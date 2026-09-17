/**
 * @module runner/dockerOptions
 * ★ 沙箱参数构造——安全核心全在这个文件（文档 §6.2）。
 * 唯一允许出现 docker 安全参数的地方；任何一行改动都必须同步更新
 * test/isolation.test.ts 的快照。
 */
import type Dockerode from 'dockerode';
import { limits, CONTAINER_DIR, sandboxRuntime } from '../config.js';
import type { LangProfile } from '../lang/profiles.js';

export interface RunTarget {
  /** 宿主机上本次任务的独占临时目录，源码已写入 */
  hostDir: string;
  /** 是否允许容器内进程执行文件（编译型语言的编译轮必须为 true） */
  needExec: boolean;
}

/**
 * 沙箱容器的唯一构造入口。
 */
export function buildContainerSpec(
  target: RunTarget,
  profile: LangProfile,
  cmdOverride?: string[],
): Dockerode.ContainerCreateOptions {
  return {
    Image: profile.image,
    Cmd: cmdOverride ?? profile.run(CONTAINER_DIR),
    WorkingDir: CONTAINER_DIR,
    User: `${limits.runAsUid}:${limits.runAsGid}`,   // 65534:65534，逃逸后也拿不到 root
    // 最小化环境：不继承宿主环境变量（防泄漏），PATH 只留标准路径
    Env: ['HOME=/tmp', 'PATH=/usr/local/bin:/usr/bin:/bin'],
    AttachStdin: true,     // 三件套：stdin 从宿主写入（execute.ts 里 stream.end(stdin)）
    AttachStdout: true,
    AttachStderr: true,
    OpenStdin: true,       // 保持 stdin 打开，等待宿主写入
    StdinOnce: true,       // stdin 一旦关闭就不再打开，避免程序卡在 read()
    Tty: false,            // 必须 false：tty 会把 \n 变成 \r\n，污染输出比对
    HostConfig: {
      // —— 文件系统 ——
      Binds: [`${target.hostDir}:${CONTAINER_DIR}:rw`],
      ReadonlyRootfs: true,
      // 编译轮允许 /tmp 执行（gcc 工具链），运行轮一律 noexec
      Tmpfs: { '/tmp': `rw,size=64m,nosuid,nodev${target.needExec ? '' : ',noexec'}` },

      // —— 权限 ——
      // 注：User 只在 ContainerCreateOptions 顶层生效，HostConfig 没有该字段
      //（文档 §6.2 的「双保险」写法实测编译不过，已修正）
      CapDrop: ['ALL'],
      SecurityOpt: ['no-new-privileges:true'],

      // —— 资源 ——
      PidsLimit: limits.pids,
      Memory: limits.memoryBytes,
      MemorySwap: limits.memoryBytes,   // ★ 必须显式相等，否则可借宿主 swap
      NanoCpus: limits.cpus * 1e9,
      Ulimits: [
        { Name: 'nofile', Soft: limits.openFiles, Hard: limits.openFiles },   // 防耗尽宿主 fd 表
        { Name: 'fsize', Soft: limits.fileBytes, Hard: limits.fileBytes },    // 防单文件写满磁盘
        { Name: 'core', Soft: 0, Hard: 0 },                                   // 防崩溃时写出 GB 级 core dump
      ],

      // —— 网络 ——
      NetworkMode: 'none',

      // —— 隔离后端：改这一个值就切到 gVisor（文档 §12.2）——
      Runtime: sandboxRuntime,

      // —— 生命周期 ——
      AutoRemove: false,   // 手动 remove：OOM kill 等异常退出时要保留现场做 inspect
    },
  };
}
