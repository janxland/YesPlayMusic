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
