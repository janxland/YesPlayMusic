#!/usr/bin/env node

/**
 * postinstall 钩子：先安装 Electron 二进制，再执行 electron-builder 原生依赖重建
 */

const { execSync } = require('child_process');
const path = require('path');

const packageJson = require(path.join(process.cwd(), 'package.json'));

if (
  !packageJson.dependencies?.electron &&
  !packageJson.devDependencies?.electron
) {
  process.exit(0);
}

// CI（GitHub Actions 自带 CI=true）不需要预装 electron 二进制：打包时
// electron-builder 会自行下载对应平台的 electron 并缓存，镜像下载反而在
// runner 上易挂。原生依赖重建也由 electron-builder 打包阶段完成。
if (process.env.CI === 'true') {
  console.log('⏭️ CI 环境：跳过 Electron 二进制安装与 install-app-deps');
  process.exit(0);
}

const { installElectron } = require('./electron-auto-extract');

installElectron()
  .then(() => {
    execSync('electron-builder install-app-deps', { stdio: 'inherit' });
  })
  .catch(err => {
    console.error(`❌ postinstall 失败: ${err.message}`);
    process.exit(1);
  });
