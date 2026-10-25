// 真实浏览器挂载冒烟：部署后用 runner 预装 Chrome 实际执行站点 bundle，
// 断言 #app-root 渲染出内容且无页面级 JS 错误。
// 背景（2026-10-25）：TDZ 循环初始化崩溃的 bundle 通过了全部 HTTP 层检查
// （curl 状态码、bot 元数据页、/api 403），但一执行就 ReferenceError——
// HTTP 冒烟对此类回归完全失明。
// 用法：node .github/scripts/boot-smoke.mjs [url]（默认生产域名）
import puppeteer from 'puppeteer-core';

const url = process.argv[2] || 'https://music.vercel.roginx.ink/';

const browser = await puppeteer.launch({
  executablePath: '/usr/bin/google-chrome',
  args: ['--no-sandbox', '--disable-dev-shm-usage'],
});
try {
  const page = await browser.newPage();
  const pageErrors = [];
  page.on('pageerror', e => pageErrors.push(String(e).slice(0, 300)));
  await page.goto(url + '?_smoke=' + Date.now(), {
    waitUntil: 'domcontentloaded',
    timeout: 45000,
  });
  await page.waitForFunction(
    () => {
      const el = document.getElementById('app-root');
      return !!el && el.childElementCount > 0;
    },
    { timeout: 20000 }
  );
  // 再观察 3s：晚一点的运行时错误（懒路由、SW 更新流）也算失败
  await new Promise(r => setTimeout(r, 3000));
  const mounted = await page.evaluate(
    () => document.getElementById('app-root')?.childElementCount ?? 0
  );
  if (mounted === 0) throw new Error('#app-root 未渲染');
  if (pageErrors.length) {
    throw new Error('页面 JS 错误: ' + pageErrors.join(' | '));
  }
  console.log(`✅ 真实浏览器挂载冒烟通过（${url} → #app-root 已渲染，无 JS 错误）`);
} finally {
  await browser.close();
}
