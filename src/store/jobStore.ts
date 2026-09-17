/**
 * @module store/jobStore
 * job 状态读写（文档 §9）。
 *
 * Redis key 设计：
 *   - job:{jobId}          String(JSON)，终态结果对象，TTL 600s
 *   - job:{jobId}:status   String，queued / running / finished，供轮询快速命中
 *
 * 状态机：queued → running → finished（含 verdict）/ failed（IE）
 * 刻意不引入 cancelled 等额外状态：多方写同一 job 时状态越多一致性越难保证。
 *
 * 约束：
 *   - Redis 连接复用 queue/connection.ts 的单例
 *   - 终态写入后不可再更新
 */
