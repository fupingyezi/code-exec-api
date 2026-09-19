/**
 * @module runner/pool
 * 容器池。
 * 心智模型：物理容器复用，语义状态不复用——
 * 每个任务仍是独占工作区（/workspace tmpfs 每任务清空）、独占执行配额。
 * 池化和「每任务一个容器」不冲突；做不到语义复用就退回冷路径（SANDBOX_POOL 默认关）。
 */
import Docker from 'dockerode';
import type { ContainerCreateOptions } from 'dockerode';
import { dockerSocketPath, limits, CONTAINER_DIR } from '../config.js';
import { createCapture } from './capture.js';
import type { ExecResult } from './execute.js';
import { logger } from '../logger.js';

const docker = new Docker({ socketPath: dockerSocketPath });

interface Warm {
  container: Docker.Container;
  image: string;
  /** 已服务任务数；超过 limits.maxReuse 销毁重建（限制一次逃逸的存活窗口） */
  used: number;
}

/** 池化模式的一轮执行（编译轮 / 运行轮） */
export interface PooledRound {
  cmd: string[];
  stdin: string;
  wallMs: number;
}

/** 在常驻容器里执行一条短命令（rm 清理 / pkill 收尾），按 inspect 轮询结束 */
async function execCmd(container: Docker.Container, cmd: string[], timeoutMs: number): Promise<void> {
  const exec = await container.exec({ Cmd: cmd });
  await exec.start({});
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const info = await exec.inspect();
    if (!info.Running) return;
    if (Date.now() > deadline) throw new Error(`execCmd 超时: ${JSON.stringify(cmd)}`);
    await new Promise((r) => setTimeout(r, 50));
  }
}

/** 杀掉容器内除 PID 1 外的所有残留进程。
 *  不能用 pkill -u 65534：PID 1（sleep infinity）也是 65534，会被一起杀掉。
 *  以 nobody 身份执行，kill 其他 uid 的进程会 EPERM（天然被权限挡下）。 */
const RESIDUE_KILL_CMD = [
  'sh', '-c',
  `for p in /proc/[0-9]*; do pid=\${p##*/}; [ "\$pid" = 1 ] && continue; kill -9 \$pid 2>/dev/null; done`,
];

export class ContainerPool {
  private idle = new Map<string, Warm[]>();
  private waiters = new Map<string, Array<() => void>>();
  private specs = new Map<string, ContainerCreateOptions>();
  private pending = new Set<Promise<void>>();
  private disposed = false;

  /** 预热：进程启动时把每种镜像的容器建好并 start（不执行任何用户代码） */
  async warm(image: string, size: number, spec: ContainerCreateOptions): Promise<void> {
    this.specs.set(image, spec);
    const list = this.idle.get(image) ?? [];
    for (let i = 0; i < size; i++) {
      const container = await docker.createContainer(spec);
      await container.start();
      if (this.disposed) {
        // drain 之后才到达的补位容器：直接销毁（异步补位与 drain 的竞态）
        await container.remove({ force: true }).catch(() => {});
        return;
      }
      list.push({ container, image, used: 0 });
    }
    this.idle.set(image, list);
    // 唤醒等待者
    for (let i = 0; i < size; i++) this.waiters.get(image)?.shift()?.();
  }

  async acquire(image: string): Promise<Warm> {
    for (;;) {
      const list = this.idle.get(image) ?? [];
      const warm = list.pop();
      if (warm) return warm;
      // 池空了：等待归还，而不是新建——新建就等于放弃池化
      await new Promise<void>((resolve) => {
        const w = this.waiters.get(image) ?? [];
        w.push(resolve);
        this.waiters.set(image, w);
      });
    }
  }

  release(warm: Warm, dirty: boolean): void {
    if (!dirty && warm.used < limits.maxReuse) {
      const list = this.idle.get(warm.image) ?? [];
      list.push(warm);
      this.idle.set(warm.image, list);
      this.waiters.get(warm.image)?.shift()?.();
      return;
    }
    // 脏容器 / 超过复用上限：销毁并预热补位（补位完成才唤醒等待者）。
    // 补位是异步的，登记进 pending 以便 drain 能等它完成，防止「drain 之后又冒出容器」泄漏
    const spec = this.specs.get(warm.image);
    const replenish = warm.container.remove({ force: true })
      .catch((err) => logger.warn({ err }, '销毁池容器失败'))
      .then(() => (spec ? this.warm(warm.image, 1, spec) : undefined))
      .catch((err) => logger.error({ err }, '池容器补位失败'));
    this.pending.add(replenish);
    void replenish.finally(() => this.pending.delete(replenish));
  }

