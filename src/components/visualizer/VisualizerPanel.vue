<template>
  <aside class="vis-panel" @mousedown.stop>
    <header class="vp-header">
      <div class="vp-title">
        <svg viewBox="0 0 24 24" width="18" height="18">
          <g fill="currentColor">
            <rect x="3" y="9" width="3" height="12" rx="1.5" />
            <rect x="8" y="5" width="3" height="16" rx="1.5" />
            <rect x="13" y="11" width="3" height="10" rx="1.5" />
            <rect x="18" y="7" width="3" height="14" rx="1.5" />
          </g>
        </svg>
        <span>可视化</span>
      </div>
      <div class="vp-actions">
        <button
          class="icon-btn"
          :class="{ on: editLayout }"
          :title="editLayout ? '锁定布局' : '自由布局（拖拽 / 缩放）'"
          @click="$emit('toggle-edit')"
        >
          <svg viewBox="0 0 24 24" width="18" height="18">
            <path
              d="M9 11V7a3 3 0 116 0v4M7 11h10a1 1 0 011 1v7a2 2 0 01-2 2H8a2 2 0 01-2-2v-7a1 1 0 011-1z"
              stroke="currentColor"
              stroke-width="1.7"
              fill="none"
              stroke-linecap="round"
              stroke-linejoin="round"
            />
          </svg>
        </button>
        <label class="vp-switch" :title="enabled ? '关闭' : '开启'">
          <input
            type="checkbox"
            :checked="enabled"
            @change="$emit('toggle-enabled')"
          />
          <span class="track"><span class="thumb"></span></span>
        </label>
        <button class="icon-btn" title="收起" @click="$emit('close')">
          <svg viewBox="0 0 24 24" width="18" height="18">
            <path
              d="M6 6l12 12M18 6L6 18"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
              fill="none"
            />
          </svg>
        </button>
      </div>
    </header>

    <section class="vp-modes">
      <button
        v-for="t in visualTypes"
        :key="t.id"
        class="mode-tile"
        :class="{ active: setting.type === t.id }"
        :title="t.label"
        @click="setting.type = t.id"
      >
        <component :is="iconFor(t.icon)" />
        <span>{{ t.label }}</span>
      </button>
    </section>

    <nav class="vp-tabs">
      <button
        v-for="tab in tabs"
        :key="tab.id"
        :class="{ active: activeTab === tab.id }"
        @click="activeTab = tab.id"
        >{{ tab.label }}</button
      >
    </nav>

    <div class="vp-body">
      <!-- 基础 -->
      <template v-if="activeTab === 'basic'">
        <div class="row">
          <label>灵敏度</label>
          <input
            v-model.number="setting.sensitivity"
            type="range"
            min="0.2"
            max="3"
            step="0.05"
          />
          <span class="val">{{ Number(setting.sensitivity).toFixed(2) }}</span>
        </div>
        <div class="row">
          <label>人声强调</label>
          <input
            v-model.number="setting.vocalBoost"
            type="range"
            min="0"
            max="2"
            step="0.05"
          />
          <span class="val">{{ Number(setting.vocalBoost).toFixed(2) }}</span>
        </div>
        <div class="row">
          <label>分辨率</label>
          <input
            v-model.number="setting.fftSize"
            type="range"
            min="6"
            max="14"
            step="1"
          />
          <span class="val">{{ Math.pow(2, setting.fftSize) }}</span>
        </div>
        <div class="row">
          <label>中心 X</label>
          <input
            v-model.number="setting.centerX"
            type="range"
            min="0"
            max="1"
            step="0.01"
          />
          <span class="val">{{ setting.centerX.toFixed(2) }}</span>
        </div>
        <div class="row">
          <label>中心 Y</label>
          <input
            v-model.number="setting.centerY"
            type="range"
            min="0"
            max="1"
            step="0.01"
          />
          <span class="val">{{ setting.centerY.toFixed(2) }}</span>
        </div>
        <div class="row">
          <label>线宽</label>
          <input
            v-model.number="setting.lineWidth"
            type="range"
            min="1"
            max="20"
            step="1"
          />
          <span class="val">{{ setting.lineWidth }}</span>
        </div>
        <div v-if="setting.type === 0" class="row">
          <label>线间距</label>
          <input
            v-model.number="setting.lineSpacing"
            type="range"
            min="0.1"
            max="10"
            step="0.1"
          />
          <span class="val">{{ setting.lineSpacing.toFixed(1) }}</span>
        </div>
        <div class="row toggle-row">
          <label>圆形端点</label>
          <label class="mini-switch">
            <input v-model="setting.isRound" type="checkbox" />
            <span></span>
          </label>
        </div>
      </template>

      <!-- 颜色 -->
      <template v-if="activeTab === 'color'">
        <div class="row">
          <label>主色</label>
          <div class="color-pick">
            <input v-model="setting.lineColor" type="color" />
            <span
              class="swatch"
              :style="{ background: setting.lineColor }"
            ></span>
          </div>
        </div>
        <div class="row">
          <label>阴影色</label>
          <div class="color-pick">
            <input v-model="setting.shadowColor" type="color" />
            <span
              class="swatch"
              :style="{ background: setting.shadowColor }"
            ></span>
          </div>
        </div>
        <div class="row">
          <label>主色不透明</label>
          <input
            v-model.number="setting.lineColorO"
            type="range"
            min="0"
            max="1"
            step="0.01"
          />
          <span class="val">{{ Math.round(setting.lineColorO * 100) }}%</span>
        </div>
        <div class="row">
          <label>阴影模糊</label>
          <input
            v-model.number="setting.shadowBlur"
            type="range"
            min="0"
            max="40"
            step="1"
          />
          <span class="val">{{ setting.shadowBlur }}</span>
        </div>
        <div class="palette-row">
          <span class="palette-label">预设</span>
          <button
            v-for="p in palettes"
            :key="p.name"
            class="palette-chip"
            :title="p.name"
            :style="{
              background: `linear-gradient(135deg, ${p.line}, ${p.shadow})`,
            }"
            @click="applyPalette(p)"
          ></button>
        </div>
      </template>

      <!-- 布局 -->
      <template v-if="activeTab === 'layout'">
        <div class="row toggle-row">
          <label>显示模式</label>
          <div class="seg">
            <button
              :class="{ on: setting.mode === 'cover' }"
              @click="setting.mode = 'cover'"
              >全屏</button
            >
            <button
              :class="{ on: setting.mode === 'window' }"
              @click="setting.mode = 'window'"
              >窗口</button
            >
          </div>
        </div>
        <div class="row">
          <label>层级</label>
          <input
            v-model.number="setting.zIndex"
            type="number"
            min="-99"
            max="999"
            step="1"
            class="num-input"
          />
          <span class="val">{{ setting.zIndex }}</span>
        </div>
        <p class="tip muted">
          <b>0</b> 背景上、歌词下；<b>50</b> 歌词上；<b>250+</b>
          覆盖播放器控件。
        </p>
        <template v-if="isWindowMode">
          <div class="row">
            <label>窗口 X</label>
            <input
              v-model.number="setting.bounds.x"
              type="range"
              min="0"
              max="0.95"
              step="0.005"
            />
            <span class="val">{{ Math.round(setting.bounds.x * 100) }}%</span>
          </div>
          <div class="row">
            <label>窗口 Y</label>
            <input
              v-model.number="setting.bounds.y"
              type="range"
              min="0"
              max="0.95"
              step="0.005"
            />
            <span class="val">{{ Math.round(setting.bounds.y * 100) }}%</span>
          </div>
          <div class="row">
            <label>宽度</label>
            <input
              v-model.number="setting.bounds.w"
              type="range"
              min="0.1"
              max="1"
              step="0.005"
            />
            <span class="val">{{ Math.round(setting.bounds.w * 100) }}%</span>
          </div>
          <div class="row">
            <label>高度</label>
            <input
              v-model.number="setting.bounds.h"
              type="range"
              min="0.1"
              max="1"
              step="0.005"
            />
            <span class="val">{{ Math.round(setting.bounds.h * 100) }}%</span>
          </div>
          <button class="ghost-btn" @click="$emit('reset-bounds')"
            >重置窗口</button
          >
        </template>
      </template>

      <!-- 高级 -->
      <template v-if="activeTab === 'advanced'">
        <template v-if="setting.type === 1">
          <div class="row">
            <label>环形半径</label>
            <input
              v-model.number="setting.circleRadius"
              type="range"
              min="20"
              max="500"
              step="5"
            />
            <span class="val">{{ setting.circleRadius }}</span>
          </div>
          <div class="row">
            <label>分割步长</label>
            <input
              v-model.number="setting.circleSplit"
              type="range"
              min="1"
              max="30"
              step="1"
            />
            <span class="val">{{ setting.circleSplit }}</span>
          </div>
          <div class="row">
            <label>循环角</label>
            <input
              v-model.number="setting.circleRange"
              type="range"
              min="60"
              max="1080"
              step="30"
            />
            <span class="val">{{ setting.circleRange }}</span>
          </div>
          <div class="row">
            <label>边缘倍数</label>
            <input
              v-model.number="setting.circleEdge"
              type="range"
              min="0.1"
              max="1.5"
              step="0.05"
            />
            <span class="val">{{ setting.circleEdge.toFixed(2) }}</span>
          </div>
        </template>
        <div class="row">
          <label>歌词透视</label>
          <input
            v-model.number="$store.state.visualSet.perspective"
            type="range"
            min="100"
            max="1000"
            step="50"
          />
          <span class="val">{{ $store.state.visualSet.perspective }}</span>
        </div>
        <div class="row">
          <label>歌词旋转</label>
          <input
            v-model.number="$store.state.visualSet.rotateY"
            type="range"
            min="-180"
            max="180"
            step="1"
          />
          <span class="val">{{ $store.state.visualSet.rotateY }}°</span>
        </div>
        <p class="tip">设置自动保存到本地（含布局、调色）。</p>
      </template>
    </div>
  </aside>
