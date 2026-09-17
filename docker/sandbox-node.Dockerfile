# 沙箱镜像：Node.js 执行环境
# 安全要求（与 src/runner/dockerOptions.ts 的约束互相配合）：
#   - 非 root 用户运行（配合 User / SecurityOpt）
#   - 不暴露网络：仅 stdout/stderr 出数据
#   - 最小镜像体积，加速冷启动
# TODO:
#   FROM node:22-alpine
#   - 创建受限用户与工作目录 /sandbox，正确设置属主与权限
#   - 设置默认 CMD / ENTRYPOINT（以只读方式执行源码）
