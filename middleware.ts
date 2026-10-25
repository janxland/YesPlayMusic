/**
 * 爬虫识别层（Vercel Routing Middleware，Web 标准 API）
 *
 * 设计：单一职责、零依赖、无状态 ——
 *   /api/*               → 403（API 已解耦到 ncmapi.roginx.ink 直连，本域名上
 *                          /api 只剩爬虫与旧缓存页面；凡到边缘的请求都计费，
 *                          见 docs/vercel-cdn-request-reduction-plan.md）
 *   爬虫 UA + HTML 路由  → 直接返回内联元数据页（零 JS/CSS/图片，零子请求）
 *   爬虫 UA + 静态资源   → 403（不喂 JS/CSS/字体/图片给任何爬虫）
 *   伪造 UA 的爬虫       → /assets/ 强制 Referer 同源校验，无 Referer 一律 403
 *   人类浏览器           → 返回 undefined 继续原链路（静态文件 / SPA 回退）
 *
 * 搜索引擎 / AI 爬虫仍可正常收录（拿到元数据 HTML + sitemap），
 * 但拿不到 SPA 资源包 —— 资源请求数只来自真实用户。
 *
 * ⚠️ 部署链路（2026-10-25 事故教训）：
 *   1. 本文件必须随 dist 一起上传（deploy-vercel.yml 的 cp 步骤）。10-10~10-25
 *      线上产物从未包含它，护栏空转，爬虫把配额打到 3M/1M 触发账号暂停。
 *   2. 入口由 vercel.json 的 proxy.entrypoint 显式声明 —— middleware.ts 文件
 *      约定要求与 package.json 同级，dist 由 CLI 直传，显式配置不赌自动检测
 *      （dist 里的 package.json 也是为此补的）。
 *   3. bot 页内容直接内联返回（BOT_HTML）：不走 self-fetch —— 内部回源会把
 *      每个爬虫页的计费请求数翻倍，而爬虫是用量主因。内联副本必须与
 *      public/bot.html 保持一致，scripts/middleware-test.mjs 有一致性断言。
 */

// 爬虫 UA 特征：知名搜索引擎 / AI 爬虫 / SEO 工具 / 无头浏览器 / 通用 bot|spider|crawler 字样。
// 通用词已覆盖 *Bot / *Spider / *crawler 命名系列；显式列出的是不含这些字样的
// Agent（ChatGPT-User、Google-Extended、Meta-ExternalAgent 等）
const BOT_UA_RE =
  /(bot|crawler|spider|slurp|headless|scraper|chatgpt-user|claude-web|meta-externalagent|google-extended|facebookexternalhit|semrush|ahrefs|mj12|dotbot|petalbot|bytespider|dataforseo|serpstatbot|puppeteer|playwright|phantomjs|selenium|python-requests|scrapy|curl\/|wget)/i;

// 允许引用静态资源的来源（人类浏览器同源加载会带 Referer）
const REFERER_OK = /(^https?:\/\/([^/]*\.)?roginx\.ink|vercel\.app|localhost)/i;

// 静态资源后缀（命中即视为资源请求）
const ASSET_RE =
  /\.(js|mjs|css|map|woff2?|ttf|otf|eot|png|jpe?g|webp|gif|svg|ico|mp3|flac|wasm|wasm\.br|txt)$/i;

// 爬虫元数据页（与 public/bot.html 同步维护，勿单方面改动）
export const BOT_HTML = `<!DOCTYPE html>
<html lang="zh-CN">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>YesPlayMusic — 高颜值的第三方网易云音乐播放器</title>
    <meta name="description" content="YesPlayMusic — 一款颜值优先的第三方网易云音乐播放器。Web 在线版 + 桌面客户端 + PWA，无需安装即可使用。" />
    <meta name="keywords" content="YesPlayMusic,网易云音乐,音乐播放器,PWA,开源,在线听歌" />
    <meta name="robots" content="index,follow" />
    <link rel="canonical" href="https://music.roginx.ink/" />
    <link rel="icon" href="/favicon.ico" />
    <meta property="og:type" content="website" />
    <meta property="og:site_name" content="YesPlayMusic" />
    <meta property="og:title" content="YesPlayMusic — 高颜值的第三方网易云播放器" />
    <meta property="og:description" content="Web 在线版 + 桌面客户端 + PWA，无需安装即可使用" />
    <meta property="og:url" content="https://music.roginx.ink/" />
    <meta property="og:image" content="https://cos.roginx.ink/www/music/dist/img/icons/android-chrome-512x512.png" />
    <meta name="twitter:card" content="summary" />
    <script type="application/ld+json">
      {
        "@context": "https://schema.org",
        "@type": "WebApplication",
        "name": "YesPlayMusic",
        "applicationCategory": "MultimediaApplication",
        "operatingSystem": "Web, Windows, macOS, Linux",
        "description": "一款颜值优先的第三方网易云音乐播放器，提供 Web 在线版、桌面客户端与 PWA。",
        "url": "https://music.roginx.ink/",
        "offers": { "@type": "Offer", "price": "0", "priceCurrency": "CNY" }
      }
    </script>
  </head>
  <body>
    <h1>YesPlayMusic</h1>
    <p>一款颜值优先的第三方网易云音乐播放器。Web 在线版 + 桌面客户端 + PWA，无需安装即可使用。</p>
    <nav>
      <ul>
        <li><a href="https://music.roginx.ink/">首页</a></li>
        <li><a href="https://music.roginx.ink/search">搜索音乐</a></li>
        <li><a href="https://music.roginx.ink/leaderboard">排行榜</a></li>
        <li><a href="https://music.roginx.ink/playlist">歌单</a></li>
        <li><a href="https://github.com/janxland/YesPlayMusic">GitHub 开源仓库</a></li>
      </ul>
    </nav>
    <!-- 爬虫专用元数据页：不含任何 JS/CSS/图片资源引用（og:image 仅为元数据声明，不会被爬虫下载）。
         由 nginx / Vercel 边缘中间件按 UA 识别爬虫后 rewrite 到本页，人类浏览器永远看到完整 SPA。 -->
  </body>
</html>\n`;