</template>

<script>
import { VISUAL_TYPES } from '@/visualizer/AudioVisual';
import { PALETTES, iconFor } from './visualizerConfig';

/**
 * VisualizerPanel —— 设置面板。
 * - 通过 prop 接收 setting，直接 mutate 其字段（同一 reactive 对象），
 *   父级 deep watcher 会感知变化并下发到 AudioVisual。
 * - 异步加载入口在 Visualization.vue：仅打开面板时才会拉取此 chunk。
 */
export default {
  name: 'VisualizerPanel',
  props: {
    setting: { type: Object, required: true },
    enabled: { type: Boolean, default: false },
    editLayout: { type: Boolean, default: false },
  },
  data() {
    return {
      activeTab: 'basic',
      visualTypes: VISUAL_TYPES,
      palettes: PALETTES,
      tabs: [
        { id: 'basic', label: '基础' },
        { id: 'color', label: '颜色' },
        { id: 'layout', label: '布局' },
        { id: 'advanced', label: '高级' },
      ],
    };
  },
  computed: {
    isWindowMode() {
      return this.setting.mode === 'window';
    },
  },
  methods: {
    iconFor,
    applyPalette(p) {
      this.setting.lineColor = p.line;
      this.setting.shadowColor = p.shadow;
    },
  },
};
</script>

