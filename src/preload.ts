// Electron preload：contextIsolation 下唯一的前后端通道。
// 暴露 window.electronBridge，src/platform/bridge.ts 是它在渲染层的唯一消费者。
// 通道白名单不设限（与旧 nodeIntegration 时代等宽），安全性由「只暴露 ipcRenderer
// 的这几个方法、不暴露 node」保证；具体 channel 校验在 ipcMain 侧按需做。
import { contextBridge, ipcRenderer } from 'electron';

// contextBridge 会给主世界传入的函数各包一层代理，同一函数多次传入不保证同一包装——
// removeListener 按身份匹配会静默失配。这里用 WeakMap 固定「主世界 listener → 包装」映射。
const wrappedListeners = new WeakMap();

function wrapListener(listener) {
  let fn = wrappedListeners.get(listener);
  if (!fn) {
    // 保留 (event, ...args) 的旧契约：占位 event 对象占住首位，调用点全部按位取参
    fn = (_event, ...args) => listener({}, ...args);
    wrappedListeners.set(listener, fn);
  }
  return fn;
}

const ipc = {
  send: (channel, ...args) => ipcRenderer.send(channel, ...args),
  invoke: (channel, ...args) => ipcRenderer.invoke(channel, ...args),
  on: (channel, listener) => ipcRenderer.on(channel, wrapListener(listener)),
  removeListener: (channel, listener) => {
    const fn = wrappedListeners.get(listener);
    if (fn) ipcRenderer.removeListener(channel, fn);
  },
  removeAllListeners: channel => ipcRenderer.removeAllListeners(channel),
  // 主进程同步弹窗（utils/nativeAlert 桌面端分支）；对话框本体在 ipcMain 侧
  sendSync: (channel, payload) => ipcRenderer.sendSync(channel, payload),
};

contextBridge.exposeInMainWorld('electronBridge', { ipcRenderer: ipc });
