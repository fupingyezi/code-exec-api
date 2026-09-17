/**
 * @module runner/capture
 * 带上限的流采集器（防 OLE 兜底）。
 *
 * 职责：
 *   - 将 dockerode 的 stdout / stderr stream 转为 Promise<Buffer>
 *   - 采集上限来自 config.ts；超过上限时：
 *     记录「已截断」标记，终止容器（配合 verdict 判 OLE），
 *     保证内存不会被子进程恶意输出撑爆
 *
 * 约束：
 *   - 上限检查在字节层，不看内容（用户输出可能是任意二进制）
 *   - 采集失败不能影响容器清理（异常可被 worker 的 finally 覆盖）
 */
