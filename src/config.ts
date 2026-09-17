/**
 * @module config
 * 全局配置中心：所有常量集中于此，禁止在其他文件散落硬编码。
 *
 * 计划集中管理的常量（按域分组）：
 *   - server:  API_PORT、body 大小上限
 *   - redis:   REDIS_URL（BullMQ 连接，注意 maxRetriesPerRequest: null）
 *              本地开发默认 redis://localhost:6380（见 docker-compose.yml 端口映射）
 *   - queue:   队列名、默认 job options（尝试次数、超时、清理策略）
 *   - sandbox: 容器资源上限——CPU 配额、内存上限（含编译/运行两档）、
 *              pids 限制、磁盘（tmpfs）大小、执行总超时兜底
 *   - output:  stdout/stderr 采集上限（防 OLE 兜底）、SSE 相关配置
 *   - lang:    支持的语言列表（供校验与 profiles.ts 对照）
 *
 * 约束：
 *   - 其余模块只 import，不定义魔法数字
 *   - 环境变量读取统一封装在此（process.env 只在 config.ts 出现）
 */
export const config = {
  server: {
    port: Number(process.env.API_PORT ?? 3000),
  },

  redis: {
    // 与 docker-compose.yml 的端口映射保持一致
    url: process.env.REDIS_URL ?? 'redis://localhost:6380',
  },

  queue: {
    name: 'jobs',
    // 队列层超时必须大于沙箱兜底超时（sandbox.fallbackTimeoutMs）：
    // 若队列先超时，job 会被标记失败，但容器清理逻辑可能还没跑完
    jobTimeoutMs: 15_000,
  },

  sandbox: {
    memoryMb: 64,
    cpus: 0.5,
    pidsLimit: 64,
    tmpfsSizeMb: 16,
    // execute.ts 的兜底超时：即使容器内限时被绕过，到点必须 kill
    fallbackTimeoutMs: 10_000,
  },

  output: {
    // 输出采集上限（capture.ts），超过即截断 → 判 OLE
    maxBytes: 64 * 1024,
  },

  lang: {
    // 与 validate.ts 的枚举、lang/profiles.ts 的注册列表保持同步
    supported: ['python'] as const,
  },
} as const;

// 由 supported 推导出的联合类型，后续给 profiles / validate 复用
export type SupportedLang = (typeof config.lang.supported)[number];