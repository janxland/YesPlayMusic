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
    };
  },
  computed: {
    ...mapState(['player']),
    isWindowMode() {
      return this.setting.mode === 'window';
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
  },
  mounted() {
    if (this.enabled) this.start();
  },
  beforeDestroy() {
    clearTimeout(this._saveTimer);
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
      this._bootTimer = setInterval(() => {
        const node = this.player?._howler?._sounds?.[0]?._node;
        if (!node || !isLoggedIn() || this.AV) return;
        clearInterval(this._bootTimer);
        const canvas = this.$refs.frame?.getCanvas();
        if (!canvas) return;
        node.crossOrigin = 'anonymous';
        this.AV = new AudioVisual(canvas, node, this.setting);
        this.AV.loadMusic(node.context, node);
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
