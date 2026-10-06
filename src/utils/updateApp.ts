import initLocalStorage from '@/stores/initLocalStorage';
import { readLocalStorageJSON } from '@/utils/storage';
import pkg from '../../package.json';

const updateSetting = () => {
  const parsedSettings = readLocalStorageJSON('settings', null);
  const settings = {
    ...initLocalStorage.settings,
    ...parsedSettings,
  };

  if (
    settings.shortcuts.length !== initLocalStorage.settings.shortcuts.length
  ) {
    // 当新增 shortcuts 时：补进默认列表里有而用户设置里没有的项。
    // （旧实现 filter 后把「对象」当 id 再去 find，恒 undefined、push(null)，
    // 属上游遗留 bug；这里按真实意图直接追加新项。）
    const oldShortcutsId = settings.shortcuts.map(s => s.id);
    const newShortcuts = initLocalStorage.settings.shortcuts.filter(
      s => oldShortcutsId.includes(s.id) === false
    );
    newShortcuts.forEach(s => settings.shortcuts.push(s));
  }

  if (localStorage.getItem('appVersion') === '"0.3.9"') {
    settings.lyricsBackground = true;
  }

  localStorage.setItem('settings', JSON.stringify(settings));
};

const updateData = () => {
  const parsedData = readLocalStorageJSON('data', null);
  const data = {
    ...parsedData,
  };
  localStorage.setItem('data', JSON.stringify(data));
};

const updatePlayer = () => {
  let parsedData = readLocalStorageJSON('player', null);
  let appVersion = localStorage.getItem('appVersion');
  if (appVersion === `"0.2.5"`) parsedData = {}; // 0.2.6版本重构了player
  const data = {
    ...parsedData,
  };
  localStorage.setItem('player', JSON.stringify(data));
};

const removeOldStuff = () => {
  // remove old indexedDB databases created by localforage
  indexedDB.deleteDatabase('tracks');
};

export default function () {
  updateSetting();
  updateData();
  updatePlayer();
  removeOldStuff();
  localStorage.setItem('appVersion', JSON.stringify(pkg.version));
}
