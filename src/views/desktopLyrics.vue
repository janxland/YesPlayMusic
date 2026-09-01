<template>
  <div
    class="desktop-lyrics-window"
    @mouseenter="handleMouseEnter"
    @mouseleave="handleMouseLeave"
  >
    <transition name="fade">
      <div v-show="showToolbar" class="toolbar">
        <button
          :title="locked ? '已锁定（鼠标穿透），点击解锁' : '锁定（鼠标穿透）'"
          :class="{ active: locked }"
          @click="toggleLock"
        >
          <svg-icon icon-class="lock" />
        </button>
        <button title="关闭桌面歌词" @click="closeWindow">
          <svg-icon icon-class="x" />
        </button>
      </div>
    </transition>
    <div class="lyrics-stage">
      <div class="current">{{ currentText }}</div>
      <div class="next">{{ nextText }}</div>
    </div>
  </div>
</template>

<script>
// Electron 桌面歌词窗口内容：透明窗口、整窗可拖动（-webkit-app-region: drag），
// 播放状态由主窗口经主进程 IPC 转发（desktopLyrics:state），本地按时间插值平滑进度。
import { getLyric } from '@/api/track';
import { lyricParser } from '@/utils/lyrics';

export default {
  name: 'DesktopLyrics',
  data() {
    return {
      ipcRenderer: null,
      locked: false,
      showToolbar: true,
      trackId: 0,
      trackName: '',
      artistName: '',
      progress: 0,
      playing: false,
      lastStateAt: Date.now(),
      lyricLines: [],
      highlightIndex: -1,
      tickTimer: null,
    };
  },
  computed: {
    currentText() {
      if (!this.trackName) return '未在播放';
      if (this.lyricLines.length === 0) {
        return `《${this.trackName}》 正在获取歌词…`;
      }
      if (this.highlightIndex < 0) return '♪ ♪ ♪';
      return this.lyricLines[this.highlightIndex].content;
    },
    nextText() {
      const next = this.lyricLines[this.highlightIndex + 1];
      return next ? next.content : '';
    },
  },
  mounted() {
    this.ipcRenderer = window.require('electron').ipcRenderer;
    this.ipcRenderer.on('desktopLyrics:state', this.handleState);
    this.tickTimer = setInterval(this.updateHighlight, 200);
    // 锁定（鼠标穿透）模式下 mousemove 事件仍会转发过来，
    // 鼠标进入时临时解锁以便操作工具栏
    window.addEventListener('mousemove', this.handleForwardedMove);
  },
  beforeDestroy() {
    clearInterval(this.tickTimer);
    window.removeEventListener('mousemove', this.handleForwardedMove);
    this.ipcRenderer?.removeListener('desktopLyrics:state', this.handleState);
  },
  methods: {
    handleState(event, payload) {
      this.progress = payload.progress ?? 0;
      this.playing = !!payload.playing;
      this.lastStateAt = Date.now();
      this.trackName = payload.trackName || '';
      this.artistName = payload.artistName || '';
      if (payload.trackId !== this.trackId) {
        this.trackId = payload.trackId;
        this.lyricLines = [];
        this.highlightIndex = -1;
        this.fetchLyrics(this.trackId);
      }
    },
    fetchLyrics(id) {
      if (!id) return;
      getLyric(id)
        .then(data => {
          if (id !== this.trackId) return; // 已切歌，丢弃过期结果
          const { lyric } = lyricParser(data || {});
          this.lyricLines = lyric.filter(l => l.content && l.content.trim());
          this.updateHighlight();
        })
        .catch(() => {
          this.lyricLines = [];
        });
    },
    updateHighlight() {
      if (this.lyricLines.length === 0) return;
      // 上次同步进度 + 流逝时间插值，避免 500ms 同步间隔造成跳变；
      // 不能用 computed（Date.now 非响应式会被缓存住）
      const progress = this.playing
        ? this.progress + (Date.now() - this.lastStateAt) / 1000
        : this.progress;
      const index = this.lyricLines.findIndex((l, i) => {
        const next = this.lyricLines[i + 1];
        return progress >= l.time && (next ? progress < next.time : true);
      });
      if (index !== this.highlightIndex) {
        this.highlightIndex = index;
      }
    },
    toggleLock() {
      this.locked = !this.locked;
      this.ipcRenderer.send('desktopLyrics:setIgnoreMouse', this.locked);
    },
    // 穿透状态下鼠标移入 → 临时解锁；移出窗口 → 重新锁定
    handleForwardedMove() {
      if (this.locked) {
        this.locked = false;
        this.ipcRenderer.send('desktopLyrics:setIgnoreMouse', false);
        this.showToolbar = true;
      }
    },
    handleMouseEnter() {
      this.showToolbar = true;
    },
    handleMouseLeave() {
      this.showToolbar = false;
      if (this.locked) {
        this.ipcRenderer.send('desktopLyrics:setIgnoreMouse', true);
      }
    },
    closeWindow() {
      window.close();
    },
  },
};
</script>

<style lang="scss">
// 透明窗口：清掉全局背景（App.vue 全局样式会给 body/#app 上主题色）
html,
body,
#app {
  background: transparent !important;
}
</style>

<style lang="scss" scoped>
.desktop-lyrics-window {
  position: fixed;
  inset: 0;
  -webkit-app-region: drag; // 整窗可拖动定位
  -webkit-user-select: none;
  user-select: none;
  display: flex;
  flex-direction: column;
  justify-content: center;
  overflow: hidden;
}

.toolbar {
  position: absolute;
  top: 4px;
  right: 6px;
  z-index: 2;
  display: flex;
  gap: 2px;
  -webkit-app-region: no-drag;

  button {
    width: 26px;
    height: 26px;
    border: none;
    border-radius: 6px;
    background: rgba(0, 0, 0, 0.35);
    color: rgba(255, 255, 255, 0.8);
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    transition: background 0.2s;

    &:hover {
      background: rgba(0, 0, 0, 0.6);
    }

    &.active {
      color: #ffd661;
    }

    .svg-icon {
      height: 13px;
      width: 13px;
    }
  }
}

.lyrics-stage {
  text-align: center;
  padding: 0 24px;
  color: #fff;

  .current {
    font-size: 30px;
    font-weight: 700;
    line-height: 1.4;
    // 白字 + 双层阴影，保证叠在任何桌面/窗口上都清晰
    text-shadow: 0 1px 2px rgba(0, 0, 0, 0.85), 0 0 14px rgba(0, 0, 0, 0.55);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .next {
    margin-top: 6px;
    font-size: 16px;
    opacity: 0.72;
    line-height: 1.4;
    text-shadow: 0 1px 2px rgba(0, 0, 0, 0.85);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
}

.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.2s;
}
.fade-enter,
.fade-leave-to {
  opacity: 0;
}
</style>
