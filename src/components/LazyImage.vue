<template>
  <img
    ref="imgRef"
    v-bind="$attrs"
    :src="displaySrc || undefined"
    :alt="alt"
    :class="rootClass"
    :style="lqipUnderlayStyle"
    @load="onLoad"
    @error="onError"
  />
</template>

<script setup lang="ts">
// Vue2 实例字段（非响应式，仅作预加载去重句柄）
let preloadImg: HTMLImageElement | null = null;
const attrs = useAttrs();

import imageLoadService, {
  imageLoadStrategies,
} from '@/utils/imageLoadService';
import { COVER_FALLBACK } from '@/utils/imageFallback';
import {
  computed,
  onBeforeUnmount,
  onMounted,
  ref,
  useAttrs,
  useTemplateRef,
  watch,
} from 'vue';
import { useSettingsStore } from '@/stores/settings';
import { storeToRefs } from 'pinia';

// $attrs 手动绑定到 img（class/referrerpolicy/事件监听透传给真身），关闭根元素自动继承避免同一批 attrs 应用两次
defineOptions({ inheritAttrs: false });

const imgRef = useTemplateRef<HTMLImageElement>('imgRef');
const { settings } = storeToRefs(useSettingsStore());

const props = defineProps({
  src: { type: String, required: true },
  alt: { type: String, default: '' },
  lqipSize: { type: Number, default: 32 },
});

const displaySrc = ref<any>('');

const phase = ref<any>('idle');

// 非 blur 策略没有 filter 过渡，靠这个一次性动画淡入，避免图片到达时硬蹦
const reveal = ref(false);
let revealTimer: ReturnType<typeof setTimeout> | null = null;

const strategyName = computed(function strategyName() {
  const name = settings.value.imageLoadEffect;
  return imageLoadStrategies[name] ? name : 'blur';
});

const strategy = computed(function strategy() {
  return imageLoadStrategies[strategyName.value];
});

const lqipUrl = computed(function lqipUrl() {
  return imageLoadService.getLqipUrl(props.src, props.lqipSize);
});

const lqipUnderlayStyle = computed(function lqipUnderlayStyle() {
  if (
    strategyName.value !== 'blur' ||
    (phase.value !== 'placeholder' && phase.value !== 'loading')
  ) {
    return undefined;
  }
  // 微缩图铺在 background 上垫底：src 从 LQIP 换成全图那一刻不会闪空帧
  return {
    backgroundImage: `url(${lqipUrl.value})`,
    backgroundSize: '100% 100%',
  };
});

const rootClass = computed(function rootClass() {
  const pending = phase.value !== 'done' && phase.value !== 'error';
  const classes = { 'lazy-image': true };
  if (pending && phase.value === 'idle' && props.src) {
    classes['lazy-image-idle'] = true;
  }
  if (pending && displaySrc.value && strategy.value.placeholderClass) {
    classes[strategy.value.placeholderClass] = true;
  } else if (pending && displaySrc.value && props.src) {
    // none 等无占位样式的策略，加载中也保留骨架底，避免整块空白
    classes['lazy-image-idle'] = true;
  }
  if (reveal.value) {
    classes['lazy-image-reveal'] = true;
  }
  return classes;
});

// 视口附近（含 rootMargin 同等的 200px 预载带）直接同步开始加载，
// 不等 IntersectionObserver 派发：窗口停帧/遮挡时 IO 回调会无限期延迟
function isNearViewport(el) {
  const rect = el.getBoundingClientRect();
  return (
    rect.width > 0 &&
    rect.top < window.innerHeight + 200 &&
    rect.bottom > -200
  );
}

function start() {
  cleanup();
  if (!props.src) return;
  if (
    props.src.startsWith('data:') ||
    props.src.startsWith('blob:') ||
    imageLoadService.isLoaded(props.src)
  ) {
    showFullImmediately();
    return;
  }
  const el = imgRef.value;
  if (el && isNearViewport(el)) {
    onIntersect();
    return;
  }
  imageLoadService.observe(el, onIntersect);
}

function showFullImmediately() {
  displaySrc.value = props.src;
  phase.value = 'done';
  imageLoadService.markLoaded(props.src);
}

