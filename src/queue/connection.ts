/**
 * @module queue/connection
 * Redis 连接（ioredis 实例）。
 *
 * 关键点：
 *   - BullMQ 要求连接参数 maxRetriesPerRequest: null，
 *     否则 worker 会在长时间任务中断连报错
 *   - 单例导出，供 queue.ts / worker.ts / jobStore.ts 共用
 *     （BullMQ 的 Queue/Worker 可共享同一 connection 对象）
 *   - 地址来自 config.ts，不在本文件硬编码
 */
import { Redis } from "ioredis";
import { config } from "../config.js";

export const redisConnection = new Redis(config.redis.url, {
  maxRetriesPerRequest: null,
});