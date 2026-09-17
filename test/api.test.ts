/**
 * @module test/api
 * API 层测试。
 *
 * 计划用例：
 *   - POST /run 参数校验：缺字段 / 非法语言 / 超长 source 应 400
 *   - POST /run 正常入队返回 jobId，且 jobStore 中状态为 queued
 *   - GET /jobs/:id 命中 / 未命中（404）
 *   - SSE：订阅后能收到状态流转事件，终态后流关闭
 *
 * 运行方式：mock 队列与 jobStore（单元层），或对真实 redis 做集成
 */