<style lang="scss" scoped>
/* ============================================================
   Visualizer Panel — 独立主题系统
   ------------------------------------------------------------
   - 使用 CSS 变量集中管理颜色 / 边框 / 阴影，适配 [data-theme]
   - 通过 isolation:isolate + 样式 reset 防止应用全局 button/input
     样式（如 main.scss 中的全局设置）污染面板内部控件
   - 所有交互元素均限定在 .vis-panel 内，避免优先级冲突
   ============================================================ */
.vis-panel {
  /* 暗色（默认） */
  --vp-bg: rgba(28, 28, 38, 0.88);
  --vp-fg: rgba(255, 255, 255, 0.95);
  --vp-fg-soft: rgba(255, 255, 255, 0.65);
  --vp-fg-muted: rgba(255, 255, 255, 0.42);
  --vp-border: rgba(255, 255, 255, 0.1);
  --vp-border-strong: rgba(255, 255, 255, 0.18);
  --vp-surface: rgba(255, 255, 255, 0.05);
  --vp-surface-hover: rgba(255, 255, 255, 0.1);
  --vp-input-bg: rgba(0, 0, 0, 0.28);
  --vp-accent: #4f9dff;
  --vp-accent-2: #b76bff;
  --vp-accent-glow: rgba(79, 157, 255, 0.45);
  --vp-shadow: 0 16px 56px rgba(0, 0, 0, 0.5);

  position: fixed;
  /* FAB \u5728 top:80 right:24 \u5904\uff0c\u9762\u677f\u4e0b\u79fb 56px \u907f\u5f00\uff1b
     z=401 \u9ad8\u4e8e FAB(400) \u4ee5\u9632\u88ab FAB \u906e\u4f4f\u53f3\u4e0a\u89d2\u4ea4\u4e92 */
  top: 136px;
  right: 16px;
  z-index: 401;
  width: 340px;
  max-height: calc(100vh - 152px);
  display: flex;
  flex-direction: column;
  overflow: hidden;
  isolation: isolate; /* 新堆叠上下文 + 避免 mix-blend 泄漏 */
  border-radius: 18px;
  border: 1px solid var(--vp-border);
  background: var(--vp-bg);
  backdrop-filter: blur(28px) saturate(180%);
  -webkit-backdrop-filter: blur(28px) saturate(180%);
  color: var(--vp-fg);
  box-shadow: var(--vp-shadow);
  font: 500 13px/1.45 -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto,
    'PingFang SC', 'Hiragino Sans GB', 'Microsoft YaHei', sans-serif;
  text-align: left;
  letter-spacing: 0;

  /* ---- 全局渲染 reset，仅作用于面板内部 ---- */
  & * {
    box-sizing: border-box;
  }
  & button {
    font: inherit;
    color: inherit;
    margin: 0;
    padding: 0;
    background: transparent;
    border: 0;
    cursor: pointer;
    line-height: 1.2;
    text-transform: none;
    letter-spacing: inherit;
    -webkit-tap-highlight-color: transparent;
  }
  & input,
  & label,
  & span {
    font: inherit;
    color: inherit;
  }
  & input[type='range'],
  & input[type='number'],
  & input[type='color'],
  & input[type='checkbox'] {
    margin: 0;
    padding: 0;
  }
}
[data-theme='light'] .vis-panel {
  --vp-bg: rgba(255, 255, 255, 0.92);
  --vp-fg: rgba(20, 20, 28, 0.92);
  --vp-fg-soft: rgba(20, 20, 28, 0.62);
  --vp-fg-muted: rgba(20, 20, 28, 0.42);
  --vp-border: rgba(0, 0, 0, 0.08);
  --vp-border-strong: rgba(0, 0, 0, 0.18);
  --vp-surface: rgba(0, 0, 0, 0.03);
  --vp-surface-hover: rgba(0, 0, 0, 0.06);
  --vp-input-bg: rgba(255, 255, 255, 0.8);
  --vp-shadow: 0 16px 56px rgba(0, 0, 0, 0.18);
}

