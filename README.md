# code-exec-api

基于 Node.js + Docker 的在线代码执行服务：接收不可信代码，在资源受限的容器沙箱中运行，结构化返回 stdout / stderr / 耗时 / 退出码。

所有与外部参考实现不符之处都是实测修正，记录在代码注释与 [docs/实测偏差.md](docs/实测偏差.md)。

## 快速开始

```bash
npm install                      # 装依赖
npm run sandbox:python           # 构建三种沙箱镜像（首次）
npm run sandbox:node
npm run sandbox:cpp
docker compose up -d             # 起 redis（本机映射 6380）
npm run dev                      # 起 API + Worker
open http://localhost:3000       # 代码提交测试页
```

## 测试

```bash
npm test                         # 冷路径模式：API 契约 4 条 + 隔离自测 8 条
SANDBOX_POOL=1 npm test          # 池化模式：额外跑容器池 8 条（残留/复用上限）
```

隔离测试需要 docker 与三个沙箱镜像。测试文件顺序执行：隔离用例需要连续跑，且并行会给 VM 叠加负载。

## 环境变量

| 变量 | 默认 | 说明 |
|---|---|---|
| `API_PORT` | `3000` | API 端口 |
| `REDIS_URL` | `redis://localhost:6380` | Redis 地址（本机 6379 被占用故映射 6380） |
| `SANDBOX_RUNTIME` | `runc` | 改 `runsc` 切换 gVisor |
| `SANDBOX_POOL` | `''` | `1` 启用容器池 |
| `POOL_SIZE` | `4` | 每种镜像预热容器数 |
| `JOBS_DIR` | `~/.code-exec/jobs` | 冷路径任务临时目录（colima 只共享 $HOME） |
| `DOCKER_SOCKET` | 探测式 | docker socket（colima / Docker Desktop / Linux） |
| `LOG_LEVEL` | `info` | pino 日志级别 |

## 容器化部署

`docker compose up -d --build` 会构建 api 镜像并编排 redis + api（含 docker.sock 挂载——**等价于把该容器变成宿主 root**，生产必须拆机部署）。

> ⚠ 本机是 colima 环境：colima(vz) 只共享 `$HOME`，宿主的 `/tmp` 与 `/var/run/docker.sock` 都不可用，容器化部署在本机跑不通，请继续用 `npm run dev`。此编排面向 Linux / Docker Desktop。

## gVisor（M5）——已完成

runsc release-20260914.0 已装入 colima VM 并注册为 Docker runtime。切换（不改一行代码）：

```bash
SANDBOX_RUNTIME=runsc npm run dev                              # gVisor + 冷路径（cpp 不可用，见下）
SANDBOX_RUNTIME=runsc SANDBOX_POOL=1 npm run dev               # gVisor 的正确姿势（全语言可用）
SANDBOX_RUNTIME=runsc npm test                                 # 12/12 全绿
SANDBOX_RUNTIME=runsc SANDBOX_POOL=1 npm test                  # 20/20 全绿
```

对比实验结论见 [docs/gvisor-对比.md](docs/gvisor-对比.md)：本机冷启动实测 ~5ms（池化在本机是负优化）；cpp 冷路径在 runsc 下编译失败（gofer 对 virtiofs 绑定挂载 reopen 拒绝）；MLE 判定在 runsc 下降级为 TLE（无 OOMKilled 标志）。卸载/回滚见 VM 内 `/etc/docker/daemon.json.bak-before-runsc`。

## Commit 历史

| Commit | 内容 |
|---|---|
| `6459f17` | 项目骨架 |
| `8365d42` | config + redis 连接 |
| `f8962b9` | 语言画像 + 沙箱参数构造 |
| `4e5f426` | 执行器 + 结果判定 |
| `682da52` | 队列 + Worker + 存储 |
| `806785f` | HTTP API + SSE + 限流 |
| `abdcbe0` | 代码提交测试页 |
| `c48da26` | 隔离自测 + API 测试 |
| `21db7c9` | 结构化日志 |
| `b050757` | 容器池（M4） |
| `ca2c6c2` | 部署编排 + 项目文档目录 |
| `12195c0` | gVisor 对比实验（M5） |
| `3b801ac` | 注释清理 + .env 补全 |
