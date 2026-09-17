/**
 * @module queue/queue
 * 队列定义与默认 job options（文档 §4.1/§9.1）。
 */
import { Queue } from 'bullmq';
import { redisConnection } from './connection.js';
import { queueName } from '../config.js';

export interface JobData {
  lang: 'node' | 'python' | 'cpp';
  source: string;
  stdin: string;
  /** 单次墙钟超时（ms）；validate 层已限制 500–15000，只能调小不能绕过上限 */
  wallMs?: number;
}

// BullMQ 的 Queue/Worker/QueueEvents 建议各自持有独立连接：
// Worker 会在连接上跑阻塞命令（BRPOPLPUSH），共享连接会把其他调用一起堵住
export const jobQueue = new Queue<JobData>(queueName, {
  connection: redisConnection.duplicate(),
  defaultJobOptions: {
    attempts: 1,                            // 不可信代码不重试：失败重跑只是重复烧资源
    removeOnComplete: { count: 1000 },      // 只保留最近结果，防 Redis 被 job 记录堆满
    removeOnFail: { count: 1000 },
  },
});
