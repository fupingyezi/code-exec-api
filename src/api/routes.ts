/**
 * @module api/routes
 * HTTP 路由层（文档 §4 接口契约）：只做协议转换，不做业务逻辑。
 * 端点：POST /run · GET /jobs/:id · GET /jobs/:id/events(SSE)
 */
import { Router, type Response } from 'express';
import { QueueEvents } from 'bullmq';
import { jobQueue } from '../queue/queue.js';
import { redisConnection } from '../queue/connection.js';
import { runRequestSchema } from './validate.js';
import { getJobResult, getJobStatus, setJobStatus } from '../store/jobStore.js';
import { limits, queueName } from '../config.js';

export const router = Router();

// —— SSE 事件分发（文档 §4.3）——
// QueueEvents 是 BullMQ 的发布/订阅事件流：Worker 侧任何状态变化都会广播过来
const queueEvents = new QueueEvents(queueName, { connection: redisConnection.duplicate() });
const sseClients = new Map<string, Set<Response>>();

function sseEvent(res: Response, event: string, data: unknown): void {
  res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
}

function broadcast(jobId: string, event: string, data: unknown): void {
  for (const client of sseClients.get(jobId) ?? []) sseEvent(client, event, data);
}

/** 终态推送：读 jobStore 的终态对象发 done 事件并关闭所有客户端连接 */
async function finishSse(jobId: string): Promise<void> {
  const result = await getJobResult(jobId);
  const clients = sseClients.get(jobId);
  if (!clients) return;
  if (result) {
    for (const client of clients) {
      sseEvent(client, 'done', { verdict: result.verdict, wallMs: result.wallMs, exitCode: result.exitCode });
      client.end();
    }
  }
  sseClients.delete(jobId);
}

queueEvents.on('active', ({ jobId }) => broadcast(jobId, 'status', { status: 'running' }));
queueEvents.on('progress', ({ jobId, data }) => broadcast(jobId, 'stdout', data));
queueEvents.on('completed', ({ jobId }) => void finishSse(jobId));
queueEvents.on('failed', ({ jobId }) => void finishSse(jobId));

/** 测试与优雅退出用：关闭事件订阅连接 */
export async function closeApiResources(): Promise<void> {
  await queueEvents.close();
}

// —— 限流（文档 §9.1 rate:{callerId} / §4.4 429）——
// 文档 §2 说令牌桶；此处用固定窗口计数近似（INCR + 首次设 TTL），学习项目足够
async function checkRateLimit(callerId: string): Promise<boolean> {
  const key = `rate:${callerId}`;
  const count = await redisConnection.incr(key);
  if (count === 1) await redisConnection.expire(key, limits.rateWindowSeconds);
  return count <= limits.rateMaxRequests;
}

// —— POST /run（文档 §4.1）——
router.post('/run', async (req, res) => {
  const parsed = runRequestSchema.safeParse(req.body);
  if (!parsed.success) {
    const sourceTooLarge = parsed.error.issues.some(
      (i) => i.path[0] === 'source' && i.code === 'too_big',
    );
    return res.status(sourceTooLarge ? 413 : 400).json({
      error: {
        code: sourceTooLarge ? 'SOURCE_TOO_LARGE' : 'INVALID_BODY',
        message: parsed.error.issues.map((i) => i.message).join('; '),
      },
    });
  }

  // §4.4：令牌桶耗尽 → 429 退避重试
  if (!(await checkRateLimit(req.ip ?? 'unknown'))) {
    return res.status(429).json({
      error: { code: 'RATE_LIMITED', message: '请求过于频繁，请退避重试' },
    });
  }

  // §4.4：QUEUE_SATURATED——最重要的自我保护机制。
  // 队列不设上限的后果：攻击者提交百万任务，宿主持续满负载且全在服务他一个人
  if ((await jobQueue.getWaitingCount()) >= limits.maxQueueLength) {
    return res.status(503).json({
      error: { code: 'QUEUE_SATURATED', message: '队列积压超阈值，稍后再试' },
    });
  }

  // 扁平化：Worker 直接读 job.data.wallMs（zod 已保证区间 500–15000）
  const { lang, source, stdin, limits: lim } = parsed.data;
  const job = await jobQueue.add(lang, { lang, source, stdin, wallMs: lim?.wallMs });
  await setJobStatus(job.id!, 'queued');
  return res.status(202).json({
    jobId: job.id,
    status: 'queued',
    pollUrl: `/jobs/${job.id}`,
    eventsUrl: `/jobs/${job.id}/events`,
  });
});

// —— GET /jobs/:id（文档 §4.2）——
router.get('/jobs/:id', async (req, res) => {
  const jobId = req.params.id ?? '';
  const status = await getJobStatus(jobId);
  if (!status) {
    return res.status(404).json({
      error: { code: 'JOB_NOT_FOUND', message: '任务不存在或已过期（TTL 10 分钟）' },
    });
  }
  const result = await getJobResult(jobId);
  if (result) return res.json(result);            // 终态：完整对象
  return res.json({ jobId, status });             // 轮询中间态
});

// —— GET /jobs/:id/events（文档 §4.3 SSE）——
router.get('/jobs/:id/events', async (req, res) => {
  const jobId = req.params.id ?? '';
  const status = await getJobStatus(jobId);
  if (!status) {
    return res.status(404).json({
      error: { code: 'JOB_NOT_FOUND', message: '任务不存在或已过期' },
    });
  }

  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
    // §4.3 警告框：代理默认缓冲会让 SSE 变成「执行完才一次性收到」
    'X-Accel-Buffering': 'no',
  });
  res.write(': keep-alive\n\n');

  const clients = sseClients.get(jobId) ?? new Set<Response>();
  clients.add(res);
  sseClients.set(jobId, clients);

  sseEvent(res, 'status', { status });

  // 心跳注释行：防长任务被中间层断开（§4.3）
  const heartbeat = setInterval(() => res.write(': keep-alive\n\n'), 15_000);
  req.on('close', () => {
    clearInterval(heartbeat);
    clients.delete(res);
  });

  // 竞态兜底：注册期间任务可能恰好完成（completed 事件已错过），补查一次
  if ((await getJobResult(jobId)) !== null) await finishSse(jobId);
});
