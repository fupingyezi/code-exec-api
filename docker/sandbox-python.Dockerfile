# 沙箱镜像：Python 执行环境
# 安全要求同 sandbox-node.Dockerfile：
#   - 非 root 用户运行
#   - 不暴露网络
FROM python:3.12-alpine

# 创建非 root 用户：用户代码以最小权限运行
RUN adduser -D -u 1000 sandbox \
    && mkdir -p /sandbox \
    && chown sandbox:sandbox /sandbox

WORKDIR /sandbox
USER sandbox

# -I：隔离模式，忽略 PYTHONPATH / 用户级 site-packages，防止环境注入
# -u：关闭 stdout 缓冲，输出实时到达采集端（对后续 capture.ts 很重要）
ENTRYPOINT ["python", "-I", "-u"]