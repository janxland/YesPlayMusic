#!/usr/bin/env node

/**
 * Post-install 钩子脚本
 * 在 npm install 后自动执行 Electron 解压缩
 */

const { execSync } = require('child_process');
const path = require('path');

// 检查是否在 Electron 项目中
const packageJsonPath = path.join(process.cwd(), 'package.json');
const packageJson = require(packageJsonPath);

if (packageJson.dependencies && packageJson.dependencies.electron) {
  console.log('🔧 检测到 Electron 项目，执行自动解压缩...');
  
  try {
    // 运行自动解压缩脚本
    const scriptPath = path.join(__dirname, 'electron-auto-extract.js');
    execSync(`node "${scriptPath}"`, { stdio: 'inherit' });
  } catch (error) {
    console.error('❌ 自动解压缩失败:', error.message);
  }
} else {
  console.log('ℹ️ 非 Electron 项目，跳过自动解压缩');
}
