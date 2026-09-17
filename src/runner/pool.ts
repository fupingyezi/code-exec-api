/**
 * @module runner/pool
 * 容器池（阶段三）。
 *
 * 目标：复用预热容器，消除 create/start 冷启动开销。
 *
 * 计划设计：
 *   - 按语言画像分池（node / python / cpp 各自一个池）
 *   - 租借/归还接口：acquire(profile) / release(container)
 *   - 池内容器执行前必须重置状态：
 *     清空工作目录残留、终止残留进程、恢复资源计数
 *   - 健康检查与淘汰：超龄容器、异常容器（OOM 后）直接销毁重建
 *   - 池容量与并发度来自 config.ts
 *
 * 注意：
 *   - 阶段一/二不实现，execute.ts 每次新建容器即可
 *   - 复用容器对隔离性的削弱需要专门评估（test/isolation.test.ts 覆盖）
 */
