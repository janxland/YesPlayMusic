// roginx-login.js - 临时 OAuth 登录脚本
// 用法: node scripts/roginx-login.js
// 链路: 浏览器登录 edu.roginx.ink → 302 回调本机 127.0.0.1:8931/callback?code=...
//       → 用 code 换 token → 写入 ~/.roginx-cli/credentials.json（deploy-cdn.js 读取）

const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');
const { execFile } = require('child_process');

const OAUTH_BASE = process.env.ROGINX_OAUTH_BASE || 'https://edu.roginx.ink/api';
const CLIENT_ID = 'roginx-cli';
const REDIRECT_URI = 'http://127.0.0.1:8931/callback';
const CRED_PATH = path.join(os.homedir(), '.roginx-cli', 'credentials.json');

const authorizeUrl =
  `${OAUTH_BASE}/auth-center/oauth/authorize` +
  `?client_id=${CLIENT_ID}&response_type=code` +
  `&redirect_uri=${encodeURIComponent(REDIRECT_URI)}`;

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://127.0.0.1:8931');
  if (url.pathname !== '/callback') {
    res.writeHead(404);
    return res.end();
  }
  const code = url.searchParams.get('code');
  if (!code) {
    res.writeHead(400, { 'Content-Type': 'text/html; charset=utf-8' });
    return res.end('<h3>登录失败：回调缺少 code 参数</h3>');
  }
  try {
    const tokenRes = await fetch(`${OAUTH_BASE}/auth-center/oauth/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        grant_type: 'authorization_code',
        code,
        client_id: CLIENT_ID,
        redirect_uri: REDIRECT_URI,
      }),
    });
    const data = await tokenRes.json();
    if (!tokenRes.ok || !data.accessToken) {
      throw new Error(data.message || data.error || `HTTP ${tokenRes.status}`);
    }
    fs.mkdirSync(path.dirname(CRED_PATH), { recursive: true });
    fs.writeFileSync(CRED_PATH, JSON.stringify(data, null, 2));
    console.log(`✅ 登录成功，凭证已写入 ${CRED_PATH}`);
    console.log(`   user=${data.username || data.userId || '?'} scope=${data.scope || '?'}`);
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end('<h3>✅ 登录成功，可以关闭此页面，回到终端继续部署。</h3>');
    server.close(() => process.exit(0));
  } catch (err) {
    console.error('❌ 换取 token 失败:', err.message || err);
    res.writeHead(500, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end('<h3>❌ 换取 token 失败，请查看终端输出</h3>');
    server.close(() => process.exit(1));
  }
});

server.listen(8931, '127.0.0.1', () => {
  console.log('已在 127.0.0.1:8931 监听 OAuth 回调，正在打开浏览器登录页...');
  console.log(`若浏览器未自动打开，请手动访问:\n  ${authorizeUrl}`);
  execFile('open', [authorizeUrl]);
  setTimeout(() => {
    console.error('⏰ 2 分钟内未完成登录，已超时退出');
    process.exit(1);
  }, 120000);
});
