// 构建 Electron 主进程与 preload（渲染层由 `vite build --mode electron` 直出同目录）。
// 取代旧 vue-cli-plugin-electron-builder 的 webpack 主进程编译链。
// 产物布局：dist_electron/{background.js, preload.js, index.html, assets/...}
// —— main 里 Express 以 __dirname 为静态根，三层产物必须同目录。
import esbuild from 'esbuild';

const isDev = process.argv.includes('--watch') || process.env.NODE_ENV === 'development';

await esbuild.build({
  entryPoints: ['src/background.js', 'src/preload.ts'],
  outdir: 'dist_electron',
  bundle: true,
  platform: 'node',
  format: 'cjs',
  target: 'node22',
  alias: { '@': './src' },
  // external 原则：native 模块（.node）、运行时动态 require 的包、以及依赖
  // electron 运行环境的包不进 bundle，交给 asar 内的 node_modules（electron-builder
  // 会按 package.json dependencies 自动打包）
  external: [
    'electron',
    '@unblockneteasemusic/rust-napi',
    '@neteaseapireborn/api',
    'electron-updater',
    'electron-store',
    'discord-rich-presence',
    'mpris-service',
  ],
  define: {
    'process.env.NODE_ENV': isDev ? '"development"' : '"production"',
    'process.env.IS_ELECTRON': 'true',
    // 旧 vue-cli 链注入的静态资源根：prod 指向包内 dist_electron（vite 已把
    // public/ 的 img/ 拷到该处）；dev 指回仓库 public/（渲染层走 vite dev server）
    __static: isDev
      ? 'require("path").join(__dirname, "../public")'
      : '__dirname',
  },
  sourcemap: false,
  logLevel: 'info',
});
