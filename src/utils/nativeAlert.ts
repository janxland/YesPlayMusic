import { isDesktop } from '@/platform/env';
import { ipcBridge } from '@/platform/bridge';

// Windows 上原生 alert 关闭后 <input> 无法再聚焦（electron#19977），
// 桌面端改走主进程同步弹窗，Web 端仍用内置 alert
const nativeAlert = (message: string) => {
  if (isDesktop()) {
    ipcBridge.showMessageBoxSync(message);
    return;
  }
  alert(message);
};

export default nativeAlert;