/* 进出场动画 */
.vis-panel-enter-active,
.vis-panel-leave-active {
  transition: transform 0.25s cubic-bezier(0.2, 0.9, 0.25, 1), opacity 0.2s ease;
}
.vis-panel-enter,
.vis-panel-leave-to {
  opacity: 0;
  transform: translateX(24px) scale(0.96);
}

/* ---------- 头部 ---------- */
.vis-panel .vp-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 14px 16px 10px;
  border-bottom: 1px solid var(--vp-border);
}
.vis-panel .vp-title {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  font-weight: 700;
  font-size: 14px;
  color: var(--vp-fg);
  svg {
    color: var(--vp-accent);
  }
}
.vis-panel .vp-actions {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}
.vis-panel .icon-btn {
  width: 30px;
  height: 30px;
  border-radius: 8px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: var(--vp-fg-soft);
  transition: background 0.15s, color 0.15s;
  &:hover {
    background: var(--vp-surface-hover);
    color: var(--vp-fg);
  }
  &.on {
    background: var(--vp-accent-glow);
    color: var(--vp-accent);
  }
}

/* ---------- 模式选择 ---------- */
.vis-panel .vp-modes {
  display: grid;
  grid-template-columns: repeat(5, 1fr);
  gap: 6px;
  padding: 12px;
}
.vis-panel .mode-tile {
  border: 1px solid var(--vp-border);
  background: var(--vp-surface);
  border-radius: 12px;
  color: var(--vp-fg-soft);
  padding: 8px 4px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  transition: background 0.18s, color 0.18s, transform 0.18s, box-shadow 0.18s;
  font-size: 10px;
  font-weight: 600;
  span {
    line-height: 1.1;
    text-align: center;
  }
  &:hover {
    background: var(--vp-surface-hover);
    color: var(--vp-fg);
  }
  &.active {
    color: #fff;
    background: linear-gradient(135deg, var(--vp-accent), var(--vp-accent-2));
    border-color: transparent;
    box-shadow: 0 4px 16px var(--vp-accent-glow);
  }
}

