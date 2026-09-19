export const isWindows = process.platform === 'win32';
export const isMac = process.platform === 'darwin';
export const isLinux = process.platform === 'linux';
export const isDevelopment = process.env.NODE_ENV === 'development';

export const isCreateTray = isWindows || isLinux || isDevelopment;
export const isCreateMpris = isLinux;

/**
 * Electron 桥接句柄。Web 构建下 IS_ELECTRON 恒为 false，短路后不会去读
 * 浏览器里不存在的 window.require。导出给 player/audioSource.js 复用。
 */
export const electron =
  process.env.IS_ELECTRON === true ? window.require('electron') : null;
export const ipcRenderer = electron ? electron.ipcRenderer : null;
