# 沙箱镜像：Python 执行环境
FROM python:3.11-alpine

# 基础镜像已自带 nobody(65534)，直接以该身份运行。
# （addgroup/adduser 创建 65534 会因 gid 已被 nobody 组占用而构建失败，
#   实测修正：删掉创建用户的步骤）

# 运行镜像不留包管理器：pip 是攻击者的工具
RUN pip uninstall -y pip 2>/dev/null || true

WORKDIR /workspace

# 镜像层声明非 root
USER 65534:65534

# 清空 ENTRYPOINT：命令完全由 HostConfig.Cmd 决定（python3 -I main.py）
ENTRYPOINT []
