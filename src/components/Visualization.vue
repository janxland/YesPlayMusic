<template>
  <!--
    薄编排器：
    - 自身 display:contents，不创建堆叠上下文
    - Frame  -> setting.zIndex（编辑态自动提到 399）
    - Fab    -> 固定 400，常驻，点击仅切换 panelOpen，不会自我消失
    - Panel  -> 固定 401，异步 chunk + <transition> 平滑出入；
               卸载时不动 FAB，FAB 始终在原位
  -->
  <div class="vis-host">
    <VisualizerFrame
      v-show="enabled"
      ref="frame"
      :setting="setting"
      :editing="editLayout"
      @drag-start="onDragWindow"
      @resize-start="onResizeWindow"
    />
    <VisualizerFab
      :active="enabled"
      :panel-open="panelOpen"
      @toggle-panel="panelOpen = !panelOpen"
    />
    <transition name="vis-panel">
      <VisualizerPanel
        v-if="panelOpen"
        :setting="setting"
        :enabled="enabled"
        :edit-layout="editLayout"
        @close="panelOpen = false"
        @toggle-enabled="toggleEnabled"
        @toggle-edit="toggleLayoutEdit"
        @reset-bounds="resetBounds"
      />
    </transition>
  </div>
</template>

<script>
/* eslint-disable */
import { mapState } from 'vuex';
import { isLoggedIn } from '@/utils/auth';
import { AudioVisual } from '@/visualizer/AudioVisual';
import {
  DEFAULT_BOUNDS,
  loadSetting,
  loadUiState,
  saveSetting,
  saveUiState,
} from './visualizer/visualizerConfig';
import VisualizerFrame from './visualizer/VisualizerFrame.vue';
import VisualizerFab from './visualizer/VisualizerFab.vue';

/**
 * Visualization
 * --------------------------------------------------------------
 * 仅承担三件事：
 *   1) 加载/保存 setting；deep-watch 后下发到 AudioVisual + refresh()
 *   2) 启动/销毁 AudioVisual（持有 player._howler 内部 audio 节点）
 *   3) 维护「自由布局编辑」的 drag/resize 交互
 * UI 全部委派给 Frame / Fab / Panel 三个高内聚子组件。
 *
 * Panel 通过 webpack dynamic import 异步加载 —— 用户从不打开面板时
 * 不会下载这部分代码，达到按需加载效果。
 */
