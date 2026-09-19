/**
 * @module queue/connection
 * Redis 连接（ioredis 实例）。
 *
 * 关键点：
 *   - BullMQ 要求连接参数 maxRetriesPerRequest: null，
 *     否则 worker 会在长时间任务中断连报错
 *   - 单例导出，供 jobStore 等直接使用；BullMQ 的 Queue/Worker/QueueEvents
 *     用 duplicate() 各自持有独立连接（Worker 的阻塞命令会堵住共享连接）
 *   - 地址来自 config.ts，不在本文件硬编码
 */
import { Redis } from "ioredis";
import { redisUrl } from "../config.js";

export const redisConnection = new Redis(redisUrl, {
  maxRetriesPerRequest: null,
});
