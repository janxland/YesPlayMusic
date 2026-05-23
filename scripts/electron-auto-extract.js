#!/usr/bin/env node

/**
 * Electron 二进制自动安装脚本
 *
 * 解决官方源 / 证书问题导致 electron install.js 下载失败的情况：
 * 1. .npmrc 中设置 electron_skip_binary_download=true，跳过官方网络下载
 * 2. pnpm i 的 postinstall 阶段从 npmmirror 下载对应平台 zip 并解压到 node_modules/electron/dist
 *
 * 镜像：https://registry.npmmirror.com/binary.html?path=electron/
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const https = require('https');
const http = require('http');

const PROJECT_ROOT = process.cwd();
const CACHE_DIR = path.join(PROJECT_ROOT, '.cache', 'electron');
const MIRROR_BASE = 'https://npmmirror.com/mirrors/electron';
const MIRROR_FALLBACK = 'https://registry.npmmirror.com/-/binary/electron';

function log(msg) {
  console.log(msg);
}

function error(msg) {
  console.error(msg);
}

function getElectronPlatform() {
  switch (process.platform) {
    case 'win32':
      return 'win32';
    case 'darwin':
      return 'darwin';
    case 'linux':
      return 'linux';
    default:
      throw new Error(`不支持的平台: ${process.platform}`);
  }
}

function getElectronArch() {
  switch (process.arch) {
    case 'x64':
      return 'x64';
    case 'arm64':
      return 'arm64';
    case 'ia32':
      return 'ia32';
    case 'arm':
      return 'armv7l';
    default:
      throw new Error(`不支持的架构: ${process.arch}`);
  }
}

function findElectronModulePath() {
  const direct = path.join(PROJECT_ROOT, 'node_modules', 'electron');
  if (fs.existsSync(path.join(direct, 'package.json'))) {
    return direct;
  }

  const pnpmDir = path.join(PROJECT_ROOT, 'node_modules', '.pnpm');
  if (fs.existsSync(pnpmDir)) {
    for (const dir of fs.readdirSync(pnpmDir)) {
      if (dir.startsWith('electron@')) {
        const candidate = path.join(pnpmDir, dir, 'node_modules', 'electron');
        if (fs.existsSync(path.join(candidate, 'package.json'))) {
          return candidate;
        }
      }
    }
  }

  return null;
}

function getElectronVersion() {
  const electronPath = findElectronModulePath();
  if (electronPath) {
    const pkg = JSON.parse(
      fs.readFileSync(path.join(electronPath, 'package.json'), 'utf8')
    );
    return pkg.version;
  }

  const rootPkg = JSON.parse(
    fs.readFileSync(path.join(PROJECT_ROOT, 'package.json'), 'utf8')
  );
  const declared =
    rootPkg.dependencies?.electron || rootPkg.devDependencies?.electron;
  if (!declared) {
    throw new Error('package.json 中未找到 electron 依赖');
  }
  return declared.replace(/^[^\d]*/, '');
}

function getArtifactName(version, platform, arch) {
  return `electron-v${version}-${platform}-${arch}.zip`;
}

function getExecutableName(platform) {
  return platform === 'win32' ? 'electron.exe' : 'electron';
}

function isElectronInstalled(electronPath, platform) {
  const executable = path.join(
    electronPath,
    'dist',
    getExecutableName(platform)
  );
  return fs.existsSync(executable);
}

function findLocalZip(zipName, electronPath) {
  const candidates = [
    path.join(CACHE_DIR, zipName),
    path.join(electronPath, zipName),
    path.join(PROJECT_ROOT, zipName),
  ];
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }
  return null;
}

