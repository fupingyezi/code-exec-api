/**
 * @module test/isolation
 * 隔离自测用例集（第 11 章）。
 *
 * 目标：验证 dockerOptions.ts 的每一项安全约束真实生效。
 *
 * 计划用例（每项先「预期被阻断」再「确认结果」）：
 *   - 网络隔离：尝试外连 / 连接宿主 redis 端口，应失败
 *   - 内存限制：分配超限内存，应 OOMKilled → 判 MLE
 *   - CPU 限制：忙循环跑满，确认 CPU 配额被限制（执行时长可佐证）
 *   - fork 炸弹：确认 PidsLimit 生效，宿主不挂
 *   - 文件系统只读：尝试写 /etc、/ 根目录，应失败；/sandbox 与 /tmp 可写
 *   - 权限提升：尝试 setuid / 提升 capability，应被 no-new-privileges 阻断
 *   - 超大输出：确认 capture.ts 截断并判 OLE，内存不失控
 *   - 残留清理：异常/超时任务后确认容器与文件被清理（无泄漏）
 *
 * 运行方式：需 Docker 可用；集成测试，按语言画像遍历执行
 */
