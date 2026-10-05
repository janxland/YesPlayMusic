<template>
  <div class="login">
    <div>
      <div class="title">{{ $t('login.usernameLogin') }}</div>
      <div class="section">
        <div class="search-box">
          <div class="container">
            <svg-icon icon-class="search" />
            <div class="input">
              <input
                v-model="keyword"
                :placeholder="$t('login.searchHolder')"
                @keydown.enter="throttleSearch"
              />
            </div>
          </div>
        </div>
      </div>
      <div class="sestion">
        <div v-show="activeUser.nickname === undefined" class="name">
          {{ $t('login.enterTip') }}
        </div>
        <div v-show="activeUser.nickname !== undefined" class="name">
          {{ $t('login.choose') }}
        </div>
        <div class="user-list">
          <div
            v-for="user in result"
            :key="user.id"
            class="user"
            :class="{ active: user.nickname === activeUser.nickname }"
            @click="activeUser = user"
          >
            <LazyImage class="head" :src="resizeImage(user.avatarUrl)" />
            <div class="nickname">
              {{ user.nickname }}
            </div>
          </div>
        </div>
      </div>
      <ButtonTwoTone
        v-show="activeUser.nickname !== undefined"
        @click="confirm"
      >
        {{ $t('login.confirm') }}
      </ButtonTwoTone>
    </div>
  </div>
</template>

<script setup lang="ts">
const router = useRouter();

import NProgress from 'nprogress';
// 与同名本地函数撞名，导入改名（Options API 时代的 this 遮蔽在 setup 里不成立）
import { search as searchApi } from '@/api/others';
import { userPlaylist } from '@/api/user';
import { throttle } from '@/utils/common';
import ButtonTwoTone from '@/components/ButtonTwoTone.vue';
import { resizeImage } from '@/utils/formatters';
import { ref } from 'vue';
import { useDataStore } from '@/stores';

import { useRouter } from 'vue-router';
const dataStore = useDataStore();

const updateData = dataStore.updateData;

const keyword = ref<any>('');

const result = ref<any>([]);

const activeUser = ref<any>({});

function search() {
  if (!keyword.value) return;
  searchApi({ keywords: keyword.value, limit: 9, type: 1002 }).then(data => {
    result.value = data.result.userprofiles;
    activeUser.value = result.value[0];
  });
}

function confirm() {
  updateData({ key: 'user', value: activeUser.value });
  updateData({ key: 'loginMode', value: 'username' });
  userPlaylist({
    uid: activeUser.value.userId,
    limit: 1,
  }).then(data => {
    updateData({
      key: 'likedSongPlaylistID',
      value: data.playlist[0].id,
    });
    router.push({ path: '/library' });
  });
}

// 原 methods 里 throttle(...) 生成的是单例节流函数，这里保持一致（每次调用都新建节流器会让节流完全失效）
const throttleSearch = throttle(function () {
  search();
}, 500);

NProgress.done();
</script>

<style lang="scss" scoped>
.login {
  display: flex;
  color: var(--color-text);
}

.title {
  font-size: 42px;
  font-weight: 700;
  margin-bottom: 48px;
}

.sestion {
  margin-top: 18px;
  .name {
    font-size: 14px;
    font-weight: 500;
    margin-bottom: 8px;
    opacity: 0.78;
  }
}

.search-box {
  .container {
    display: flex;
    align-items: center;
    height: 48px;
    border-radius: 11px;
    width: 326px;
    background: var(--color-primary-bg);
  }

  .svg-icon {
    height: 22px;
    width: 22px;
    color: var(--color-primary);
    margin: {
      left: 12px;
      right: 8px;
    }
  }

  input {
    flex: 1;
    font-size: 22px;
    border: none;
    background: transparent;
    width: 115%;
    font-weight: 600;
    margin-top: -1px;
    color: var(--color-primary);
    &::placeholder {
      color: var(--color-primary);
      opacity: 0.78;
    }
  }
}

.user-list {
  display: flex;
  flex-wrap: wrap;
  margin-top: 24px;
  margin-bottom: 24px;
}

.user {
  margin-right: 16px;
  margin-bottom: 16px;
  display: flex;
  align-items: center;
  padding: 12px 12px 12px 16px;
  border-radius: 8px;
  width: 256px;
  transition: 0.2s;
  user-select: none;
  .head {
    border-radius: 50%;
    height: 44px;
    width: 44px;
  }
  .nickname {
    font-size: 18px;
    margin-left: 12px;
  }
  &:hover {
    background: var(--color-secondary-bg);
  }
}

.user.active {
  transition: 0.2s;
  background: var(--color-primary-bg);
  .nickname {
    color: var(--color-primary);
  }
}
</style>
