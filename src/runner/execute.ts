/**
 * @module runner/execute
 * 容器执行：attach + start + 兜底超时 + 输出采集（文档 §7.2）。
 */
import Docker from 'dockerode';
import { limits, dockerSocketPath } from '../config.js';
import { buildContainerSpec, type RunTarget } from './dockerOptions.js';
import { createCapture } from './capture.js';
import type { LangProfile } from '../lang/profiles.js';

// socket 路径探测见 config.ts（colima / Docker Desktop / Linux 三选一）
const docker = new Docker({ socketPath: dockerSocketPath });

export interface ExecResult {
  stdout: string;
  stderr: string;
  exitCode: number | null;
  wallMs: number;
  oomKilled: boolean;
  timedOut: boolean;
  truncated: boolean;
}

export async function executeInSandbox(
  target: RunTarget,
  profile: LangProfile,
  stdin: string,
  cmdOverride?: string[],
  wallMs: number = limits.wallMs,
): Promise<ExecResult> {
  const started = Date.now();
  const container = await docker.createContainer(
    buildContainerSpec(target, profile, cmdOverride),
  );

  const capture = createCapture(limits.outputBytes);

  try {
    // ★ 顺序：先 attach，再 start（文档 §5 图2 注）。
    // 反过来时，启动很快的程序会在 attach 完成前写完输出，stdout 拿到空 ——
    // 只在快程序 + 小概率时序下复现，最难排查的一类 bug。
    const stream = await container.attach({
      stream: true, stdin: true, stdout: true, stderr: true, hijack: true,
    });
    container.modem.demuxStream(stream, capture.stdout, capture.stderr);

    await container.start();

    // 写入 stdin 后立刻 end。不 end 的话，任何读 stdin 的程序都会永久阻塞
    // （StdinOnce 只保证端到端关闭，不会替我们把流关掉）
    stream.end(stdin);

    // ★ 兜底计时器：唯一不能被恶意代码绕过的时间限制（文档 §7.1）
    let timedOut = false;
    const hardKill = setTimeout(() => {
      timedOut = true;
      // SIGKILL 不可捕获、不可忽略、不可协商
      container.kill({ signal: 'SIGKILL' }).catch(() => {});
    }, wallMs);

    let statusCode: number | null = null;
    try {
      // kill 之后也必须 wait()：kill 只是发信号，wait() 阻塞到容器真正停止，
      // 是唯一可靠的同步点（直接 inspect 可能读到 running 中间态）
      const waited = await container.wait();
      statusCode = waited.StatusCode;
    } finally {
      clearTimeout(hardKill);   // 正常结束必须清掉，否则计时器持有引用导致泄漏
    }

    // inspect 必须赶在 remove 之前：OOMKilled 是区分 TLE/MLE 的唯一依据（§4.2）
    const info = await container.inspect();

    return {
      stdout: capture.out(),
      stderr: capture.err(),
      exitCode: statusCode,
      wallMs: Date.now() - started,
      oomKilled: info.State.OOMKilled === true,
      timedOut,
      truncated: capture.truncated(),
    };
  } finally {
    // 对文档 §7.2 的一处补强：异常路径也强制回收容器，避免泄漏
    // （文档原版 remove 在正常路径末尾，attach/start 抛错时容器会残留）
    await container.remove({ force: true }).catch(() => {});
  }
}