/* ---------- Tabs ---------- */
.vis-panel .vp-tabs {
  display: flex;
  gap: 4px;
  padding: 0 12px;
  border-bottom: 1px solid var(--vp-border);
  button {
    flex: 1;
    padding: 10px 0;
    color: var(--vp-fg-soft);
    font-size: 13px;
    border-bottom: 2px solid transparent;
    transition: color 0.15s, border-color 0.15s;
    &:hover {
      color: var(--vp-fg);
    }
    &.active {
      color: var(--vp-fg);
      border-bottom-color: var(--vp-accent);
    }
  }
}

/* ---------- Body & Rows ---------- */
.vis-panel .vp-body {
  padding: 12px;
  overflow-y: auto;
  scrollbar-width: thin;
}
.vis-panel .row {
  display: grid;
  grid-template-columns: 80px 1fr 48px;
  align-items: center;
  gap: 10px;
  padding: 6px 0;
  & > label {
    color: var(--vp-fg-soft);
    font-size: 12px;
    font-weight: 500;
  }
  .val {
    text-align: right;
    font-variant-numeric: tabular-nums;
    color: var(--vp-fg);
    font-size: 12px;
    font-weight: 600;
  }
}
.vis-panel .row.toggle-row {
  grid-template-columns: 80px 1fr;
}

/* Range slider */
.vis-panel input[type='range'] {
  -webkit-appearance: none;
  appearance: none;
  width: 100%;
  height: 4px;
  background: var(--vp-border-strong);
  border-radius: 4px;
  outline: none;
  cursor: pointer;
  &::-webkit-slider-thumb {
    -webkit-appearance: none;
    appearance: none;
    width: 14px;
    height: 14px;
    border-radius: 50%;
    background: var(--vp-accent);
    box-shadow: 0 0 0 4px rgba(79, 157, 255, 0.18);
    transition: transform 0.15s;
  }
  &::-webkit-slider-thumb:active {
    transform: scale(1.18);
  }
  &::-moz-range-thumb {
    width: 14px;
    height: 14px;
    border: none;
    border-radius: 50%;
    background: var(--vp-accent);
  }
}

/* Number input */
.vis-panel .num-input {
  width: 72px;
  background: var(--vp-input-bg);
  color: var(--vp-fg);
  border: 1px solid var(--vp-border);
  border-radius: 8px;
  padding: 4px 8px;
  font: inherit;
  appearance: textfield;
  -webkit-appearance: textfield;
  outline: none;
  &:focus {
    border-color: var(--vp-accent);
    box-shadow: 0 0 0 3px var(--vp-accent-glow);
  }
  &::-webkit-outer-spin-button,
  &::-webkit-inner-spin-button {
    -webkit-appearance: none;
    margin: 0;
  }
}

