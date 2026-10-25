<template>
  <Modal
    class="api-blocked-modal"
    v-model:show="show"
    :show-footer="false"
    :title="$t('modal.apiBlockedTitle')"
    width="25vw"
  >
    <template #default>
      <div class="icon-badge">
        <svg-icon icon-class="globe" />
      </div>
      <p class="desc">{{ $t('modal.apiBlockedDesc') }}</p>
      <div class="status-chip">HTTP 402 · Payment Required</div>
      <div class="steps">
        <div class="step">
          <div class="num">1</div>
          <div class="text">{{ $t('modal.apiBlockedStep1') }}</div>
        </div>
        <div class="step">
          <div class="num">2</div>
          <div class="text">{{ $t('modal.apiBlockedStep2') }}</div>
        </div>
      </div>
      <div class="actions">
        <button class="later" @click="show = false">{{
          $t('modal.apiBlockedLater')
        }}</button>
        <button class="retry" @click="reload">{{
          $t('modal.apiBlockedRefresh')
        }}</button>
      </div>
    </template>
  </Modal>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { storeToRefs } from 'pinia';
import Modal from '@/components/Modal.vue';
import { useUiStore } from '@/stores/ui';

const uiStore = useUiStore();
const { modals } = storeToRefs(uiStore);

const show = computed({
  get() {
    return modals.value.apiBlockedModal.show;
  },
  set(value) {
    // 关闭时记录时间戳，供入口 onApiBlocked 做 60s 限流重弹
    if (!value) {
      modals.value.apiBlockedModal.lastDismissedAt = Date.now();
    }
    uiStore.updateModal({
      modalName: 'apiBlockedModal',
      key: 'show',
      value,
    });
  },
});

function reload() {
  window.location.reload();
}
</script>

<style lang="scss" scoped>
.icon-badge {
  margin: 4px auto 18px;
  width: 72px;
  height: 72px;
  border-radius: 50%;
  display: flex;
  justify-content: center;
  align-items: center;
  background: var(--color-primary-gradient);
  color: #fff;
  box-shadow: 0 10px 28px -10px rgba(51, 94, 234, 0.55);
  .svg-icon {
    height: 34px;
    width: 34px;
  }
}

.desc {
  margin: 0;
  font-size: 14px;
  line-height: 1.7;
  text-align: center;
  color: var(--color-text);
  opacity: 0.82;
}

.status-chip {
  display: table;
  margin: 14px auto 0;
  padding: 3px 12px;
  border-radius: 6px;
  font-size: 12px;
  font-family: 'JetBrains Mono', 'SF Mono', Menlo, Consolas, monospace;
  letter-spacing: 0.3px;
  background: rgba(235, 87, 87, 0.12);
  color: #eb5757;
}

.steps {
  margin-top: 22px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.step {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  .num {
    flex-shrink: 0;
    margin-top: 1px;
    width: 20px;
    height: 20px;
    border-radius: 50%;
    display: flex;
    justify-content: center;
    align-items: center;
    font-size: 12px;
    font-weight: 600;
    background: var(--color-primary-bg);
    color: var(--color-primary);
  }
  .text {
    font-size: 13.5px;
    line-height: 1.6;
    color: var(--color-text);
    opacity: 0.88;
  }
}

.actions {
  margin-top: 24px;
  display: flex;
  justify-content: flex-end;
  gap: 12px;
  button {
    border: none;
    border-radius: 8px;
    padding: 8px 16px;
    font-size: 14px;
    cursor: pointer;
    transition: 0.2s;
    &:active {
      transform: scale(0.94);
    }
  }
  .later {
    color: var(--color-text);
    background: var(--color-secondary-bg-for-transparent);
  }
  .retry {
    color: var(--color-primary-bg);
    background: var(--color-primary-gradient);
    font-weight: 500;
  }
}
</style>
