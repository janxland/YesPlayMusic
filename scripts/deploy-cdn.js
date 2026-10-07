// deploy-cdn.js - 部署 YesPlayMusic 到腾讯云 COS（OAuth→STS，不再需要真实密钥）

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const dotenv = require('dotenv');
const COS = require('cos-nodejs-sdk-v5');

const rootDir = path.resolve(__dirname, '..');

// 公网 COS（music.roginx.ink）只发布 master。跟弹功能在 feat/keyboard-live，
// 属内部使用，禁止上线 —— 而构建取的是当前工作区，所以在错误的分支上跑这条
// 命令就会把内部代码推到公网。
const FORBIDDEN_IN_PUBLIC = /keyboard-live/i;
function currentBranch() {
  return execSync('git rev-parse --abbrev-ref HEAD', {
    cwd: rootDir,
    encoding: 'utf8',
  }).trim();
}

function assertDeployableBranch() {
  const branch = currentBranch();
  if (branch === 'master') return;
  console.error(`❌ 当前分支是 ${branch}，deploy:cdn 只允许从 master 发布。`);
  console.error('   非公开功能（如跟弹）不得上传到公网 COS。');
  console.error('   请先执行: git checkout master');
  process.exit(1);
}

// `--check-only`：在 build 之前先过闸门，避免在错误分支上白跑一次构建。
if (process.argv.includes('--check-only')) {
  assertDeployableBranch();
  console.log('✅ 分支闸门通过（master）');
  process.exit(0);
}

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

// OAuth → STS 链路收敛在 scripts/cos-sts.js（与 upload-releases.js 共用）
const { getTempCredentials: fetchTempCredentials } = require('./cos-sts');

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

  console.log('🔐 未检测到 COS_SECRET_ID/KEY，走 OAuth→STS 获取临时密钥...');
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

/**
 * 入口/更新链路文件的缓存策略（文件名不带 hash，内容随发版变化）。
 *
 *  - 不能一年强缓存：sw.js 曾因 REVALIDATE_PATTERN 只匹配 service-worker.js
 *    而落进桶默认策略，被 CDN 缓存 30 天，PWA 更新传不下去。
 *  - 也不再用 no-cache：腾讯 CDN 对 no-cache 资源不建边缘缓存（实测每次
 *    Cache Miss 回源），每次访问都是一次 COS 计费读请求。
 *  - 折中 public, max-age=300：浏览器与 CDN 各缓存 5 分钟。发版延迟 ≤5 分钟；
 *    入口回源从「每次访问」降到「每 5 分钟每边缘」。SW 主脚本的更新检查本就
 *    绕过浏览器 HTTP 缓存（updateViaCache 默认 imports），新鲜度由 CDN 层的
 *    5 分钟 TTL 吸收 —— 与 web.dev/Workbox 的 SW 更新建议一致。
 */
const REVALIDATE_PATTERN =
  /(^|\/)index\.html$|(^|\/)sw\.js$|(^|\/)workbox-.*\.js$|(^|\/)visualizer-worker\.js$|precache-manifest\..*\.js$/;
function buildCacheControl(relativePath) {
  return REVALIDATE_PATTERN.test(relativePath)
    ? 'public, max-age=300, must-revalidate'
    : 'max-age=31536000, immutable';
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
        // Cache-Control 必须走 SDK 顶层 CacheControl 参数；放进 Headers 里
        // 不会被识别为对象元数据，对象会落到存储桶默认缓存策略（曾导致
        // index.html 被缓存 60 天、刷新不更新）。
        CacheControl: buildCacheControl(relativePath),
        Headers: {
          'x-cos-acl': 'public-read',
          'Access-Control-Allow-Origin': '*',
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

  // COS 在高并发偶发 socket hang up。单个文件上传失败不重试的话，线上会
  // 长期处于「新 index.html 指向未上传的 hash chunk」的混合态 —— 对用户就是
  // 白屏 + 控制台 ChunkLoadError。这里做退避重试，把偶发抖动挡在部署阶段。
  const MAX_ATTEMPTS = 3;
  async function withRetry(file, relativePath) {
    for (let attempt = 1; ; attempt++) {
      try {
        return await uploadFile(file);
      } catch (err) {
        if (attempt >= MAX_ATTEMPTS) throw err;
        await new Promise(r => setTimeout(r, 300 * attempt));
        console.warn(`重试第 ${attempt} 次: ${relativePath}`);
      }
    }
  }

  async function worker() {
    while (index < files.length) {
      const file = files[index++];
      const relativePath = path.relative(distDir, file).replace(/\\/g, '/');
      try {
        await withRetry(file, relativePath);
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

// 分支对了还不够：dist 可能是上一次在别的分支 build 的残留。
function assertNoForbiddenArtifacts(files) {
  const leaked = files.filter(f =>
    FORBIDDEN_IN_PUBLIC.test(path.relative(distDir, f))
  );
  if (!leaked.length) return;
  console.error(`❌ dist 含非公开产物，拒绝上传（共 ${leaked.length} 个）:`);
  leaked.slice(0, 10).forEach(f =>
    console.error(`   ${path.relative(distDir, f)}`)
  );
  console.error('   请在 master 上重新 build 后再发布。');
  process.exit(1);
}

async function main() {
  assertDeployableBranch();

  if (!fs.existsSync(distDir)) {
    console.error('错误: dist 目录不存在，请先运行 npm run build');
    process.exit(1);
  }

  const files = getAllFiles(distDir);
  assertNoForbiddenArtifacts(files);

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
