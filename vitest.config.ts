import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // 测试文件顺序执行：
    // ① 文档 §11.2 要求隔离用例连续跑（组合攻击才有意义）
    // ② 池测试 + 隔离测试并行会给 colima VM 叠加负载，容器回收偶发失败（实测踩坑）
    fileParallelism: false,
  },
});
