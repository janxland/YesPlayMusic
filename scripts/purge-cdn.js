// purge-cdn.js - 部署后刷新腾讯云 CDN 缓存（PurgePaths 目录刷新）
//
// 为什么必须刷新：cos.roginx.ink 的 js/css 资源被 MaxAge 规则强制边缘缓存
// （此前 sw.js 实测 30 天），新版本上传后边缘仍持有旧对象；入口 index.html
// 现在也走 5 分钟边缘缓存。CI 每次部署后目录刷新一次，发版延迟趋近于零，
// 同时保住边缘缓存带来的「回源请求数下降」。
//
// 凭据走环境变量 TENCENT_CDN_SECRET_ID / TENCENT_CDN_SECRET_KEY（GitHub
// Secrets 注入）。缺省时静默跳过（本地无凭据不阻塞构建验证），退出码 0。
// 用法: node scripts/purge-cdn.js [--path https://cos.roginx.ink/www/music/dist/]

const { createHmac, createHash } = require('crypto');
const https = require('https');

const SECRET_ID = process.env.TENCENT_CDN_SECRET_ID;
const SECRET_KEY = process.env.TENCENT_CDN_SECRET_KEY;
const DEFAULT_PATH = 'https://cos.roginx.ink/www/music/dist/';

function tc3Request({ service, host, action, version, payload, secretId, secretKey }) {
  return new Promise((resolve, reject) => {
    const timestamp = Math.floor(Date.now() / 1000);
    const date = new Date(timestamp * 1000).toISOString().slice(0, 10);
    const body = JSON.stringify(payload);
    const hashedBody = createHash('sha256').update(body).digest('hex');
    // canonical headers 与 SignedHeaders 必须一致；这里只签 content-type/host
    const canonicalRequest = [
      'POST',
      '/',
      '',
      `content-type:application/json\nhost:${host}\n`,
      'content-type;host',
      hashedBody,
    ].join('\n');
    const stringToSign = [
      'TC3-HMAC-SHA256',
      timestamp,
      `${date}/${service}/tc3_request`,
      createHash('sha256').update(canonicalRequest).digest('hex'),
    ].join('\n');
    const hmac = key => data => createHmac('sha256', key).update(data).digest();
    const kSigning = hmac(hmac(hmac(`TC3${secretKey}`)(date))(service))('tc3_request');
    const signature = createHmac('sha256', kSigning).update(stringToSign).digest('hex');
    const authorization =
      `TC3-HMAC-SHA256 Credential=${secretId}/${date}/${service}/tc3_request, ` +
      'SignedHeaders=content-type;host, ' +
      `Signature=${signature}`;
    const req = https.request(
      { hostname: host, method: 'POST', path: '/', headers: {
        'Content-Type': 'application/json',
        Host: host,
        'X-TC-Action': action,
        'X-TC-Version': version,
        'X-TC-Timestamp': String(timestamp),
        Authorization: authorization,
      } },
      res => {
        let data = '';
        res.on('data', chunk => (data += chunk));
        res.on('end', () => {
          try { resolve(JSON.parse(data)); } catch (err) { reject(err); }
        });
      }
    );
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

async function main() {
  const pathArg = process.argv.includes('--path')
    ? process.argv[process.argv.indexOf('--path') + 1]
    : DEFAULT_PATH;

  if (!SECRET_ID || !SECRET_KEY) {
    console.log('未配置 TENCENT_CDN_SECRET_ID/KEY，跳过 CDN 缓存刷新（发版延迟 ≤ 边缘 TTL）');
    return;
  }

  const res = await tc3Request({
    service: 'cdn',
    host: 'cdn.tencentcloudapi.com',
    action: 'PurgePathCache',
    version: '2018-06-06',
    payload: { Paths: [pathArg], FlushType: 'flush' },
    secretId: SECRET_ID,
    secretKey: SECRET_KEY,
  });

  if (res.Response && res.Response.TaskId) {
    console.log(`CDN 目录刷新已提交: ${pathArg} (TaskId ${res.Response.TaskId})`);
  } else {
    const err = res.Response && res.Response.Error;
    // 刷新失败不阻断部署：边缘 TTL 本身有界（入口 5min / 其余按源站），只是慢一点
    console.warn(`CDN 刷新失败（不阻断部署）: ${err ? `${err.Code}: ${err.Message}` : JSON.stringify(res).slice(0, 200)}`);
  }
}

main().catch(err => {
  console.warn(`CDN 刷新异常（不阻断部署）: ${err.message}`);
});