  /** 退出时清空全部常驻容器（先等异步补位结束，防止晚到的容器漏清） */
  async drain(): Promise<void> {
    this.disposed = true;
    await Promise.allSettled([...this.pending]);
    for (const list of this.idle.values()) {
      for (const w of list) await w.container.remove({ force: true }).catch(() => {});
    }
    this.idle.clear();
  }

  /** 观测用：当前空闲容器数 */
  idleCount(image: string): number {
    return this.idle.get(image)?.length ?? 0;
  }
}

export const containerPool = new ContainerPool();

/** 在常驻容器中执行一轮（编译或运行），输出采集与兜底超时语义同冷路径 */
async function executeInWarm(
  container: Docker.Container,
  round: PooledRound,
  onOutput?: (kind: 'stdout' | 'stderr', text: string) => void,
): Promise<ExecResult> {
  const started = Date.now();
  const capture = createCapture(limits.outputBytes, onOutput);

  // exec 继承容器的 User(65534)/Env/资源限制
  const exec = await container.exec({
    Cmd: round.cmd,
    WorkingDir: CONTAINER_DIR,
    AttachStdin: true,
    AttachStdout: true,
    AttachStderr: true,
    Tty: false,
  });

  const stream = await exec.start({ hijack: true, stdin: true });
  container.modem.demuxStream(stream, capture.stdout, capture.stderr);
  stream.end(round.stdin);

  let timedOut = false;
  const hardKill = setTimeout(() => {
    timedOut = true;
    // SIGKILL 杀死整个容器（PID 1 是 sleep，一并终止）。
    // 调用方据此把容器标记为脏，池销毁重建——这是池化模式下 kill 链路的终点
    container.kill({ signal: 'SIGKILL' }).catch(() => {});
  }, round.wallMs);

  // exec 没有 wait API：轮询 inspect 直到结束（dockerode 标准做法）
  let exitCode: number | null = null;
  try {
    for (;;) {
      const info = await exec.inspect();
      if (!info.Running) {
        exitCode = info.ExitCode ?? null;
        break;
      }
      await new Promise((r) => setTimeout(r, 50));
    }
  } finally {
    clearTimeout(hardKill);
  }

  // OOMKilled 读容器状态：即使 PID1 幸存（OOM 只杀了 exec 进程），标志也在容器上
  const state = await container.inspect();
  return {
    stdout: capture.out(),
    stderr: capture.err(),
    exitCode,
    wallMs: Date.now() - started,
    oomKilled: state.State.OOMKilled === true,
    timedOut,
    truncated: capture.truncated(),
  };
}

/**
 * 池化执行一个完整任务：租借容器 → 清工作区 → 逐轮执行 → 收残留 → 归还。
 * 编译轮与运行轮在同一个容器里跑（运行轮要看到编译产物）。
 *
 * ★ 源码注入方式（实测修正）：
 * putArchive（docker cp）在 ReadonlyRootfs=true 的容器上被 daemon 整体拒绝
 *（"container rootfs is marked read-only"，tmpfs 挂载点同样被拒），
 * 因此改为无文件通道：解释型语言源码走 argv（node -e / python3 -c），
 * 编译型语言源码走 exec stdin（g++ -x c++ -）。代价是源码在 ps 里短暂可见——
 * 但池化容器同一时刻只服务一个任务 + 每次任务后残留进程被清理，风险可控。
 *
 * 返回每轮结果；任何异常/超时/OOM 都会把容器标记为脏并销毁重建。
 */
export async function executePooledJob(
  pool: ContainerPool,
  image: string,
  rounds: PooledRound[],
  onOutput?: (kind: 'stdout' | 'stderr', text: string) => void,
): Promise<ExecResult[]> {
  const warm = await pool.acquire(image);
  warm.used++;
  const results: ExecResult[] = [];
  let dirty = false;

  try {
    // ① 清空上一个任务的工作区残留（cpp 的编译产物也在这）
    await execCmd(warm.container, ['sh', '-c', `rm -f ${CONTAINER_DIR}/*`], 5_000);

    // ② 逐轮执行
    for (const round of rounds) {
      const r = await executeInWarm(warm.container, round, onOutput);
      results.push(r);
      if (r.timedOut || r.oomKilled) {
        dirty = true;   // 容器已死或已被污染，不能再复用
        break;
      }
    }
  } catch (err) {
    dirty = true;   // 任何异常都视为脏容器，销毁重建，宁可冷启动不赌安全
    throw err;
  } finally {
    // ③ 收掉残留后台进程。脏容器直接销毁，无需收
    if (!dirty) {
      await execCmd(warm.container, RESIDUE_KILL_CMD, 2_000).catch(() => {});
    }
    pool.release(warm, dirty);
  }
  return results;
}
