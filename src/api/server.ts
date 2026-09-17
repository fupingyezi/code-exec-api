/**
 * @module api/server
 * Express 实例与中间件装配。
 *
 * 职责：
 *   - 创建 express 实例，按序装配中间件：
 *     express.json()（注意 body 大小上限与 config.ts 对齐）
 *     CORS（如需）
 *     请求日志 / 错误处理中间件
 *   - 挂载路由（src/api/routes.ts）
 *   - 暴露 listen/close 供 index.ts 启动与优雅退出
 *
 * 约束：
 *   - 中间件装配顺序是安全性的一部分（json 解析在路由之前，错误处理在最后）
 */