function botPage(): Response {
  return new Response(BOT_HTML, {
    status: 200,
    headers: {
      'content-type': 'text/html; charset=utf-8',
      'cache-control': 'public, s-maxage=600, stale-while-revalidate=86400',
    },
  });
}

// ---- 请求画像信标（2026-10-25 加装，诊断 Vercel 流量构成用）----
// Hobby 套餐的 Observability 不开放 API，面板之外拿不到请求明细；middleware
// 是唯一能看到每个请求的地方。fire-and-forget 打到 ncmapi 域名（全球直连
// 成都、不进 Vercel、无回环），nginx 访问日志即计数器：
//   p=路径(截80) s=状态码 b=是否爬虫UA u=UA桶(1=已知爬虫 2=Windows-Chrome系 3=其他)
// 不 await、不影响响应延迟；个别信标可能被运行时冻结丢弃（统计级可接受）。
// matcher 豁免的路径（robots/llms/sw.js 等）不经过本函数，不在计数内。
// 不再需要时删掉 beacon() 调用即可（或置 BEACON=false）。
const BEACON = true;
function beacon(path: string, status: number, bot: boolean, uaBucket: 1 | 2 | 3) {
  if (!BEACON) return;
  try {
    fetch(
      `https://ncmapi.roginx.ink/__vcnt?p=${encodeURIComponent(path.slice(0, 80))}&s=${status}&b=${bot ? 1 : 0}&u=${uaBucket}`
    ).catch(() => {});
  } catch {
    /* 信标失败不影响响应 */
  }
}

export default function middleware(request: Request): Response | undefined {
  const url = new URL(request.url);
  const ua = request.headers.get('user-agent') ?? '';
  const isBot = BOT_UA_RE.test(ua);
  const uaBucket: 1 | 2 | 3 = isBot ? 1 : /windows nt/i.test(ua) ? 2 : 3;

  // /api 大门焊死：vercel.json 已不再反代 /api，打到这里的只有爬虫直探与
  // 旧缓存 HTML 的残留调用（前端构建时注入的是 ncmapi 绝对地址）。403 无
  // body，是这条路径上最便宜的响应
  if (url.pathname.startsWith('/api/')) {
    beacon(url.pathname, 403, isBot, uaBucket);
    return new Response(null, { status: 403 });
  }

  if (isBot && ASSET_RE.test(url.pathname)) {
    beacon(url.pathname, 403, true, uaBucket);
    return new Response(null, { status: 403 });
  }

  // 伪造浏览器 UA 的爬虫拿资源清单时一般不带 Referer；真实用户永远同源带 Referer
  if (ASSET_RE.test(url.pathname)) {
    const referer = request.headers.get('referer') ?? '';
    if (!referer || !REFERER_OK.test(referer)) {
      beacon(url.pathname, 403, isBot, uaBucket);
      return new Response(null, { status: 403 });
    }
  }

  if (isBot && request.method === 'GET') {
    beacon(url.pathname, 200, true, uaBucket);
    return botPage();
  }

  // 人类请求：交回原路由（静态文件 / SPA fallback）
  beacon(url.pathname, 0, isBot, uaBucket);
  return undefined;
}

export const config = {
  // Routing Middleware 默认即 Node.js runtime，显式写出锚定意图
  runtime: 'nodejs',
  // 跳过元数据页本身与 PWA 基础文件（llms.txt 就是写给爬虫的，不能被 .txt
  // 资源规则 403）；/api 必须进中间件（上面 403）
  matcher: [
    '/((?!bot\\.html|favicon\\.ico|robots\\.txt|sitemap\\.xml|llms\\.txt|manifest\\.webmanifest|sw\\.js|\\.well-known/).*)',
  ],
};
