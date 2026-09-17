# 沙箱镜像：C/C++ 编译 + 执行环境（编译与执行同镜像）
# 编译阶段需要 tmpfs 可执行（dockerOptions 的 needExec），运行阶段不需要
FROM gcc:12

# 基础镜像已自带 nogroup/nobody(65534)，直接以该身份运行。
# （文档原版 groupadd/useradd 会因 GID 65534 已被占用而构建失败，实测修正）

WORKDIR /workspace
USER 65534:65534
ENTRYPOINT []
