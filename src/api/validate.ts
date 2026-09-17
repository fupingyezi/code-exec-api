/**
 * @module api/validate
 * 请求体校验（zod，文档 §4.1）。
 * 校验必须发生在入队之前：坏数据不能流入队列与沙箱。
 */
import { z } from 'zod';
import { limits } from '../config.js';

// lang 枚举需与 lang/profiles.ts 的注册列表保持同步（文档 §3）
export const runRequestSchema = z.object({
  lang: z.enum(['node', 'python', 'cpp']),
  // 源码长度上限 128 KiB（§4.1）。注：z.string().max 按字符数，ASCII 下与字节等价
  source: z.string().min(1).max(limits.sourceBytes),
  // stdin 上限 1 MiB（§4.1）
  stdin: z.string().max(limits.stdinBytes).default(''),
  limits: z
    .object({
      // 允许区间 500–15000（§4.1）：只能调小，不能绕过上限
      wallMs: z.number().int().min(500).max(15_000),
    })
    .optional(),
});

export type RunRequest = z.infer<typeof runRequestSchema>;
