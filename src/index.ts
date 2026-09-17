/**
 * @module index
 * 进程入口：负责装配与启动。
 *
 * 职责：
 *   1. 读取 config.ts 中的配置
 *   2. 启动 HTTP API（src/api/server.ts）
 *   3. 启动队列 Worker（src/queue/worker.ts）
 *
 * 约束：
 *   - 本文件只做「启动」，不承载业务逻辑
 *   - 优雅退出：SIGINT/SIGTERM 时先停 API，再停 Worker（BullMQ worker.close()）
 */
