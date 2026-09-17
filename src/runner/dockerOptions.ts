/**
 * @module runner/dockerOptions
 * ★ 沙箱参数构造——安全核心全在这个文件。
 *
 * 职责：根据语言画像（lang/profiles.ts）+ 任务限制，构造 dockerode 的
 * ContainerCreateOptions / HostConfig。
 *
 * 安全清单（每一项都对应一类攻击面）：
 *   - 网络隔离：NetworkMode 'none'（阻断外联、横向访问宿主服务）
 *   - 资源限制：Memory / NanoCpus / PidsLimit（防 OOM、CPU 打满、fork 炸弹）
 *   - 用户隔离：User 非 root + SecurityOpt no-new-privileges
 *   - 文件系统只读：ReadonlyRootfs + 可写 tmpfs（工作目录、/tmp）
 *   - 能力裁剪：CapDrop ALL（必要时仅加回所需 capability）
 *   - 输出限制：stdout/stderr 由 capture.ts 兜底，超限截断
 *
 * 约束：
 *   - 本文件是唯一允许出现 docker 安全参数的地方
 *   - 所有数值来自 config.ts，禁止魔法数字
 */
