<template>
  <button class="button-icon"><slot></slot></button>
</template>

<script setup lang="ts"></script>

<style lang="scss" scoped>
button {
  display: flex;
  justify-content: center;
  align-items: center;
  padding: 8px;
  background: transparent;
  margin: 4px;
  border-radius: 25%;
  transition: 0.2s;
  // Vue3 不再把宿主 scopeId 盖到 slot 内容根节点，须 :deep() 穿透（Vue2 时代隐式可用）
  :deep(.svg-icon) {
    color: var(--color-text);
    height: 16px;
    width: 16px;
  }
  &:first-child {
    margin-left: 0;
  }
  &:hover {
    background: var(--color-secondary-bg-for-transparent);
  }
  &:active {
    transform: scale(0.92);
  }
}
</style>
