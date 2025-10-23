/**
 * Vite 插件：自动处理 Electron 解压缩
 * 在构建过程中自动检查和修复 Electron 安装问题
 */

const fs = require('fs');
const path = require('path');
const os = require('os');

function vitePluginElectronExtract(options = {}) {
  const {
    electronVersion = '13.6.7',
    autoExtract = true,
    verbose = false
  } = options;

  let config;
  let isElectronMode = false;

  return {
    name: 'vite-plugin-electron-extract',
    
    configResolved(resolvedConfig) {
      config = resolvedConfig;
      isElectronMode = resolvedConfig.command === 'build' && 
                       process.env.npm_lifecycle_event?.includes('electron');
    },

    buildStart() {
      if (!isElectronMode || !autoExtract) return;
      
      this.checkAndFixElectron();
    },

    checkAndFixElectron() {
      const platform = os.platform();
      const electronPath = path.join(process.cwd(), 'node_modules', 'electron');
      const distPath = path.join(electronPath, 'dist');
      const executableName = platform === 'win32' ? 'electron.exe' : 'electron';
      const executablePath = path.join(distPath, executableName);
      const zipPath = path.join(electronPath, `electron-v${electronVersion}-${platform}-${os.arch()}.zip`);

      if (verbose) {
        console.log('🔍 [Vite Plugin] 检查 Electron 安装状态...');
      }

      // 检查是否需要解压
      if (!fs.existsSync(executablePath) && fs.existsSync(zipPath)) {
        console.log('🚀 [Vite Plugin] 自动解压 Electron...');
        
        try {
          // 创建 dist 目录
          if (!fs.existsSync(distPath)) {
            fs.mkdirSync(distPath, { recursive: true });
          }

          // 解压文件
          const AdmZip = require('adm-zip');
          const zip = new AdmZip(zipPath);
          zip.extractAllTo(distPath, true);
          
          // 设置权限
          if (platform !== 'win32') {
            fs.chmodSync(executablePath, '755');
          }
          
          console.log('✅ [Vite Plugin] Electron 自动解压完成');
        } catch (error) {
          console.error('❌ [Vite Plugin] Electron 解压失败:', error.message);
        }
      }
    }
  };
}

module.exports = vitePluginElectronExtract;
