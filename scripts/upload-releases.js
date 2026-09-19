// upload-releases.js - 上传桌面客户端安装包到 COS releases/ 目录
// 用法: node scripts/upload-releases.js <文件...>（pnpm electron:build-* 之后执行）
// 走与 deploy-cdn 相同的 OAuth→STS 链路，权限收敛到 <COS_PREFIX>/releases。
const fs = require('fs');
const path = require('path');
const COS = require('cos-nodejs-sdk-v5');
const { getTempCredentials } = require('./cos-sts');

const BASE_PREFIX = (process.env.COS_PREFIX || 'www/music/dist').replace(/\/+$/, '');
const RELEASE_PREFIX = `${BASE_PREFIX}/releases`;

function putObject(cos, bucket, region, key, filePath) {
  return new Promise((resolve, reject) => {
    cos.putObject(
      {
        Bucket: bucket,
        Region: region,
        Key: key,
        Body: fs.createReadStream(filePath),
        ContentType: 'application/octet-stream',
        CacheControl: 'max-age=31536000',
        Headers: { 'x-cos-acl': 'public-read' },
      },
      (err, data) => (err ? reject(err) : resolve(data))
    );
  });
}

function sliceUpload(cos, bucket, region, key, filePath) {
  return new Promise((resolve, reject) => {
    cos.sliceUploadFile(
      {
        Bucket: bucket,
        Region: region,
        Key: key,
        FilePath: filePath,
        AsyncLimit: 5,
        SliceSize: 8 * 1024 * 1024,
        Headers: { 'x-cos-acl': 'public-read', 'Cache-Control': 'max-age=31536000' },
      },
      (err, data) => (err ? reject(err) : resolve(data))
    );
  });
}

async function upload(filePath, keyName) {
  if (!fs.existsSync(filePath)) {
    throw new Error(`文件不存在: ${filePath}`);
  }
  const stat = fs.statSync(filePath);
  console.log(
    `🔐 STS 临时密钥（prefix=${RELEASE_PREFIX}）... ${path.basename(filePath)} ${(stat.size / 1024 / 1024).toFixed(1)}MB`
  );
  const cred = await getTempCredentials(RELEASE_PREFIX);
  const cos = new COS({
    SecretId: cred.secretId,
    SecretKey: cred.secretKey,
    SecurityToken: cred.sessionToken,
  });
  const bucket = cred.bucket || process.env.COS_BUCKET;
  const region = cred.region || process.env.COS_REGION;
  const key = `${RELEASE_PREFIX}/${keyName || path.basename(filePath)}`;
  const big = stat.size > 64 * 1024 * 1024;
  await (big ? sliceUpload(cos, bucket, region, key, filePath) : putObject(cos, bucket, region, key, filePath));
  console.log(`✅ ${key}`);
  return key;
}

async function main() {
  const args = process.argv.slice(2);
  if (!args.length) {
    console.error('用法: node scripts/upload-releases.js <安装包文件...> [目标文件名]');
    process.exit(1);
  }
  let pairs;
  if (args.length === 2 && fs.existsSync(args[0]) && !fs.existsSync(args[1])) {
    pairs = [[args[0], args[1]]];
  } else {
    pairs = args.map(a => [a]);
  }
  const cdnBase = process.env.COS_CDN_DOMAIN || 'https://cos.roginx.ink';
  for (const [file, keyName] of pairs) {
    const key = await upload(path.resolve(file), keyName);
    console.log(`   下载直链: ${cdnBase}/${key}`);
  }
}

main().catch(err => {
  console.error('上传失败:', err.message || err);
  process.exit(1);
});
