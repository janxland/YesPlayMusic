# YesPlayMusic 自动部署到腾讯云COS

这个脚本可以将YesPlayMusic项目自动构建并上传到腾讯云COS存储桶。

## 功能特性

- 自动构建Vue项目
- 智能上传到腾讯云COS
- 支持环境变量配置
- 支持CDN域名配置
- 支持匿名访问模式
- 批量并行上传，提高效率
- 自动设置正确的MIME类型和缓存策略

## 使用方法

### 1. 安装依赖

```bash
npm install
```

### 2. 配置环境变量

复制 `env.example` 文件为 `.env.development`：

```bash
cp env.example .env.development
```

然后编辑 `.env.development` 文件，填入您的腾讯云COS配置：

```env
# 腾讯云访问密钥ID
COS_SECRET_ID=your_secret_id_here

# 腾讯云访问密钥Key
COS_SECRET_KEY=your_secret_key_here

# COS存储桶名称
COS_BUCKET=your-bucket-name

# COS地域
COS_REGION=ap-guangzhou

# 上传路径前缀（YesPlayMusic将上传到 www/music/dist/）
COS_PREFIX=www/music/dist

# 自定义域名（可选）
# COS_DOMAIN=your-custom-domain.com

# CDN域名（可选）
# COS_CDN_DOMAIN=https://your-cdn-domain.com
```

### 3. 执行部署

```bash
npm run deploy:cdn
```

这个命令会：
1. 自动构建项目 (`npm run build`)
2. 将构建产物上传到腾讯云COS

## 配置说明

### 必需配置

- `COS_SECRET_ID`: 腾讯云访问密钥ID
- `COS_SECRET_KEY`: 腾讯云访问密钥Key
- `COS_BUCKET`: COS存储桶名称
- `COS_REGION`: COS地域（如：ap-guangzhou）
- `COS_PREFIX`: 上传路径前缀（默认：www/music/dist）

### 可选配置

- `COS_DOMAIN`: 自定义域名
- `COS_CDN_DOMAIN`: CDN域名
- `COS_ANONYMOUS`: 是否使用匿名访问（设置为true时不需要密钥）

## 上传路径

项目将上传到：`{COS_PREFIX}/` 目录下，例如：
- `www/music/dist/index.html`
- `www/music/dist/js/index.d43e18f3.js`
- `www/music/dist/css/index.0d89a9b5.css`
- 等等...

## 访问地址

部署完成后，您可以通过以下地址访问：

- COS直链：`https://{BUCKET}.cos.{REGION}.myqcloud.com/{PREFIX}/index.html`
- CDN地址：`{COS_CDN_DOMAIN}/{PREFIX}/index.html`（如果配置了CDN域名）

## 注意事项

1. 确保您的腾讯云账号有COS的读写权限
2. 确保存储桶已开启公共读权限
3. 如果使用CDN，请确保CDN已配置正确的回源设置
4. 建议在生产环境中使用CDN域名以提高访问速度

## 故障排除

### 权限问题
如果遇到权限问题，可以尝试：
1. 检查SecretId和SecretKey是否正确
2. 检查存储桶权限设置
3. 尝试设置 `COS_ANONYMOUS=true` 使用匿名访问

### 网络问题
如果上传失败，可以：
1. 检查网络连接
2. 检查防火墙设置
3. 尝试使用VPN

### 配置问题
如果配置不生效：
1. 检查环境变量文件路径
2. 检查环境变量格式
3. 重启终端或IDE
