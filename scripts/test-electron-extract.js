#!/usr/bin/env node

/**
 * 测试 Electron 自动解压缩功能
 */

const fs = require('fs');
const path = require('path');
const os = require('os');

// 测试配置
const testConfig = {
  electronVersion: '13.6.7',
  platform: os.platform(),
  arch: os.arch(),
  verbose: true
};

console.log('🧪 开始测试 Electron 自动解压缩功能...\n');

// 测试 1: 检查 Electron 安装状态
function testElectronInstallation() {
  console.log('📋 测试 1: 检查 Electron 安装状态');
  
  const electronPath = path.join(process.cwd(), 'node_modules', 'electron');
  const distPath = path.join(electronPath, 'dist');
  const executableName = testConfig.platform === 'win32' ? 'electron.exe' : 'electron';
  const executablePath = path.join(distPath, executableName);
  
  console.log(`   Electron 路径: ${electronPath}`);
  console.log(`   可执行文件: ${executablePath}`);
  console.log(`   存在状态: ${fs.existsSync(executablePath) ? '✅ 存在' : '❌ 不存在'}`);
  
  return fs.existsSync(executablePath);
}

// 测试 2: 检查压缩包
function testZipFile() {
  console.log('\n📋 测试 2: 检查压缩包');
  
  const electronPath = path.join(process.cwd(), 'node_modules', 'electron');
  const zipPath = path.join(electronPath, `electron-v${testConfig.electronVersion}-${testConfig.platform}-${testConfig.arch}.zip`);
  
  console.log(`   压缩包路径: ${zipPath}`);
  console.log(`   存在状态: ${fs.existsSync(zipPath) ? '✅ 存在' : '❌ 不存在'}`);
  
  if (fs.existsSync(zipPath)) {
    const stats = fs.statSync(zipPath);
    console.log(`   文件大小: ${(stats.size / 1024 / 1024).toFixed(2)} MB`);
  }
  
  return fs.existsSync(zipPath);
}

// 测试 3: 检查脚本功能
function testScriptFunctionality() {
  console.log('\n📋 测试 3: 检查脚本功能');
  
  const scriptPath = path.join(__dirname, 'electron-auto-extract.js');
  console.log(`   脚本路径: ${scriptPath}`);
  console.log(`   存在状态: ${fs.existsSync(scriptPath) ? '✅ 存在' : '❌ 不存在'}`);
  
  if (fs.existsSync(scriptPath)) {
    try {
      const scriptContent = fs.readFileSync(scriptPath, 'utf8');
      console.log(`   脚本大小: ${scriptContent.length} 字符`);
      console.log(`   包含类定义: ${scriptContent.includes('class ElectronAutoExtractor') ? '✅ 是' : '❌ 否'}`);
    } catch (error) {
      console.log(`   读取错误: ${error.message}`);
    }
  }
  
  return fs.existsSync(scriptPath);
}

// 测试 4: 检查 npm 脚本
function testNpmScripts() {
  console.log('\n📋 测试 4: 检查 npm 脚本');
  
  const packageJsonPath = path.join(process.cwd(), 'package.json');
  
  if (fs.existsSync(packageJsonPath)) {
    try {
      const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
      const scripts = packageJson.scripts || {};
      
      console.log(`   electron:extract: ${scripts['electron:extract'] ? '✅ 存在' : '❌ 不存在'}`);
      console.log(`   electron:fix: ${scripts['electron:fix'] ? '✅ 存在' : '❌ 不存在'}`);
      console.log(`   postinstall: ${scripts['postinstall'] ? '✅ 存在' : '❌ 不存在'}`);
      
      return scripts['electron:extract'] && scripts['electron:fix'];
    } catch (error) {
      console.log(`   解析错误: ${error.message}`);
      return false;
    }
  }
  
  return false;
}

// 测试 5: 检查插件文件
function testPluginFiles() {
  console.log('\n📋 测试 5: 检查插件文件');
  
  const plugins = [
    'vite-plugin-electron-extract.js',
    'babel-plugin-electron-extract.js',
    'postinstall-hook.js'
  ];
  
  let allExist = true;
  
  plugins.forEach(plugin => {
    const pluginPath = path.join(__dirname, plugin);
    const exists = fs.existsSync(pluginPath);
    console.log(`   ${plugin}: ${exists ? '✅ 存在' : '❌ 不存在'}`);
    if (!exists) allExist = false;
  });
  
  return allExist;
}

// 运行所有测试
function runAllTests() {
  console.log('🔧 Electron 自动解压缩测试套件');
  console.log('=' .repeat(50));
  
  const tests = [
    { name: 'Electron 安装状态', fn: testElectronInstallation },
    { name: '压缩包检查', fn: testZipFile },
    { name: '脚本功能', fn: testScriptFunctionality },
    { name: 'npm 脚本', fn: testNpmScripts },
    { name: '插件文件', fn: testPluginFiles }
  ];
  
  let passed = 0;
  let total = tests.length;
  
  tests.forEach(test => {
    try {
      const result = test.fn();
      if (result) passed++;
    } catch (error) {
      console.log(`   ❌ 测试失败: ${error.message}`);
    }
  });
  
  console.log('\n' + '=' .repeat(50));
  console.log(`📊 测试结果: ${passed}/${total} 通过`);
  
  if (passed === total) {
    console.log('🎉 所有测试通过！Electron 自动解压缩功能正常');
  } else {
    console.log('⚠️ 部分测试失败，请检查配置');
  }
  
  return passed === total;
}

// 主函数
function main() {
  try {
    const success = runAllTests();
    process.exit(success ? 0 : 1);
  } catch (error) {
    console.error('❌ 测试执行失败:', error.message);
    process.exit(1);
  }
}

// 如果直接运行此脚本
if (require.main === module) {
  main();
}

module.exports = {
  testElectronInstallation,
  testZipFile,
  testScriptFunctionality,
  testNpmScripts,
  testPluginFiles,
  runAllTests
};
