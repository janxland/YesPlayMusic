import { ref, watch } from 'vue';
import { defineStore } from 'pinia';
import initLocalStorage from './initLocalStorage';
import { readLocalStorageJSON } from '@/utils/storage';
import { invalidateSettingsCache } from '@/utils/request';
import { ipcBridge } from '@/platform/bridge';
import { isDesktop } from '@/platform/env';
import { changeAppearance, changeThemeColor } from '@/utils/common';
import cloneDeep from 'lodash/cloneDeep';
import shortcuts from '@/utils/shortcuts';
import { applyFont } from '@/utils/fontLoader';

// 用户设置域（localStorage key: 'settings'，键与结构冻结不变）；
// 「设置变更即推送主进程」收敛在本 store 的 updateSettings 内。
export const useSettingsStore = defineStore('settings', () => {
  const settings = ref<Record<string, any>>(
    readLocalStorageJSON('settings', initLocalStorage.settings)
  );

  // 持久化：deep watch 写回（同时失效请求层的 settings 内存缓存）
  watch(
    settings,
    s => {
      localStorage.setItem('settings', JSON.stringify(s));
      invalidateSettingsCache();
    },
    {
      deep: true,
    }
  );

  // 首次运行默认语言
  if ([undefined, null].includes(settings.value.lang)) {
    const defaultLang = 'en';
    const langMapper = new Map()
      .set('zh', 'zh-CN')
      .set('zh-TW', 'zh-TW')
      .set('en', 'en')
      .set('tr', 'tr');
    settings.value.lang =
      langMapper.get(
        langMapper.has(navigator.language)
          ? navigator.language
          : navigator.language.slice(0, 2)
      ) || defaultLang;
    localStorage.setItem('settings', JSON.stringify(settings.value));
  }

  // 主题初始化与系统深色联动
  changeAppearance(settings.value.appearance);
  changeThemeColor(settings.value.themeColor, settings.value.appearance);
  window
    .matchMedia('(prefers-color-scheme: dark)')
    .addEventListener('change', () => {
      if (settings.value.appearance === 'auto') {
        changeAppearance(settings.value.appearance);
        changeThemeColor(settings.value.themeColor, settings.value.appearance);
      }
    });

  function updateSettings({ key, value }: { key: string; value: unknown }) {
    settings.value[key] = value;
    // 设置变更即推送主进程（桌面端）
    if (isDesktop()) ipcBridge.send('settings', settings.value);
  }
  function changeLang(lang: string) {
    settings.value.lang = lang;
  }
  function changefontFamilyName(value: string) {
    settings.value.fontFamilyName = value;
    applyFont(value);
  }
  function changeMusicQuality(value: number) {
    settings.value.musicQuality = value;
  }
  function changeLyricFontSize(value: number) {
    settings.value.lyricFontSize = value;
  }
  function changeOutputDevice(deviceId: string) {
    settings.value.outputDevice = deviceId;
  }
  function togglePlaylistCategory(name: string) {
    const categories = settings.value.enabledPlaylistCategories;
    const index = categories.findIndex((c: string) => c === name);
    if (index !== -1) {
      settings.value.enabledPlaylistCategories = categories.filter(
        (c: string) => c !== name
      );
    } else {
      categories.push(name);
    }
  }
  function updateShortcut({
    id,
    type,
    shortcut,
  }: {
    id: string;
    type: string;
    shortcut: string;
  }) {
    const target = settings.value.shortcuts.find(
      (s: { id: string }) => s.id === id
    );
    if (!target) return;
    // 就地改嵌套字段即可，deep watch 一次触发；先改再 map 重赋同一批引用会让持久化写两次
    target[type] = shortcut;
  }
  function restoreDefaultShortcuts() {
    settings.value.shortcuts = cloneDeep(shortcuts);
  }

  return {
    settings,
    updateSettings,
    changeLang,
    changefontFamilyName,
    changeMusicQuality,
    changeLyricFontSize,
    changeOutputDevice,
    togglePlaylistCategory,
    updateShortcut,
    restoreDefaultShortcuts,
  };
});
