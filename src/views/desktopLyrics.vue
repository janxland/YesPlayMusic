<template>
  <div
    class="desktop-lyrics-window"
    :class="{ locked }"
    @mouseenter="handleMouseEnter"
    @mouseleave="handleMouseLeave"
  >
    <div class="toolbar" :class="{ visible: locked ? btnHot : hovering }">
      <template v-if="!locked">
        <button title="上一首" @click="sendControl('prev')">
          <svg-icon icon-class="previous" />
        </button>
        <button
          :title="playing ? '暂停' : '播放'"
          @click="sendControl('playPause')"
        >
          <svg-icon :icon-class="playing ? 'pause' : 'play'" />
        </button>
        <button title="停止" @click="sendControl('stop')">
          <svg-icon icon-class="stop" />
        </button>
        <button title="下一首" @click="sendControl('next')">
          <svg-icon icon-class="next" />
        </button>
        <button
          :title="modeTitle"
          :class="{ active: repeatMode !== 'off' }"
          @click="sendControl('mode')"
        >
          <svg-icon
            :icon-class="repeatMode === 'one' ? 'repeat-1' : 'repeat'"
          />
        </button>
      </template>
      <button
        ref="lockBtn"
        :title="
          locked
            ? '已锁定（鼠标穿透），悬停到本按钮附近可操作，点击解锁'
            : '锁定（鼠标穿透）'
        "
        :class="{ active: locked }"
        @click="toggleLock"
      >
        <svg-icon icon-class="lock" />
      </button>
      <button v-if="!locked" title="关闭桌面歌词" @click="closeWindow">
        <svg-icon icon-class="x" />
      </button>
    </div>
    <div class="lyrics-stage">
      <transition name="soft">
        <div v-if="showRoller" class="viewport">
          <div class="roller" :style="rollerStyle">
            <div
              v-for="(line, i) in lyricLines"
              :key="i"
              class="line"
              :class="{
                active: i === highlightIndex,
                past: i < highlightIndex,
              }"
            >
              <span class="line-text">{{ line.content }}</span>
            </div>
          </div>
        </div>
      </transition>
      <transition name="soft">
        <div v-if="!showRoller" class="placeholder">{{ currentText }}</div>
      </transition>
    </div>
  </div>
</template>

<script>
// Electron 桌面歌词窗口内容：透明置顶窗口，播放状态由主窗口经主进程 IPC 转发
// （desktopLyrics:state），本地按时间插值 + rAF 逐帧驱动。
// 锁定语义与真实歌词软件一致：整窗不可拖动、完全鼠标穿透（可直接操作下方桌面），
// 唯一交互是解锁按钮。热区命中检测在主进程做光标坐标轮询（mac 的 forward
// mousemove 在真实鼠标下不可靠，会导致锁定后解不开）：本窗口上报解锁按钮
// rect，主进程轮询命中→关穿透并回发 hover 状态显示工具栏，移出→恢复穿透。
// 播控按钮（上一首/播放/停止/下一首/模式）经主进程转发回主窗口执行。
import { getLyric } from '@/api/track';
import { lyricParser } from '@/utils/lyrics';

const HIT_MARGIN = 16; // 解锁按钮热区外扩像素（含在上报的 rect 里）
const LINE_H = 48; // 滚动列每行固定高度（px），viewport 高 3 行

