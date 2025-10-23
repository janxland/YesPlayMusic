#!/usr/bin/env node

/**
 * Electron 自动解压缩脚本
 * 用于在安装依赖后自动处理 Electron 二进制文件
 * 支持多种包管理器：npm, yarn, pnpm
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const { execSync } = require('child_process');

class ElectronAutoExtractor {
  constructor() {
    this.platform = os.platform();
    this.arch = os.arch();
    this.electronVersion = '13.6.7';
    this.projectRoot = process.cwd();
    this.electronPath = path.join(this.projectRoot, 'node_modules', 'electron');
    this.distPath = path.join(this.electronPath, 'dist');
    this.zipPath = path.join(this.electronPath, 'electron-v13.6.7-win32-x64.zip');
  }

  /**
   * 检查 Electron 是否已正确安装
   */
  checkElectronInstallation() {
    console.log('🔍 检查 Electron 安装状态...');
    
    if (!fs.existsSync(this.electronPath)) {
      console.log('❌ Electron 未安装');
      return false;
    }

    if (!fs.existsSync(this.distPath)) {
      console.log('❌ Electron dist 目录不存在');
      return false;
    }

    const executableName = this.platform === 'win32' ? 'electron.exe' : 'electron';
    const executablePath = path.join(this.distPath, executableName);

    if (!fs.existsSync(executablePath)) {
      console.log('❌ Electron 可执行文件不存在');
      return false;
    }

    console.log('✅ Electron 安装正常');
    return true;
  }

  /**
   * 检查是否存在压缩包
   */
  checkZipFile() {
    if (fs.existsSync(this.zipPath)) {
      console.log('📦 发现 Electron 压缩包，开始解压...');
      return true;
    }
    return false;
  }

  /**
   * 解压缩 Electron
   */
  async extractElectron() {
    try {
      console.log('🚀 开始解压 Electron...');
      
      // 使用 Node.js 内置的 zlib 和 tar 模块
      const zlib = require('zlib');
      const tar = require('tar');
      
      // 创建 dist 目录
      if (!fs.existsSync(this.distPath)) {
        fs.mkdirSync(this.distPath, { recursive: true });
      }

      // 解压 zip 文件
      const AdmZip = require('adm-zip');
      const zip = new AdmZip(this.zipPath);
      zip.extractAllTo(this.distPath, true);
      
      console.log('✅ Electron 解压完成');
      return true;
    } catch (error) {
      console.error('❌ 解压失败:', error.message);
      return false;
    }
  }

  /**
   * 设置可执行权限 (Unix 系统)
   */
  setExecutablePermissions() {
    if (this.platform !== 'win32') {
      try {
        const executablePath = path.join(this.distPath, 'electron');
        fs.chmodSync(executablePath, '755');
        console.log('✅ 设置可执行权限完成');
      } catch (error) {
        console.warn('⚠️ 设置权限失败:', error.message);
      }
    }
  }

  /**
   * 验证解压结果
   */
  verifyExtraction() {
    const executableName = this.platform === 'win32' ? 'electron.exe' : 'electron';
    const executablePath = path.join(this.distPath, executableName);
    
    if (fs.existsSync(executablePath)) {
      console.log('✅ Electron 解压验证成功');
      return true;
    } else {
      console.log('❌ Electron 解压验证失败');
      return false;
    }
  }

  /**
   * 主执行函数
   */
  async run() {
    console.log('🔧 Electron 自动解压缩工具启动');
    console.log(`📋 平台: ${this.platform}-${this.arch}`);
    console.log(`📋 Electron 版本: ${this.electronVersion}`);
    
    // 检查是否已正确安装
    if (this.checkElectronInstallation()) {
      console.log('✅ Electron 已正确安装，无需处理');
      return;
    }

    // 检查压缩包
    if (!this.checkZipFile()) {
      console.log('❌ 未找到 Electron 压缩包');
      console.log('💡 请确保已下载 electron-v13.6.7-win32-x64.zip 到 node_modules/electron/ 目录');
      return;
    }

    // 执行解压
    const success = await this.extractElectron();
    if (success) {
      this.setExecutablePermissions();
      this.verifyExtraction();
      console.log('🎉 Electron 自动解压缩完成！');
    } else {
      console.log('❌ Electron 解压缩失败');
      process.exit(1);
    }
  }
}

// 如果直接运行此脚本
if (require.main === module) {
  const extractor = new ElectronAutoExtractor();
  extractor.run().catch(console.error);
}

module.exports = ElectronAutoExtractor;
