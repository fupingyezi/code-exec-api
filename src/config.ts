/**
 * @module config
 * 全局配置中心：所有常量集中于此，禁止在其他文件散落硬编码。
 * 环境变量只允许在本文件出现。数值与文档附录 A 对齐。
 */

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
} as const;

// —— 本地环境配置（文档附录 C 中的环境变量）——
export const apiPort = Number(process.env.API_PORT ?? 3000);
export const redisUrl = process.env.REDIS_URL ?? 'redis://localhost:6380';
export const queueName = 'code-exec';   // 对应 BullMQ 前缀 bull:code-exec:*