export default {
  name: 'DesktopLyrics',
  data() {
    return {
      ipcRenderer: null,
      locked: localStorage.getItem('desktopLyricsLocked') === '1',
      hovering: false, // 光标在窗口内（仅影响解锁状态下的工具栏可见性）
      btnHot: false, // 主进程轮询判定：光标命中解锁按钮热区（锁定时唯一可交互点）
      trackId: 0,
      trackName: '',
      progress: 0,
      playing: false,
      repeatMode: 'off', // off | on | one（与主窗口 player 一致）
      lastStateAt: Date.now(),
      lyricLines: [],
      // 歌词加载状态：loading=请求中，ok=有词，none=无词/纯音乐（对齐 lyrics.vue 的 noLyric 语义）
      lyricState: 'idle',
      highlightIndex: -1,
      renderedIdx: null, // roller 当前停靠的行索引（null=未就位，禁动效）
      animRoll: false,
      tickTimer: null,
      rafId: 0,
    };
  },
  computed: {
    showRoller() {
      return this.lyricLines.length > 0 && this.highlightIndex >= 0;
    },
    rollerStyle() {
      const idx = this.renderedIdx == null ? 0 : this.renderedIdx;
      return {
        transform: `translateY(${LINE_H * (1 - idx)}px)`,
        transition: this.animRoll
          ? 'transform 0.5s cubic-bezier(0.2, 0.8, 0.2, 1)'
          : 'none',
      };
    },
    currentText() {
      if (!this.trackName) return '未在播放';
      if (this.lyricState === 'loading') {
        return `《${this.trackName}》 正在获取歌词…`;
      }
      // 无词/纯音乐，或前奏空档：与 lyrics.vue 一致画音符
      return '♪ ♪ ♪';
    },
    modeTitle() {
      return {
        off: '列表播放（点击切换）',
        on: '列表循环（点击切换）',
        one: '单曲循环（点击切换）',
      }[this.repeatMode];
    },
  },
  mounted() {
    document.documentElement.classList.add('desktop-lyrics-view');
    this.ipcRenderer = window.require('electron').ipcRenderer;
    this.ipcRenderer.on('desktopLyrics:state', this.handleState);
    // 主进程热区轮询的回执：光标进入/离开解锁按钮区域
    this.ipcRenderer.on('desktopLyrics:hover', (event, hot) => {
      this.btnHot = hot;
    });
    // rAF 逐帧检测切句（延迟 ≤16ms）；窗口被遮挡时 rAF 会停摆，留个低频定时器兜底
    const loop = () => {
      this.updateHighlight();
      this.rafId = requestAnimationFrame(loop);
    };
    this.rafId = requestAnimationFrame(loop);
    this.tickTimer = setInterval(this.updateHighlight, 250);
    this.reportHitArea();
    this.ipcRenderer.send('desktopLyrics:setLock', this.locked);
    window.addEventListener('resize', this.reportHitArea);
  },
  beforeDestroy() {
    cancelAnimationFrame(this.rafId);
    clearInterval(this.tickTimer);
    window.removeEventListener('resize', this.reportHitArea);
    if (this.ipcRenderer) {
      this.ipcRenderer.removeListener('desktopLyrics:state', this.handleState);
      this.ipcRenderer.removeAllListeners('desktopLyrics:hover');
    }
  },
  methods: {
    handleState(event, payload) {
      this.progress = payload.progress ?? 0;
      this.playing = !!payload.playing;
      this.repeatMode = payload.repeatMode || 'off';
      this.lastStateAt = Date.now();
      this.trackName = payload.trackName || '';
      if (payload.trackId !== this.trackId) {
        this.trackId = payload.trackId;
        this.lyricLines = [];
        this.lyricState = 'idle';
        this.highlightIndex = -1;
        this.renderedIdx = null;
        this.fetchLyrics(this.trackId);
      }
    },
    fetchLyrics(id) {
      if (!id) return;
      this.lyricState = 'loading';
      getLyric(id)
        .then(data => {
          if (id !== this.trackId) return; // 已切歌，丢弃过期结果
          const { lyric } = lyricParser(data || {});
          this.lyricLines = lyric.filter(l => l.content && l.content.trim());
          this.lyricState = this.lyricLines.length > 0 ? 'ok' : 'none';
          this.updateHighlight();
        })
        .catch(() => {
          if (id !== this.trackId) return;
          this.lyricLines = [];
          this.lyricState = 'none';
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
        this.slideTo(index);
      }
    },
    slideTo(index) {
      const prev = this.renderedIdx;
      // 只在相邻换行时滚动；新歌就位、拖动进度条等大幅跳变瞬间落位
      this.animRoll = prev !== null && Math.abs(index - prev) === 1;
      this.renderedIdx = index;
    },
    // 上报解锁按钮热区（窗口相对坐标，含外扩边距）给主进程做光标轮询
    reportHitArea() {
      const el = this.$refs.lockBtn;
      if (!el || !this.ipcRenderer) return;
      const r = el.getBoundingClientRect();
      this.ipcRenderer.send('desktopLyrics:hitArea', {
        x: Math.max(0, r.left - HIT_MARGIN),
        y: Math.max(0, r.top - HIT_MARGIN),
        w: r.width + HIT_MARGIN * 2,
        h: r.height + HIT_MARGIN * 2,
      });
    },
    sendControl(cmd) {
      this.ipcRenderer.send('desktopLyrics:control', cmd);
    },
    toggleLock() {
      this.locked = !this.locked;
      localStorage.setItem('desktopLyricsLocked', this.locked ? '1' : '0');
      // 工具栏按钮数量随 locked 变化，布局更新后重新上报热区再交给主进程
      this.$nextTick(() => {
        this.reportHitArea();
        this.ipcRenderer.send('desktopLyrics:setLock', this.locked);
      });
    },
    handleMouseEnter() {
      this.hovering = true;
    },
    handleMouseLeave() {
      this.hovering = false;
    },
    closeWindow() {
      window.close();
    },
  },
};
</script>

<style lang="scss">
// 透明窗口：清掉主题背景（global.scss 把背景色挂在 html 上）。
// 注意：webpack 会把本组件样式并进主窗口共享的 chunk（可视化面板），
// 必须用歌词窗专属类名门控，否则主窗口深色主题背景会被打穿成白色。
html.desktop-lyrics-view,
html.desktop-lyrics-view body,
html.desktop-lyrics-view #app {
  background: transparent !important;
}
</style>

