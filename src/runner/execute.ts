/**
 * @module runner/execute
 * 容器执行：attach + start + 兜底超时 + 输出采集。
 *
 * 流程：
 *   1. 用 dockerOptions.ts 构造并 create 容器
 *   2. attach 到容器（流交给 capture.ts 采集）
 *   3. start 容器
 *   4. wait 容器退出（Promise + setTimeout 兜底超时，超时则 kill 容器）
 *   5. 汇总退出码 / 信号 / 用时 / 输出，返回执行结果元数据
 *
 * 关键点：
 *   - 兜底超时是「最后防线」：即使容器内限时（如 timeout 命令）被绕过也兜底
 *   - wait 与超时竞态：先到者胜，另一方必须能安全取消（容器 kill 幂等）
 *   - 输出采集必须在 wait 之前 attach（否则可能丢输出）
 *   - 调用方保证 finally 中 remove 容器
 */
