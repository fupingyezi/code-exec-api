/**
 * @module api/routes
 * HTTP 路由层：只做「协议转换」，不做业务逻辑。
 *
 * 端点：
 *   - POST /run         接收代码提交 → zod 校验（validate.ts）→ 入队 → 返回 jobId
 *   - GET  /jobs/:id     查询任务状态（store/jobStore.ts 读 Redis Hash）
 *   - GET  /jobs/:id/events   SSE：订阅任务状态流转，直到终态后关闭流
 *
 * 约束：
 *   - 入队参数与 jobStore 初始化在这里完成，判定逻辑不在此
 *   - SSE 关闭条件统一（终态判定集中在 runner/verdict.ts）
 */
