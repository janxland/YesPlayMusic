// deploy-cdn.js - 部署YesPlayMusic到腾讯云COS的脚本
// 注意：此脚本需要安装cos-nodejs-sdk-v5包和dotenv包
// npm install cos-nodejs-sdk-v5 dotenv --save-dev

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// 显示当前工作目录和脚本目录
console.log('当前工作目录:', process.cwd());
console.log('脚本目录:', __dirname);

// 加载环境变量
let dotenv;
try {
  dotenv = require('dotenv');
  
  // 优先加载.env.production，如果不存在则加载.env.development
  const envProdPath = path.resolve(__dirname, '../.env.production');
  const envDevPath = path.resolve(__dirname, '../.env.development');
  const envPath = fs.existsSync(envProdPath) ? envProdPath : envDevPath;
  
  console.log(`尝试加载环境变量文件: ${envPath}`);
  console.log(`该文件是否存在: ${fs.existsSync(envPath)}`);
  
  // 加载环境变量
  const result = dotenv.config({ path: envPath });
  
  if (result.error) {
    console.error('加载环境变量失败:', result.error);
  } else {
    console.log('环境变量加载成功');
    // 打印所有环境变量（隐藏敏感信息）
    console.log('环境变量列表:');
    Object.keys(process.env).forEach(key => {
      if (key.startsWith('COS_')) {
        const value = process.env[key];
        console.log(`${key}: ${key.includes('SECRET') ? (value ? '******' : '未设置') : value}`);
      }
    });
  }
} catch (e) {
  console.error('无法加载dotenv包:', e);
  console.log('尝试安装dotenv...');
  try {
    execSync('npm install dotenv --save-dev', { stdio: 'inherit' });
    dotenv = require('dotenv');
    dotenv.config({ path: path.resolve(__dirname, '../.env.development') });
  } catch (installError) {
    console.error('安装dotenv失败，将使用默认配置');
  }
}

// 从环境变量中读取COS配置
const cosConfig = {
  SecretId: process.env.COS_SECRET_ID,
  SecretKey: process.env.COS_SECRET_KEY,
  Bucket: process.env.COS_BUCKET || 'mybox-1257251314',
  Region: process.env.COS_REGION || 'ap-guangzhou',
  Prefix: process.env.COS_PREFIX || 'www/music/dist',
  Domain: process.env.COS_DOMAIN,
  cdnDomain: process.env.COS_CDN_DOMAIN,
  useAnonymous: process.env.COS_ANONYMOUS === 'true'
};

console.log('COS配置信息：', {
  Bucket: cosConfig.Bucket,
  Region: cosConfig.Region,
  Prefix: cosConfig.Prefix,
  SecretId: cosConfig.SecretId ? `${cosConfig.SecretId.substring(0, 5)}...` : '未设置',
  SecretKey: cosConfig.SecretKey ? '******' : '未设置',
  useAnonymous: cosConfig.useAnonymous
});

