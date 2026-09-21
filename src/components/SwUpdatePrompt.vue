<template>
  <transition name="fade">
    <div v-if="swNeedsRefresh" class="sw-update-prompt">
      <span>发现新版本</span>
      <button @click="refresh">刷新以更新</button>
    </div>
  </transition>
</template>

<script>
import { mapState } from 'vuex';

export default {
  name: 'SwUpdatePrompt',
  computed: mapState(['swNeedsRefresh']),
  methods: {
    // 新 SW 已 skipWaiting + clientsClaim 接管，重载一次即拿到全部新资源
    refresh() {
      window.location.reload();
    },
  },
};
</script>

<style lang="scss" scoped>
.sw-update-prompt {
  position: fixed;
  bottom: 64px;
  left: 50%;
  transform: translateX(-50%);
  display: flex;
  align-items: center;
  gap: 12px;
  font-size: 14px;
  color: var(--color-text);
  background: rgba(255, 255, 255, 0.88);
  box-shadow: 0 6px 12px -4px rgba(0, 0, 0, 0.08);
  border: 1px solid rgba(0, 0, 0, 0.06);
  backdrop-filter: blur(12px);
  border-radius: 8px;
  padding: 6px 12px;
  z-index: 1011;

  button {
    border: none;
    background: var(--color-primary);
    color: white;
    border-radius: 6px;
    padding: 4px 10px;
    cursor: pointer;
  }
}

[data-theme='dark'] .sw-update-prompt {
  background: rgba(46, 46, 46, 0.68);
  backdrop-filter: blur(16px) contrast(120%);
  border: 1px solid rgba(255, 255, 255, 0.08);
}

.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.2s;
}

.fade-enter,
.fade-leave-to {
  opacity: 0;
}
</style>
