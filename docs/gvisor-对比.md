# gVisor（runsc）对比实验报告（文档 §12.3，M5）

本机环境：macOS + colima(vz) VM（4 GiB / aarch64），runsc release-20260914.0 装入 VM 并注册为 Docker runtime。切换方式：`SANDBOX_RUNTIME=runsc`，代码零改动。

## 1. 耗时对比（实测，5 次取平均）

### 冷路径（每任务一个容器）

| 语言 | runtime | 总耗时 | 执行 wallMs | 冷启动 ≈ |
|---|---|---|---|---|
| node | runc | 83 ms | 78 ms | **5 ms** |
| node | runsc | 192 ms | 187 ms | 5 ms |
| python | runc | 60 ms | 55 ms | **5 ms** |
| python | runsc | 102 ms | 98 ms | 4 ms |
| cpp | runc | 56 ms | 53 ms | 3 ms |
| cpp | runsc | — | — | **编译失败（见 §3）** |

### 池化路径（常驻容器 + exec）

| 任务 | runc | runsc |
|---|---|---|
| node hello | 168 ms | 199 ms |
| python hello | 165 ms | 166 ms |
| cpp 编译+运行 | 227 ms | 297 ms |

### 结论（与文档估值的出入）

1. **文档 §10.1 的「冷启动 ≈ 500ms 是物理下限」在本机不成立**：实测仅 ~5 ms。原因是 colima 的 daemon 在 VM 内、镜像层已在 VM 缓存、沙箱镜像是几 MB 的 alpine——没有文档假设的「拉取 + 解压 + cgroup 初始化」大头。文档也声明过所有耗时是量级估算，以实测为准。
2. **本机池化是负优化**：池化每条任务有 3 个 exec（清工作区、执行、收残留），exec 的 create + inspect 轮询固定开销 ~110 ms，大于冷启动的 5 ms。池化收益要在「容器创建成本 > exec 开销」的环境才成立（文档的 500ms 模型）。
3. **gVisor 的代价在执行不在启动**（文档 §10.1 的图 3 注）：node 执行 78→187 ms（×2.4，syscall 拦截开销），启动本身几乎不涨。这与文档「runsc 启动 800ms+」的估算不符，但与「执行时间不变」也不符——本机实测执行时间显著上涨。

## 2. 自测用例对比（同一套测试，两种 runtime）

| 用例 | runc | runsc | 说明 |
|---|---|---|---|
| 网络外联被阻断 | ✓ | ✓ | |
| 根文件系统只读 | ✓ | ✓ | |
| 宿主敏感文件不可读 | ✓ | ✓ | |
| /tmp 可写 | ✓ | ✓ | |
| fork 炸弹被拦住 | ✓ | ✓ | gVisor 的 pids 限制生效 |
| 内存炸弹 → MLE | **MLE** | **TLE（降级）** | gVisor 不设置容器 OOMKilled 标志，兜底计时器接管 |
| 死循环 → TLE | ✓ | ✓ | |
| 输出轰炸 → OLE | ✓ | ✓ | |
| 容器残留检查 | ✓ | ✓ | |
| 池化 8 用例（含 cpp 编译+运行） | ✓ 8/8 | ✓ 8/8 | 池化的 /workspace 是 gVisor 内部 tmpfs，不经过 gofer |

## 3. 兼容性实测：cpp 冷路径在 runsc 下不可用

**现象**：`ld: reopening /workspace/main: Permission denied`，编译轮全部失败（任务会误判为 CE）。

**原因链**：冷路径的 /workspace 是宿主管道上的 virtiofs 绑定挂载（colima 只共享 $HOME）；gVisor 的文件访问经 gofer 代理，`ld` 写完后**重开输出文件做 final link**（open→write→close→reopen 序列）时被拒绝。runc 下同一目录（chmod 777）正常；runsc 直接 docker run 写 755 目录也复现同样错误。

**结论**：不是 gVisor 本身不能编译——池化模式下（/workspace 是沙箱内部 tmpfs，不经 gofer）cpp 编译+运行全绿。**冷路径 + cpp + runsc 是已知不可用组合**，用 runsc 时请搭配池化模式（`SANDBOX_RUNTIME=runsc SANDBOX_POOL=1`）。

## 4. MLE 判定降级

runc 下内存炸弹 → 容器 OOMKilled=true → 判 MLE。runsc 下 gVisor 对 cgroup 内存超限的进程终止不反映到容器 State.OOMKilled，兜底计时器 5s 后 SIGKILL → 判 TLE。

影响：**runsc 下无法区分 TLE 与 MLE**。可接受的替代：探测 stderr 的运行时 OOM 特征（node 的 `FATAL ERROR: ... out of memory` / gVisor 的 OOM 消息），做成按 runtime 切换的辅助判定——留给后续迭代。

## 5. 使用建议（本机）

| 组合 | 可用性 | 适用场景 |
|---|---|---|
| runc + 冷路径 | ✓ 全绿 | 默认；本机冷启动只要 5ms，没有池化必要 |
| runc + 池化 | ✓ 全绿 | 本机无收益（负优化），练手/压测用 |
| runsc + 冷路径 | ✓ 除 cpp 外全绿 | 想用 gVisor 时 node/python 可用 |
| runsc + 池化 | ✓ 全绿 | **gVisor 的正确姿势**；cpp 可用、MLE 降级为 TLE |

同一份代码在两种 runtime 下的差异：**cpp 冷路径（CE 假象）与内存炸弹（MLE→TLE）**。这就是「我知道我的隔离方案边界在哪」的实证——切 runsc 后出现 CE 先查 runtime 组合，出现 TLE 先想 MLE 降级。
