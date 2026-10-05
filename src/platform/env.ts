// 平台判定的唯一出处，本模块零依赖且同时被 Electron 主进程 import（禁止触碰 window）。

/** 运行在 Electron（桌面端）里。Web 构建下恒为 false。 */
export const isDesktop = () => process.env.IS_ELECTRON === true;

/** vue-cli / electron-builder 的开发态标记。 */
export const isDev = () => process.env.NODE_ENV === 'development';

// Electron 渲染进程下与 window.require('os').platform() 取值一致，且 Web/主进程可安全调用
export const osName = () => process.platform;

export const isWindows = () => osName() === 'win32';
export const isMac = () => osName() === 'darwin';
export const isLinux = () => osName() === 'linux';
