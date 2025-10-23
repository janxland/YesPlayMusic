# Electron 自动解压缩使用指南

## 快速开始

### 1. 自动执行（推荐）
```bash
# 安装依赖时自动执行
npm install

# 手动执行
npm run electron:extract
```

### 2. 直接使用脚本
```bash
# 基本使用
node scripts/electron-auto-extract.js

# 详细模式
node scripts/electron-auto-extract.js --verbose

# 强制重新解压
node scripts/electron-auto-extract.js --force
```

## 配置选项

### 环境变量
```bash
# 设置 Electron 版本
export ELECTRON_VERSION=13.6.7

# 启用详细日志
export ELECTRON_EXTRACT_VERBOSE=true

# 禁用自动解压
export ELECTRON_AUTO_EXTRACT=false
```

### 脚本参数
```bash
# 指定版本
node scripts/electron-auto-extract.js --version=13.6.7

# 详细模式
node scripts/electron-auto-extract.js --verbose

# 强制重新解压
node scripts/electron-auto-extract.js --force

# 帮助信息
node scripts/electron-auto-extract.js --help
```

## 集成到构建流程

### 1. Vite 集成
```javascript
// vite.config.js
import { defineConfig } from 'vite'
import electronExtractPlugin from './scripts/vite-plugin-electron-extract.js'

export default defineConfig({
  plugins: [
    electronExtractPlugin({
      electronVersion: '13.6.7',
      autoExtract: true,
      verbose: true
    })
  ]
})
```

### 2. Webpack 集成
```javascript
// webpack.config.js
const electronExtractPlugin = require('./scripts/vite-plugin-electron-extract.js')

module.exports = {
  plugins: [
    new electronExtractPlugin({
      electronVersion: '13.6.7',
      autoExtract: true,
      verbose: true
    })
  ]
}
```

### 3. Babel 集成
```javascript
// babel.config.js
module.exports = {
  plugins: [
    './scripts/babel-plugin-electron-extract.js'
  ]
}
```

## 故障排除

### 常见问题

#### 1. 权限不足
```bash
# Windows
# 以管理员身份运行 PowerShell

# macOS/Linux
sudo node scripts/electron-auto-extract.js
```

#### 2. 磁盘空间不足
```bash
# 检查磁盘空间
df -h

# 清理缓存
npm cache clean --force
```

#### 3. 网络问题
```bash
# 使用代理
npm config set proxy http://proxy.company.com:8080
npm config set https-proxy http://proxy.company.com:8080

# 使用淘宝镜像
npm config set registry https://registry.npmmirror.com
```

#### 4. 版本不匹配
```bash
# 检查 Electron 版本
npm list electron

# 重新安装
npm uninstall electron
npm install electron@13.6.7
```

### 调试模式
```bash
# 启用调试日志
DEBUG=electron-extract npm run electron:extract

# 查看详细输出
npm run electron:extract -- --verbose
```

## 高级用法

### 1. 自定义配置
```javascript
// scripts/custom-electron-extract.js
const ElectronAutoExtractor = require('./electron-auto-extract.js')

const extractor = new ElectronAutoExtractor({
  electronVersion: '13.6.7',
  platform: 'win32',
  arch: 'x64',
  verbose: true,
  force: false
})

extractor.run()
```

### 2. 批量处理
```bash
# 处理多个版本
for version in 13.6.7 14.2.9 15.5.5; do
  ELECTRON_VERSION=$version node scripts/electron-auto-extract.js
done
```

### 3. 集成到 CI/CD
```yaml
# .github/workflows/build.yml
name: Build
on: [push, pull_request]

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v2
      - uses: actions/setup-node@v2
        with:
          node-version: '16'
      - run: npm install
      - run: npm run electron:extract
      - run: npm run build
```

## 性能优化

### 1. 缓存机制
```bash
# 启用缓存
export ELECTRON_CACHE_DIR=/tmp/electron-cache

# 清理缓存
rm -rf /tmp/electron-cache
```

### 2. 并行处理
```bash
# 并行解压多个平台
npm run electron:extract -- --platform=all --parallel
```

### 3. 增量更新
```bash
# 只更新变化的文件
npm run electron:extract -- --incremental
```

## 监控和日志

### 1. 日志配置
```bash
# 设置日志级别
export ELECTRON_LOG_LEVEL=debug

# 输出到文件
npm run electron:extract > electron-extract.log 2>&1
```

### 2. 监控脚本
```javascript
// scripts/monitor-electron.js
const fs = require('fs')
const path = require('path')

function monitorElectron() {
  const electronPath = path.join(__dirname, '../node_modules/electron/dist')
  const executablePath = path.join(electronPath, 'electron.exe')
  
  if (!fs.existsSync(executablePath)) {
    console.log('⚠️ Electron 可执行文件缺失，正在修复...')
    require('./electron-auto-extract.js')
  }
}

// 每5分钟检查一次
setInterval(monitorElectron, 5 * 60 * 1000)
```

## 最佳实践

### 1. 项目结构
```
project/
├── scripts/
│   ├── electron-auto-extract.js
│   ├── vite-plugin-electron-extract.js
│   ├── babel-plugin-electron-extract.js
│   └── postinstall-hook.js
├── docs/
│   ├── electron-auto-extract-solution.md
│   └── electron-auto-extract-usage.md
└── package.json
```

### 2. 版本管理
```json
{
  "scripts": {
    "postinstall": "electron-builder install-app-deps && node scripts/postinstall-hook.js",
    "electron:extract": "node scripts/electron-auto-extract.js",
    "electron:fix": "node scripts/electron-auto-extract.js"
  }
}
```

### 3. 错误处理
```javascript
// 在应用启动时检查
const { app } = require('electron')

app.whenReady().then(() => {
  // 检查 Electron 安装
  require('./scripts/electron-auto-extract.js')
})
```

## 贡献指南

### 1. 开发环境
```bash
# 克隆项目
git clone <repository-url>
cd <project-name>

# 安装依赖
npm install

# 运行测试
npm test
```

### 2. 提交代码
```bash
# 创建功能分支
git checkout -b feature/electron-auto-extract

# 提交更改
git add .
git commit -m "feat: add electron auto extract functionality"

# 推送分支
git push origin feature/electron-auto-extract
```

### 3. 代码规范
- 使用 ESLint 进行代码检查
- 遵循项目的代码风格
- 添加必要的注释和文档
- 编写单元测试

## 许可证

MIT License - 详见 LICENSE 文件
