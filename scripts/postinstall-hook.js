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

// CI 上 pnpm install 阶段不做二进制预装（避免与 workflow 步骤重复下载），
// 由 .github/workflows/build.yaml 的 "Extract Electron binary" 步骤显式调用
// pnpm run electron:extract 补齐；原生依赖重建由 electron-builder 打包阶段完成。
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
