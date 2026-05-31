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
     *
     * 注意：暂停 (player.playing=false) 时仍然继续渲染——AnalyserNode
     * 会输出 0 数据，画面静止/淡出，符合“暂停音乐≠停止可视化”的语义。
     */
    shouldRun() {
      return this.enabled && this.showLyrics && !this.docHidden;
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
    // 切歌：旧 audio 节点已被 Howler.unload() 销毁，必须把可视化指向新节点。
    'player.currentTrack.id'() {
      if (!this.shouldRun) return;
      // 切歌一律完整重建 AV（与刷新等价），力度/状态完全一致。
      this._rebindToNewAudio();
    },
  },
  mounted() {
    try {
      window.__YPM_AV_ENABLED__ = !!this.enabled;
    } catch (_) {}
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
      try {
        window.__YPM_AV_ENABLED__ = false;
      } catch (_) {}
      this._teardown();
    },
    /**
     * 轻量暂停：仅停 RAF，不销毁 AudioVisual / Worker / AudioContext，
     * 以便重新进歌词页时能零成本恢复。
     */
    _pause() {
      this._clearBootTimer();
      this._clearReadyListener();
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
      this._clearBootTimer();
      this._clearRebindTimer();
      this._clearReadyListener();
      this._unbindAudioEvents();
      if (this._fadeTimer) {
        clearTimeout(this._fadeTimer);
        this._fadeTimer = null;
      }
      if (this._fadeSafetyTimer) {
        clearTimeout(this._fadeSafetyTimer);
        this._fadeSafetyTimer = null;
      }
      if (this.AV) {
        this.AV.destroy();
        this.AV = null;
      }
    },
    _clearBootTimer() {
      if (this._bootTimer) {
        clearInterval(this._bootTimer);
        this._bootTimer = null;
      }
    },
    _clearRebindTimer() {
      if (this._rebindTimer) {
        clearInterval(this._rebindTimer);
        this._rebindTimer = null;
      }
    },
    /**
     * 取消挂在某 audio 节点上的“等就绪再重试”监听，避免重复绑定。
     */
    _clearReadyListener() {
      if (this._readyOff) {
        this._readyOff();
        this._readyOff = null;
      }
    },
    /**
     * 在 audio 元素上一次性监听 'playing' / 'loadeddata' —— 一旦真正开始
     * 出声，captureStream 才会有音轨可拿。回调里再尝试 attach / rebind。
     */
    _waitAudioReady(node, retry) {
      this._clearReadyListener();
      const handler = () => {
        this._clearReadyListener();
        if (!this.shouldRun) return;
        retry();
      };
      node.addEventListener('playing', handler, { once: true });
      node.addEventListener('loadeddata', handler, { once: true });
      this._readyOff = () => {
        node.removeEventListener('playing', handler);
        node.removeEventListener('loadeddata', handler);
      };
    },
    start() {
      this.enabled = true;
      try {
        window.__YPM_AV_ENABLED__ = true;
      } catch (_) {}
      if (!this.shouldRun) return;
      this._tryAttach();
    },
    /**
     * 等待 howler 的 _node 与 canvas 就绪后调用 _attachTo。
     * 使用短轮询是因为 Howler 在 html5 模式下异步创建 _node。
     */
    _tryAttach() {
      if (this.AV) return;
      this._clearBootTimer();
      let tries = 0;
      this._bootTimer = setInterval(() => {
        tries++;
        if (this.AV || !this.shouldRun) {
          this._clearBootTimer();
          return;
        }
        const node = this.player?._howler?._sounds?.[0]?._node;
        const canvas = this.$refs.frame?.getCanvas();
        if (node && canvas && isLoggedIn()) {
          this._clearBootTimer();
          this._attachTo(node, canvas);
        } else if (tries > 25) {
          this._clearBootTimer();
        }
      }, 200);
    },
    _attachTo(node, canvas) {
      // 不设置 crossOrigin：第三方音源 (kuwo / qq / migu / joox 等) 不返回
      // Access-Control-Allow-Origin，一旦带 Origin 头将被 CORS 拦截，导致无法播放。
      // 播放优先；可视化对这些源会因为 captureStream tainted 而无声/失败，已可接受。
      try {
        this.AV = new AudioVisual(canvas, node, this.setting);
        this.AV.loadMusic(node.context, node);
        this._bindAudioEvents(node);
        this._fadeInCanvas();
      } catch (err) {
        this._handleAttachError(err, node, () => this._attachTo(node, canvas));
      }
    },

    /** 为当前 audio 节点挂 seeking/seeked 事件，实现拖动进度时丝滑过渡。 */
    _bindAudioEvents(node) {
      this._unbindAudioEvents();
      const onSeeking = () => this._fadeOutCanvas();
      const onSeeked = () => this._fadeInCanvas();
      node.addEventListener('seeking', onSeeking);
      node.addEventListener('seeked', onSeeked);
      this._audioOff = () => {
        try {
          node.removeEventListener('seeking', onSeeking);
          node.removeEventListener('seeked', onSeeked);
        } catch (_) {}
      };
    },
    _unbindAudioEvents() {
      if (this._audioOff) {
        this._audioOff();
        this._audioOff = null;
      }
    },
    _getCanvas() {
      return this.$refs.frame?.getCanvas();
    },
    /** 立刻深度 0 × 0。 */
    _fadeOutCanvas() {
      const c = this._getCanvas();
      if (!c) return;
      c.style.opacity = '0';
      // 取消已有的恢复计时，防止快速 seek 连击调乱状态
      if (this._fadeTimer) {
        clearTimeout(this._fadeTimer);
        this._fadeTimer = null;
      }
      // 兜底：1.2s 内若仍未触发 fadeIn（attach 失败 / NOT_SUPPORTED 等），
      // 强制恢复显示，避免画布永远透明造成"黑屏"。
      if (this._fadeSafetyTimer) clearTimeout(this._fadeSafetyTimer);
      this._fadeSafetyTimer = setTimeout(() => {
        this._fadeSafetyTimer = null;
        const cc = this._getCanvas();
        if (cc && cc.style.opacity === '0') cc.style.opacity = '1';
      }, 1200);
    },
    /** 下一帧 RAF 后设 opacity=1，CSS transition 接手。 */
    _fadeInCanvas() {
      const c = this._getCanvas();
      if (!c) return;
      // 给 AV 一小段充分时间走完重建（captureStream + worker AGC 冷启动），
      // 避免淑入后第一帧仍是"质变"画面。
      if (this._fadeTimer) clearTimeout(this._fadeTimer);
      if (this._fadeSafetyTimer) {
        clearTimeout(this._fadeSafetyTimer);
        this._fadeSafetyTimer = null;
      }
      this._fadeTimer = setTimeout(() => {
        this._fadeTimer = null;
        const cc = this._getCanvas();
        if (cc) cc.style.opacity = '1';
      }, 60);
    },
    _handleAttachError(err, node, retry) {
      if (this.AV) {
        try {
          this.AV.destroy();
        } catch (_) {}
        this.AV = null;
      }
      const code = err && err.code;
      if (code === 'AV_NOT_READY') {
        // 新 audio 还没真正出声，等 'playing' 后再来一次
        this._waitAudioReady(node, retry);
        return;
      }
      if (code === 'AV_NOT_SUPPORTED') {
        console.warn(
          '[Visualization] 当前环境不支持 captureStream，已跳过可视化以保证播放。'
        );
        return;
      }
      console.error('[Visualization] AV init failed', err);
    },
    /**
     * 切歌后重建可视化，让"切歌"与"刷新"走完全相同的初始化路径。
     *
     * 旧实现走 changeMediaElementSource 试图复用 AV 实例，
     * 但 worker AGC / runPeak 等内部状态在新旧歌之间无法平滑迁移，
     * 用户感知就是「切歌力度与刷新不一致 + 切换瞬间卡顿」。
     *
     * 现做法：一刀切——destroy 旧 AV，再用 _tryAttach 等新 _node 出来后
     * 按刷新路径全新构造 AudioVisual + Worker + AGC，状态白板，
     * 视觉表现与刷新完全一致。
     */
    _rebindToNewAudio() {
      this._clearRebindTimer();
      this._clearReadyListener();
      this._unbindAudioEvents();
      // 立即淑出当前画面。后续 _attachTo 成功后会淑入。
      this._fadeOutCanvas();
      // 立刻把旧 AV 整个拆掉：worker terminate / source disconnect /
      // stream tracks stop —— 与 destroy() 完全一致。
      if (this.AV) {
        try {
          this.AV.destroy();
        } catch (_) {}
        this.AV = null;
      }
      // 走与刷新相同的"等 _node + canvas 就绪 → _attachTo"路径。
      this._tryAttach();
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
