/**
 * @module api/validate
 * 请求体校验（zod schema）。
 *
 * 职责：
 *   - 定义 POST /run 的请求 schema：language、source、stdin、可选限制参数
 *   - language 枚举与 src/lang/profiles.ts 支持列表保持一致（以 config.ts 为准）
 *   - 导出校验函数，路由层直接复用；校验失败返回 400 与结构化错误
 *
 * 安全要点：
 *   - source/stdin 长度上限必须在此强制（防止超大 payload 直达队列）
 */
