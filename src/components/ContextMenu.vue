<template>
  <div class="context-menu">
    <div
      v-if="showMenu"
      ref="menuRef"
      class="menu"
      tabindex="-1"
      :style="{ top: top, left: left }"
      @blur="closeMenu"
      @click="closeMenu"
    >
      <slot></slot>
    </div>
  </div>
</template>

<script setup lang="ts">
// 关闭时通过 @close 通知宿主重置其右键状态，不再依赖 $parent 桥（Vue3 script setup 下不可靠，已移除）
const emit = defineEmits(['close']);

import { nextTick, ref, useTemplateRef } from 'vue';
import { usePlayerStore } from '@/stores/player';
import { useUiStore } from '@/stores/ui';
import { storeToRefs } from 'pinia';

const menuRef = useTemplateRef<HTMLElement>('menuRef');
const uiStore = useUiStore();

const { player } = storeToRefs(usePlayerStore());

const showMenu = ref(false);

const top = ref('0px');

const left = ref('0px');

function setMenu(inTop: number, inLeft: number) {
  let heightOffset = player.value.enabled ? 64 : 0;
  let largestHeight =
    window.innerHeight - menuRef.value.offsetHeight - heightOffset;
  let largestWidth = window.innerWidth - menuRef.value.offsetWidth - 25;
  if (inTop > largestHeight) inTop = largestHeight;
  if (inLeft > largestWidth) inLeft = largestWidth;
  // 参数改名为 inTop/inLeft：原迁移版被同名参数遮蔽 ref，赋值落空（与迁移前 this.top = top 语义不一致）
  top.value = inTop + 'px';
  left.value = inLeft + 'px';
}

function closeMenu() {
  showMenu.value = false;
  emit('close');
  uiStore.toggleScrolling(true);
}

function openMenu(e: MouseEvent) {
  showMenu.value = true;
  nextTick(function () {
    menuRef.value.focus();
    setMenu(e.y, e.x);
  });
  e.preventDefault();
  uiStore.toggleScrolling(false);
}

defineExpose({ openMenu, closeMenu });
</script>

<style lang="scss" scoped>
.context-menu {
  width: 100%;
  height: 100%;
  user-select: none;
}

.menu {
  position: fixed;
  min-width: 136px;
  max-width: 240px;
  list-style: none;
  background: rgba(255, 255, 255, 0.88);
  box-shadow: 0 6px 12px -4px rgba(0, 0, 0, 0.08);
  border: 1px solid rgba(0, 0, 0, 0.06);
  backdrop-filter: blur(12px);
  border-radius: 12px;
  box-sizing: border-box;
  padding: 6px;
  z-index: 1000;
  -webkit-app-region: no-drag;
  transition: background 125ms ease-out, opacity 125ms ease-out,
    transform 125ms ease-out;

  &:focus {
    outline: none;
  }
}

[data-theme='dark'] {
  .menu {
    background: rgba(36, 36, 36, 0.78);
    backdrop-filter: blur(16px) contrast(120%) brightness(60%);
    border: 1px solid rgba(255, 255, 255, 0.08);
    box-shadow: 0 0 6px rgba(255, 255, 255, 0.08);
  }
  .menu :deep(.item:hover) {
    color: var(--color-text);
  }
}

@supports (-moz-appearance: none) {
  .menu {
    background-color: var(--color-body-bg) !important;
  }
}

// 菜单项由宿主插槽传入，Vue3 下只带宿主 scope 属性不带本组件 data-v，必须 :deep() 才能命中
.menu :deep(.item) {
  font-weight: 600;
  font-size: 14px;
  padding: 10px 14px;
  border-radius: 8px;
  cursor: default;
  color: var(--color-text);
  display: flex;
  align-items: center;
  &:hover {
    color: var(--color-primary);
    background: var(--color-primary-bg-for-transparent);
    transition: opacity 125ms ease-out, transform 125ms ease-out;
  }
  &:active {
    opacity: 0.75;
    transform: scale(0.95);
  }

  .svg-icon {
    height: 16px;
    width: 16px;
    margin-right: 5px;
  }
}

.menu :deep(hr) {
  margin: 4px 10px;
  background: rgba(128, 128, 128, 0.18);
  height: 1px;
  box-shadow: none;
  border: none;
}

.menu :deep(.item-info) {
  padding: 10px 10px;
  display: flex;
  align-items: center;
  color: var(--color-text);
  cursor: default;
  img {
    height: 38px;
    width: 38px;
    border-radius: 4px;
  }
  .info {
    margin-left: 10px;
  }
  .title {
    font-size: 16px;
    font-weight: 600;
    display: -webkit-box;
    -webkit-box-orient: vertical;
    -webkit-line-clamp: 1;
    overflow: hidden;
    word-break: break-all;
  }
  .subtitle {
    font-size: 12px;
    opacity: 0.68;
    display: -webkit-box;
    -webkit-box-orient: vertical;
    -webkit-line-clamp: 1;
    overflow: hidden;
    word-break: break-all;
  }
}
</style>
