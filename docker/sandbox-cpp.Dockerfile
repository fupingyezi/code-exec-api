# 沙箱镜像：C/C++ 编译 + 执行环境（编译与执行同镜像）
# 安全要求同 sandbox-node.Dockerfile，额外注意：
#   - 编译产物写入可执行目录（tmpfs），运行时文件系统只读
# TODO:
#   FROM gcc:14 或 alpine + g++
#   - 创建受限用户与工作目录 /sandbox
#   - 设置默认 CMD / ENTRYPOINT（配合编译/运行两阶段命令）
