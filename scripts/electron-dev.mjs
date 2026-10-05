// Electron 开发编排：vite dev server + esbuild watch 主进程 + 拉起 Electron。
// 替代旧 vue-cli-plugin-electron-builder 的 electron:serve。
// 退出：Ctrl-C 会经 SIGTERM 传播给三个子进程（Electron 退出即整体收尾）。
import { spawn } from 'node:child_process';
import { context } from 'esbuild';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const electronBin = require('electron');

const DEV_SERVER_PORT = process.env.DEV_SERVER_PORT || 8080;
const devServerUrl = `http://localhost:${DEV_SERVER_PORT}`;

const commonOptions = {
  entryPoints: ['src/background.js', 'src/preload.ts'],
  outdir: 'dist_electron',
  bundle: true,
  platform: 'node',
  format: 'cjs',
  target: 'node22',
  alias: { '@': './src' },
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
    'process.env.NODE_ENV': '"development"',
    'process.env.IS_ELECTRON': 'true',
    // dev 态静态资源根：仓库 public/（渲染层走 vite dev server，img/ 不在 dist_electron）
    __static: 'require("path").join(__dirname, "../public")',
  },
  sourcemap: 'inline',
  logLevel: 'info',
};

async function waitForVite(url, timeoutMs = 30000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    try {
      const res = await fetch(url);
      if (res.ok) return;
    } catch {
      // vite 尚未就绪
    }
    await new Promise(resolve => setTimeout(resolve, 300));
  }
  throw new Error(`vite dev server not ready at ${url}`);
}

const vite = spawn('pnpm', ['dev'], { stdio: 'inherit' });

const esbuildCtx = await context(commonOptions);
await esbuildCtx.watch();

await waitForVite(devServerUrl);

const electron = spawn(electronBin, ['.'], {
  stdio: 'inherit',
  env: {
    ...process.env,
    VITE_DEV_SERVER_URL: devServerUrl,
    ELECTRON_START_URL: devServerUrl,
  },
});

electron.on('exit', code => {
  vite.kill('SIGTERM');
  process.exit(code ?? 0);
});

['SIGINT', 'SIGTERM'].forEach(signal => {
  process.on(signal, () => {
    electron.kill(signal);
    vite.kill(signal);
    process.exit(0);
  });
});
