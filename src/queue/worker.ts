/**
 * @module queue/worker
 * 消费逻辑（BullMQ Worker）。
 *
 * 处理流水线（每个 job 依次执行）：
 *   1. 更新 jobStore 状态为 running
 *   2. 写源码 / stdin 到临时工作目录
 *   3. 编译（编译型语言，CE 则短路）
 *   4. 沙箱执行（runner/execute.ts）
 *   5. 判定（runner/verdict.ts）
 *   6. 清理容器与临时文件（finally 中保证执行）
 *   7. 写回 jobStore 终态（AC / CE / RE / TLE / MLE / OLE）
 *
 * 约束：
 *   - 清理逻辑必须在 finally，任何异常都不能泄漏容器
 *   - 容器池接入后（阶段三）改为向 runner/pool.ts 租借容器
 */
