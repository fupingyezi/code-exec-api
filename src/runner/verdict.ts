/**
 * @module runner/verdict
 * 运行阶段结果判定（文档 §8.1/§8.2）。
 */
import type { ExecResult } from './execute.js';

// CE 不进入 judgeRun：Worker 在编译分支直接返回（文档 §5.1 ③）
export type Verdict = 'AC' | 'CE' | 'RE' | 'TLE' | 'MLE' | 'OLE' | 'IE';

/** 只判定运行阶段；CE 在 Worker 的编译分支里直接返回 */
export function judgeRun(r: ExecResult): Verdict {
  // 顺序敏感：OLE 要排在 TLE 前面（文档 §8.1）。
  // 否则「输出爆炸 + 被 kill」会被报成 TLE，掩盖真实死因。
  if (r.truncated) return 'OLE';
  if (r.oomKilled) return 'MLE';
  if (r.timedOut || r.exitCode === 137) return 'TLE';   // 137 = 128+SIGKILL
  if (r.exitCode === null) return 'IE';                 // 连退出码都拿不到
  // 1..128：程序自身的退出码（未捕获异常、assert、process.exit(n)）→ RE
  // 实测修正：文档 §8.2 的代码把 exit 1 归入 IE，与 §8.1 表的 RE 矛盾，按表修正
  if (r.exitCode <= 128) return r.exitCode === 0 ? 'AC' : 'RE';
  if (r.exitCode === 139 || r.exitCode === 134) return 'RE';  // SIGSEGV / SIGABRT
  return 'IE';   // 136/138/141/143 等不可解释信号 → 报「我不知道」
  // 注：AC 只表示「跑完了」，不代表答案正确（文档 §8.1 警示框）
}
