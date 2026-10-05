<template>
  <div class="desktop-lyrics-window" :class="{ locked }">
    <div class="toolbar" :class="{ visible: hovering || btnHot }">
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
        ref="lockBtnRef"
        :title="
          locked
            ? '已锁定（光标离开歌词后鼠标穿透），点击解锁'
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
              :key="`${line.time}-${i}`"
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

<script setup lang="ts">
import { ipcBridge, hasIpc } from '@/platform/bridge';
import { getLyric } from '@/api/track';
import { lyricParser } from '@/utils/lyrics';
import { ref, computed, nextTick, onMounted, onBeforeUnmount } from 'vue';

const HIT_MARGIN = 16; // 解锁按钮热区外扩像素（含在上报的 rect 里）
const LINE_H = 48; // 滚动列每行固定高度（px），viewport 高 3 行

const lockBtnRef = ref<any>(null);
// 默认锁定（鼠标穿透）：桌面歌词的存在意义就是悬浮展示，不该挡住底下的操作；
// 显式存过 '0' 才默认解锁。工具栏显隐由主进程光标轮询驱动（拖拽区会吞 DOM 鼠标事件）
const locked = ref(localStorage.getItem('desktopLyricsLocked') !== '0');

const hovering = ref<any>(false);

const btnHot = ref<any>(false);

const trackId = ref<any>(0);

const trackName = ref<any>('');

const progress = ref<any>(0);

const playing = ref<any>(false);

const repeatMode = ref<any>('off');

const lastStateAt = ref(Date.now());

const lyricLines = ref<any[]>([]);

const lyricState = ref<any>('idle');

const highlightIndex = ref(-1);

const renderedIdx = ref<any>(null);

const animRoll = ref<any>(false);

// rAF / 兜底定时器句柄（非响应式）：同 lyrics.vue 的 _lyricRaf 一样用普通变量避免响应式开销，onBeforeUnmount 统一清理
let _tickTimer: ReturnType<typeof setInterval> | null = null;

let _rafId = 0;

const showRoller = computed(function showRoller() {
  return lyricLines.value.length > 0 && highlightIndex.value >= 0;
});

const rollerStyle = computed(function rollerStyle() {
  const idx = renderedIdx.value == null ? 0 : renderedIdx.value;
  return {
    transform: `translateY(${LINE_H * (1 - idx)}px)`,
    transition: animRoll.value
      ? 'transform 0.5s cubic-bezier(0.2, 0.8, 0.2, 1)'
      : 'none',
  };
});

const currentText = computed(function currentText() {
  if (!trackName.value) return '未在播放';
  if (lyricState.value === 'loading') {
    return `《${trackName.value}》 正在获取歌词…`;
  }
  // 无词/纯音乐，或前奏空档：与 lyrics.vue 一致画音符
  return '♪ ♪ ♪';
});

const modeTitle = computed(function modeTitle() {
  return {
    off: '列表播放（点击切换）',
    on: '列表循环（点击切换）',
    one: '单曲循环（点击切换）',
  }[repeatMode.value];
});

function handleState(event, payload) {
  progress.value = payload.progress ?? 0;
  playing.value = !!payload.playing;
  repeatMode.value = payload.repeatMode || 'off';
  lastStateAt.value = Date.now();
  trackName.value = payload.trackName || '';
  if (payload.trackId !== trackId.value) {
    trackId.value = payload.trackId;
    lyricLines.value = [];
    lyricState.value = 'idle';
    highlightIndex.value = -1;
    renderedIdx.value = null;
    fetchLyrics(trackId.value);
  }
}

function fetchLyrics(id) {
  if (!id) return;
  lyricState.value = 'loading';
  getLyric(id)
    .then(data => {
      if (id !== trackId.value) return; // 已切歌，丢弃过期结果
      const { lyric } = lyricParser(data || {});
      lyricLines.value = lyric.filter(l => l.content && l.content.trim());
      lyricState.value = lyricLines.value.length > 0 ? 'ok' : 'none';
      updateHighlight();
    })
    .catch(() => {
      if (id !== trackId.value) return;
      lyricLines.value = [];
      lyricState.value = 'none';
    });
}