/* Segmented control */
.vis-panel .seg {
  display: inline-flex;
  border: 1px solid var(--vp-border);
  border-radius: 10px;
  overflow: hidden;
  button {
    color: var(--vp-fg-soft);
    padding: 6px 14px;
    font-size: 12px;
    font-weight: 600;
    transition: background 0.15s, color 0.15s;
    &:hover {
      color: var(--vp-fg);
    }
    &.on {
      background: var(--vp-accent);
      color: #fff;
    }
  }
}

/* Ghost button */
.vis-panel .ghost-btn {
  margin-top: 6px;
  width: 100%;
  padding: 8px 12px;
  border-radius: 10px;
  border: 1px dashed var(--vp-border-strong);
  color: var(--vp-fg-soft);
  font-weight: 600;
  transition: background 0.15s, color 0.15s, border-color 0.15s;
  &:hover {
    background: var(--vp-surface-hover);
    color: var(--vp-fg);
    border-style: solid;
  }
}

/* iOS-style switch */
.vis-panel .vp-switch {
  position: relative;
  width: 38px;
  height: 22px;
  cursor: pointer;
  input {
    display: none;
  }
  .track {
    display: block;
    width: 100%;
    height: 100%;
    border-radius: 999px;
    background: var(--vp-border-strong);
    transition: background 0.2s;
    position: relative;
  }
  .thumb {
    position: absolute;
    top: 2px;
    left: 2px;
    width: 18px;
    height: 18px;
    border-radius: 50%;
    background: #fff;
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.25);
    transition: transform 0.2s cubic-bezier(0.2, 0.9, 0.25, 1);
  }
  input:checked + .track {
    background: var(--vp-accent);
  }
  input:checked + .track .thumb {
    transform: translateX(16px);
  }
}

/* Mini switch */
.vis-panel .mini-switch {
  position: relative;
  width: 32px;
  height: 18px;
  cursor: pointer;
  input {
    display: none;
  }
  span {
    position: absolute;
    inset: 0;
    background: var(--vp-border-strong);
    border-radius: 999px;
    transition: background 0.2s;
    &::after {
      content: '';
      position: absolute;
      top: 2px;
      left: 2px;
      width: 14px;
      height: 14px;
      background: #fff;
      border-radius: 50%;
      transition: transform 0.2s;
    }
  }
  input:checked + span {
    background: var(--vp-accent);
  }
  input:checked + span::after {
    transform: translateX(14px);
  }
}

/* Color picker */
.vis-panel .color-pick {
  position: relative;
  display: inline-flex;
  align-items: center;
  gap: 8px;
  input[type='color'] {
    position: absolute;
    opacity: 0;
    inset: 0;
    width: 100%;
    height: 100%;
    cursor: pointer;
  }
  .swatch {
    display: inline-block;
    width: 26px;
    height: 26px;
    border-radius: 8px;
    border: 1px solid var(--vp-border);
    box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.1);
  }
}

/* Palette */
.vis-panel .palette-row {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 0 2px;
  flex-wrap: wrap;
}
.vis-panel .palette-label {
  color: var(--vp-fg-soft);
  font-size: 12px;
  font-weight: 600;
  width: 80px;
}
.vis-panel .palette-chip {
  width: 24px;
  height: 24px;
  border-radius: 50%;
  border: 1px solid var(--vp-border);
  transition: transform 0.15s;
  &:hover {
    transform: scale(1.15);
  }
}

/* Tip */
.vis-panel .tip {
  margin: 12px 2px 0;
  font-size: 11px;
  color: var(--vp-fg-muted);
  line-height: 1.55;
  b {
    color: var(--vp-fg-soft);
    font-weight: 700;
  }
  &.muted {
    color: var(--vp-fg-muted);
  }
}
</style>
