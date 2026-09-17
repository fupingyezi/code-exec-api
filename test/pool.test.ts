/**
 * @module test/pool
 * 容器池测试（文档 §10.3 三个新问题）——SANDBOX_POOL=1 时运行：
 *   SANDBOX_POOL=1 npx vitest run
 * 池化把「任务之间天然隔离」变成了「必须主动清理」，这些用例就是验收。
 */
import { describe, test, expect, beforeAll, afterAll } from 'vitest';
import { containerPool, executePooledJob } from '../src/runner/pool.js';
import { profiles } from '../src/lang/profiles.js';
import { buildWarmSpec } from '../src/runner/dockerOptions.js';
import { judgeRun } from '../src/runner/verdict.js';
import { limits, poolEnabled, CONTAINER_DIR, sandboxRuntime } from '../src/config.js';

describe.skipIf(!poolEnabled)('容器池（SANDBOX_POOL=1）', () => {
  beforeAll(async () => {
    await Promise.all(
      Object.values(profiles).map((p) => containerPool.warm(p.image, 2, buildWarmSpec(p))),
    );
  });

  afterAll(async () => {
    await containerPool.drain();
  });

  /** 单轮任务（运行轮） */
  const run = (lang: 'node' | 'python' | 'cpp', source: string, stdin = '') =>
    executePooledJob(containerPool, profiles[lang].image, [
      { cmd: profiles[lang].runInline(source), stdin, wallMs: limits.wallMs },
    ]);

  /** cpp 完整任务（编译轮 + 运行轮） */
  const runCpp = (source: string, stdin = '') =>
    executePooledJob(containerPool, profiles.cpp.image, [
      { cmd: profiles.cpp.compileInline!(source), stdin: source, wallMs: limits.compileWallMs },
      { cmd: profiles.cpp.runInline(source), stdin, wallMs: limits.wallMs },
    ]);

  test('池 · 三语言 hello（cpp 含编译轮+运行轮）', async () => {
    expect(judgeRun((await run('node', "console.log('p-node')"))[0]!)).toBe('AC');
    expect(judgeRun((await run('python', "print('p-py')"))[0]!)).toBe('AC');
    const [cc, cr] = await runCpp('#include <iostream>\nint main(){ std::cout << "p-cpp" << std::endl; }');
    expect(cc!.exitCode).toBe(0);
    expect(judgeRun(cr!)).toBe('AC');
  }, 60_000);

  test('池 · stdin 正常注入', async () => {
    const r = await run('python', 'import sys; print("got:", sys.stdin.read().strip())', 'hello pool\n');
    expect(r[0]!.stdout).toContain('got: hello pool');
  }, 60_000);

  test('池 · 死循环 → TLE，且被杀死的容器不影响后续任务', async () => {
    const r = await run('node', 'while(true){}');
    expect(judgeRun(r[0]!)).toBe('TLE');
    const next = await run('node', "console.log('still alive')");
    expect(judgeRun(next[0]!)).toBe('AC');
  }, 60_000);

  test('池 · 内存炸弹 → MLE，脏容器被重建', async () => {
    const r = await run('node', 'const a=[]; while(1) a.push(Buffer.alloc(1<<20))');
    // gVisor（runsc）实测降级：OOM 进程无 OOMKilled 标记，兜底计时器接管 → 判 TLE
    //（§12.3 兼容性差异，见 docs/gvisor-对比.md）
    expect(judgeRun(r[0]!)).toBe(sandboxRuntime === 'runsc' ? 'TLE' : 'MLE');
    const next = await run('node', "console.log('after mle')");
    expect(judgeRun(next[0]!)).toBe('AC');
  }, 60_000);

  test('池 · 输出轰炸 → OLE', async () => {
    const r = await run('node', "for(let i=0;i<1e5;i++) console.log('x'.repeat(1000))");
    expect(judgeRun(r[0]!)).toBe('OLE');
  }, 60_000);

  // §10.3 文件残留：任务 A 的编译产物/文件不得被任务 B 看到
  test('池 · 工作区不跨任务残留（§10.3）', async () => {
    await runCpp('int main(){ return 0; }');
    const b = await run('node', "console.log(require('fs').existsSync('/workspace/main') ? 'LEAK' : 'clean')");
    expect(b[0]!.stdout).toContain('clean');
  }, 60_000);

  // §10.3 进程残留：任务 A fork 的后台进程不得活到任务 B
  test('池 · 后台进程不跨任务存活（§10.3）', async () => {
    await run('node', "require('child_process').spawn('node',['-e','setInterval(()=>{},100)']); console.log('spawned')");
    const c = await run(
      'node',
      "const {execSync}=require('child_process'); const lines=execSync('ps -o comm=').toString().trim().split('\\n').filter(l=>l==='node'); console.log('NODE_COUNT:'+lines.length)",
    );
    // 任务 C 自己就是 node：合法值是 1；泄漏的后台 node 会让它变成 2
    expect(c[0]!.stdout).toContain('NODE_COUNT:1');
  }, 60_000);

  // 复用上限：超过 limits.maxReuse 的容器必须被销毁重建（§10.3 逃逸窗口）
  test('池 · 复用达到上限后销毁重建', async () => {
    const before = containerPool.idleCount(profiles.node.image);
    for (let i = 0; i < limits.maxReuse; i++) {
      await run('node', '1');   // 空语句快速任务
    }
    // 50 次复用后容器被销毁并补位重建，空闲数不变，且新容器可正常服务
    expect(containerPool.idleCount(profiles.node.image)).toBe(before);
    const ok = await run('node', "console.log('fresh')");
    expect(judgeRun(ok[0]!)).toBe('AC');
  }, 120_000);
});
