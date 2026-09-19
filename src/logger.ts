/**
 * @module logger
 * 结构化日志：统一走 pino。
 * 纪律：日志里绝不打印源码全文（source 是敏感数据且可能巨大）。
 */
import pino from 'pino';

export const logger = pino({
  level: process.env.LOG_LEVEL ?? 'info',
});
