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
      ref="frameRef"
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

<script setup lang="ts">
// Vue2 时代挂在实例上的私有句柄（非响应式），降为模块级变量
let _audioOff = null;
let _fadeSafetyTimer = null;
let _fadeTimer = null;
let _onVis = null;
let _readyOff = null;
let _rebindTimer = null;
// 轮询/防抖计时器同样只是私有句柄，从不进模板：普通变量即可，不必进 ref
let _bootTimer: ReturnType<typeof setInterval> | null = null;
let _saveTimer: ReturnType<typeof setTimeout> | null = null;

// 仅本组件读写的私有全局开关（env.d.ts 归全局，这里组件内局部收敛类型）
const globalFlags = window as { __YPM_AV_ENABLED__?: boolean };

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
// Panel 保持异步 chunk：不打开面板就不下载这 1000+ 行的组件
const VisualizerPanel = defineAsyncComponent(
  () => import('./visualizer/VisualizerPanel.vue')
);
import {
  ref,
  shallowRef,
  computed,
  watch,
  onMounted,
  onBeforeUnmount,
  defineAsyncComponent,
  useTemplateRef,
} from 'vue';
import { usePlayerStore } from '@/stores/player';
import { useUiStore } from '@/stores/ui';
import { storeToRefs } from 'pinia';
import { player as playerInstance } from '@/player/singleton';

// 模板 ref 用 useTemplateRef：类型更准，避免被当成数据 ref 误用
const frameRef =
  useTemplateRef<{ getCanvas: () => HTMLCanvasElement }>('frameRef');

const { player } = storeToRefs(usePlayerStore());
const { showLyrics } = storeToRefs(useUiStore());

// AudioVisual 内含 canvas ctx / AudioNode / Worker / RAF 循环等重对象且从不进模板渲染：shallowRef 避免实例被深度 reactive 代理（同为非响应式句柄）
const AV = shallowRef<AudioVisual | null>(null);

const ui = loadUiState();
const enabled = ref(ui.enabled);

const panelOpen = ref(ui.panelOpen);

const editLayout = ref<any>(false);

const setting = ref(loadSetting());

const docHidden = ref(
  typeof document !== 'undefined' ? !!document.hidden : false
);

const isWindowMode = computed(function isWindowMode() {
  return setting.value.mode === 'window';
});

const shouldRun = computed(function shouldRun() {
  return enabled.value && showLyrics.value && !docHidden.value;
});

function toggleEnabled() {
  enabled.value ? stop() : start();
}

function toggleLayoutEdit() {
  if (!editLayout.value && !isWindowMode.value) setting.value.mode = 'window';
  editLayout.value = !editLayout.value;
}

function resetBounds() {
  setting.value.bounds = { ...DEFAULT_BOUNDS };
}

function stop() {
  enabled.value = false;
  try {
    globalFlags.__YPM_AV_ENABLED__ = false;
  } catch (_) {}
  _teardown();
}

function _pause() {
  _clearBootTimer();
  _clearReadyListener();
  if (AV.value) AV.value.stop();
}

function _resume() {
  if (!enabled.value) return;
  if (AV.value) {
    AV.value.refresh();
    AV.value.start();
  } else {
    start();
  }
}

function _teardown() {
  _clearBootTimer();
  _clearRebindTimer();
  _clearReadyListener();
  _unbindAudioEvents();
  if (_fadeTimer) {
    clearTimeout(_fadeTimer);
    _fadeTimer = null;
  }
  if (_fadeSafetyTimer) {
    clearTimeout(_fadeSafetyTimer);
    _fadeSafetyTimer = null;
  }
  if (AV.value) {
    AV.value.destroy();
    AV.value = null;
  }
}

function _clearBootTimer() {
  if (_bootTimer) {
    clearInterval(_bootTimer);
    _bootTimer = null;
  }
}

function _clearRebindTimer() {
  if (_rebindTimer) {
    clearInterval(_rebindTimer);
    _rebindTimer = null;
  }
}