// 如果没有SecretId和SecretKey，尝试直接从文件中读取
if (!cosConfig.SecretId || !cosConfig.SecretKey) {
  console.log('尝试直接读取环境变量文件内容...');
  try {
    const envPath = path.resolve(__dirname, '../.env.development');
    if (fs.existsSync(envPath)) {
      const envContent = fs.readFileSync(envPath, 'utf8');
      console.log('环境变量文件内容（隐藏敏感信息）:');
      
      // 显示文件内容，但隐藏敏感信息
      const sanitizedContent = envContent
        .split('\n')
        .map(line => {
          if (line.includes('SECRET_ID') || line.includes('SECRET_KEY')) {
            const parts = line.split('=');
            if (parts.length > 1) {
              return `${parts[0]}=******`;
            }
          }
          return line;
        })
        .join('\n');
      
      console.log(sanitizedContent);
      
      // 手动解析环境变量
      const envVars = {};
      envContent.split('\n').forEach(line => {
        if (line && !line.startsWith('#')) {
          const parts = line.split('=');
          if (parts.length >= 2) {
            const key = parts[0].trim();
            const value = parts.slice(1).join('=').trim();
            envVars[key] = value;
          }
        }
      });
      
      // 更新配置
      if (envVars.COS_SECRET_ID) cosConfig.SecretId = envVars.COS_SECRET_ID;
      if (envVars.COS_SECRET_KEY) cosConfig.SecretKey = envVars.COS_SECRET_KEY;
      if (envVars.COS_BUCKET) cosConfig.Bucket = envVars.COS_BUCKET;
      if (envVars.COS_REGION) cosConfig.Region = envVars.COS_REGION;
      if (envVars.COS_PREFIX) cosConfig.Prefix = envVars.COS_PREFIX;
      if (envVars.COS_DOMAIN) cosConfig.Domain = envVars.COS_DOMAIN;
      if (envVars.COS_CDN_DOMAIN) cosConfig.cdnDomain = envVars.COS_CDN_DOMAIN;
      if (envVars.COS_ANONYMOUS) cosConfig.useAnonymous = envVars.COS_ANONYMOUS === 'true';
      
      console.log('手动解析后的COS配置：', {
        Bucket: cosConfig.Bucket,
        Region: cosConfig.Region,
        Prefix: cosConfig.Prefix,
        SecretId: cosConfig.SecretId ? `${cosConfig.SecretId.substring(0, 5)}...` : '未设置',
        SecretKey: cosConfig.SecretKey ? '******' : '未设置',
        useAnonymous: cosConfig.useAnonymous
      });
    } else {
      console.log('环境变量文件不存在');
    }
  } catch (err) {
    console.error('读取环境变量文件失败:', err);
  }
}

// 检查是否安装了cos-nodejs-sdk-v5
let COS;
try {
  COS = require('cos-nodejs-sdk-v5');
} catch (e) {
  console.log('正在安装cos-nodejs-sdk-v5...');
  try {
    execSync('npm install cos-nodejs-sdk-v5 --save-dev', { stdio: 'inherit' });
  } catch (installError) {
    console.error('安装cos-nodejs-sdk-v5失败，请手动安装: npm install cos-nodejs-sdk-v5 --save-dev');
    process.exit(1);
  }
  COS = require('cos-nodejs-sdk-v5');
}

// 配置腾讯云COS
const cos = new COS({
  SecretId: cosConfig.useAnonymous ? undefined : cosConfig.SecretId,
  SecretKey: cosConfig.useAnonymous ? undefined : cosConfig.SecretKey,
  // 如果使用匿名访问，则不提供密钥
  ...cosConfig.useAnonymous && { 
    Anonymous: true,
    getAuthorization: function (options, callback) {
      callback({
        TmpSecretId: undefined,
        TmpSecretKey: undefined,
        SecurityToken: undefined,
        ExpiredTime: undefined,
      });
    }
  }
});

// COS配置
const Bucket = cosConfig.Bucket;
const Region = cosConfig.Region;
const cosBaseDir = cosConfig.Prefix.endsWith('/') ? cosConfig.Prefix : cosConfig.Prefix + '/';

// 本地dist目录
const distDir = path.resolve(__dirname, '../dist');

// 检查dist目录是否存在
if (!fs.existsSync(distDir)) {
  console.error('错误: dist目录不存在，请先构建项目');
  console.log('请运行: npm run build');
  process.exit(1);
}

// 检查COS权限
function checkCOSPermission() {
  if (cosConfig.useAnonymous) {
    console.log('使用匿名访问模式，跳过权限检查');
    return Promise.resolve(true);
  }
  
  return new Promise((resolve, reject) => {
    cos.getService({}, (err, data) => {
      if (err) {
        console.error('COS权限检查失败:', err);
        console.log('提示: 如果是权限问题，可以尝试设置环境变量 COS_ANONYMOUS=true 使用匿名访问');
        reject(err);
        return;
      }
      console.log('COS权限检查通过，可访问的存储桶列表:');
      data.Buckets.forEach(bucket => {
        console.log(`- ${bucket.Name} (${bucket.Location})`);
      });
      resolve(true);
    });
  });
}

/**
 * 递归获取目录下的所有文件
 * @param {string} dir 目录路径
 * @returns {Array} 文件路径数组
 */
