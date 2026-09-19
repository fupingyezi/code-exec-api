/**
 * @module store/jobStore
 * job 状态读写。
 *
 * Redis key 设计：
 *   - job:{jobId}          String(JSON)，终态结果对象，TTL 600s
 *   - job:{jobId}:status   String，queued / running / finished / failed，供轮询快速命中
 *
 * 刻意不引入 cancelled 等额外状态：多方写同一 job 时状态越多一致性越难保证。
 */
import { redisConnection } from '../queue/connection.js';
import { limits } from '../config.js';
import type { Verdict } from '../runner/verdict.js';

export type JobStatus = 'queued' | 'running' | 'finished' | 'failed';

/** 终态对象：每个字段都有明确的判定来源 */
export interface JobResult {
  jobId: string;
  status: 'finished' | 'failed';
  verdict: Verdict;
  stdout: string;
  stderr: string;
  exitCode: number | null;
  wallMs: number;
  truncated: boolean;
  timedOut: boolean;
  oomKilled: boolean;
  finishedAt: string;
}

const resultKey = (jobId: string) => `job:${jobId}`;
const statusKey = (jobId: string) => `job:${jobId}:status`;

export async function setJobStatus(jobId: string, status: JobStatus): Promise<void> {
  await redisConnection.set(statusKey(jobId), status, 'EX', limits.jobTtlSeconds);
}

/** 终态写入后不再更新（状态机终点） */
export async function saveJobResult(jobId: string, result: JobResult): Promise<void> {
  await redisConnection.set(resultKey(jobId), JSON.stringify(result), 'EX', limits.jobTtlSeconds);
  await redisConnection.set(statusKey(jobId), result.status, 'EX', limits.jobTtlSeconds);
}

export async function getJobResult(jobId: string): Promise<JobResult | null> {
  const raw = await redisConnection.get(resultKey(jobId));
  return raw ? (JSON.parse(raw) as JobResult) : null;
}

export async function getJobStatus(jobId: string): Promise<JobStatus | null> {
  const s = await redisConnection.get(statusKey(jobId));
  return s ? (s as JobStatus) : null;
}