function onIntersect() {
  if (strategy.value.useLqip && lqipUrl.value && lqipUrl.value !== props.src) {
    displaySrc.value = lqipUrl.value;
    phase.value = 'placeholder';
    preloadFull();
  } else {
    beginLoad();
  }
}

function beginLoad() {
  if (phase.value === 'done' || phase.value === 'error') return;
  displaySrc.value = props.src;
  phase.value = 'loading';
}

function preloadFull() {
  const img = new Image();
  // useAttrs() 的值类型是 unknown；referrerpolicy 只会是字符串字面量
  if (attrs.referrerpolicy) img.referrerPolicy = attrs.referrerpolicy as string;
  preloadImg = img;
  img.onload = () => {
    if (preloadImg !== img) return;
    beginLoad();
  };
  img.onerror = () => {
    if (preloadImg !== img) return;
    showError();
  };
  img.src = props.src;
}

function onLoad() {
  if (displaySrc.value !== props.src) return;
  const el = imgRef.value;
  if (el && el.decode) {
    // 后台标签页中 decode() 可能永不 resolve，超时兜底防止图片卡在模糊态
    const timeout = new Promise(resolve => setTimeout(resolve, 300));
    Promise.race([el.decode().catch(() => {}), timeout]).then(markDone);
  } else {
    markDone();
  }
}

function markDone() {
  if (phase.value === 'done' || phase.value === 'error') return;
  // blur 有自身的 filter 过渡；其余策略到达时做一次淡入
  if (strategyName.value !== 'blur') {
    reveal.value = true;
    if (revealTimer) clearTimeout(revealTimer);
    revealTimer = setTimeout(function () {
      reveal.value = false;
    }, 450);
  }
  phase.value = 'done';
  imageLoadService.markLoaded(props.src);
}

function onError() {
  // LQIP 加载失败静默跳过，继续等全图
  if (displaySrc.value === lqipUrl.value) return;
  showError();
}

function showError() {
  if (phase.value === 'error') return;
  phase.value = 'error';
  displaySrc.value = COVER_FALLBACK;
}

function cleanup() {
  imageLoadService.unobserve(imgRef.value);
  if (preloadImg) {
    preloadImg.onload = null;
    preloadImg.onerror = null;
    preloadImg.src = '';
    preloadImg = null;
  }
  if (revealTimer) {
    clearTimeout(revealTimer);
    revealTimer = null;
  }
  reveal.value = false;
  phase.value = 'idle';
  displaySrc.value = '';
}

watch(
  () => props.src,
  function () {
    start();
  }
);

watch(strategyName, function () {
  if (phase.value !== 'done' && phase.value !== 'error') start();
});

onMounted(function mounted() {
  preloadImg = null;
  start();
});

onBeforeUnmount(function beforeUnmount() {
  cleanup();
});
</script>

<style lang="scss" scoped>
.lazy-image {
  transition: opacity 0.4s ease, filter 0.4s ease, transform 0.4s ease;
}

.lazy-image-idle,
.lazy-image-fade {
  background-color: var(--color-secondary-bg);
}

// 加载中的可见骨架：微光扫过，替代和底色融为一体的空块
.lazy-image-idle,
.lazy-image-fade,
.lazy-image-glass {
  background-image: linear-gradient(
    100deg,
    transparent 35%,
    rgba(255, 255, 255, 0.05) 50%,
    transparent 65%
  );
  background-size: 200% 100%;
  animation: lazy-image-shimmer 1.6s ease-in-out infinite;
}

.lazy-image-blur {
  filter: blur(20px);
  transform: scale(1.1);
}

.lazy-image-glass {
  background-color: var(--color-secondary-bg-for-transparent);
  backdrop-filter: blur(12px);
}

.lazy-image-reveal {
  animation: lazy-image-reveal 0.4s ease;
}

@keyframes lazy-image-shimmer {
  from {
    background-position: 150% 0;
  }
  to {
    background-position: -50% 0;
  }
}

@keyframes lazy-image-reveal {
  from {
    opacity: 0;
  }
  to {
    opacity: 1;
  }
}
</style>
