import Vue from 'vue';
import Vuex from 'vuex';
import state from './state';
import mutations from './mutations';
import actions from './actions';
import { changeAppearance, changeThemeColor } from '@/utils/common';
import Player from '@/utils/Player';
// vuex 自定义插件
import saveToLocalStorage from './plugins/localStorage';
import { getSendSettingsPlugin } from './plugins/sendSettings';

Vue.use(Vuex);

let plugins = [saveToLocalStorage];
if (process.env.IS_ELECTRON === true) {
  let sendSettings = getSendSettingsPlugin();
  plugins.push(sendSettings);
}
const options = {
  state,
  mutations,
  actions,
  plugins,
};

const store = new Vuex.Store(options);

if ([undefined, null].includes(store.state.settings.lang)) {
  const defaultLang = 'en';
  const langMapper = new Map()
    .set('zh', 'zh-CN')
    .set('zh-TW', 'zh-TW')
    .set('en', 'en')
    .set('tr', 'tr');
  store.state.settings.lang =
    langMapper.get(
      langMapper.has(navigator.language)
        ? navigator.language
        : navigator.language.slice(0, 2)
    ) || defaultLang;
  localStorage.setItem('settings', JSON.stringify(store.state.settings));
}

changeAppearance(store.state.settings.appearance);
changeThemeColor(store.state.settings.themeColor);

window
  .matchMedia('(prefers-color-scheme: dark)')
  .addEventListener('change', () => {
    if (store.state.settings.appearance === 'auto') {
      changeAppearance(store.state.settings.appearance);
      changeThemeColor(store.state.settings.themeColor);
    }
  });

let player = new Player();
// 落盘/IPC 拖尾合并（setter 先行生效，声音仍实时跟手）：旧实现音量
// 滑动的每次 mousemove 都 stringify 整个 player + 同步写盘 + 数条 IPC
let _playerSyncTimer = null;
const flushPlayerSync = target => {
  if (_playerSyncTimer === null) return;
  _playerSyncTimer = null;
  target.saveSelfToLocalStorage();
  target.sendSelfToIpcMain();
};
player = new Proxy(player, {
  set(target, prop, val) {
    target[prop] = val;
    if (prop === '_howler') return true;
    clearTimeout(_playerSyncTimer);
    _playerSyncTimer = setTimeout(() => flushPlayerSync(target), 300);
    return true;
  },
});
// 关窗前落盘最后一次变更
window.addEventListener('pagehide', () => {
  clearTimeout(_playerSyncTimer);
  flushPlayerSync(player);
});
store.state.player = player;

export default store;
