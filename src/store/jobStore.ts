/**
 * @module store/jobStore
 * job 状态读写（Redis Hash）。
 *
 * 职责：
 *   - 任务状态字段：status（queued/running/终态）、verdict、输出、用时、
 *     创建/完成时间等
 *   - 提供 create / get / update / 终态写入等方法
 *   - TTL 策略：终态任务保留一段时间后过期（防 Redis 无限增长）
 *
 * 约束：
 *   - Redis 连接复用 queue/connection.ts 的单例
 *   - 状态流转合法性在本层校验（如终态不可再更新）
 */
