/**
 * 爬虫识别层（Vercel 边缘，framework-agnostic Web 标准 API）
 *
 * 设计：单一职责、零依赖、无状态 ——
 *   爬虫 UA + HTML 路由  → 改写为 /bot.html（纯元数据页，零 JS/CSS/图片）
 *   爬虫 UA + 静态资源   → 403（不喂 JS/CSS/字体/图片给任何爬虫）
 *   伪造 UA 的爬虫       → /assets/ 强制 Referer 同源校验，无 Referer 一律 403
 *   人类浏览器           → 完全直通，无任何额外开销（返回 undefined 继续原链路）
 *
 * 搜索引擎 / AI 爬虫仍可正常收录（拿到元数据 HTML + sitemap），
 * 但拿不到 SPA 资源包 —— 资源请求数只来自真实用户。
 */

// 爬虫 UA 特征：知名搜索引擎 / AI 爬虫 / SEO 工具 / 无头浏览器 / 通用 bot|spider|crawler 字样
const BOT_UA_RE =
  /(bot|crawler|spider|slurp|headless|scraper|facebookexternalhit|semrush|ahrefs|mj12|dotbot|petalbot|bytespider|dataforseo|serpstatbot|puppeteer|playwright|phantomjs|selenium|python-requests|scrapy|curl\/|wget)/i;

// 允许引用静态资源的来源（人类浏览器同源加载会带 Referer）
const REFERER_OK = /(^https?:\/\/([^/]*\.)?roginx\.ink|vercel\.app|localhost)/i;

// 静态资源后缀（命中即视为资源请求）
const ASSET_RE =
  /\.(js|mjs|css|map|woff2?|ttf|otf|eot|png|jpe?g|webp|gif|svg|ico|mp3|flac|wasm|wasm\.br|txt)$/i;

export default function middleware(request: Request): Response | undefined {
  const url = new URL(request.url);
  const ua = request.headers.get('user-agent') ?? '';
  const isBot = BOT_UA_RE.test(ua);

  if (isBot && ASSET_RE.test(url.pathname)) {
    return new Response(null, { status: 403 });
  }

  // 伪造浏览器 UA 的爬虫拿资源清单时一般不带 Referer；真实用户永远同源带 Referer
  if (ASSET_RE.test(url.pathname)) {
    const referer = request.headers.get('referer') ?? '';
    if (!referer || !REFERER_OK.test(referer)) {
      return new Response(null, { status: 403 });
    }
  }

  if (isBot && request.method === 'GET') {
    // 元数据页：边缘就近回源同部署静态文件，短缓存，爬虫高峰也不产生函数级放大
    return fetch(new URL('/bot.html', url.origin), {
      headers: { 'user-agent': 'bot-html-rewrite' },
    }).then(res =>
      new Response(res.body, {
        status: 200,
        headers: {
          'content-type': 'text/html; charset=utf-8',
          'cache-control': 'public, s-maxage=600, stale-while-revalidate=86400',
        },
      })
    );
  }

  // 人类请求：交回原路由（静态文件 / SPA fallback / API 代理）
  return undefined;
}

export const config = {
  // 跳过 API 代理、元数据页本身与 PWA 基础文件
  matcher: ['/((?!api/|bot\\.html|favicon\\.ico|robots\\.txt|sitemap\\.xml|manifest\\.webmanifest|sw\\.js|\\.well-known/).*)'],
};
