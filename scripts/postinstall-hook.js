#!/usr/bin/env node

/**
 * Post-install 钩子脚本
 * 在 npm install 后自动执行 Electron 解压缩
 */

const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');

// 检查是否在 Electron 项目中
const packageJsonPath = path.join(process.cwd(), 'package.json');
const packageJson = require(packageJsonPath);

if (packageJson.dependencies && packageJson.dependencies.electron) {
  console.log('🔧 检测到 Electron 项目，执行 Electron 安装...');
  
  try {
    // 查找 Electron 安装脚本
    const electronPath = path.join(process.cwd(), 'node_modules', 'electron');
    const electronInstallPath = path.join(electronPath, 'install.js');
    
    // 如果使用 pnpm，路径可能不同
    let installScriptPath = electronInstallPath;
    if (!fs.existsSync(installScriptPath)) {
      // 尝试查找 pnpm 的路径（查找所有可能的 electron 版本）
      const pnpmElectronPath = path.join(process.cwd(), 'node_modules', '.pnpm');
      if (fs.existsSync(pnpmElectronPath)) {
        try {
          const pnpmDirs = fs.readdirSync(pnpmElectronPath);
          for (const dir of pnpmDirs) {
            if (dir.startsWith('electron@')) {
              const possiblePath = path.join(pnpmElectronPath, dir, 'node_modules', 'electron', 'install.js');
              if (fs.existsSync(possiblePath)) {
                installScriptPath = possiblePath;
                break;
              }
            }
          }
        } catch (error) {
          // 忽略错误，继续使用默认路径
        }
      }
    }
    
    // 如果找到安装脚本，先运行它
    if (fs.existsSync(installScriptPath)) {
      console.log('📥 运行 Electron 安装脚本...');
      try {
        // 使用国内镜像源加速下载
        const env = {
          ...process.env,
          ELECTRON_SKIP_BINARY_DOWNLOAD: '0',
          ELECTRON_MIRROR: process.env.ELECTRON_MIRROR || 'https://npmmirror.com/mirrors/electron/',
          ELECTRON_CACHE: process.env.ELECTRON_CACHE || '/tmp/electron-cache'
        };
        execSync(`node "${installScriptPath}"`, { 
          stdio: 'inherit',
          env: env
        });
      } catch (error) {
        console.warn('⚠️ Electron 安装脚本执行失败，继续尝试自动解压缩...');
      }
    }
    
    // 运行自动解压缩脚本
    const scriptPath = path.join(__dirname, 'electron-auto-extract.js');
    execSync(`node "${scriptPath}"`, { stdio: 'inherit' });
  } catch (error) {
    console.error('❌ 自动解压缩失败:', error.message);
  }
} else {
  console.log('ℹ️ 非 Electron 项目，跳过自动解压缩');
}
