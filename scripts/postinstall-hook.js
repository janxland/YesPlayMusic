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

const { installElectron } = require('./electron-auto-extract');

installElectron()
  .then(() => {
    execSync('electron-builder install-app-deps', { stdio: 'inherit' });
  })
  .catch(err => {
    console.error(`❌ postinstall 失败: ${err.message}`);
    process.exit(1);
  });
