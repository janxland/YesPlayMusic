/**
 * 桌面端 IPC 接线：只负责「主进程发了哪个通道」→「调用方想做什么」，
 * 不认识 store、不认识 Vue 实例、不认识 router（依赖方向铁律，拆 R14）。
 * 具体动作全部由 App.vue 以回调注入；本文件对状态层零 import。
 */
import { ipcBridge } from '@/platform/bridge';
import { osName } from '@/platform/env';

// 菜单 accelerator 在主进程层先于页面拦截按键，输入框里的
// 「跳行首/行尾」会变成切歌，故播放控制通道在编辑文本时让位。
const isEditingText = () => {
  const el = document.activeElement;
  return (
    el.tagName === 'INPUT' ||
    el.tagName === 'TEXTAREA' ||
    el.isContentEditable === true
  );
};

export function wireDesktopIpc(handlers) {
  const {
    onRouteChange,
    onFocusSearch,
    onPlayPause,
    onNext,
    onPrev,
    onVolumeDelta,
    onLike,
    onRepeat,
    onShuffle,
    onNavbarGo,
    onNextUp,
    onCloseAppOption,
    onSeekTo,
  } = handlers;

  // 添加专有的类名
  document.body.setAttribute('data-electron', 'yes');
  document.body.setAttribute('data-electron-os', osName());

  // listens to the main process 'changeRouteTo' event and changes the route from
  // inside this Vue instance, according to what path the main process requires.
  // responds to Menu click() events at the main process and changes the route accordingly.
  ipcBridge.on('changeRouteTo', (event, path) => onRouteChange(path));

  ipcBridge.on('search', () => onFocusSearch());

  // 失焦时 activeElement 会停留在上次聚焦的输入框，仅限本窗口持有焦点
  // 才让位，否则误伤共用这批通道的托盘/媒体键/Mpris。
  const onMedia = (channel, fn) =>
    ipcBridge.on(channel, () => {
      if (!(document.hasFocus() && isEditingText())) fn();
    });

  onMedia('play', onPlayPause);
  onMedia('next', onNext);
  onMedia('previous', onPrev);
  onMedia('increaseVolume', () => onVolumeDelta(0.1));
  onMedia('decreaseVolume', () => onVolumeDelta(-0.1));
  onMedia('like', onLike);

  // 这两个通道原实现就不做编辑态让位（不影响输入），语义保持
  ipcBridge.on('repeat', () => onRepeat());
  ipcBridge.on('shuffle', () => onShuffle());

  ipcBridge.on('routerGo', (event, where) => onNavbarGo(where));

  ipcBridge.on('nextUp', () => onNextUp());

  ipcBridge.on('rememberCloseAppOption', (event, value) =>
    onCloseAppOption(value)
  );

  ipcBridge.on('setPosition', (event, position) => onSeekTo(position));
}
