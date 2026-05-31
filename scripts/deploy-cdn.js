// deploy-cdn.js - 部署 YesPlayMusic 到腾讯云 COS

const fs = require('fs');
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

if (!cosConfig.Bucket || !cosConfig.Region) {
  console.error('错误: 请在 .env 中设置 COS_BUCKET 和 COS_REGION');
  process.exit(1);
}

if (!cosConfig.useAnonymous && (!cosConfig.SecretId || !cosConfig.SecretKey)) {
  console.error('错误: 请在 .env 中设置 COS_SECRET_ID 和 COS_SECRET_KEY');
  process.exit(1);
}

const cosBaseDir = cosConfig.Prefix.endsWith('/')
  ? cosConfig.Prefix
  : `${cosConfig.Prefix}/`;

const distDir = path.join(rootDir, 'dist');

const cos = new COS({
  SecretId: cosConfig.useAnonymous ? undefined : cosConfig.SecretId,
  SecretKey: cosConfig.useAnonymous ? undefined : cosConfig.SecretKey,
});

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
    } else {
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

  console.log('COS 配置:', {
    Bucket: cosConfig.Bucket,
    Region: cosConfig.Region,
    Prefix: cosBaseDir,
    concurrency: cosConfig.concurrency,
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
