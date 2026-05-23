<template>
  <!-- 独立 fixed 层，z-index 由用户 setting.zIndex 决定；不受 root 影响 -->
  <div
    class="vis-frame"
    :class="{ window: isWindowMode, editing: editing && isWindowMode }"
    :style="frameStyle"
  >
    <canvas ref="canvas" class="vis-canvas"></canvas>
    <template v-if="editing && isWindowMode">
      <div
        class="frame-handle drag"
        @mousedown.prevent="$emit('drag-start', $event)"
      >
        <svg viewBox="0 0 24 24" width="14" height="14">
          <g fill="currentColor">
            <circle cx="9" cy="6" r="1.4" />
            <circle cx="15" cy="6" r="1.4" />
            <circle cx="9" cy="12" r="1.4" />
            <circle cx="15" cy="12" r="1.4" />
            <circle cx="9" cy="18" r="1.4" />
            <circle cx="15" cy="18" r="1.4" />
          </g>
        </svg>
        <span>拖拽移动</span>
      </div>
      <div
        class="frame-handle resize"
        @mousedown.prevent="$emit('resize-start', $event)"
      >
        <svg viewBox="0 0 12 12" width="12" height="12">
          <path
            d="M2 10L10 2M6 10L10 6M10 10v0"
            stroke="currentColor"
            stroke-width="1.6"
            stroke-linecap="round"
            fill="none"
          />
        </svg>
      </div>
    </template>
  </div>
</template>

<script>
/**
 * VisualizerFrame
 * --------------------------------------------------------------
 * 仅负责呈现可视化画布容器（全屏 / 窗口）与编辑手柄。
 * 不持有音频/设置状态；通过 props 输入、events 输出，便于复用与测试。
 *
 * - 暴露 canvas DOM 给父级（`ref` 转发）：父级负责把它交给 AudioVisual。
 * - position:fixed 独立层，z-index 直接受 setting.zIndex 控制；
 *   FAB / 面板不在本组件内，因此不会被一起压到底层。
 */
export default {
  name: 'VisualizerFrame',
  props: {
    setting: { type: Object, required: true },
    editing: { type: Boolean, default: false },
  },
  computed: {
    isWindowMode() {
      return this.setting.mode === 'window';
    },
    frameStyle() {
      // 编辑模式临时提升 z 到 399（低于 FAB/Panel 400，高于歌词），
      // 否则用户低 z（如 0）会被歌词覆盖导致无法点击拖手柄。
      const z = this.editing && this.isWindowMode ? 399 : this.setting.zIndex;
      if (!this.isWindowMode) return { inset: 0, zIndex: z };
      const b = this.setting.bounds || { x: 0.1, y: 0.1, w: 0.5, h: 0.5 };
      return {
        left: (b.x * 100).toFixed(3) + '%',
        top: (b.y * 100).toFixed(3) + '%',
        width: (b.w * 100).toFixed(3) + '%',
        height: (b.h * 100).toFixed(3) + '%',
        zIndex: z,
      };
    },
  },
  methods: {
    /** 父级通过 ref 获取真实 canvas 元素以建立 Web Audio 图。 */
    getCanvas() {
      return this.$refs.canvas;
    },
  },
};
</script>

<style lang="scss" scoped>
.vis-frame {
  position: fixed;
  pointer-events: none;
  /* 正常态彻底无边界、无圆角、无阴影 —— 画布像素直接融入背景。
     仅 editing 时显示虚线轮廓以辅助拖拽，0.25s 平滑过渡防闪烁。 */
  transition: box-shadow 0.25s ease, outline-color 0.25s ease,
    background 0.25s ease;
  outline: 0 dashed transparent;
  &.editing {
    pointer-events: auto;
    outline: 1.5px dashed #4f9dff;
    outline-offset: -2px;
    box-shadow: 0 0 0 1px rgba(79, 157, 255, 0.45),
      0 12px 48px rgba(0, 0, 0, 0.45);
  }
}
.vis-canvas {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  pointer-events: none;
  /* canvas 本身保持矩形，不裁剪，便于像素融入周围 */
  display: block;
}
.frame-handle {
  position: absolute;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 11px;
  font-weight: 600;
  color: rgba(255, 255, 255, 0.92);
  background: rgba(28, 28, 38, 0.85);
  backdrop-filter: blur(20px) saturate(160%);
  border: 1px solid rgba(255, 255, 255, 0.08);
  user-select: none;
  pointer-events: auto;
  &.drag {
    top: -14px;
    left: 50%;
    transform: translateX(-50%);
    padding: 4px 10px;
    border-radius: 999px;
    cursor: grab;
    &:active {
      cursor: grabbing;
    }
  }
  &.resize {
    right: -2px;
    bottom: -2px;
    width: 22px;
    height: 22px;
    border-radius: 8px;
    justify-content: center;
    cursor: nwse-resize;
  }
}
</style>