export default {
  name: 'Visualization',
  components: {
    VisualizerFrame,
    VisualizerFab,
    VisualizerPanel: () =>
      import(
        /* webpackChunkName: "visualizer-panel" */ './visualizer/VisualizerPanel.vue'
      ),
  },
  data() {
    const ui = loadUiState();
    return {
      AV: null,
      enabled: ui.enabled,
      panelOpen: ui.panelOpen,
      editLayout: false,
      setting: loadSetting(),
      _bootTimer: null,
      _saveTimer: null,
      docHidden: typeof document !== 'undefined' ? !!document.hidden : false,
    };
  },
  computed: {
    ...mapState(['player', 'showLyrics']),
    isWindowMode() {
      return this.setting.mode === 'window';
    },
    /**
     * 是否应当实际跑可视化：
     *   - 用户开启（enabled）
     *   - 当前在歌词页（showLyrics）—— Visualization 只在歌词页内可见，
     *     歌词页隐藏后继续跑 RAF/FFT 完全是浪费 CPU
     *   - 页面处于 visible 状态（标签切走/最小化后依然暂停）
     *   - 正在播放（暂停状态下 AnalyserNode 输出全 0，没必要刷帧）
     */
    shouldRun() {
      return (
        this.enabled &&
        this.showLyrics &&
        !this.docHidden &&
        !!this.player?.playing
      );
    },
  },
  watch: {
    setting: {
      deep: true,
      handler(v) {
        if (this.AV) {
          this.AV.setSetting(v);
          this.AV.refresh();
        }
        clearTimeout(this._saveTimer);
        this._saveTimer = setTimeout(() => saveSetting(v), 300);
      },
    },
    enabled(v) {
      saveUiState({ enabled: v, panelOpen: this.panelOpen });
    },
    panelOpen(v) {
      saveUiState({ enabled: this.enabled, panelOpen: v });
    },
    // 核心：隐藏 / 暂停 / 离页 时停掉 RAF，避免白白吃 CPU
    shouldRun(v) {
      if (v) this._resume();
      else this._pause();
    },
  },
  mounted() {
    this._onVis = () => {
      this.docHidden = !!document.hidden;
    };
    document.addEventListener('visibilitychange', this._onVis);
    if (this.shouldRun) this.start();
  },
  beforeDestroy() {
    clearTimeout(this._saveTimer);
    if (this._onVis) {
      document.removeEventListener('visibilitychange', this._onVis);
      this._onVis = null;
    }
    this._teardown();
  },
  methods: {
    toggleEnabled() {
      this.enabled ? this.stop() : this.start();
    },
    toggleLayoutEdit() {
      if (!this.editLayout && !this.isWindowMode) this.setting.mode = 'window';
      this.editLayout = !this.editLayout;
    },
    resetBounds() {
      this.setting.bounds = { ...DEFAULT_BOUNDS };
    },
    stop() {
      this.enabled = false;
      this._teardown();
    },
    /**
     * 轻量暂停：仅停 RAF，不销毁 AudioVisual / Worker / AudioContext，
     * 以便重新进歌词页时能零成本恢复。
     */
    _pause() {
      if (this._bootTimer) {
        clearInterval(this._bootTimer);
        this._bootTimer = null;
      }
      if (this.AV) this.AV.stop();
    },
    _resume() {
      if (!this.enabled) return;
      if (this.AV) {
        this.AV.refresh();
        this.AV.start();
      } else {
        this.start();
      }
    },
    _teardown() {
      if (this._bootTimer) {
        clearInterval(this._bootTimer);
        this._bootTimer = null;
      }
      if (this.AV) {
        this.AV.destroy();
        this.AV = null;
      }
    },
    start() {
      this.enabled = true;
      // 如果不该跑（例如歌词页未打开），只记录开关状态，暂停启动流水线
      if (!this.shouldRun) return;
      this._bootTimer = setInterval(() => {
        const node = this.player?._howler?._sounds?.[0]?._node;
        if (!node || !isLoggedIn() || this.AV) return;
        clearInterval(this._bootTimer);
        this._bootTimer = null;
        const canvas = this.$refs.frame?.getCanvas();
        if (!canvas) return;
        // 不再强制设置 crossOrigin：其他第三方音频源（酷我/QQ等）不返回 CORS 头，
        // 强设 crossOrigin='anonymous' 会让浏览器拒载音频。
        // AudioVisual 内部会优先使用 captureStream，它对未设置 crossOrigin 的
        // cross-origin 音频只会输出静默流，可视化“没动静”，但播放不受影响。
        try {
          this.AV = new AudioVisual(canvas, node, this.setting);
          this.AV.loadMusic(node.context, node);
        } catch (err) {
          if (err && err.code === 'AV_NO_CORS_SAFE_SOURCE') {
            console.warn(
              '[Visualization] 当前音源不支持 CORS，已跳过可视化以保证播放。'
            );
          } else {
            console.error('[Visualization] AV init failed', err);
          }
          if (this.AV) {
            try {
              this.AV.destroy();
            } catch (_) {}
            this.AV = null;
          }
        }
      }, 400);
    },

    /* ---------- 自由布局 drag / resize ---------- */
    _beginDrag(e, mutate) {
      const startX = e.clientX;
      const startY = e.clientY;
      const sb = { ...this.setting.bounds };
      const W = window.innerWidth;
      const H = window.innerHeight;
      const prevSel = document.body.style.userSelect;
      document.body.style.userSelect = 'none';
      const move = ev => {
        this.setting.bounds = mutate(
          sb,
          (ev.clientX - startX) / W,
          (ev.clientY - startY) / H
        );
      };
      const up = () => {
        document.removeEventListener('mousemove', move);
        document.removeEventListener('mouseup', up);
        document.body.style.userSelect = prevSel;
      };
      document.addEventListener('mousemove', move);
      document.addEventListener('mouseup', up);
    },
    onDragWindow(e) {
      this._beginDrag(e, (sb, dx, dy) => ({
        ...sb,
        x: Math.max(0, Math.min(1 - sb.w, sb.x + dx)),
        y: Math.max(0, Math.min(1 - sb.h, sb.y + dy)),
      }));
    },
    onResizeWindow(e) {
      this._beginDrag(e, (sb, dx, dy) => ({
        ...sb,
        w: Math.max(0.1, Math.min(1 - sb.x, sb.w + dx)),
        h: Math.max(0.1, Math.min(1 - sb.y, sb.h + dy)),
      }));
    },
  },
};
</script>

<style lang="scss" scoped>
/* display:contents：宿主元素不参与布局/堆叠，避免在歌词页内
   产生新的 stacking context；三个子层各自 fixed 定位、独立 z-index。 */
.vis-host {
  display: contents;
}
</style>
