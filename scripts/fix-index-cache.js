// fix-index-cache.js - 一次性修补：重传 index.html 并设置 Cache-Control: no-cache
// 背景：deploy-cdn.js 旧版把 Cache-Control 放进了 Headers（SDK 不识别），
// 导致线上 index.html 落到桶默认缓存策略（max-age=5184000，60 天）。
// 用法: node scripts/fix-index-cache.js

// 进程内剔除代理，避免本地系统代理拦截 fetch / COS 请求
for (const k of ['HTTP_PROXY', 'HTTPS_PROXY', 'http_proxy', 'https_proxy']) {
  delete process.env[k];
}

const fs = require('fs');
const os = require('os');
const path = require('path');
const COS = require('cos-nodejs-sdk-v5');

const rootDir = path.resolve(__dirname, '..');
const OAUTH_BASE = process.env.ROGINX_OAUTH_BASE || 'https://edu.roginx.ink/api';
const CLIENT_ID = 'roginx-cli';
const CONFIG_NAME = process.env.COS_CONFIG_NAME || 'music';
const PREFIX = process.env.COS_PREFIX || 'www/music/dist';

async function getSts() {
  const credPath = path.join(os.homedir(), '.roginx-cli', 'credentials.json');
  let cred = JSON.parse(fs.readFileSync(credPath, 'utf-8'));
  const fetchCred = token =>
    fetch(
      `${OAUTH_BASE}/cloud-storage/temp-credentials?configName=${encodeURIComponent(CONFIG_NAME)}&prefix=${encodeURIComponent(PREFIX)}`,
      { headers: { Authorization: `Bearer ${token}` } }
    );
  let res = await fetchCred(cred.accessToken);
  if (res.status === 401) {
    const r2 = await fetch(`${OAUTH_BASE}/auth-center/oauth/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        grant_type: 'refresh_token',
        refresh_token: cred.refreshToken,
        client_id: CLIENT_ID,
      }),
    });
    if (!r2.ok) throw new Error(`OAuth 刷新失败 HTTP ${r2.status}，请先 pnpm roginx-login`);
    cred = { ...cred, ...(await r2.json()) };
    fs.writeFileSync(credPath, JSON.stringify(cred, null, 2));
    res = await fetchCred(cred.accessToken);
  }
  if (!res.ok) throw new Error(`获取 STS 失败: HTTP ${res.status}`);
  const json = await res.json();
  const d = json.data || json;
  if (!d.secretId) throw new Error('STS 返回不完整');
  return d;
}

async function main() {
  const filePath = path.join(rootDir, 'dist', 'index.html');
  if (!fs.existsSync(filePath)) {
    console.error('dist/index.html 不存在，请先 build');
    process.exit(1);
  }
  const sts = await getSts();
  const cos = new COS({
    SecretId: sts.secretId,
    SecretKey: sts.secretKey,
    SecurityToken: sts.sessionToken,
  });
  const Key = `${PREFIX}/index.html`;
  await new Promise((resolve, reject) => {
    cos.putObject(
      {
        Bucket: sts.bucket,
        Region: sts.region,
        Key,
        Body: fs.createReadStream(filePath),
        ContentType: 'text/html',
        CacheControl: 'no-cache',
        Headers: {
          'x-cos-acl': 'public-read',
          'Access-Control-Allow-Origin': '*',
        },
      },
      (err, data) => (err ? reject(err) : resolve(data))
    );
  });
  console.log(`✅ 已重传 ${Key}（Cache-Control: no-cache）`);
}

main().catch(err => {
  console.error('修补失败:', err.message || err);
  process.exit(1);
});
