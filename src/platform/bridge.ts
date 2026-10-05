// IPC 桥：全仓唯一允许触碰 window.require('electron') 的地方，11 个调用点收敛于此。
// Web 构建下所有方法都是安全空操作；将来换 preload/contextBridge 只需改本文件。
import { isDesktop } from './env';

// isDesktop() 在 Web 构建为 false，短路后不会去读浏览器里不存在的 window.require
const ipcRenderer = isDesktop() ? window.require('electron').ipcRenderer : null;

/** 当前是否真的持有 IPC 通道（桌面端主窗口/歌词窗口才为 true）。 */
export const hasIpc = () => ipcRenderer !== null;

export const ipcBridge = {
  send(channel, ...args) {
    if (!ipcRenderer) return;
    ipcRenderer.send(channel, ...args);
  },

  /**
   * 注册监听并返回取消函数。直接挂原 listener 不包一层：
   * 调用点有按身份 removeListener 的，包一层会静默失配导致泄漏。
   */
  on(channel, listener) {
    if (!ipcRenderer) return () => {};
    ipcRenderer.on(channel, listener);
    return () => ipcRenderer.removeListener(channel, listener);
  },

  removeListener(channel, listener) {
    if (!ipcRenderer) return;
    ipcRenderer.removeListener(channel, listener);
  },

  removeAllListeners(channel) {
    if (!ipcRenderer) return;
    ipcRenderer.removeAllListeners(channel);
  },

  /** Web 下 resolve(null)，调用点的 `if (value)` 分支自然退化。 */
  invoke(channel, ...args) {
    if (!ipcRenderer) return Promise.resolve(null);
    return ipcRenderer.invoke(channel, ...args);
  },

  /**
   * 主进程同步弹窗（utils/nativeAlert 桌面端分支）。
   * dialog 只在主进程存在，故同样收口在本文件触碰 window.require。
   */
  showMessageBoxSync(message: string) {
    if (!ipcRenderer) return;
    window
      .require('electron')
      .dialog.showMessageBoxSync(null, { type: 'warning', message });
  },
};
