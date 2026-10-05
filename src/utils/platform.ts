// 操作系统/构建期布尔常量，Electron 主进程与渲染进程共用（不得触碰 window）；
// IPC 通道请从 @/platform/bridge 取 ipcBridge，不要往这里加。
import { isDev, osName } from '@/platform/env';

export const isWindows = osName() === 'win32';
export const isMac = osName() === 'darwin';
export const isLinux = osName() === 'linux';
export const isDevelopment = isDev();

export const isCreateTray = isWindows || isLinux || isDevelopment;
export const isCreateMpris = isLinux;