function _clearReadyListener() {
  if (_readyOff) {
    _readyOff();
    _readyOff = null;
  }
}

function _waitAudioReady(node, retry) {
  _clearReadyListener();
  const handler = () => {
    _clearReadyListener();
    if (!shouldRun.value) return;
    retry();
  };
  node.addEventListener('playing', handler, { once: true });
  node.addEventListener('loadeddata', handler, { once: true });
  _readyOff = () => {
    node.removeEventListener('playing', handler);
    node.removeEventListener('loadeddata', handler);
  };
}

function start() {
  enabled.value = true;
  try {
    globalFlags.__YPM_AV_ENABLED__ = true;
  } catch (_) {}
  if (!shouldRun.value) return;
  _tryAttach();
}

function _tryAttach() {
  if (AV.value) return;
  _clearBootTimer();
  let tries = 0;
  _bootTimer = setInterval(() => {
    tries++;
    if (AV.value || !shouldRun.value) {
      _clearBootTimer();
      return;
    }
    // _howler 不进 store 镜像（类实例不入响应式系统，见 player/singleton.ts），必须从单例直读；本函数本就是 setInterval 轮询，无需响应性
    const node = playerInstance._howler?._sounds?.[0]?._node;
    const canvas = frameRef.value?.getCanvas();
    if (node && canvas && isLoggedIn()) {
      _clearBootTimer();
      _attachTo(node, canvas);
    } else if (tries > 25) {
      _clearBootTimer();
    }
  }, 200);
}

function _attachTo(node, canvas) {
  // 不设置 crossOrigin：第三方音源 (kuwo/qq/migu/joox 等) 不返回 Access-Control-Allow-Origin，带 Origin 头将被 CORS 拦截导致无法播放；
  // 播放优先，可视化对这些源因 captureStream tainted 而无声/失败，已可接受
  try {
    AV.value = new AudioVisual(canvas, node, setting.value);
    AV.value.loadMusic(node.context, node);
    _bindAudioEvents(node);
    _fadeInCanvas();
  } catch (err) {
    _handleAttachError(err, node, () => _attachTo(node, canvas));
  }
}

function _bindAudioEvents(node) {
  _unbindAudioEvents();
  const onSeeking = () => _fadeOutCanvas();
  const onSeeked = () => _fadeInCanvas();
  node.addEventListener('seeking', onSeeking);
  node.addEventListener('seeked', onSeeked);
  _audioOff = () => {
    try {
      node.removeEventListener('seeking', onSeeking);
      node.removeEventListener('seeked', onSeeked);
    } catch (_) {}
  };
}

function _unbindAudioEvents() {
  if (_audioOff) {
    _audioOff();
    _audioOff = null;
  }
}

function _getCanvas() {
  return frameRef.value?.getCanvas();
}

function _fadeOutCanvas() {
  const c = _getCanvas();
  if (!c) return;
  c.style.opacity = '0';
  // 取消已有的恢复计时，防止快速 seek 连击调乱状态
  if (_fadeTimer) {
    clearTimeout(_fadeTimer);
    _fadeTimer = null;
  }
  // 兜底：1.2s 内若仍未触发 fadeIn（attach 失败 / NOT_SUPPORTED 等），强制恢复显示避免画布永远透明造成"黑屏"
  if (_fadeSafetyTimer) clearTimeout(_fadeSafetyTimer);
  _fadeSafetyTimer = setTimeout(() => {
    _fadeSafetyTimer = null;
    const cc = _getCanvas();
    if (cc && cc.style.opacity === '0') cc.style.opacity = '1';
  }, 1200);
}

function _fadeInCanvas() {
  const c = _getCanvas();
  if (!c) return;
  // 给 AV 一小段充分时间走完重建（captureStream + worker AGC 冷启动），避免淑入后第一帧仍是"质变"画面
  if (_fadeTimer) clearTimeout(_fadeTimer);
  if (_fadeSafetyTimer) {
    clearTimeout(_fadeSafetyTimer);
    _fadeSafetyTimer = null;
  }
  _fadeTimer = setTimeout(() => {
    _fadeTimer = null;
    const cc = _getCanvas();
    if (cc) cc.style.opacity = '1';
  }, 60);
}

