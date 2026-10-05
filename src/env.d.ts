/// <reference types="vite/client" />

declare module '*.vue' {
  import type { DefineComponent } from 'vue';
  const component: DefineComponent<
    Record<string, unknown>,
    Record<string, unknown>,
    unknown
  >;
  export default component;
}

interface Window {
  resetApp: () => string;
  yesplaymusic: Record<string, any>;
  /** 仅 platform/bridge.ts 在桌面端使用（nodeIntegration 渲染进程） */
  require?: NodeRequire;
  /**
   * contextBridge 注入的 IPC 桥（src/preload.ts 暴露，platform/bridge.ts 独家消费）。
   * 形状对齐旧的 require('electron') 用法：ipcRenderer 五件套 + 同步弹窗应答。
   */
  electronBridge?: {
    ipcRenderer: {
      send(channel: string, ...args: any[]): void;
      invoke(channel: string, ...args: any[]): Promise<any>;
      on(channel: string, listener: (...args: any[]) => void): void;
      removeListener(channel: string, listener: (...args: any[]) => void): void;
      removeAllListeners(channel: string): void;
      sendSync(channel: string, payload?: any): any;
    };
  };
  /** Document Picture-in-Picture（桌面歌词 Canvas 降级之外的正路） */
  documentPictureInPicture?: {
    requestWindow(options: {
      width?: number;
      height?: number;
    }): Promise<Window>;
  };
  /** 封面 404 兜底 data-URL（utils/imageFallback 注入，LazyImage 消费） */
  __YPM_COVER_FALLBACK__?: string;
  /** 音频可视化总开关（主窗口与可视化面板共享） */
  __YPM_AV_ENABLED__?: boolean;
}

declare namespace NodeJS {
  interface ProcessEnv {
    /** Web 构建由 vite.config define 恒置 false；桌面端为 true */
    IS_ELECTRON?: boolean;
  }
}