function downloadFile(url, dest) {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(dest);
    const client = url.startsWith('https') ? https : http;

    const request = client.get(url, response => {
      if (
        response.statusCode >= 300 &&
        response.statusCode < 400 &&
        response.headers.location
      ) {
        file.close();
        fs.unlink(dest, () => {});
        downloadFile(response.headers.location, dest).then(resolve, reject);
        return;
      }

      if (response.statusCode !== 200) {
        file.close();
        fs.unlink(dest, () => {});
        reject(new Error(`下载失败 HTTP ${response.statusCode}: ${url}`));
        return;
      }

      const total = parseInt(response.headers['content-length'] || '0', 10);
      let downloaded = 0;
      let lastPercent = -1;

      response.on('data', chunk => {
        downloaded += chunk.length;
        if (total > 0) {
          const percent = Math.floor((downloaded / total) * 100);
          if (percent !== lastPercent && percent % 10 === 0) {
            log(`   下载进度: ${percent}%`);
            lastPercent = percent;
          }
        }
      });

      response.pipe(file);
      file.on('finish', () => {
        file.close(() => resolve());
      });
    });

    request.on('error', err => {
      file.close();
      fs.unlink(dest, () => {});
      reject(err);
    });

    file.on('error', err => {
      file.close();
      fs.unlink(dest, () => {});
      reject(err);
    });
  });
}

async function downloadZip(version, platform, arch, zipName, zipPath) {
  const urls = [
    `${MIRROR_BASE}/${version}/${zipName}`,
    `${MIRROR_FALLBACK}/${version}/${zipName}`,
  ];

  fs.mkdirSync(path.dirname(zipPath), { recursive: true });

  let lastError;
  for (const url of urls) {
    log(`📥 正在下载: ${url}`);
    try {
      await downloadFile(url, zipPath);
      const stats = fs.statSync(zipPath);
      if (stats.size < 1024 * 1024) {
        fs.unlinkSync(zipPath);
        throw new Error('下载文件过小，可能不完整');
      }
      log(`✅ 下载完成 (${(stats.size / 1024 / 1024).toFixed(1)} MB)`);
      return;
    } catch (err) {
      lastError = err;
      log(`⚠️  镜像失败: ${err.message}`);
      if (fs.existsSync(zipPath)) {
        fs.unlinkSync(zipPath);
      }
    }
  }

  throw new Error(
    `所有镜像均下载失败: ${lastError?.message || 'unknown error'}`
  );
}

async function extractZip(zipPath, distPath) {
  const extract = require('extract-zip');

  if (fs.existsSync(distPath)) {
    fs.rmSync(distPath, { recursive: true, force: true });
  }
  fs.mkdirSync(distPath, { recursive: true });

  await extract(zipPath, { dir: distPath });
}

function writePathFile(electronPath, platform) {
  const executable = path.join(
    electronPath,
    'dist',
    getExecutableName(platform)
  );
  fs.writeFileSync(path.join(electronPath, 'path.txt'), executable);
}

function setExecutablePermissions(distPath, platform) {
  if (platform !== 'win32') {
    const executable = path.join(distPath, 'electron');
    if (fs.existsSync(executable)) {
      fs.chmodSync(executable, 0o755);
    }
  }
}

async function installElectron() {
  log('🔧 Electron 自动安装（npmmirror 镜像）');

  const platform = getElectronPlatform();
  const arch = getElectronArch();
  const version = getElectronVersion();
  const zipName = getArtifactName(version, platform, arch);

  log(`📋 版本: ${version} | 平台: ${platform}-${arch}`);

  const electronPath = findElectronModulePath();
  if (!electronPath) {
    throw new Error(
      '未找到 node_modules/electron，请先运行 pnpm i 安装依赖包'
    );
  }

  if (isElectronInstalled(electronPath, platform)) {
    log('✅ Electron 二进制已就绪，跳过安装');
    return;
  }

  const cacheZipPath = path.join(CACHE_DIR, zipName);
  let zipPath = findLocalZip(zipName, electronPath);

  if (zipPath) {
    log(`📦 使用本地缓存: ${zipPath}`);
  } else {
    await downloadZip(version, platform, arch, zipName, cacheZipPath);
    zipPath = cacheZipPath;
  }

  const distPath = path.join(electronPath, 'dist');
  log(`📂 解压到: ${distPath}`);
  await extractZip(zipPath, distPath);

  if (!isElectronInstalled(electronPath, platform)) {
    throw new Error('解压完成但未找到 electron 可执行文件');
  }

  writePathFile(electronPath, platform);
  setExecutablePermissions(distPath, platform);

  log('🎉 Electron 安装完成');
}

if (require.main === module) {
  installElectron().catch(err => {
    error(`❌ Electron 安装失败: ${err.message}`);
    process.exit(1);
  });
}

module.exports = { installElectron, findElectronModulePath, getElectronVersion };
