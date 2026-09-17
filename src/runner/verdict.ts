/**
 * @module runner/verdict
 * 运行阶段结果判定（文档 §8）。
 *
 * Verdict 类型：'AC' | 'RE' | 'TLE' | 'MLE' | 'OLE' | 'IE'
 * CE 不在这里判：Worker 在编译分支直接返回（文档 §5.1 ③）。
 *
 * judgeRun 判定优先级（文档 §8.1，顺序敏感）：
 *   1. truncated        → OLE（优先级高于 TLE，否则掩盖真实死因）
 *   2. oomKilled        → MLE
 *   3. timedOut || 137  → TLE
 *   4. 139 / 134        → RE
 *   5. 其他非零退出码    → IE（无法解释的状态报「我不知道」）
 *   6. exitCode 0       → AC（仅表示跑完，不代表答案正确）
 */
