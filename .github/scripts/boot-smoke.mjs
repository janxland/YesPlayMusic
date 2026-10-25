// 真实浏览器挂载冒烟：部署后用 runner 预装 Chrome 实际执行站点 bundle，
// 断言 #app-root 渲染出内容且无页面级 JS 错误。
// 背景（2026-10-25）：TDZ 循环初始化崩溃的 bundle 通过了全部 HTTP 层检查
// （curl 状态码、bot 元数据页、/api 403），但一执行就 ReferenceError——
// HTTP 冒烟对此类回归完全失明。
// 用法：node boot-smoke.mjs [url]（默认生产域名）
// ⚠️ 必须覆盖 UA：无头 Chrome 默认 UA 含 "HeadlessChrome"，会被自家
// 爬虫门（middleware 的 BOT_UA_RE / nginx 的 $music_bot 都匹配 headless）
// 识别为爬虫喂 bot.html，误报挂载失败。
import puppeteer from 'puppeteer-core';

const url = process.argv[2] || 'https://music.vercel.roginx.ink/';
const UA =
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';

const browser = await puppeteer.launch({
  executablePath: '/usr/bin/google-chrome',
  args: ['--no-sandbox', '--disable-dev-shm-usage'],
});

async function diagnose(page, pageErrors, badResponses) {
  try {
    const d = await page.evaluate(() => ({
      title: document.title,
      bootError: !!document.querySelector('.app-boot-error'),
      botPage: document.body.textContent.includes('一款颜值优先的第三方网易云音乐播放器'),
      mainScript: document.querySelector('script[src*="index-"]')?.src?.split('/').pop() || 'NONE',
      appChildren: document.getElementById('app-root')?.childElementCount ?? -1,
    }));
    console.error(
      `诊断: ${JSON.stringify(d)} | pageErrors=${JSON.stringify(pageErrors)} | 4xx/5xx=${JSON.stringify(badResponses.slice(0, 5))}`
    );
  } catch (e) {
    console.error('诊断失败:', String(e).slice(0, 200));
  }
}

try {
  const page = await browser.newPage();
  await page.setUserAgent(UA);
  const pageErrors = [];
  const badResponses = [];
  page.on('pageerror', e => pageErrors.push(String(e).slice(0, 300)));
  page.on('response', r => {
    if (r.status() >= 400) badResponses.push(r.status() + ' ' + r.url().slice(-60));
  });
  await page.goto(url + '?_smoke=' + Date.now(), {
    waitUntil: 'domcontentloaded',
    timeout: 45000,
  });
  try {
    await page.waitForFunction(
      () => {
        const el = document.getElementById('app-root');
        return !!el && el.childElementCount > 0;
      },
      { timeout: 25000 }
    );
  } catch (e) {
    await diagnose(page, pageErrors, badResponses);
    throw e;
  }
  // 再观察 3s：晚一点的运行时错误（懒路由、SW 更新流）也算失败
  await new Promise(r => setTimeout(r, 3000));
  const mounted = await page.evaluate(
    () => document.getElementById('app-root')?.childElementCount ?? 0
  );
  if (mounted === 0) {
    await diagnose(page, pageErrors, badResponses);
    throw new Error('#app-root 未渲染');
  }
  if (pageErrors.length) {
    await diagnose(page, pageErrors, badResponses);
    throw new Error('页面 JS 错误: ' + pageErrors.join(' | '));
  }
  console.log(`✅ 真实浏览器挂载冒烟通过（${url} → #app-root 已渲染，无 JS 错误）`);
} finally {
  await browser.close();
}
