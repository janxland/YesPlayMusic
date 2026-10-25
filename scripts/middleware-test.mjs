// middleware 行为测试台：Node strip-types 直接加载 middleware.ts，
// 覆盖 爬虫HTML直答 / 资源403 / Referer护栏 / /api焊死 / 人类直通 / matcher 语义 /
// 内联 BOT_HTML 与 public/bot.html 一致性。
// 用法：node --experimental-strip-types --disable-warning=ExperimentalWarning scripts/middleware-test.mjs
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

const {
  default: middleware,
  BOT_HTML,
  config,
} = await import('../middleware.ts');

const BROWSER =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';
const mk = (path, headers = {}) =>
  new Request('http://localhost' + path, { headers });

const cases = [
  [
    'GPTBot GET / → 内联 bot 页',
    mk('/', { 'user-agent': 'Mozilla/5.0 (compatible; GPTBot/1.0)' }),
    async r => r && r.status === 200 && (await r.text()) === BOT_HTML,
  ],
  [
    'Bytespider GET /playlist → bot 页',
    mk('/playlist', {
      'user-agent': 'Mozilla/5.0 (compatible;Bytespider;spider@bytedance.com)',
    }),
    async r => r && r.status === 200,
  ],
  [
    'curl GET /search → bot 页',
    mk('/search', { 'user-agent': 'curl/8.4.0' }),
    async r => r && r.status === 200,
  ],
  [
    'bot 页响应头：s-maxage 短缓存',
    mk('/', { 'user-agent': 'GPTBot/1.0' }),
    async r =>
      r && (r.headers.get('cache-control') || '').includes('s-maxage=600'),
  ],
  [
    'GPTBot GET /assets/x.js → 403',
    mk('/assets/index-abc.js', { 'user-agent': 'GPTBot/1.0' }),
    async r => r && r.status === 403,
  ],
  [
    'ChatGPT-User GET /assets/x.js → 403（补漏 UA）',
    mk('/assets/x.js', { 'user-agent': 'ChatGPT-User' }),
    async r => r && r.status === 403,
  ],
  [
    'Google-Extended GET /img/a.png → 403（补漏 UA）',
    mk('/img/a.png', {
      'user-agent': 'Mozilla/5.0 (compatible; Google-Extended)',
    }),
    async r => r && r.status === 403,
  ],
  [
    'Browser GET / → 直通',
    mk('/', { 'user-agent': BROWSER }),
    r => r === undefined,
  ],
  [
    'Browser GET /assets/x.js 带同源 Referer → 直通',
    mk('/assets/x.js', {
      'user-agent': BROWSER,
      referer: 'https://music.vercel.roginx.ink/',
    }),
    r => r === undefined,
  ],
  [
    'Browser GET /assets/x.js 无 Referer → 403',
    mk('/assets/x.js', { 'user-agent': BROWSER }),
    async r => r && r.status === 403,
  ],
  [
    'Browser GET /api/search → 403',
    mk('/api/search?keywords=a', { 'user-agent': BROWSER }),
    async r => r && r.status === 403,
  ],
  [
    'GPTBot GET /api/search → 403',
    mk('/api/search', { 'user-agent': 'GPTBot/1.0' }),
    async r => r && r.status === 403,
  ],
  [
    'Browser POST /api/netease/credential → 403',
    new Request('http://localhost/api/netease/credential', {
      method: 'POST',
      headers: { 'user-agent': BROWSER },
    }),
    async r => r && r.status === 403,
  ],
];

let fail = 0;
for (const [name, req, check] of cases) {
  let ok = false;
  let note = '';
  try {
    ok = await check(await middleware(req));
  } catch (e) {
    note = String(e);
  }
  if (!ok) fail++;
  console.log(
    (ok ? 'PASS' : 'FAIL') + '  ' + name + (note ? '  <' + note + '>' : '')
  );
}

// 内联副本与 public/bot.html 必须严格一致（两份来源，测试台防漂移）
const botFile = await readFile(join(process.cwd(), 'public/bot.html'), 'utf8');
const synced = botFile === BOT_HTML;
if (!synced) fail++;
console.log(
  (synced ? 'PASS' : 'FAIL') +
    '  BOT_HTML 与 public/bot.html 严格一致（防两份漂移）'
);

// runtime 显式为 nodejs（Routing Middleware 文件约定值）
const runtimeOk = config.runtime === 'nodejs';
if (!runtimeOk) fail++;
console.log((runtimeOk ? 'PASS' : 'FAIL') + '  config.runtime = nodejs');

// matcher 语义：平台按 matcher 决定是否调用 middleware，排除名单必须放行
// llms.txt（写给爬虫的）与 PWA 基础文件，且不能放行 /api
const matcherRe = new RegExp('^' + config.matcher[0] + '$');
const mustSkip = [
  '/bot.html',
  '/favicon.ico',
  '/robots.txt',
  '/sitemap.xml',
  '/llms.txt',
  '/manifest.webmanifest',
  '/sw.js',
  '/.well-known/acme',
];
const mustRun = ['/assets/x.js', '/api/search', '/', '/playlist'];
for (const p of mustSkip) {
  const skip = !matcherRe.test(p);
  if (!skip) fail++;
  console.log((skip ? 'PASS' : 'FAIL') + '  matcher 跳过 ' + p);
}
for (const p of mustRun) {
  const run = matcherRe.test(p);
  if (!run) fail++;
  console.log((run ? 'PASS' : 'FAIL') + '  matcher 进入 ' + p);
}

console.log(fail === 0 ? '\nALL PASS' : `\n${fail} FAILED`);
process.exit(fail === 0 ? 0 : 1);