<style lang="scss" scoped>
.desktop-lyrics-window {
  position: fixed;
  inset: 0;
  -webkit-app-region: drag; // 解锁状态：整窗可拖动定位
  -webkit-user-select: none;
  user-select: none;
  display: flex;
  flex-direction: column;
  justify-content: center;
  overflow: hidden;

  // 锁定后整窗禁拖：穿透期间拖动无意义，解锁按钮是唯一交互点
  &.locked {
    -webkit-app-region: no-drag;
  }
}

.toolbar {
  position: absolute;
  top: 4px;
  right: 6px;
  z-index: 2;
  display: flex;
  gap: 2px;
  opacity: 0;
  pointer-events: none;
  transition: opacity 0.25s ease;
  -webkit-app-region: no-drag;

  &.visible {
    opacity: 1;
    pointer-events: auto;
  }

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
  position: relative;
  height: 144px; // 3 × 48px 行高
  color: #fff;
}

.viewport,
.placeholder {
  position: absolute;
  inset: 0;
}

.viewport {
  overflow: hidden; // 只露出 3 行：上一句(暗) / 当前句(亮) / 下一句(暗)
}

.roller {
  will-change: transform; // 整列只做 translateY，GPU 合成零重排
}

.line {
  height: 48px; // 与 LINE_H 一致
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0 24px;
}

.line-text {
  display: block;
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 22px;
  font-weight: 700;
  line-height: 48px;
  opacity: 0.32;
  transform: scale(0.86);
  // 白字 + 双层阴影，保证叠在任何桌面/窗口上都清晰
  text-shadow: 0 1px 2px rgba(0, 0, 0, 0.85), 0 0 14px rgba(0, 0, 0, 0.55);
  transition: opacity 0.45s ease, transform 0.45s cubic-bezier(0.2, 0.8, 0.2, 1);
}

.line.active .line-text {
  opacity: 1;
  transform: scale(1.3);
}

.line.past .line-text {
  opacity: 0.18;
  transform: scale(0.8);
}

.placeholder {
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 26px;
  font-weight: 700;
  text-shadow: 0 1px 2px rgba(0, 0, 0, 0.85), 0 0 14px rgba(0, 0, 0, 0.55);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  padding: 0 24px;
}

// 占位态（未在播放 / 正在获取歌词 / ♪）与滚动列整体软切
.soft-enter-active,
.soft-leave-active {
  transition: opacity 0.3s ease;
}
.soft-enter,
.soft-leave-to {
  opacity: 0;
}
</style>
