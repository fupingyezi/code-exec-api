/**
 * @module lang/profiles
 * 语言画像：描述每种受支持语言「如何执行」。
 *
 * 计划类型：
 *   interface LanguageProfile {
 *     id: string          // 'node' | 'python' | 'cpp'（与 validate.ts 枚举一致）
 *     image: string       // 沙箱镜像名（docker/sandbox-*.Dockerfile 构建产物）
 *     sourceFile: string  // 源码写入的文件名（如 main.py / main.cpp）
 *     compile?: string[]  // 编译命令（解释型语言缺省）
 *     run: string[]       // 运行命令
 *     limits: { ... }     // 该语言的默认资源限制（可被请求覆盖，取更小者）
 *   }
 *
 * 约束：
 *   - 新语言接入只需在此注册 + 新增沙箱 Dockerfile，不动其他模块
 *   - 命令模板中文件名用占位符统一替换，禁止字符串拼接注入
 */
