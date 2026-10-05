<template>
  <div>
    <transition name="fade">
      <div
        v-show="show"
        id="scrollbar"
        :class="{ 'on-drag': isOnDrag }"
        @click="handleClick"
      >
        <div
          id="thumbContainer"
          :class="{ active }"
          :style="thumbStyle"
          @mouseenter="handleMouseenter"
          @mouseleave="handleMouseleave"
          @mousedown="handleDragStart"
          @click.stop
        >
          <div></div>
        </div>
      </div>
    </transition>
  </div>
</template>

<script setup lang="ts">
const router = useRouter();
const route = useRoute();
// 滚动容器（App 的 <main>）与「拖拽时禁止全局选中」一律走 props/emit，不再经 $parent 桥（Vue3 script setup 下不可靠）
import { computed, ref, onBeforeUnmount } from 'vue';

import { useRoute, useRouter } from 'vue-router';

const props = defineProps({
  scrollTarget: {
    type: Object as () => HTMLElement | null,
    default: null,
  },
});

// 拖动滚动条时通知宿主切换 user-select
const emit = defineEmits(['dragging']);

const top = ref(0);

const thumbHeight = ref(0);

const active = ref(false);

const show = ref(false);

const isOnDrag = ref(false);

// 以下私有状态从不进模板：普通变量即可，不必付响应式代理的开销
let hideTimer: ReturnType<typeof setTimeout> | null = null;

let onDragClientY = 0;

let positions: Record<string, { scrollTop: number; params: unknown }> = {
  home: { scrollTop: 0, params: {} },
};

const thumbStyle = computed(function thumbStyle() {
  return {
    transform: `translateY(${top.value}px)`,
    height: `${thumbHeight.value}px`,
  };
});

const main = computed(function main() {
  return props.scrollTarget;
});

function handleScroll() {
  if (!main.value) return;
  const clintHeight = main.value.clientHeight - 128;
  const scrollHeight = main.value.scrollHeight - 128;
  const scrollTop = main.value.scrollTop;
  // 局部变量改名 topOffset/newThumbHeight：原迁移版被同名局部变量遮蔽 ref，赋值落空
  let topOffset = ~~((scrollTop / scrollHeight) * clintHeight);
  let newThumbHeight = ~~((clintHeight / scrollHeight) * clintHeight);

  if (newThumbHeight < 24) newThumbHeight = 24;
  if (topOffset > clintHeight - newThumbHeight) {
    topOffset = clintHeight - newThumbHeight;
  }
  top.value = topOffset;
  thumbHeight.value = newThumbHeight;

  if (!show.value && clintHeight !== newThumbHeight) show.value = true;
  setScrollbarHideTimeout();

  if (route.meta.savePosition) {
    positions[route.name as string] = { scrollTop, params: route.params };
  }
}

function handleMouseenter() {
  active.value = true;
}

function handleMouseleave() {
  active.value = false;
  setScrollbarHideTimeout();
}

function handleDragStart(e: MouseEvent) {
  onDragClientY = e.clientY;
  isOnDrag.value = true;
  emit('dragging', true);
  document.addEventListener('mousemove', handleDragMove);
  document.addEventListener('mouseup', handleDragEnd);
}

function handleDragMove(e: MouseEvent) {
  if (!isOnDrag.value || !main.value) return;
  const clintHeight = main.value.clientHeight - 128;
  const scrollHeight = main.value.scrollHeight - 128;
  const clientY = e.clientY;
  const scrollTop = main.value.scrollTop;
  const offset = ~~(((clientY - onDragClientY) / clintHeight) * scrollHeight);
  top.value = ~~((scrollTop / scrollHeight) * clintHeight);
  main.value.scrollBy(0, offset);
  onDragClientY = clientY;
}

function handleDragEnd() {
  isOnDrag.value = false;
  emit('dragging', false);
  document.removeEventListener('mousemove', handleDragMove);
  document.removeEventListener('mouseup', handleDragEnd);
}

function handleClick(e: MouseEvent) {
  if (!main.value) return;
  let scrollTop;
  if (e.clientY < top.value + 84) {
    scrollTop = -256;
  } else {
    scrollTop = 256;
  }
  main.value.scrollBy({
    top: scrollTop,
    behavior: 'smooth',
  });
}

function setScrollbarHideTimeout() {
  if (hideTimer !== null) clearTimeout(hideTimer);
  hideTimer = setTimeout(() => {
    if (!active.value) show.value = false;
    hideTimer = null;
  }, 4000);
}

function restorePosition() {
  if (
    !route.meta.savePosition ||
    positions[route.name as string] === undefined ||
    !main.value
  ) {
    return;
  }
  main.value.scrollTo({ top: positions[route.name as string].scrollTop });
}

// beforeEach 返回注销函数，卸载后必须摘除守卫，否则闭包把组件作用域钉在路由器里造成永久泄漏
const removeRouteGuard = router.beforeEach((to, from, next) => {
  show.value = false;
  next();
});

onBeforeUnmount(function beforeUnmount() {
  removeRouteGuard();
  if (hideTimer !== null) {
    clearTimeout(hideTimer);
    hideTimer = null;
  }
});

defineExpose({ handleScroll, restorePosition });
</script>

<style lang="scss" scoped>
#scrollbar {
  position: absolute;
  right: 0;
  top: 0;
  bottom: 0;
  width: 16px;
  z-index: 1000;

  #thumbContainer {
    margin-top: 64px;
    div {
      transition: background 0.4s;
      position: absolute;
      right: 2px;
      width: 8px;
      height: 100%;
      border-radius: 4px;
      background: rgba(128, 128, 128, 0.38);
    }
  }
  #thumbContainer.active div {
    background: rgba(128, 128, 128, 0.58);
  }
}

[data-theme='dark'] {
  #thumbContainer div {
    background: var(--color-secondary-bg);
  }
}

#scrollbar.on-drag {
  left: 0;
  width: auto;
}

.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.2s;
}
.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}
</style>
