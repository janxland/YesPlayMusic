// cos-sts.js - OAuth→STS 共用链路：换取收敛到指定 prefix 的临时 COS 密钥
// 凭证由 `pnpm roginx-login` 生成（~/.roginx-cli/credentials.json），真实密钥不落仓库。
const fs = require('fs');
const os = require('os');
const path = require('path');

const OAUTH_BASE = process.env.ROGINX_OAUTH_BASE || 'https://edu.roginx.ink/api';
const CLIENT_ID = 'roginx-cli';
const CONFIG_NAME = process.env.COS_CONFIG_NAME || 'music';
const CRED_FILE = path.join(os.homedir(), '.roginx-cli', 'credentials.json');

function readCredentials() {
  if (!fs.existsSync(CRED_FILE)) {
    throw new Error(
      `未找到 OAuth 登录凭证: ${CRED_FILE}\n请先执行 pnpm roginx-login 完成浏览器 OAuth 登录`
    );
  }
  return JSON.parse(fs.readFileSync(CRED_FILE, 'utf-8'));
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
  fs.writeFileSync(CRED_FILE, JSON.stringify(updated, null, 2));
  console.log('🔄 OAuth token 已自动刷新');
  return updated;
}

async function requestTempCredentials(cred, prefix) {
  const url = `${OAUTH_BASE}/cloud-storage/temp-credentials?configName=${encodeURIComponent(
    CONFIG_NAME
  )}&prefix=${encodeURIComponent(prefix)}`;
  return fetch(url, { headers: { Authorization: `Bearer ${cred.accessToken}` } });
}

/** 取 30min STS 临时密钥（权限收敛到 prefix；bucket/region 以返回值为权威） */
async function getTempCredentials(prefix) {
  let cred = readCredentials();
  let res = await requestTempCredentials(cred, prefix);
  if (res.status === 401) {
    console.log('🔄 accessToken 过期，尝试自动刷新...');
    cred = await refreshOAuthTokens(cred);
    res = await requestTempCredentials(cred, prefix);
  }
  if (!res.ok) throw new Error(`获取 STS 临时密钥失败: HTTP ${res.status}`);
  const json = await res.json();
  const d = json.data || json;
  if (!d.secretId || !d.secretKey || !d.sessionToken) {
    throw new Error(`STS 临时密钥返回不完整: ${json.message || ''}`);
  }
  return d; // { secretId, secretKey, sessionToken, bucket, region, prefix, ... }
}

module.exports = { getTempCredentials };
