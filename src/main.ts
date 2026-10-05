import '@/utils/imageFallback';
import { createApp } from 'vue';
import VueGtag from 'vue-gtag';
import App from './App.vue';
import { pinia, useSettingsStore, useUiStore } from './stores';
import router from './router';
import { setupI18n } from '@/locale';
import 'virtual:svg-icons-register';
import SvgIcon from '@/components/SvgIcon.vue';
import LazyImage from '@/components/LazyImage.vue';
import './registerServiceWorker';
import { initPlayer } from '@/player/singleton';
import { dailyTask } from '@/utils/common';
import '@/assets/css/global.scss';
import NProgress from 'nprogress';
import '@/assets/css/nprogress.css';
import { configureRequest } from '@/utils/request';
import { doLogout } from '@/utils/auth';
import { isDesktop } from '@/platform/env';

// api 层不许 import store/router，会话过期的动作在此注入；必须早于任何请求发出。
configureRequest({
  onSessionExpired: () => {
    useUiStore().showToast('登录已过期，请重新登录');
    doLogout();
    router.push({ name: isDesktop() ? 'loginAccount' : 'login' });
  },
});

window.resetApp = () => {
  localStorage.clear();
  indexedDB.deleteDatabase('yesplaymusic');
  document.cookie.split(';').forEach(function (c) {
    document.cookie = c
      .replace(/^ +/, '')
      .replace(/=.*/, '=;expires=' + new Date().toUTCString() + ';path=/');
  });
  return '已重置应用，请刷新页面（按Ctrl/Command + R）';
};
console.log(
  '如出现问题，可尝试在本页输入 %cresetApp()%c 然后按回车重置应用。',
  'background: #eaeffd;color:#335eea;padding: 4px 6px;border-radius:3px;',
  'background:unset;color:unset;'
);

const app = createApp(App);

app.use(pinia);
app.use(router);
// i18n 语言包按需加载：启动只拉当前语言一个包，就绪后再挂载避免首屏渲染出 key 名
async function bootstrap() {
  app.use(await setupI18n(useSettingsStore().settings.lang));
  app.use(
    VueGtag,
    {
      config: { id: 'G-KMJJCFZDKF' },
    },
    router
  );
  // Vue2 全局 filter 的兜底：全局挂载 formatters，避免个别组件漏注册 methods
  // 时模板裸调用直接打断整棵 patch 树
  const formatters = await import('@/utils/formatters');
  Object.entries(formatters).forEach(([k, fn]) => {
    app.config.globalProperties[k] = fn;
  });
  app.component('SvgIcon', SvgIcon);
  app.component('LazyImage', LazyImage);

  NProgress.configure({ showSpinner: false, trickleSpeed: 100 });
  dailyTask();
  // _init 依赖 store 就绪（updateTitle/IPC/托盘），必须在 pinia 激活后调用
  initPlayer();

  app.mount('#app-root');
}
bootstrap();
