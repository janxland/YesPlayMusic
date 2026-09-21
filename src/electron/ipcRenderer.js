import store from '@/store';

const player = store.state.player;

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

export function ipcRenderer(vueInstance) {
  const self = vueInstance;
  // 添加专有的类名
  document.body.setAttribute('data-electron', 'yes');
  document.body.setAttribute(
    'data-electron-os',
    window.require('os').platform()
  );
  // ipc message channel
  const electron = window.require('electron');
  const ipcRenderer = electron.ipcRenderer;

  // listens to the main process 'changeRouteTo' event and changes the route from
  // inside this Vue instance, according to what path the main process requires.
  // responds to Menu click() events at the main process and changes the route accordingly.

  ipcRenderer.on('changeRouteTo', (event, path) => {
    self.$router.push(path);
    if (store.state.showLyrics) {
      store.commit('toggleLyrics');
    }
  });

  ipcRenderer.on('search', () => {
    // 触发数据响应
    self.$refs.navbar.$refs.searchInput.focus();
    self.$refs.navbar.inputFocus = true;
  });

  // 失焦时 activeElement 会停留在上次聚焦的输入框，仅限本窗口持有焦点
  // 才让位，否则误伤共用这批通道的托盘/媒体键/Mpris。
  const onMedia = (channel, fn) =>
    ipcRenderer.on(channel, () => {
      if (!(document.hasFocus() && isEditingText())) fn();
    });

  onMedia('play', () => player.playOrPause());
  onMedia('next', () =>
    player.isPersonalFM ? player.playNextFMTrack() : player.playNextTrack()
  );
  onMedia('previous', () => player.playPrevTrack());
  onMedia('increaseVolume', () => {
    player.volume = Math.min(player.volume + 0.1, 1);
  });
  onMedia('decreaseVolume', () => {
    player.volume = Math.max(player.volume - 0.1, 0);
  });
  onMedia('like', () => store.dispatch('likeATrack', player.currentTrack.id));

  ipcRenderer.on('repeat', () => {
    player.switchRepeatMode();
  });

  ipcRenderer.on('shuffle', () => {
    player.switchShuffle();
  });

  ipcRenderer.on('routerGo', (event, where) => {
    self.$refs.navbar.go(where);
  });

  ipcRenderer.on('nextUp', () => {
    self.$refs.player.goToNextTracksPage();
  });

  ipcRenderer.on('rememberCloseAppOption', (event, value) => {
    store.commit('updateSettings', {
      key: 'closeAppOption',
      value,
    });
  });

  ipcRenderer.on('setPosition', (event, position) => {
    player._howler.seek(position);
  });
}
