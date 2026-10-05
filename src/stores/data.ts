import { ref, watch } from 'vue';
import { defineStore } from 'pinia';
import initLocalStorage from './initLocalStorage';
import { userAccount } from '@/api/user';
import { isAccountLoggedIn } from '@/utils/auth';

// 账号数据域（localStorage key: 'data' 与 'lastfm'，键与结构冻结不变）
export const useDataStore = defineStore('data', () => {
  const data = ref<Record<string, any>>(
    JSON.parse(
      localStorage.getItem('data') || JSON.stringify(initLocalStorage.data)
    )
  );

  const lastfm = ref<Record<string, any>>(
    JSON.parse(localStorage.getItem('lastfm') || '{}')
  );

  // 仅 data 深度写回；lastfm 由视图回调手动落盘，保持原行为
  watch(data, d => localStorage.setItem('data', JSON.stringify(d)), {
    deep: true,
  });

  function updateData({ key, value }: { key: string; value: unknown }) {
    data.value[key] = value;
  }
  function updateLastfm(session: unknown) {
    lastfm.value = session;
  }
  function fetchUserProfile() {
    if (!isAccountLoggedIn()) return;
    return userAccount().then(result => {
      if (result.code === 200) {
        updateData({ key: 'user', value: result.profile });
      }
    });
  }

  return {
    data,
    lastfm,
    updateData,
    updateLastfm,
    fetchUserProfile,
  };
});