function updateHighlight() {
  if (lyricLines.value.length === 0) return;
  // 上次同步进度 + 流逝时间插值，避免 500ms 同步间隔造成跳变；不能用 computed（Date.now 非响应式会被缓存住）
  const currentProgress = playing.value
    ? progress.value + (Date.now() - lastStateAt.value) / 1000
    : progress.value;
  const index = lyricLines.value.findIndex((l, i) => {
    const next = lyricLines.value[i + 1];
    return (
      currentProgress >= l.time && (next ? currentProgress < next.time : true)
    );
  });
  if (index !== highlightIndex.value) {
    highlightIndex.value = index;
    slideTo(index);
  }
}

function slideTo(index) {
  const prev = renderedIdx.value;
  // 只在相邻换行时滚动；新歌就位、拖动进度条等大幅跳变瞬间落位
  animRoll.value = prev !== null && Math.abs(index - prev) === 1;
  renderedIdx.value = index;
}

function reportHitArea() {
  const el = lockBtnRef.value;
  if (!el || !hasIpc()) return;
  const r = el.getBoundingClientRect();
  ipcBridge.send('desktopLyrics:hitArea', {
    x: Math.max(0, r.left - HIT_MARGIN),
    y: Math.max(0, r.top - HIT_MARGIN),
    w: r.width + HIT_MARGIN * 2,
    h: r.height + HIT_MARGIN * 2,
  });
}

function sendControl(cmd) {
  ipcBridge.send('desktopLyrics:control', cmd);
}

function toggleLock() {
  locked.value = !locked.value;
  localStorage.setItem('desktopLyricsLocked', locked.value ? '1' : '0');
  // 工具栏按钮数量随 locked 变化，布局更新后重新上报热区再交给主进程
  nextTick(() => {
    reportHitArea();
    ipcBridge.send('desktopLyrics:setLock', locked.value);
  });
}

function closeWindow() {
  window.close();
}

onMounted(function mounted() {
  document.documentElement.classList.add('desktop-lyrics-view');
  ipcBridge.on('desktopLyrics:state', handleState);
  // 主进程热区轮询的回执：inside=光标在窗口内（解锁态工具栏显隐），
  // hot=光标在解锁按钮热区（锁定态工具栏显隐 + 鼠标已回收）
  ipcBridge.on('desktopLyrics:hover', (event, state) => {
    hovering.value = !!state?.inside;
    btnHot.value = !!state?.hot;
  });
  // rAF 逐帧检测切句（延迟 ≤16ms）；窗口被遮挡时 rAF 会停摆，留个低频定时器兜底
  const loop = () => {
    updateHighlight();
    _rafId = requestAnimationFrame(loop);
  };
  _rafId = requestAnimationFrame(loop);
  _tickTimer = setInterval(updateHighlight, 250);
  reportHitArea();
  ipcBridge.send('desktopLyrics:setLock', locked.value);
  window.addEventListener('resize', reportHitArea);
});

onBeforeUnmount(function beforeUnmount() {
  cancelAnimationFrame(_rafId);
  clearInterval(_tickTimer);
  window.removeEventListener('resize', reportHitArea);
  if (hasIpc()) {
    ipcBridge.removeListener('desktopLyrics:state', handleState);
    ipcBridge.removeAllListeners('desktopLyrics:hover');
  }
});
</script>

<style lang="scss">
// 透明窗口：清掉主题背景（global.scss 把背景色挂在 html 上）；本组件样式可能与主窗口共享 chunk，必须用歌词窗专属类名门控，否则主窗口深色主题背景会被打穿成白色
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
.soft-enter-from,
.soft-leave-to {
  opacity: 0;
}
</style>
