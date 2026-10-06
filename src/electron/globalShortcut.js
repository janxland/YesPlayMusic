import defaultShortcuts from '@/utils/shortcuts';
const { globalShortcut } = require('electron');

const clc = require('cli-color');
const log = text => {
  console.log(`${clc.blueBright('[globalShortcut.js]')} ${text}`);
};

export function registerGlobalShortcut(win, store) {
  log('registerGlobalShortcut');
  let shortcuts = store.get('settings.shortcuts');
  if (shortcuts === undefined) {
    shortcuts = defaultShortcuts;
  }

  const handlers = {
    play: () => win.webContents.send('play'),
    next: () => win.webContents.send('next'),
    previous: () => win.webContents.send('previous'),
    increaseVolume: () => win.webContents.send('increaseVolume'),
    decreaseVolume: () => win.webContents.send('decreaseVolume'),
    like: () => win.webContents.send('like'),
    minimize: () => {
      win.isVisible() ? win.hide() : win.show();
    },
  };

  for (const [id, run] of Object.entries(handlers)) {
    // 渲染层 localStorage 的快捷键表可能落后于当前版本（缺条目），
    // find 失败必须跳过，否则 TypeError 会中断 app.ready 的后续初始化
    const entry = shortcuts.find(s => s.id === id);
    if (!entry || !entry.globalShortcut) continue;
    globalShortcut.register(entry.globalShortcut, run);
  }
}
