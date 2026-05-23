<template>
  <!--
    常驻入口：永远不被 v-if 卸载，点击只是切换面板 open/close。
    panel-open 状态时图标旋转一点 + 上色，给用户明确反馈。
  -->
  <button
    class="vis-fab"
    :class="{ active, opened: panelOpen }"
    :title="panelOpen ? '关闭可视化面板' : '打开可视化面板'"
    @click="$emit('toggle-panel')"
  >
    <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
      <g fill="currentColor">
        <rect x="3" y="9" width="3" height="12" rx="1.5" />
        <rect x="8" y="5" width="3" height="16" rx="1.5" />
        <rect x="13" y="11" width="3" height="10" rx="1.5" />
        <rect x="18" y="7" width="3" height="14" rx="1.5" />
      </g>
    </svg>
    <span v-if="active" class="dot"></span>
  </button>
</template>

<script>
/**
 * VisualizerFab —— 可视化入口浮标。
 * - 常驻 position:fixed z:400 层，不受 panelOpen / setting.zIndex 影响
 * - 不在外面用 v-if 包裹（防止点击瞬间自我卸载导致"消失"幻觉）
 */
export default {
  name: 'VisualizerFab',
  props: {
    active: { type: Boolean, default: false },
    panelOpen: { type: Boolean, default: false },
  },
};
</script>

<style lang="scss" scoped>
.vis-fab {
  position: fixed;
  top: 80px;
  right: 24px;
  z-index: 400; /* 必须高于歌词 .close-button(z:300)；与画布 zIndex 解耦 */
  width: 44px;
  height: 44px;
  border-radius: 14px;
  border: 1px solid rgba(255, 255, 255, 0.1);
  background: rgba(20, 20, 28, 0.62);
  backdrop-filter: blur(20px) saturate(180%);
  -webkit-backdrop-filter: blur(20px) saturate(180%);
  color: rgba(255, 255, 255, 0.92);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 12px 48px rgba(0, 0, 0, 0.45);
  cursor: pointer;
  transition: transform 0.18s ease, background 0.2s ease;
  &:hover {
    transform: translateY(-1px);
    background: rgba(28, 28, 38, 0.85);
  }
  &.active {
    color: #4f9dff;
  }
  &.opened {
    background: linear-gradient(135deg, #4f9dff, #b76bff);
    color: #fff;
    border-color: transparent;
    box-shadow: 0 12px 36px rgba(79, 157, 255, 0.45);
    transform: rotate(-4deg);
    &:hover {
      transform: rotate(-4deg) translateY(-1px);
    }
  }
  .dot {
    position: absolute;
    top: 6px;
    right: 6px;
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: #4f9dff;
    box-shadow: 0 0 12px rgba(79, 157, 255, 0.45);
    animation: vis-fab-pulse 1.6s ease-in-out infinite;
  }
}
[data-theme='light'] .vis-fab {
  border-color: rgba(0, 0, 0, 0.08);
  background: rgba(255, 255, 255, 0.7);
  color: rgba(20, 20, 28, 0.92);
}
@keyframes vis-fab-pulse {
  0%,
  100% {
    opacity: 1;
    transform: scale(1);
  }
  50% {
    opacity: 0.55;
    transform: scale(1.25);
  }
}
</style>
