// 桌面歌词窗口（Electron 主进程）：
// 透明、无边框、置顶的小窗口渲染 /#/desktop-lyrics 路由，
// 主窗口的播放状态经 IPC 转发过来（渲染进程 desktopLyrics.js 负责发送）。
import { BrowserWindow, ipcMain, screen } from 'electron';
import path from 'path';

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
// 渲染进程上报工具栏热区（窗口相对坐标），主进程每 80ms 判断光标是否命中。
// 注意：不能依赖渲染层的 DOM mouseenter/mouseleave——解锁态整窗是
// -webkit-app-region: drag 拖拽区，Electron 会吞掉拖拽区上的全部 DOM 鼠标事件
//（工具栏"永远不显示"的根因），所以窗口悬停与否也在这里轮询后推送给渲染层。
let hitArea = null; // { x, y, w, h } 相对歌词窗口左上角（DIP）
let hoverHot = false; // 锁定态：光标在解锁按钮热区内
let insideWindow = false; // 光标是否在窗口内（解锁态工具栏显隐用）
let lockedState = false;
let pollTimer = null;

// ---- 手动窗口拖动 ----
// 渲染层判定"按住且位移超阈值"后才发 dragStart（单击不算拖拽，在渲染层
// pointermove 里过滤）。主进程 16ms 轮询系统光标跟随移动，dragEnd 停止落盘
let dragTimer = null;
let dragOffset = null; // 非空 = 拖拽进行中（applyMousePolicy 依赖此状态）
let dragStartedAt = 0;

const stopWindowDrag = save => {
  if (dragTimer) {
    clearInterval(dragTimer);
    dragTimer = null;
  }
  dragOffset = null;
  if (save) debounceSaveBounds();
};

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

function isCursorInsideWindow(win) {
  const pt = screen.getCursorScreenPoint();
  const [x, y] = win.getPosition();
  const [w, h] = win.getContentSize();
  return pt.x >= x && pt.x <= x + w && pt.y >= y && pt.y <= y + h;
}

function pushHoverState(win) {
  win.webContents.send('desktopLyrics:hover', {
    inside: insideWindow,
    hot: hoverHot,
    // 显隐与可点击解耦：鼠标在窗口矩形内就显示工具栏（含锁定态的解锁按钮，
    // 与窗口焦点无关）；可点击仍由 applyMousePolicy 单独裁决——锁定态只有
    // 光标压到工具栏热区上才恢复鼠标事件，按钮必然点得到，其余区域继续穿透
    visible: insideWindow,
  });
}

function applyMousePolicy(win) {
  // 拖拽跟随期间绝不回收鼠标事件：一旦被设回穿透，渲染层立刻收不到
  // pointerup，dragEnd 永远不来，窗口会"粘"在光标上（上一轮拖动卡死根因）
  if (dragOffset) return;
  // 锁定态：只有工具条区域可交互（hot），歌词其余部分永远穿透——
  // 否则透明窗会挡住底下窗口（含主窗右上角）的点击；
  // 解锁态：整窗可交互（拖拽/按钮都需要）
  const interactive = lockedState ? hoverHot : insideWindow;
  win.setIgnoreMouseEvents(!interactive);
}

function startHoverPoll() {
  if (pollTimer) return;
  pollTimer = setInterval(() => {
    const win = lyricWindow;
    if (!win || win.isDestroyed()) {
      stopHoverPoll();
      return;
    }
    const inside = isCursorInsideWindow(win);
    const hot = isCursorInHitArea(win);
    if (inside !== insideWindow || hot !== hoverHot) {
      insideWindow = inside;
      hoverHot = hot;
      applyMousePolicy(win);
      pushHoverState(win);
    }
    // 30ms：锁定态下这是"光标进热区 → 恢复鼠标事件"的切换延迟，
    // 间隔越大，用户快速划入立刻点击的首击越容易穿到窗口底下
  }, 30);
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
  const base = process.env.VITE_DEV_SERVER_URL
    ? process.env.VITE_DEV_SERVER_URL
    : 'http://localhost:27232';
  return `${base}/#/desktop-lyrics`;
}

