// 桌面歌词：像 QQ 音乐一样把歌词置顶悬浮在屏幕上。
// - Web 端：优先使用 Document Picture-in-Picture（Chrome/Edge 116+），
//   不支持时降级为 Canvas → captureStream → 视频 PiP。
// - Electron 端：由主进程创建透明置顶窗口（见 electron/desktopLyricsWindow.js），
//   渲染进程通过 IPC 同步播放状态。
import store from '@/store';
import { getLyric } from '@/api/track';
import { lyricParser } from '@/utils/lyrics';

const isElectron = process.env.IS_ELECTRON === true;

// ---- 通用状态 ----
let open = false;
const stateListeners = [];

function setOpen(value) {
  if (open === value) return;
  open = value;
  stateListeners.forEach(cb => cb(value));
}

export function isDesktopLyricsSupported() {
  if (isElectron) return true;
  return (
    'documentPictureInPicture' in window ||
    ('pictureInPictureEnabled' in document && document.pictureInPictureEnabled)
  );
}

export function isDesktopLyricsOpen() {
  return open;
}

export function onDesktopLyricsStateChange(cb) {
  stateListeners.push(cb);
  return () => {
    const idx = stateListeners.indexOf(cb);
    if (idx !== -1) stateListeners.splice(idx, 1);
  };
}

export async function toggleDesktopLyrics() {
  if (isElectron) {
    const { ipcRenderer } = window.require('electron');
    const isOpen = await ipcRenderer.invoke('desktopLyrics:toggle');
    setOpen(isOpen);
    return isOpen;
  }
  if (open) {
    closeWebLyrics();
  } else {
    await openWebLyrics();
  }
  return open;
}

// ---- Electron：主窗口播放状态 → 主进程 → 歌词窗口 ----
let electronSyncTimer = null;
let electronInited = false;

export function initDesktopLyricsSync() {
  if (!isElectron || electronInited) return;
  electronInited = true;
  const { ipcRenderer } = window.require('electron');

  const sendState = () => {
    const player = store.state.player;
    const track = player.currentTrack || {};
    ipcRenderer.send('desktopLyrics:sync', {
      trackId: player.currentTrackID,
      trackName: track.name,
      artistName: (track.ar || []).map(ar => ar.name).join('/'),
      progress: player.seek(null, false) ?? 0,
      playing: player.playing,
    });
  };
  const start = () => {
    if (electronSyncTimer) return;
    sendState();
    electronSyncTimer = setInterval(sendState, 500);
  };
  const stop = () => {
    clearInterval(electronSyncTimer);
    electronSyncTimer = null;
  };

  ipcRenderer.on('desktopLyrics:status', (_, isOpen) => {
    setOpen(isOpen);
    isOpen ? start() : stop();
  });
  ipcRenderer
    .invoke('desktopLyrics:isOpen')
    .then(isOpen => {
      setOpen(isOpen);
      if (isOpen) start();
    })
    .catch(() => {});
}

// ---- Web：歌词数据 ----
let lyricLines = [];
let lyricTrackId = 0;

// 并发/过期请求靠 resolve 时的 trackId 校验丢弃，
// 不用 fetching 锁，避免快速切歌时新歌词永远加载不上
function fetchLyrics(trackId) {
  if (!trackId) return;
  getLyric(trackId)
    .then(data => {
      if (lyricTrackId !== trackId) return; // 已切歌，丢弃过期结果
      const { lyric } = lyricParser(data || {});
      lyricLines = lyric.filter(l => l.content && l.content.trim());
    })
    .catch(() => {
      if (lyricTrackId === trackId) lyricLines = [];
    });
}

function getHighlightIndex(progress) {
  return lyricLines.findIndex((l, index) => {
    const next = lyricLines[index + 1];
    return progress >= l.time && (next ? progress < next.time : true);
  });
}

// ---- Web：Document Picture-in-Picture ----
let pipWindow = null;
let ui = null; // { current, next, meta }
let timer = null;
let lastHighlightIndex = -2;

function buildDom(doc) {
  const stage = doc.createElement('div');
  stage.className = 'ypm-stage';
  const meta = doc.createElement('div');
  meta.className = 'ypm-meta';
  const current = doc.createElement('div');
  current.className = 'ypm-current';
  const next = doc.createElement('div');
  next.className = 'ypm-next';
  stage.appendChild(current);
  stage.appendChild(next);
  doc.body.appendChild(meta);
  doc.body.appendChild(stage);
  return { meta, current, next };
}

function injectStyles(doc) {
  const style = doc.createElement('style');
  style.textContent = `
    html, body {
      margin: 0; padding: 0; height: 100%;
      background: #121216; color: #fff;
      font-family: system-ui, -apple-system, 'PingFang SC', 'Microsoft YaHei', sans-serif;
      overflow: hidden; user-select: none;
    }
    .ypm-meta {
      position: absolute; top: 8px; left: 12px; right: 12px;
      font-size: 12px; opacity: 0.45;
      white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
    }
    .ypm-stage {
      height: 100%; display: flex; flex-direction: column;
      justify-content: center; align-items: center; gap: 8px;
      padding: 20px 24px; box-sizing: border-box; text-align: center;
    }
    .ypm-current {
      font-size: 28px; font-weight: 700; line-height: 1.35;
      max-width: 100%;
      display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical;
      overflow: hidden;
    }
    .ypm-next {
      font-size: 17px; opacity: 0.45; line-height: 1.35;
      max-width: 100%;
      white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
    }
  `;
  doc.head.appendChild(style);
}

