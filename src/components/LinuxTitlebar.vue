<template>
  <div class="linux-titlebar">
    <div class="logo">
      <img src="@/assets/img/logos/yesplaymusic-white24x24.png" />
    </div>
    <div class="title">{{ title }}</div>
    <div class="controls">
      <div
        class="button minimize codicon codicon-chrome-minimize"
        @click="windowMinimize"
      ></div>
      <div
        class="button max-restore codicon"
        :class="{
          'codicon-chrome-restore': isMaximized,
          'codicon-chrome-maximize': !isMaximized,
        }"
        @click="windowMaxRestore"
      ></div>
      <div
        class="button close codicon codicon-chrome-close"
        @click="windowClose"
      ></div>
    </div>
  </div>
</template>

<script setup lang="ts">
// codicon 字体 71KB 且只有桌面端标题栏用：随本组件按需加载（Navbar 里 defineAsyncComponent）
import 'vscode-codicons/dist/codicon.css';
import { ipcBridge } from '@/platform/bridge';
import { isDesktop } from '@/platform/env';
import { ref, onBeforeUnmount } from 'vue';
import { useUiStore } from '@/stores/ui';
import { storeToRefs } from 'pinia';

const uiStore = useUiStore();

const { title } = storeToRefs(uiStore);

const isMaximized = ref<any>(false);

function windowMinimize() {
  ipcBridge.send('minimize');
}

function windowMaxRestore() {
  ipcBridge.send('maximizeOrUnmaximize');
}

function windowClose() {
  ipcBridge.send('close');
}

let offIsMaximized: (() => void) | null = null;
if (isDesktop()) {
  offIsMaximized = ipcBridge.on('isMaximized', (_, value) => {
    isMaximized.value = value;
  });
}

onBeforeUnmount(function beforeUnmount() {
  // ipcBridge.on 返回注销函数；卸载后不摘除会把监听和组件作用域一起钉死
  offIsMaximized?.();
  offIsMaximized = null;
});
</script>

<style lang="scss" scoped>
.linux-titlebar {
  color: var(--color-text);
  position: fixed;
  left: 0;
  top: 0;
  right: 0;
  -webkit-app-region: drag;
  display: flex;
  align-items: center;
  --hover: #e6e6e6;
  --active: #cccccc;

  .logo {
    padding: 0 8px;
  }

  .title {
    padding: 8px;
    font-size: 12px;
    font-family: 'Segoe UI', 'Microsoft YaHei UI', 'Microsoft YaHei', sans-serif;
    justify-self: center;
    margin: 0 auto;
  }
  .controls {
    height: 32px;
    justify-content: flex-end;
    display: flex;
    .button {
      height: 100%;
      width: 46px;
      font-size: 16px;
      display: flex;
      justify-content: center;
      align-items: center;
      -webkit-app-region: no-drag;
      &:hover {
        background: var(--hover);
      }
      &:active {
        background: var(--active);
      }
      &.close {
        &:hover {
          background: #c42c1b;
          color: rgba(255, 255, 255, 0.8);
        }
        &:active {
          background: #f1707a;
          color: #000;
        }
      }
    }
  }
}
[data-theme='dark'] .linux-titlebar {
  --hover: #191919;
  --active: #333333;
}
</style>
