# 沙箱镜像：Node 执行环境
FROM node:18-alpine

# 基础镜像已自带 nobody(65534)，直接以该身份运行。
# （addgroup/adduser 创建 65534 会因 gid 已被 nobody 组占用而构建失败，
#   实测修正：删掉创建用户的步骤）

# 删掉包管理器：npm 是攻击者的工具
RUN npm uninstall -g npm 2>/dev/null || true

WORKDIR /workspace

# 预热一次运行时，让 V8 字节码缓存落到镜像层（减少首次执行抖动）
RUN node -e "console.log(1)" > /dev/null

# 镜像层声明非 root
USER 65534:65534

# 清空 ENTRYPOINT，命令完全由 HostConfig.Cmd 决定
ENTRYPOINT []
