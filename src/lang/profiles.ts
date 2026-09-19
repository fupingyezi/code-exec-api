/**
 * @module lang/profiles
 * 语言画像：描述每种受支持语言「如何执行」。
 * 加一门新语言 = 加一条 profile + 一个 Dockerfile，不动 runner/ 下任何一行。
 */
import { CONTAINER_DIR } from '../config.js';

export interface LangProfile {
  id: 'node' | 'python' | 'cpp';
  /** 沙箱镜像名（docker/sandbox-*.Dockerfile 构建产物） */
  image: string;
  /** 源码写入的文件名（位于容器内 CONTAINER_DIR，冷路径用） */
  sourceFile: string;
  /** 编译命令（仅编译型语言）；Worker 编译轮调用，失败直接 CE */
  compile?: (dir: string) => string[];
  /** 运行命令；dir 为容器内目录 */
  run: (dir: string) => string[];
  /** 池化路径的编译命令：源码经 stdin 注入（实现说明见 pool.ts） */
  compileInline?: (source: string) => string[];
  /** 池化路径的运行命令：源码经 argv 注入 */
  runInline: (source: string) => string[];
}

export const profiles: Record<LangProfile['id'], LangProfile> = {
  node: {
    id: 'node',
    image: 'sandbox-node:latest',
    sourceFile: 'main.js',
    run: (dir) => ['node', `${dir}/main.js`],
    runInline: (source) => ['node', '-e', source],
  },

  python: {
    id: 'python',
    image: 'sandbox-python:latest',
    sourceFile: 'main.py',
    // -I：隔离模式，忽略 PYTHONPATH / PYTHONSTARTUP 等环境变量注入
    run: (dir) => ['python3', '-I', `${dir}/main.py`],
    runInline: (source) => ['python3', '-I', '-c', source],
  },

  cpp: {
    id: 'cpp',
    image: 'sandbox-cpp:latest',
    sourceFile: 'main.cpp',
    compile: (dir) => [
      'g++', '-std=c++17', '-O2', '-o', `${dir}/main`, `${dir}/main.cpp`,
    ],
    run: (dir) => [`${dir}/main`],
    // -x c++ -：从 stdin 读源码；-o 落在 /workspace tmpfs（exec 选项已开）
    compileInline: () => ['g++', '-std=c++17', '-O2', '-o', `${CONTAINER_DIR}/main`, '-x', 'c++', '-'],
    runInline: () => [`${CONTAINER_DIR}/main`],
  },
};
