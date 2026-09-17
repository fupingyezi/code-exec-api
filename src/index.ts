/**
 * @module index
 * 进程入口（文档 §3）：启动 Worker + HTTP API。
 * 本文件只做「启动」，不承载业务逻辑。
 */
import { startServer } from './api/server.js';
import { startWorker } from './queue/worker.js';
import { logger } from './logger.js';

const worker = await startWorker();
const server = await startServer();

// 优雅退出：先停 Worker（等当前任务收尾），再关 HTTP
async function shutdown(signal: string): Promise<void> {
  logger.info({ signal }, '开始优雅退出');
  await worker.close();
  server.close(() => {
    logger.info('已退出');
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 5000).unref();   // 兜底：5 秒内没退完就强制退出
}
process.on('SIGINT', () => void shutdown('SIGINT'));
process.on('SIGTERM', () => void shutdown('SIGTERM'));
