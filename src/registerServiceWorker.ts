/* eslint-disable no-console */

import { register } from 'register-service-worker';
import { isDesktop } from '@/platform/env';
import { useUiStore } from '@/stores';

function getServiceWorkerUrl() {
  const baseUrl = import.meta.env.BASE_URL || '/';
  try {
    const resolvedBase = new URL(baseUrl, window.location.origin);
    if (resolvedBase.origin !== window.location.origin) {
      // Service Worker must be registered from the page origin, not the CDN.
      return null;
    }
    return new URL('sw.js', resolvedBase).href;
  } catch {
    return `${baseUrl}sw.js`;
  }
}

const serviceWorkerUrl = getServiceWorkerUrl();

// PWA 只在构建产物启用：dev 模式下 vite-plugin-pwa 不产出 sw.js，
// 这里的注册请求会落进 SPA fallback 拿到 text/html，触发
// "Expected sw.js to have javascript content-type" 报错
if (import.meta.env.PROD && !isDesktop() && serviceWorkerUrl) {
  register(serviceWorkerUrl, {
    updatefound() {
      // 新资源正在后台下载，无需提示（下载完才走 updated）
    },
    updated() {
      // 曾全体被注释吞掉：新版本永远无人知晓，线上修复到不了老用户手里。
      // 现在置标志交给 SwUpdatePrompt 组件，由用户挑时机刷新，不打断听歌。
      useUiStore().updateSwNeedsRefresh(true);
    },
    offline() {
      console.log(
        'No internet connection found. App is running in offline mode.'
      );
    },
    error(error) {
      console.error('Error during service worker registration:', error);
    },
  });
}
