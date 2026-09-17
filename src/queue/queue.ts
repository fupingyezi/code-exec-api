/**
 * @module queue/queue
 * 队列定义与默认 job options。
 *
 * 职责：
 *   - 创建 BullMQ Queue 实例（供 API 层 enqueue）
 *   - 定义默认 job options：
 *     attempts / backoff（重试策略）
 *     timeout（与沙箱兜底超时关系：队列 timeout 必须大于容器兜底超时）
 *     removeOnComplete / removeOnFail（清理策略，防 Redis 堆积）
 *   - 定义 job data 类型（language、source、stdin、限制参数）
 *
 * 约束：
 *   - 常量一律来自 config.ts
 */
