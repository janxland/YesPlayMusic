// 桌面歌词窗口（Electron 主进程）：
// 透明、无边框、置顶的小窗口渲染 /#/desktop-lyrics 路由，
// 主窗口的播放状态经 IPC 转发过来（渲染进程 desktopLyrics.js 负责发送）。
import { BrowserWindow, ipcMain, screen } from 'electron';

const clc = require('cli-color');
const log = text => {
  console.log(`${clc.blueBright('[desktopLyricsWindow.js]')} ${text}`);
};

let lyricWindow = null;
let mainWin = null;
let store = null;
let saveBoundsTimer = null;

// ---- 锁定穿透的热区检测 ----
// macOS 的 setIgnoreMouseEvents(forward:true) 在真实鼠标下不可靠（转发 mousemove
// 会丢事件），锁定后用户可能永远碰不到解锁按钮。改为主进程轮询系统光标坐标：
// 渲染进程上报工具栏热区（窗口相对坐标），主进程每 80ms 判断光标是否命中，
// 命中→关穿透并通知渲染显示工具栏，移出→恢复穿透。
let hitArea = null; // { x, y, w, h } 相对歌词窗口左上角（DIP）
let hoverHot = false;
let pollTimer = null;

function stopHoverPoll() {
  if (pollTimer) {
    clearInterval(pollTimer);
    pollTimer = null;
  }
}

function isCursorInHitArea(win) {
  if (!hitArea) return false;
  const pt = screen.getCursorScreenPoint();
  const pos = win.getPosition();
  return (
    pt.x >= pos[0] + hitArea.x &&
    pt.x <= pos[0] + hitArea.x + hitArea.w &&
    pt.y >= pos[1] + hitArea.y &&
    pt.y <= pos[1] + hitArea.y + hitArea.h
  );
}

function startHoverPoll(win) {
  stopHoverPoll();
  pollTimer = setInterval(() => {
    if (!win || win.isDestroyed()) {
      stopHoverPoll();
      return;
    }
    const inside = isCursorInHitArea(win);
    if (inside === hoverHot) return;
    hoverHot = inside;
    win.setIgnoreMouseEvents(!inside);
    win.webContents.send('desktopLyrics:hover', inside);
  }, 80);
}

function notifyMainWindow() {
  // 主进程走 webpack4 打包，不支持可选链语法，用显式判空
  if (mainWin && !mainWin.isDestroyed()) {
    mainWin.webContents.send('desktopLyrics:status', !!lyricWindow);
  }
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
  const win = new BrowserWindow({
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

  lyricWindow = win;

  // 置顶层级尽量高，模仿 QQ 音乐桌面歌词
  win.setAlwaysOnTop(true, 'screen-saver');
  win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });

  win.loadURL(getLyricsUrl());
  win.once('ready-to-show', () => {
    if (!win.isDestroyed()) win.show();
  });

  win.on('moved', debounceSaveBounds);
  win.on('resized', debounceSaveBounds);
  // 'closed' 是异步派发的：只允许"当前记录的就是本窗口"时清空引用，
  // 否则迟到的 closed 回调会把刚创建的新窗口抹成孤儿（叠加窗口的根因）
  win.on('closed', () => {
    log('desktop lyrics window closed');
    stopHoverPoll();
    hitArea = null;
    hoverHot = false;
    if (lyricWindow === win) {
      lyricWindow = null;
      notifyMainWindow();
    }
  });
}

export function ensureLyricsWindow() {
  if (!store) return false; // initDesktopLyrics 尚未执行
  if (!lyricWindow || lyricWindow.isDestroyed()) {
    createLyricsWindow();
    notifyMainWindow();
  }
  return !!lyricWindow;
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

  // 主窗口播放状态 → 歌词窗口。
  // 只信任主窗口的发送者：歌词窗口等其它 webContents 转发的同步一律丢弃，
  // 否则多发送者会让歌词窗口的 trackId 交替振荡（"正在获取歌词"闪烁的根因）
  ipcMain.on('desktopLyrics:sync', (event, payload) => {
    if (!mainWin || mainWin.isDestroyed()) return;
    if (event.sender !== mainWin.webContents) return;
    if (lyricWindow && !lyricWindow.isDestroyed()) {
      lyricWindow.webContents.send('desktopLyrics:state', payload);
    }
  });

  // 锁定穿透：主进程轮询光标热区（见文件头注释）——只接受歌词窗口自己的指令
  ipcMain.on('desktopLyrics:setLock', (event, locked) => {
    if (!lyricWindow || lyricWindow.isDestroyed()) return;
    if (event.sender !== lyricWindow.webContents) return;
    if (locked) {
      hoverHot = false;
      lyricWindow.setIgnoreMouseEvents(true);
      startHoverPoll(lyricWindow);
    } else {
      stopHoverPoll();
      hoverHot = false;
      lyricWindow.setIgnoreMouseEvents(false);
      lyricWindow.webContents.send('desktopLyrics:hover', false);
    }
  });
  ipcMain.on('desktopLyrics:hitArea', (event, area) => {
    if (!lyricWindow || lyricWindow.isDestroyed()) return;
    if (event.sender !== lyricWindow.webContents) return;
    hitArea = area && area.w > 0 && area.h > 0 ? area : null;
  });

  // 歌词窗工具栏播控指令 → 主窗口执行（歌词窗没有音频实例，必须回主窗操作）
  ipcMain.on('desktopLyrics:control', (event, cmd) => {
    if (!mainWin || mainWin.isDestroyed()) return;
    if (!lyricWindow || lyricWindow.isDestroyed()) return;
    if (event.sender !== lyricWindow.webContents) return;
    mainWin.webContents.send('desktopLyrics:control', cmd);
  });
}
