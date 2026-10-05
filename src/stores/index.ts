import { createPinia, setActivePinia } from 'pinia';
import initLocalStorage from './initLocalStorage';
import pkg from '../../package.json';
import updateApp from '@/utils/updateApp';

// ---- 原 src/store/state.js 的启动期副作用（key/结构冻结不变）----
if (localStorage.getItem('appVersion') === null) {
  localStorage.setItem('settings', JSON.stringify(initLocalStorage.settings));
  localStorage.setItem('data', JSON.stringify(initLocalStorage.data));
  localStorage.setItem('appVersion', pkg.version);
}
updateApp();

// 立即激活：Player._init / dailyTask 等非组件调用点要在 app.use(pinia) 之前拿到实例
export const pinia = createPinia();
setActivePinia(pinia);

// ---- 领域 store（localStorage key 全部冻结不变）----
export { useSettingsStore } from './settings';
export { useLikedStore } from './liked';
export { useDataStore } from './data';
export { useUiStore } from './ui';
export { usePlayerStore } from './player';
