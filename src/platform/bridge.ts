// IPC 桥：全仓唯一允许触碰 window.electronBridge（src/preload.ts 经 contextBridge 注入）的
// 地方，11 个调用点收敛于此。Web 构建下 electronBridge 不存在，所有方法都是安全空操作。
import { isDesktop } from './env';

// isDesktop() 在 Web 构建为 false，短路后不会去读浏览器里不存在的 electronBridge
const bridge = isDesktop() ? window.electronBridge : null;
const ipcRenderer = bridge ? bridge.ipcRenderer : null;

/** 当前是否真的持有 IPC 通道（桌面端主窗口/歌词窗口才为 true）。 */
export const hasIpc = () => ipcRenderer !== null;

export const ipcBridge = {
  send(channel, ...args) {
    if (!ipcRenderer) return;
    ipcRenderer.send(channel, ...args);
  },

  /**
   * 注册监听并返回取消函数。preload 侧用 WeakMap 固定了「主世界 listener → 包装」
   * 映射，这里的按身份 removeListener 能正确命中。
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
   * contextIsolation 下渲染层拿不到 dialog，改走 ipcMain 的同步应答通道。
   */
  showMessageBoxSync(message: string) {
    if (!ipcRenderer) return;
    ipcRenderer.sendSync('show-message-box-sync', {
      type: 'warning',
      message,
    });
  },
};
