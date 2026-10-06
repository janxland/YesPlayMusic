<template>
  <div class="lastfm-callback">
    <div class="section-1">
      <img src="@/assets/img/logos/yesplaymusic.png" />
      <svg-icon icon-class="x"></svg-icon>
      <img src="@/assets/img/logos/lastfm.png" />
    </div>
    <div class="message">{{ message }}</div>
    <button v-show="done" @click="close"> 完成 </button>
  </div>
</template>

<script setup lang="ts">
import { authGetSession } from '@/api/lastfm';
import { ref } from 'vue';
import { useDataStore } from '@/stores';

const dataStore = useDataStore();

const message = ref<any>('请稍等...');

const done = ref<any>(false);

function close() {
  window.close();
}

(() => {
  const token = new URLSearchParams(window.location.search).get('token');
  if (!token) {
    message.value = '连接失败，请重试或联系开发者（无Token）';
    done.value = true;
    return;
  }
  authGetSession(token).then(result => {
    if (!result.data.session) {
      message.value = '连接失败，请重试或联系开发者（无Session）';
      done.value = true;
      return;
    }
    localStorage.setItem('lastfm', JSON.stringify(result.data.session));
    dataStore.updateLastfm(result.data.session);
    message.value = '已成功连接到 Last.fm';
    done.value = true;
  }).catch(() => {
    // 会话换取失败（网络/Token 过期）时页面必须给出终态，不能停在"请稍等..."
    message.value = '连接失败，请检查网络后重试';
    done.value = true;
  });
})();
</script>

<style lang="scss" scoped>
.lastfm-callback {
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  height: calc(100vh - 192px);
}
.section-1 {
  margin-bottom: 16px;
  display: flex;
  align-items: center;
  img {
    height: 64px;
    margin: 20px;
  }
  .svg-icon {
    height: 24px;
    width: 24px;
    color: rgba(82, 82, 82, 0.28);
  }
}

.message {
  font-size: 1.4rem;
  font-weight: 500;
  color: var(--color-text);
}

button {
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 16px;
  font-weight: 600;
  background-color: var(--color-primary-bg);
  color: var(--color-primary);
  border-radius: 8px;
  margin-top: 24px;
  transition: 0.2s;
  padding: 8px 16px;
  &:hover {
    transform: scale(1.06);
  }
  &:active {
    transform: scale(0.94);
  }
}
</style>