function webTick() {
  const player = store.state.player;
  const trackId = player.currentTrackID;
  const track = player.currentTrack || {};
  const progress = player.seek(null, false) ?? 0;

  if (trackId !== lyricTrackId) {
    lyricTrackId = trackId;
    lyricLines = [];
    lastHighlightIndex = -2;
    fetchLyrics(trackId);
  }
  if (!trackId) return;

  const metaText = track.name
    ? `${track.name} - ${(track.ar || []).map(ar => ar.name).join('/')}`
    : '';

  if (lyricLines.length === 0) {
    if (ui.meta.textContent !== metaText) ui.meta.textContent = metaText;
    const placeholder = track.name ? '正在获取歌词…' : '未在播放';
    if (ui.current.textContent !== placeholder) {
      ui.current.textContent = placeholder;
      ui.next.textContent = '';
    }
    return;
  }

  const index = getHighlightIndex(progress);
  if (index === lastHighlightIndex && ui.meta.textContent === metaText) {
    return;
  }
  lastHighlightIndex = index;
  ui.meta.textContent = metaText;
  ui.current.textContent = index >= 0 ? lyricLines[index].content : '♪ ♪ ♪';
  ui.next.textContent =
    index >= 0 && lyricLines[index + 1] ? lyricLines[index + 1].content : '';
}

function startTimer() {
  clearInterval(timer);
  timer = setInterval(webTick, 300);
  webTick();
}

function cleanupWebLyrics() {
  clearInterval(timer);
  timer = null;
  pipWindow = null;
  ui = null;
  lastHighlightIndex = -2;
  setOpen(false);
}

function closeWebLyrics() {
  if (pipWindow) {
    pipWindow.close();
    return;
  }
  // Canvas 降级模式的关闭
  if (document.pictureInPictureElement) {
    document.exitPictureInPicture().catch(() => {});
  }
}

async function openWebLyrics() {
  if ('documentPictureInPicture' in window) {
    const pipWin = await window.documentPictureInPicture.requestWindow({
      width: 760,
      height: 190,
    });
    pipWindow = pipWin;
    injectStyles(pipWin.document);
    ui = buildDom(pipWin.document);
    pipWin.addEventListener('pagehide', cleanupWebLyrics);
    setOpen(true);
    startTimer();
    return;
  }
  await openCanvasPip();
}

// ---- Web：Canvas → 视频 PiP 降级（不支持 Document PiP 的浏览器）----
let canvas = null;
let fallbackVideo = null;

function drawCanvas() {
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const w = canvas.width;
  const h = canvas.height;
  ctx.clearRect(0, 0, w, h);
  ctx.fillStyle = '#121216';
  ctx.fillRect(0, 0, w, h);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  const player = store.state.player;
  const track = player.currentTrack || {};
  let currentText = track.name ? '正在获取歌词…' : '未在播放';
  let nextText = '';
  if (lyricLines.length > 0) {
    const progress = player.seek(null, false) ?? 0;
    const index = getHighlightIndex(progress);
    if (index >= 0) {
      currentText = lyricLines[index].content;
      nextText = lyricLines[index + 1]?.content || '';
    } else {
      currentText = '♪ ♪ ♪';
    }
  }

  ctx.fillStyle = '#ffffff';
  ctx.font = '700 52px system-ui, PingFang SC, Microsoft YaHei, sans-serif';
  ctx.fillText(currentText, w / 2, h / 2 - 26, w - 80);
  ctx.fillStyle = 'rgba(255, 255, 255, 0.45)';
  ctx.font = '400 30px system-ui, PingFang SC, Microsoft YaHei, sans-serif';
  ctx.fillText(nextText, w / 2, h / 2 + 44, w - 80);
}

async function openCanvasPip() {
  canvas = document.createElement('canvas');
  canvas.width = 1280;
  canvas.height = 260;
  const stream = canvas.captureStream(10);
  fallbackVideo = document.createElement('video');
  fallbackVideo.muted = true;
  fallbackVideo.playsInline = true;
  fallbackVideo.srcObject = stream;
  await fallbackVideo.play();
  await fallbackVideo.requestPictureInPicture();
  fallbackVideo.addEventListener('leavepictureinpicture', () => {
    fallbackVideo = null;
    canvas = null;
    cleanupWebLyrics();
  });
  setOpen(true);
  clearInterval(timer);
  timer = setInterval(() => {
    // 保持歌词数据新鲜并绘制到画布
    const player = store.state.player;
    const trackId = player.currentTrackID;
    if (trackId !== lyricTrackId) {
      lyricTrackId = trackId;
      lyricLines = [];
      fetchLyrics(trackId);
    }
    drawCanvas();
  }, 300);
}
