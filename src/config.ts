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
