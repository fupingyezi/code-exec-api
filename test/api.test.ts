/**
 * @module test/api
 * API 层测试：真实 redis + 真实 server，不起 Worker，
 * 只验证「校验 → 入队 → 状态查询」这条同步路径。
 */
import { test, expect, beforeAll, afterAll } from 'vitest';

process.env.API_PORT = '3100';   // 避开开发用 3000；必须在动态 import 之前设置

const base = 'http://localhost:3100';
let cleanup: (() => Promise<void>) | undefined;

beforeAll(async () => {
  const [{ startServer }, { closeApiResources }, { redisConnection }] = await Promise.all([
    import('../src/api/server.js'),
    import('../src/api/routes.js'),
    import('../src/queue/connection.js'),
  ]);
  // 清掉限流计数：测试连续跑几轮 + 开发期 curl 会在 60s 窗口内攒满 30 次触发 429
  const rateKeys = await redisConnection.keys('rate:*');
  if (rateKeys.length) await redisConnection.del(...rateKeys);
  await startServer();
  cleanup = async () => {
    await closeApiResources();
    redisConnection.disconnect();
  };
});

afterAll(async () => {
  // 清掉测试期间入队的任务，保持 redis 干净
  const { jobQueue } = await import('../src/queue/queue.js');
  await jobQueue.obliterate({ force: true });
  await cleanup?.();
});

test('POST /run 非法语言 → 400 INVALID_BODY', async () => {
  const resp = await fetch(`${base}/run`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ lang: 'rust', source: 'x' }),
  });
  expect(resp.status).toBe(400);
  const data = (await resp.json()) as { error: { code: string } };
  expect(data.error.code).toBe('INVALID_BODY');
});

test('POST /run 空源码 → 400 INVALID_BODY', async () => {
  const resp = await fetch(`${base}/run`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ lang: 'node', source: '' }),
  });
  expect(resp.status).toBe(400);
});

test('POST /run 合法请求 → 202 + jobId + pollUrl', async () => {
  const resp = await fetch(`${base}/run`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ lang: 'node', source: "console.log('test')", stdin: 'x' }),
  });
  expect(resp.status).toBe(202);
  const data = (await resp.json()) as { jobId: string; pollUrl: string; eventsUrl: string; status: string };
  expect(data.jobId).toBeTruthy();
  expect(data.status).toBe('queued');
  expect(data.pollUrl).toBe(`/jobs/${data.jobId}`);
  expect(data.eventsUrl).toBe(`/jobs/${data.jobId}/events`);

  // 不起 Worker，状态应停留在 queued
  const poll = (await (await fetch(`${base}${data.pollUrl}`)).json()) as { status: string };
  expect(poll.status).toBe('queued');
});

test('GET /jobs/未知id → 404 JOB_NOT_FOUND', async () => {
  const resp = await fetch(`${base}/jobs/definitely-not-exist`);
  expect(resp.status).toBe(404);
  const data = (await resp.json()) as { error: { code: string } };
  expect(data.error.code).toBe('JOB_NOT_FOUND');
});
