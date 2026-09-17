/**
 * @module api/server
 * Express 实例与中间件装配（文档 §3）。
 * 中间件顺序是安全性的一部分：json 解析在前，路由居中，错误处理最后。
 */
import express from 'express';
import type http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { apiPort } from '../config.js';
import { router } from './routes.js';

export async function startServer(): Promise<http.Server> {
  const app = express();

  // body 上限略大于 source 上限（128 KiB），防超大 payload 直达解析层
  app.use(express.json({ limit: '256kb' }));

  // 学习项目全放开 CORS；生产按需收紧
  app.use((req, res, next) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
    if (req.method === 'OPTIONS') return res.sendStatus(204);
    next();
  });

  app.use(router);

  // 代码提交测试页（public/index.html）
  const publicDir = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'public');
  app.use(express.static(publicDir));

  // 统一错误处理（必须最后装配）
  app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    console.error('API 错误:', err);
    res.status(500).json({ error: { code: 'INTERNAL', message: '内部错误' } });
  });

  const server = app.listen(apiPort, () => {
    console.log(`code-exec-api 已启动: http://localhost:${apiPort}`);
  });
  return server;
}