function getAllFiles(dir) {
  let results = [];
  const list = fs.readdirSync(dir);
  
  list.forEach(file => {
    const filePath = path.join(dir, file);
    const stat = fs.statSync(filePath);
    
    if (stat && stat.isDirectory()) {
      results = results.concat(getAllFiles(filePath));
    } else {
      results.push(filePath);
    }
  });
  
  return results;
}

/**
 * 获取文件的MIME类型
 * @param {string} filePath 文件路径
 * @returns {string} MIME类型
 */
function getMimeType(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  const mimeTypes = {
    '.html': 'text/html',
    '.js': 'application/javascript',
    '.css': 'text/css',
    '.json': 'application/json',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.gif': 'image/gif',
    '.svg': 'image/svg+xml',
    '.ico': 'image/x-icon',
    '.woff': 'font/woff',
    '.woff2': 'font/woff2',
    '.ttf': 'font/ttf',
    '.eot': 'application/vnd.ms-fontobject',
    '.otf': 'font/otf',
    '.txt': 'text/plain',
    '.map': 'application/json',
    '.woff2': 'font/woff2',
    '.woff': 'font/woff',
    '.ttf': 'font/ttf',
    '.eot': 'application/vnd.ms-fontobject',
    '.otf': 'font/otf'
  };
  
  return mimeTypes[ext] || 'application/octet-stream';
}

/**
 * 上传单个文件到COS
 * @param {string} filePath 本地文件路径
 * @returns {Promise} 上传结果Promise
 */
function uploadFile(filePath) {
  const relativePath = path.relative(distDir, filePath).replace(/\\/g, '/');
  const cosKey = cosBaseDir + relativePath;
  
  return new Promise((resolve, reject) => {
    cos.putObject({
      Bucket,
      Region,
      Key: cosKey,
      Body: fs.createReadStream(filePath),
      ContentType: getMimeType(filePath),
      // 设置CORS头
      Headers: {
        'x-cos-acl': 'public-read',
        'Access-Control-Allow-Origin': '*',
        'Cache-Control': relativePath.includes('index.html') ? 'no-cache' : 'max-age=31536000'
      }
    }, (err, data) => {
      if (err) {
        console.error(`上传失败: ${relativePath}`, err);
        reject(err);
        return;
      }
      console.log(`上传成功: ${relativePath} -> ${cosKey}`);
      resolve(data);
    });
  });
}

/**
 * 主函数
 */
async function main() {
  try {
    console.log('开始部署YesPlayMusic到COS...');
    
    // 检查COS权限
    try {
      await checkCOSPermission();
    } catch (permErr) {
      console.error('COS权限检查失败，请确认SecretId和SecretKey是否正确，以及是否有足够的权限');
      process.exit(1);
    }
    
    // 获取所有文件
    const files = getAllFiles(distDir);
    console.log(`找到 ${files.length} 个文件需要上传`);
    
    // 上传重要文件
    const importantFiles = files.filter(file => 
      file.includes('index.html') || 
      file.includes('manifest.json') ||
      file.includes('service-worker.js')
    );
    
    console.log('首先上传关键文件...');
    for (const file of importantFiles) {
      await uploadFile(file);
    }
    
    // 上传其他文件
    const otherFiles = files.filter(file => !importantFiles.includes(file));
    console.log('上传其余文件...');
    
    // 并行上传其他文件，每次10个
    const batchSize = 10;
    for (let i = 0; i < otherFiles.length; i += batchSize) {
      const batch = otherFiles.slice(i, i + batchSize);
      await Promise.all(batch.map(file => uploadFile(file)));
      console.log(`进度: ${Math.min(i + batchSize, otherFiles.length)}/${otherFiles.length}`);
    }
    
    console.log('部署完成!');
    console.log(`YesPlayMusic已部署到: https://${Bucket}.cos.${Region}.myqcloud.com/${cosBaseDir}index.html`);
    if (cosConfig.cdnDomain) {
      console.log(`CDN访问地址: ${cosConfig.cdnDomain}/${cosBaseDir}index.html`);
    }
    
  } catch (error) {
    console.error('部署失败:', error);
    process.exit(1);
  }
}

// 执行主函数
main();
