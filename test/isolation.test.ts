/**
 * @module test/isolation
 * 隔离自测用例集（文档 §11.2/§11.3）——「敢跑」的验收标准。
 * 任何人改 dockerOptions.ts，都会被这里挡住：安全参数最容易在重构时被顺手删掉，
 * 而那种删除在功能测试里完全看不出来。
 *
 * 运行前提：docker 可用、三个沙箱镜像已构建。
 */
import { test, expect, afterAll } from 'vitest';
import { mkdir, mkdtemp, writeFile, chown, chmod, rm } from 'node:fs/promises';
import path from 'node:path';
import Docker from 'dockerode';
import { profiles } from '../src/lang/profiles.js';
import { executeInSandbox } from '../src/runner/execute.js';
import { judgeRun } from '../src/runner/verdict.js';
import { limits, jobsBaseDir, dockerSocketPath, poolEnabled, sandboxRuntime } from '../src/config.js';

/** 直接走执行器（不经队列），隔离测试关注的是沙箱参数本身 */
async function runInSandbox(lang: 'node' | 'python' | 'cpp', source: string, stdin = '') {
  await mkdir(jobsBaseDir, { recursive: true });
  const profile = profiles[lang];
  const dir = await mkdtemp(path.join(jobsBaseDir, 'job-'));
  try {
    await writeFile(path.join(dir, profile.sourceFile), source, { mode: 0o644 });
    await chown(dir, limits.runAsUid, limits.runAsGid).catch(() => {});
    await chmod(dir, 0o777);
    return await executeInSandbox({ hostDir: dir, needExec: false }, profile, stdin);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

// §11.2 用例 1：网络隔离（NetworkMode: none）
// 实测修正：文档用域名 expect 立刻失败，但 network:none 下 DNS 查询会挂起直到兜底 kill，
// 改用 IP 直连（无路由 → 内核立刻返回 ENETUNREACH）才是确定性行为
test('隔离 · 网络外联被阻断', async () => {
  const r = await runInSandbox('node', "fetch('http://1.2.3.4').catch(e => console.log(e.cause?.code ?? e.name))");
  expect(r.stdout + r.stderr).toMatch(/ENETUNREACH|EAI_AGAIN|UND_ERR|TimeoutError/);
}, 30_000);

// §11.2 用例 2：根文件系统只读（ReadonlyRootfs）
test('隔离 · 根文件系统只读', async () => {
  const r = await runInSandbox('node', "require('fs').writeFileSync('/root/a.txt','x')");
  expect(r.stdout + r.stderr).toMatch(/EACCES|EROFS/);
}, 30_000);

// §11.2 用例 3：宿主文件不可见（挂载白名单 + 非 root）
test('隔离 · 宿主敏感文件不可读', async () => {
  const r = await runInSandbox('node', "require('fs').readFileSync('/etc/shadow')");
  expect(r.stdout + r.stderr).toMatch(/EACCES|ENOENT/);
}, 30_000);

// /tmp tmpfs 必须可写（mode=1777 实测修正的回归用例：Docker 默认 mode 755 会让 nobody 写不进）
test('隔离 · /tmp 对用户代码可写', async () => {
  const r = await runInSandbox('node', "require('fs').writeFileSync('/tmp/x.txt','ok'); console.log('writable')");
  expect(r.stdout).toContain('writable');
}, 30_000);

// §11.2 用例 4：fork 炸弹被 PidsLimit 拦住
test('隔离 · fork 炸弹被 PidsLimit 拦住', async () => {
  const r = await runInSandbox(
    'node',
    "const {fork}=require('child_process'); for(let i=0;i<200;i++) fork(process.argv[1])",
  );
  expect(judgeRun(r)).toBe('RE');   // fork 失败抛异常，程序自身退出
}, 30_000);

// §11.2 用例 5：内存炸弹 → MLE（OOMKilled 标志）
test('隔离 · 内存炸弹 → MLE', async () => {
  const r = await runInSandbox('node', 'const a=[]; while(1) a.push(Buffer.alloc(1<<20))');
  // gVisor（runsc）实测降级：不设置容器 OOMKilled 标志，兜底计时器接管 → 判 TLE
  //（§12.3 兼容性差异，见 docs/gvisor-对比.md，非 bug）
  expect(judgeRun(r)).toBe(sandboxRuntime === 'runsc' ? 'TLE' : 'MLE');
}, 30_000);

// §11.2 用例 6：死循环 → TLE（宿主兜底计时器，wallMs 略大于 5000）
test('隔离 · 死循环 → TLE', async () => {
  const r = await runInSandbox('node', 'while(true){}');
  expect(judgeRun(r)).toBe('TLE');
  expect(r.wallMs).toBeGreaterThanOrEqual(5_000);
}, 30_000);

// §11.2 用例 7：输出轰炸 → OLE（truncated 标记，采集内存不失控）
test('隔离 · 输出轰炸 → OLE', async () => {
  const r = await runInSandbox('node', "for(let i=0;i<1e6;i++) console.log('x'.repeat(1000))");
  expect(judgeRun(r)).toBe('OLE');
  expect(r.truncated).toBe(true);
  expect(r.stdout.length).toBeLessThanOrEqual(limits.outputBytes);
}, 30_000);

// §11.2 用例 10：残留检查——沙箱容器必须被回收。
// 池化模式下常驻容器（running 的 sleep infinity）是合法存在（§11.2「或等于池大小」），
// 泄漏 = 非池化的 sandbox-* 容器（冷路径残留 / 池容器被杀死后没销毁）
afterAll(async () => {
  const docker = new Docker({ socketPath: dockerSocketPath });
  const list = await docker.listContainers({ all: true });
  const leaks = list.filter((c) => {
    if (!(c.Image ?? '').startsWith('sandbox-')) return false;
    const isPoolWarm = c.Command === 'sleep infinity' && c.State === 'running';
    return poolEnabled ? !isPoolWarm : true;
  });
  expect(leaks).toEqual([]);
});
