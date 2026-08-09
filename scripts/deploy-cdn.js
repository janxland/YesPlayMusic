// deploy-cdn.js - 部署 YesPlayMusic 到腾讯云 COS（OAuth→STS，不再需要真实密钥）

const fs = require('fs');
const os = require('os');
const path = require('path');
const dotenv = require('dotenv');
const COS = require('cos-nodejs-sdk-v5');

const rootDir = path.resolve(__dirname, '..');

function loadEnv() {
  const candidates = ['.env.production', '.env.local', '.env'];
  for (const file of candidates) {
    const envPath = path.join(rootDir, file);
    if (fs.existsSync(envPath)) {
      dotenv.config({ path: envPath });
      return file;
    }
  }
  return null;
}

const envFile = loadEnv();
if (!envFile) {
  console.warn('未找到 .env 文件，将使用 process.env 中的变量');
} else {
  console.log(`已加载环境变量: ${envFile}`);
}

// ============================================================================
// OAuth → STS（去隐私密钥）：读 ~/.roginx-cli/credentials.json（pnpm roginx-login 生成）
// 链路: OAuth token → eorder-server /temp-credentials → 30min STS 临时密钥（收敛到 www/music/dist）
// ============================================================================
const OAUTH_BASE = process.env.ROGINX_OAUTH_BASE || 'https://edu.roginx.ink/api';
const CLIENT_ID = 'roginx-cli';
const CONFIG_NAME = process.env.COS_CONFIG_NAME || 'music';

function readOAuthCredentials() {
  const credPath = path.join(os.homedir(), '.roginx-cli', 'credentials.json');
  if (!fs.existsSync(credPath)) {
    throw new Error(
      `未找到 OAuth 登录凭证: ${credPath}\n请先执行 pnpm roginx-login 完成浏览器 OAuth 登录`
    );
  }
  return JSON.parse(fs.readFileSync(credPath, 'utf-8'));
}

