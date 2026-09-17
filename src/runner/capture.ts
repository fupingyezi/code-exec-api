/**
 * @module runner/capture
 * 带上限的输出采集器（文档 §7.3）。
 * stdout 是不可信长度的数据源，budget 由 stdout + stderr 共享——
 * 分别限制的话，攻击者可以两边各写一份来翻倍占用。
 */
import { Writable } from 'node:stream';

export interface Capture {
  stdout: Writable;
  stderr: Writable;
  out(): string;
  err(): string;
  truncated(): boolean;
}

export function createCapture(
  budget: number,
  /** 每个原始块到达时的回调，SSE 分块输出用（文档 §4.3；§7.3 原版无此参数） */
  onChunk?: (kind: 'stdout' | 'stderr', text: string) => void,
): Capture {
  const outChunks: Buffer[] = [];
  const errChunks: Buffer[] = [];
  let used = 0;
  let cut = false;

  const sink = (chunks: Buffer[], kind: 'stdout' | 'stderr') =>
    new Writable({
      write(chunk: Buffer, _enc, cb) {
        onChunk?.(kind, chunk.toString('utf8'));
        if (used < budget) {
          const slice = chunk.subarray(0, budget - used);
          chunks.push(slice);
          used += slice.length;
          // 部分写入也发生过截断（文档原版漏了这一支，与 §4.2 语义不符，已修正）
          if (slice.length < chunk.length) cut = true;
        } else {
          cut = true;
        }
        cb();   // ★ 必须回调：否则流被反压，容器写 stdout 时永久阻塞
      },
    });

  return {
    stdout: sink(outChunks, 'stdout'),
    stderr: sink(errChunks, 'stderr'),
    out: () => Buffer.concat(outChunks).toString('utf8'),
    err: () => Buffer.concat(errChunks).toString('utf8'),
    truncated: () => cut,
  };
}
