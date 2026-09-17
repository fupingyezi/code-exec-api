/**
 * @module config
 * 全局配置中心：所有常量集中于此，禁止在其他文件散落硬编码。
 * 环境变量只允许在本文件出现。数值与文档附录 A 对齐。
 */
import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';

// 沙箱容器内的工作目录（镜像 WORKDIR 与 bind mount 目标一致）
export const CONTAINER_DIR = '/workspace';

// 沙箱与执行相关限制（文档附录 A 常量速查）
export const limits = {
  wallMs: 5_000,                        // 墙钟超时（宿主侧兜底）
  compileWallMs: 10_000,                // 编译超时（仅编译型语言）
  memoryBytes: 256 * 1024 * 1024,       // 256 MiB，MemorySwap 同值
  cpus: 0.5,
  pids: 64,
  outputBytes: 64 * 1024,               // stdout + stderr 共享
  sourceBytes: 128 * 1024,              // 源码长度上限（zod 层）
  stdinBytes: 1024 * 1024,
  fileBytes: 10 * 1024 * 1024,          // ulimit fsize
  openFiles: 64,                        // ulimit nofile
  runAsUid: 65534,
  runAsGid: 65534,
  workerConcurrency: 8,                 // 队列侧限流闸门
  jobTtlSeconds: 600,                   // job 结果 TTL
  maxReuse: 50,                         // 容器池复用上限（阶段三）
  // —— 文档未给数值的设计值（§4.4）——
  rateWindowSeconds: 60,                // 令牌桶窗口（rate:{callerId} 的 TTL）
  rateMaxRequests: 30,                  // 每窗口每调用方上限
  maxQueueLength: 100,                  // 队列积压阈值，超限 503 QUEUE_SATURATED
} as const;

// —— 本地环境配置（文档附录 C 中的环境变量）——
export const apiPort = Number(process.env.API_PORT ?? 3000);
export const redisUrl = process.env.REDIS_URL ?? 'redis://localhost:6380';
export const queueName = 'code-exec';   // 对应 BullMQ 前缀 bull:code-exec:*
// 沙箱隔离后端：改成 runsc 即切换 gVisor（文档 §12.2）。
// 与文档 §6.2 的细微偏差：env 读取集中在本文件而不是 dockerOptions.ts（§3 常量集中原则）
export const sandboxRuntime = process.env.SANDBOX_RUNTIME ?? 'runc';

// —— Docker 连接 ——
// 文档 §7.2 硬编码 /var/run/docker.sock（仅 Linux 默认路径），实测修正为探测式
function detectDockerSocket(): string {
  const candidates = [
    process.env.DOCKER_HOST?.replace(/^unix:\/\//, ''),
    `${homedir()}/.colima/default/docker.sock`,  // colima（本机环境）
    `${homedir()}/.docker/run/docker.sock`,      // Docker Desktop (macOS)
    '/var/run/docker.sock',                      // Linux 默认
  ].filter((p): p is string => typeof p === 'string' && p.length > 0);
  return candidates.find((p) => existsSync(p)) ?? candidates[candidates.length - 1]!;
}

export const dockerSocketPath = detectDockerSocket();

// —— 任务临时目录 ——
// 文档 §5.1 用 os.tmpdir()；本机 colima(vz) 只共享 $HOME（virtiofs），
// 宿主的 /var/folders（os.tmpdir()）与 /tmp 会被虚拟机内同名路径遮蔽，
// bind mount 后容器里看不到源码（实测踩坑）。故基址放 home 下。
export const jobsBaseDir = process.env.JOBS_DIR ?? path.join(homedir(), '.code-exec', 'jobs');

// —— 容器池（文档 §10，阶段四）——
// 默认关：冷路径（每任务一个容器）是语义最干净的兜底（§10.3 的退回原则）
export const poolEnabled = process.env.SANDBOX_POOL === '1';
// 每种镜像的预热容器数（文档未给数值，设计值；与 workerConcurrency 对齐后压测调整）
export const poolSize = Number(process.env.POOL_SIZE ?? 4);