async function refreshOAuthTokens(cred) {
  const res = await fetch(`${OAUTH_BASE}/auth-center/oauth/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      grant_type: 'refresh_token',
      refresh_token: cred.refreshToken,
      client_id: CLIENT_ID,
    }),
  });
  if (!res.ok) throw new Error(`OAuth 刷新失败: HTTP ${res.status}，请重新执行 pnpm roginx-login`);
  const data = await res.json();
  if (!data.accessToken) throw new Error(`OAuth 刷新失败: ${data.message || '未知错误'}`);
  const updated = { ...cred, ...data };
  fs.writeFileSync(path.join(os.homedir(), '.roginx-cli', 'credentials.json'), JSON.stringify(updated, null, 2));
  console.log('🔄 OAuth token 已自动刷新');
  return updated;
}

async function fetchTempCredentials(prefix) {
  let cred = readOAuthCredentials();
  let res = await fetch(
    `${OAUTH_BASE}/cloud-storage/temp-credentials?configName=${encodeURIComponent(CONFIG_NAME)}&prefix=${encodeURIComponent(prefix)}`,
    { headers: { Authorization: `Bearer ${cred.accessToken}` } }
  );
  if (res.status === 401) {
    console.log('🔄 accessToken 过期，尝试自动刷新...');
    cred = await refreshOAuthTokens(cred);
    res = await fetch(
      `${OAUTH_BASE}/cloud-storage/temp-credentials?configName=${encodeURIComponent(CONFIG_NAME)}&prefix=${encodeURIComponent(prefix)}`,
      { headers: { Authorization: `Bearer ${cred.accessToken}` } }
    );
  }
  if (!res.ok) throw new Error(`获取 STS 临时密钥失败: HTTP ${res.status}`);
  const json = await res.json();
  const d = json.data || json;
  if (!d.secretId || !d.secretKey || !d.sessionToken) {
    throw new Error(`STS 临时密钥返回不完整: ${json.message || ''}`);
  }
  return d; // { secretId, secretKey, sessionToken, bucket, region, prefix, ... }
}

const cosConfig = {
  SecretId: process.env.COS_SECRET_ID,
  SecretKey: process.env.COS_SECRET_KEY,
  Bucket: process.env.COS_BUCKET,
  Region: process.env.COS_REGION,
  Prefix: process.env.COS_PREFIX || 'www/music/dist',
  cdnDomain: process.env.COS_CDN_DOMAIN,
  useAnonymous: process.env.COS_ANONYMOUS === 'true',
  concurrency: parseInt(process.env.COS_UPLOAD_CONCURRENCY, 10) || 20,
};

const cosBaseDir = cosConfig.Prefix.endsWith('/')
  ? cosConfig.Prefix
  : `${cosConfig.Prefix}/`;

const distDir = path.join(rootDir, 'dist');

// COS 客户端（默认用 .env 密钥；无密钥时由 initCOSWithSts 用 OAuth STS 临时密钥重建）
let cos = new COS({
  SecretId: cosConfig.useAnonymous ? undefined : cosConfig.SecretId,
  SecretKey: cosConfig.useAnonymous ? undefined : cosConfig.SecretKey,
});

/** 走 OAuth→STS 初始化 COS 客户端（.env 未配真实密钥时自动启用） */
async function initCOSWithSts() {
  if (cosConfig.useAnonymous) return; // 匿名模式不需要凭证
  if (cosConfig.SecretId && cosConfig.SecretKey) return; // 已有 .env 密钥（历史兼容）

  console.log(`🔐 未检测到 COS_SECRET_ID/KEY，走 OAuth→STS 获取临时密钥（configName=${CONFIG_NAME}）...`);
  const cred = await fetchTempCredentials(cosBaseDir.replace(/\/$/, ''));
  cos = new COS({
    SecretId: cred.secretId,
    SecretKey: cred.secretKey,
    SecurityToken: cred.sessionToken,
  });
  // 用 STS 返回的权威 bucket/region
  if (cred.bucket) cosConfig.Bucket = cred.bucket;
  if (cred.region) cosConfig.Region = cred.region;
  console.log(`✅ STS 临时密钥就绪（30min，权限收敛到 ${cred.prefix}）`);
}

const MIME_TYPES = {
  '.html': 'text/html',
  '.js': 'application/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.eot': 'application/vnd.ms-fontobject',
  '.otf': 'font/otf',
  '.txt': 'text/plain',
  '.map': 'application/json',
};

function getMimeType(filePath) {
  return MIME_TYPES[path.extname(filePath).toLowerCase()] || 'application/octet-stream';
}

function getAllFiles(dir) {
  const results = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const filePath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...getAllFiles(filePath));
    } else if (!entry.name.endsWith('.map')) {
      // 跳过 sourcemap 文件，避免线上暴露源码
      results.push(filePath);
    }
  }
  return results;
}

function checkCOSPermission() {
  return new Promise((resolve, reject) => {
    cos.headBucket(
      { Bucket: cosConfig.Bucket, Region: cosConfig.Region },
      err => (err ? reject(err) : resolve())
    );
  });
}

function uploadFile(filePath) {
  const relativePath = path.relative(distDir, filePath).replace(/\\/g, '/');
  const cosKey = cosBaseDir + relativePath;

  return new Promise((resolve, reject) => {
    cos.putObject(
      {
        Bucket: cosConfig.Bucket,
        Region: cosConfig.Region,
        Key: cosKey,
        Body: fs.createReadStream(filePath),
        ContentType: getMimeType(filePath),
        Headers: {
          'x-cos-acl': 'public-read',
          'Access-Control-Allow-Origin': '*',
          'Cache-Control': relativePath.includes('index.html')
            ? 'no-cache'
            : 'max-age=31536000',
        },
      },
      (err, data) => (err ? reject(err) : resolve(data))
    );
  });
}

async function uploadAll(files) {
  const { concurrency } = cosConfig;
  let index = 0;
  let done = 0;
  const errors = [];

  async function worker() {
    while (index < files.length) {
      const file = files[index++];
      const relativePath = path.relative(distDir, file).replace(/\\/g, '/');
      try {
        await uploadFile(file);
        done++;
        if (done % 20 === 0 || done === files.length) {
          console.log(`上传进度: ${done}/${files.length}`);
        }
      } catch (err) {
        errors.push({ file: relativePath, err });
        console.error(`上传失败: ${relativePath}`, err.message || err);
      }
    }
  }

  const workers = Array.from(
    { length: Math.min(concurrency, files.length) },
    () => worker()
  );
  await Promise.all(workers);

  if (errors.length) {
    throw new Error(`${errors.length} 个文件上传失败`);
  }
}

async function main() {
  if (!fs.existsSync(distDir)) {
    console.error('错误: dist 目录不存在，请先运行 npm run build');
    process.exit(1);
  }

  // OAuth → STS：无 .env 真实密钥时自动获取临时密钥（隐私密钥不再进入仓库/配置）
  await initCOSWithSts();

  if (!cosConfig.Bucket || !cosConfig.Region) {
    console.error('错误: 缺少 COS_BUCKET/COS_REGION（.env 或 STS 返回均无）');
    process.exit(1);
  }

  console.log('COS 配置:', {
    Bucket: cosConfig.Bucket,
    Region: cosConfig.Region,
    Prefix: cosBaseDir,
    concurrency: cosConfig.concurrency,
    credential: cosConfig.SecretId ? 'env 密钥(历史兼容)' : 'OAuth STS 临时密钥',
  });

  console.log('检查 COS 权限...');
  try {
    await checkCOSPermission();
    console.log('COS 权限检查通过');
  } catch (err) {
    console.error('COS 权限检查失败，请确认 SecretId/SecretKey 及存储桶权限');
    console.error(err.message || err);
    process.exit(1);
  }

  const files = getAllFiles(distDir);
  console.log(`开始并行上传 ${files.length} 个文件 (并发数: ${cosConfig.concurrency})...`);
  await uploadAll(files);

  const cosUrl = `https://${cosConfig.Bucket}.cos.${cosConfig.Region}.myqcloud.com/${cosBaseDir}index.html`;
  console.log('部署完成!');
  console.log(`访问地址: ${cosUrl}`);
  if (cosConfig.cdnDomain) {
    const cdnBase = cosConfig.cdnDomain.replace(/\/$/, '');
    console.log(`CDN 地址: ${cdnBase}/${cosBaseDir}index.html`);
  }
}

main().catch(err => {
  console.error('部署失败:', err.message || err);
  process.exit(1);
});