function createLyricsWindow() {
  const bounds = store.get('desktopLyricsWindow') || {};
  // 离屏自愈：上次退出时存的坐标可能落在已拔掉的外接屏/改过分辨率后
  // 的不可见区域，直接恢复会得到一个"永远找不到"的歌词窗。
  // bounds.x/y 缺省时 NaN 参与比较恒 false，自然走系统默认居中
  const onScreen = screen
    .getAllDisplays()
    .some(
      d =>
        bounds.x + 60 > d.bounds.x &&
        bounds.x + 60 < d.bounds.x + d.bounds.width &&
        bounds.y + 30 > d.bounds.y &&
        bounds.y + 30 < d.bounds.y + d.bounds.height
    );
  const win = new BrowserWindow({
    width: bounds.width || 960,
    height: bounds.height || 160,
    x: onScreen ? bounds.x : undefined,
    y: onScreen ? bounds.y : undefined,
    minWidth: 320,
    minHeight: 80,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    hasShadow: false,
    resizable: false, // 歌词窗不允许拉伸变形（用户要求），只支持位置拖动
    skipTaskbar: true,
    show: false,
    title: 'YesPlayMusic 桌面歌词',
    webPreferences: {
      webSecurity: false,
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  lyricWindow = win;

  // 置顶层级尽量高，模仿 QQ 音乐桌面歌词
  win.setAlwaysOnTop(true, 'screen-saver');
  win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });

  // express(27232) 未就绪/已挂时 loadURL 会 reject，不接住即主进程 unhandled rejection
  win.loadURL(getLyricsUrl()).catch(err => {
    log(`load lyrics page failed: ${err.message}`);
  });
  win.once('ready-to-show', () => {
    // showInactive 而非 show：歌词窗绝不抢焦点——macOS 上抢焦点会把用户
    // 从当前 Space（尤其全屏主窗）切走，表现为"开歌词后主窗口消失"
    if (!win.isDestroyed()) win.showInactive();
  });

  win.on('moved', debounceSaveBounds);
  win.on('resized', debounceSaveBounds);
  // 'closed' 是异步派发的：只允许"当前记录的就是本窗口"时清空引用，
  // 否则迟到的 closed 回调会把刚创建的新窗口抹成孤儿（叠加窗口的根因）
  win.on('closed', () => {
    log('desktop lyrics window closed');
    stopHoverPoll();
    stopWindowDrag(false);
    hitArea = null;
    hoverHot = false;
    insideWindow = false;
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

  // 锁定态切换（见文件头注释）——只接受歌词窗口自己的指令。
  // 轮询两种状态都要跑：解锁态的"悬停显示工具栏"同样依赖主进程光标轮询
  //（拖拽区吞 DOM 鼠标事件，渲染层自己测不到 mouseenter）
  ipcMain.on('desktopLyrics:setLock', (event, locked) => {
    if (!lyricWindow || lyricWindow.isDestroyed()) return;
    if (event.sender !== lyricWindow.webContents) return;
    log(`setLock: ${!!locked} (was ${lockedState})`);
    lockedState = !!locked;
    stopWindowDrag(false); // 拖拽中锁定 → 立即结束跟随
    // 按光标真实位置重算，而不是无脑清 false：解锁通常发生在光标压着
    // 工具栏的时候，若此时把 insideWindow 清 false，锁定策略会让窗口
    // 立刻恢复穿透（setIgnoreMouseEvents(true)），用户紧接着的点击全部
    // 掉到窗口底下——"解锁后右上角点不了"的根因
    insideWindow = isCursorInsideWindow(lyricWindow);
    hoverHot = lockedState && isCursorInHitArea(lyricWindow);
    startHoverPoll();
    applyMousePolicy(lyricWindow);
    pushHoverState(lyricWindow);
  });
  ipcMain.on('desktopLyrics:hitArea', (event, area) => {
    if (!lyricWindow || lyricWindow.isDestroyed()) return;
    if (event.sender !== lyricWindow.webContents) return;
    hitArea = area && area.w > 0 && area.h > 0 ? area : null;
  });

  // ---- 手动窗口拖动（渲染层已做"单击 vs 按住拖拽"判定）----
  ipcMain.on('desktopLyrics:dragStart', event => {
    if (!lyricWindow || lyricWindow.isDestroyed()) return;
    if (event.sender !== lyricWindow.webContents) return;
    if (lockedState) return; // 锁定态不允许拖动
    const pt = screen.getCursorScreenPoint();
    const [x, y] = lyricWindow.getPosition();
    dragOffset = { dx: pt.x - x, dy: pt.y - y };
    dragStartedAt = Date.now();
    log('drag start');
    dragTimer = setInterval(() => {
      // 保险丝：渲染层 pointerup 丢失（崩溃/遮挡）时 60s 后自动停
      if (!dragOffset || Date.now() - dragStartedAt > 60000) {
        log('drag fuse/stop');
        stopWindowDrag(true);
        return;
      }
      if (!lyricWindow || lyricWindow.isDestroyed()) {
        stopWindowDrag(false);
        return;
      }
      const cur = screen.getCursorScreenPoint();
      lyricWindow.setPosition(cur.x - dragOffset.dx, cur.y - dragOffset.dy);
    }, 16);
  });
  ipcMain.on('desktopLyrics:dragEnd', event => {
    if (
      lyricWindow &&
      !lyricWindow.isDestroyed() &&
      event.sender !== lyricWindow.webContents
    ) {
      return;
    }
    log('drag end');
    stopWindowDrag(true);
  });

  // 歌词窗工具栏播控指令 → 主窗口执行（歌词窗没有音频实例，必须回主窗操作）。
  // 双通道并存：新渲染层走 invoke（带 ack，可在歌词窗侧看到送达结果），
  // 旧渲染层走 send（兼容未重构建的歌词窗产物）。两条路互不触发，不会重复投递。
  // 每个守卫都留痕：指令蒸发时终端日志直接指出断在哪一跳
  const forwardControl = (event, cmd, via) => {
    if (!mainWin || mainWin.isDestroyed()) {
      log(`control:${cmd}(${via}) dropped: mainWin unavailable`);
      return false;
    }
    if (!lyricWindow || lyricWindow.isDestroyed()) {
      log(`control:${cmd}(${via}) dropped: lyricWindow unavailable`);
      return false;
    }
    if (event.sender !== lyricWindow.webContents) {
      log(`control:${cmd}(${via}) dropped: sender is not lyric window`);
      return false;
    }
    mainWin.webContents.send('desktopLyrics:control', cmd);
    log(`control:${cmd}(${via}) -> main window`);
    return true;
  };
  ipcMain.on('desktopLyrics:control', (event, cmd) => {
    forwardControl(event, cmd, 'send');
  });
  ipcMain.handle('desktopLyrics:control', (event, cmd) => {
    return forwardControl(event, cmd, 'invoke');
  });
}
