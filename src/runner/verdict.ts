/**
 * @module runner/verdict
 * 结果判定：将执行结果元数据归类为终态。
 *
 * 终态枚举：
 *   AC  Accepted      正常退出（退出码 0）
 *   CE  Compile Error 编译阶段失败（编译型语言）
 *   RE  Runtime Error 运行期异常退出（非零退出码 / 被信号杀死）
 *   TLE Time Limit    超时（容器内限时命中或兜底超时）
 *   MLE Memory Limit  内存超限（OOMKilled）
 *   OLE Output Limit  输出超限（capture.ts 截断标记）
 *
 * 职责：
 *   - judge(执行结果元数据) → Verdict，纯函数、无副作用，便于单测
 *   - 判定优先级需明确（如 OOMKilled 与超时同时出现时取哪个）
 *   - 供 worker.ts 写终态、routes.ts 判定 SSE 关闭条件
 */
