/**
 * @module queue/worker
 * 消费逻辑（文档 §5 一次执行的生命周期）。
 * 流水线：写源码 → 编译（可选）→ 执行 → 判定 → 清理 → 回写 jobStore。
 */
import { Worker } from 'bullmq';
import { mkdir, mkdtemp, writeFile, chown, chmod, rm } from 'node:fs/promises';
import path from 'node:path';
import { redisConnection } from './connection.js';
import type { JobData } from './queue.js';
import { profiles } from '../lang/profiles.js';
import { executeInSandbox } from '../runner/execute.js';
import { judgeRun } from '../runner/verdict.js';
import { setJobStatus, saveJobResult, type JobResult } from '../store/jobStore.js';
import { limits, jobsBaseDir, queueName, CONTAINER_DIR } from '../config.js';

export async function startWorker(): Promise<Worker<JobData>> {
  await mkdir(jobsBaseDir, { recursive: true });

  return new Worker<JobData>(
    queueName,
    async (job) => {
      const profile = profiles[job.data.lang];

      // §5.1 ①：mkdtemp 随机目录，不要用 jobId 拼路径
      //（可预测的路径 = 攻击者可提前预置符号链接）
      const dir = await mkdtemp(path.join(jobsBaseDir, 'job-'));
      try {
        await setJobStatus(job.id!, 'running');

        // §5.1 ②：写源码后必须改权限——容器内是 uid 65534，
        // 宿主 mkdtemp 的目录是 0o700，跳过这步会得到藏在 stderr 里的 Permission denied
        await writeFile(path.join(dir, profile.sourceFile), job.data.source, { mode: 0o644 });
        await chown(dir, limits.runAsUid, limits.runAsGid).catch(() => {});
        await chmod(dir, 0o777);   // 任务独占的随机临时目录，不需要靠权限位隔离

        // §5.1 ③：编译轮——失败直接 CE，不进入运行阶段；
        // 编译超时单独 10s（编译是确定性的，不会被恶意利用成无限循环攻击）
        if (profile.compile) {
          const cc = await executeInSandbox(
            { hostDir: dir, needExec: true },
            profile,
            '',
            profile.compile(CONTAINER_DIR),
            limits.compileWallMs,
          );
          if (cc.exitCode !== 0) {
            const result: JobResult = {
              jobId: job.id!, status: 'finished', verdict: 'CE',
              stdout: '', stderr: cc.stderr,
              exitCode: cc.exitCode, wallMs: cc.wallMs,
              truncated: cc.truncated, timedOut: cc.timedOut, oomKilled: cc.oomKilled,
              finishedAt: new Date().toISOString(),
            };
            await saveJobResult(job.id!, result);
            return result;
          }
        }

        // 运行轮
        const run = await executeInSandbox(
          { hostDir: dir, needExec: false },
          profile,
          job.data.stdin,
          undefined,
          job.data.wallMs ?? limits.wallMs,
        );

        const result: JobResult = {
          jobId: job.id!, status: 'finished', verdict: judgeRun(run),
          stdout: run.stdout, stderr: run.stderr,
          exitCode: run.exitCode, wallMs: run.wallMs,
          truncated: run.truncated, timedOut: run.timedOut, oomKilled: run.oomKilled,
          finishedAt: new Date().toISOString(),
        };
        await saveJobResult(job.id!, result);
        return result;
      } catch (err) {
        // Worker 自身异常 → failed{IE}（文档 §4.4 错误码表 / §9.2 状态机），与用户代码无关
        const result: JobResult = {
          jobId: job.id!, status: 'failed', verdict: 'IE',
          stdout: '', stderr: err instanceof Error ? err.message : String(err),
          exitCode: null, wallMs: 0,
          truncated: false, timedOut: false, oomKilled: false,
          finishedAt: new Date().toISOString(),
        };
        await saveJobResult(job.id!, result).catch(() => {});
        throw err;   // 让 BullMQ 也感知失败（attempts:1，不会重跑）
      } finally {
        // §5.1 ⑤：无论成功失败，临时目录必须清。
        // 漏掉的表现：每失败一次磁盘泄漏一点，跑几百次后宿主磁盘满
        await rm(dir, { recursive: true, force: true });
      }
    },
    {
      connection: redisConnection.duplicate(),   // Worker 的阻塞命令需要独立连接
      concurrency: limits.workerConcurrency,     // 队列侧限流闸门（文档 §1）
    },
  );
}
