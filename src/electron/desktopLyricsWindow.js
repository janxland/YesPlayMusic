// 桌面歌词窗口（Electron 主进程）：
// 透明、无边框、置顶的小窗口渲染 /#/desktop-lyrics 路由，
// 主窗口的播放状态经 IPC 转发过来（渲染进程 desktopLyrics.js 负责发送）。
import { BrowserWindow, ipcMain } from 'electron';

const clc = require('cli-color');
const log = text => {
  console.log(`${clc.blueBright('[desktopLyricsWindow.js]')} ${text}`);
};

let lyricWindow = null;
let mainWin = null;
let store = null;
let saveBoundsTimer = null;

function notifyMainWindow() {
  mainWin?.webContents.send('desktopLyrics:status', !!lyricWindow);
}

function saveBounds() {
  if (!lyricWindow || lyricWindow.isDestroyed()) return;
  store.set('desktopLyricsWindow', lyricWindow.getBounds());
}

function debounceSaveBounds() {
  clearTimeout(saveBoundsTimer);
  saveBoundsTimer = setTimeout(saveBounds, 500);
}

function getLyricsUrl() {
  const base = process.env.WEBPACK_DEV_SERVER_URL
    ? process.env.WEBPACK_DEV_SERVER_URL
    : 'http://localhost:27232';
  return `${base}/#/desktop-lyrics`;
}

function createLyricsWindow() {
  const bounds = store.get('desktopLyricsWindow') || {};
  lyricWindow = new BrowserWindow({
    width: bounds.width || 960,
    height: bounds.height || 160,
    x: bounds.x,
    y: bounds.y,
    minWidth: 320,
    minHeight: 80,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    hasShadow: false,
    resizable: true,
    skipTaskbar: true,
    show: false,
    title: 'YesPlayMusic 桌面歌词',
    webPreferences: {
      webSecurity: false,
      nodeIntegration: true,
      enableRemoteModule: true,
      contextIsolation: false,
    },
  });

  // 置顶层级尽量高，模仿 QQ 音乐桌面歌词
  lyricWindow.setAlwaysOnTop(true, 'screen-saver');
  lyricWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });

  lyricWindow.loadURL(getLyricsUrl());
  lyricWindow.once('ready-to-show', () => lyricWindow.show());

  lyricWindow.on('moved', debounceSaveBounds);
  lyricWindow.on('resized', debounceSaveBounds);
  lyricWindow.on('closed', () => {
    log('desktop lyrics window closed');
    lyricWindow = null;
    notifyMainWindow();
  });
}

function toggleLyricsWindow() {
  if (lyricWindow && !lyricWindow.isDestroyed()) {
    saveBounds();
    lyricWindow.destroy();
    lyricWindow = null;
  } else {
    createLyricsWindow();
  }
  notifyMainWindow();
  return !!lyricWindow;
}

export function initDesktopLyrics(window, electronStore) {
  mainWin = window;
  store = electronStore;

  ipcMain.handle('desktopLyrics:toggle', () => toggleLyricsWindow());
  ipcMain.handle('desktopLyrics:isOpen', () => !!lyricWindow);

  // 主窗口播放状态 → 歌词窗口
  ipcMain.on('desktopLyrics:sync', (event, payload) => {
    if (lyricWindow && !lyricWindow.isDestroyed()) {
      lyricWindow.webContents.send('desktopLyrics:state', payload);
    }
  });

  // 鼠标穿透开关（锁定模式下歌词不挡鼠标）
  ipcMain.on('desktopLyrics:setIgnoreMouse', (event, ignore) => {
    if (lyricWindow && !lyricWindow.isDestroyed()) {
      lyricWindow.setIgnoreMouseEvents(ignore, { forward: true });
    }
  });
}
