# code-exec-api

基于 Node.js + Docker 的在线代码执行服务：接收不可信代码，在资源受限的容器沙箱中运行，结构化返回 stdout / stderr / 耗时 / 退出码。

实现对照 `/Users/yoshiko/WorkBuddy/2026-09-17-12-59-18/code-exec-api-doc/code-exec-api-技术文档.md`（以下简称「文档」），逐章节对应；所有与文档不符之处都是**实测修正**，记录在代码注释与 [docs/实测偏差.md](docs/实测偏差.md)。

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
SANDBOX_POOL=1 npm test          # 池化模式：额外跑容器池 8 条（§10.3 三问题 + 复用上限）
```

隔离测试需要 docker 与三个沙箱镜像。测试文件顺序执行（文档 §11.2 要求用例连续跑）。

## 环境变量

| 变量 | 默认 | 说明 |
|---|---|---|
| `API_PORT` | `3000` | API 端口 |
| `REDIS_URL` | `redis://localhost:6380` | Redis 地址（本机 6379 被占用故映射 6380） |
| `SANDBOX_RUNTIME` | `runc` | 改 `runsc` 切换 gVisor（文档 §12.2） |
| `SANDBOX_POOL` | `''` | `1` 启用容器池（文档 §10，M4） |
| `POOL_SIZE` | `4` | 每种镜像预热容器数 |
| `JOBS_DIR` | `~/.code-exec/jobs` | 冷路径任务临时目录（colima 只共享 $HOME） |
| `DOCKER_SOCKET` | 探测式 | docker socket（colima / Docker Desktop / Linux） |
| `LOG_LEVEL` | `info` | pino 日志级别 |

## 容器化部署（附录 C）

`docker compose up -d --build` 会构建 api 镜像并编排 redis + api（含 docker.sock 挂载——**等价于把该容器变成宿主 root**，生产必须拆机部署，见文档 §13）。

> ⚠ 本机是 colima 环境：colima(vz) 只共享 `$HOME`，宿主的 `/tmp` 与 `/var/run/docker.sock` 都不可用，容器化部署在本机跑不通，请继续用 `npm run dev`。此编排面向 Linux / Docker Desktop。

## M5 进阶（gVisor，文档 §12）

1. 安装 runsc（本机尚未安装，需要 sudo）：
   ```bash
   ARCH=$(uname -m)
   URL="https://storage.googleapis.com/gvisor/releases/release/latest/${ARCH}"
   wget "${URL}/runsc" "${URL}/runsc.sha512"
   sha512sum -c runsc.sha512
   chmod a+rx runsc && sudo mv runsc /usr/local/bin/
   sudo runsc install && sudo systemctl restart docker   # colima 环境需在 VM 内配置
   docker run --rm --runtime=runsc alpine dmesg | head -1
   ```
2. 切换（不改一行代码）：`SANDBOX_RUNTIME=runsc npm run dev`
3. 同一套测试在两种 runtime 下各跑一遍，按文档 §12.3 记录对比表：用例 × 两种 runtime ×（启动耗时 / 执行耗时 / verdict），写进 `docs/`。

## Commit → 文档章节对照

| Commit | 内容 | 文档 |
|---|---|---|
| `6459f17` | 项目骨架 | §3 |
| `8365d42` | config + redis 连接 | 附录A / §9 |
| `f8962b9` | 语言画像 + 沙箱参数构造 | §6.2 / §7.3 |
| `4e5f426` | 执行器 + 结果判定 | §7.2 / §8 |
| `682da52` | 队列 + Worker + 存储 | §5 / §9 |
| `806785f` | HTTP API + SSE + 限流 | §4 |
| `abdcbe0` | 代码提交测试页 | — |
| `c48da26` | 隔离自测 + API 测试 | §11 |
| `21db7c9` | 结构化日志 | 附录B |
| `b050757` | 容器池（M4） | §10 |