function _handleAttachError(err, node, retry) {
  if (AV.value) {
    try {
      AV.value.destroy();
    } catch (_) {}
    AV.value = null;
  }
  const code = err && err.code;
  if (code === 'AV_NOT_READY') {
    // 新 audio 还没真正出声，等 'playing' 后再来一次
    _waitAudioReady(node, retry);
    return;
  }
  if (code === 'AV_NOT_SUPPORTED') {
    console.warn(
      '[Visualization] 当前环境不支持 captureStream，已跳过可视化以保证播放。'
    );
    return;
  }
  console.error('[Visualization] AV init failed', err);
}

function _rebindToNewAudio() {
  _clearRebindTimer();
  _clearReadyListener();
  _unbindAudioEvents();
  _fadeOutCanvas();
  // 立刻把旧 AV 整个拆掉：worker terminate / source disconnect / stream tracks stop —— 与 destroy() 完全一致
  if (AV.value) {
    try {
      AV.value.destroy();
    } catch (_) {}
    AV.value = null;
  }
  // 走与刷新相同的"等 _node + canvas 就绪 → _attachTo"路径。
  _tryAttach();
}

function _beginDrag(e, mutate) {
  const startX = e.clientX;
  const startY = e.clientY;
  const sb = { ...setting.value.bounds };
  const W = window.innerWidth;
  const H = window.innerHeight;
  const prevSel = document.body.style.userSelect;
  document.body.style.userSelect = 'none';
  const move = ev => {
    setting.value.bounds = mutate(
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
}

function onDragWindow(e) {
  _beginDrag(e, (sb, dx, dy) => ({
    ...sb,
    x: Math.max(0, Math.min(1 - sb.w, sb.x + dx)),
    y: Math.max(0, Math.min(1 - sb.h, sb.y + dy)),
  }));
}

function onResizeWindow(e) {
  _beginDrag(e, (sb, dx, dy) => ({
    ...sb,
    w: Math.max(0.1, Math.min(1 - sb.x, sb.w + dx)),
    h: Math.max(0.1, Math.min(1 - sb.y, sb.h + dy)),
  }));
}

watch(
  setting,
  function (v) {
    if (AV.value) {
      AV.value.setSetting(v);
      AV.value.refresh();
    }
    if (_saveTimer) clearTimeout(_saveTimer);
    _saveTimer = setTimeout(() => saveSetting(v), 300);
  },
  {
    deep: true,
  }
);

watch(enabled, function (v) {
  saveUiState({ enabled: v, panelOpen: panelOpen.value });
});

watch(panelOpen, function (v) {
  saveUiState({ enabled: enabled.value, panelOpen: v });
});

watch(shouldRun, function (v) {
  if (v) _resume();
  else _pause();
});

watch(
  () => player.value.currentTrack.id,
  function () {
    if (!shouldRun.value) return;
    // 切歌一律完整重建 AV（与刷新等价），力度/状态完全一致
    _rebindToNewAudio();
  }
);

onMounted(function mounted() {
  try {
    globalFlags.__YPM_AV_ENABLED__ = !!enabled.value;
  } catch (_) {}
  _onVis = () => {
    docHidden.value = !!document.hidden;
  };
  document.addEventListener('visibilitychange', _onVis);
  if (shouldRun.value) start();
});

onBeforeUnmount(function beforeUnmount() {
  if (_saveTimer) clearTimeout(_saveTimer);
  if (_onVis) {
    document.removeEventListener('visibilitychange', _onVis);
    _onVis = null;
  }
  _teardown();
});
</script>

<style lang="scss" scoped>
/* display:contents：宿主元素不参与布局/堆叠，避免在歌词页内产生新的 stacking context；三个子层各自 fixed 定位、独立 z-index */
.vis-host {
  display: contents;
}
</style>
