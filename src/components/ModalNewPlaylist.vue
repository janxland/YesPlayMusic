<template>
  <Modal
    class="add-playlist-modal"
    v-model:show="show"
    title="新建歌单"
    width="25vw"
  >
    <!-- Vue2 的 slot="xxx" 在 Vue3 会编译成惰性 <template> 元素（内容不渲染），改用 v-slot 语法恢复迁移前行为 -->
    <template #default>
      <input
        v-model="title"
        type="text"
        placeholder="歌单标题"
        maxlength="40"
      />
      <div class="checkbox">
        <input
          id="checkbox-private"
          v-model="privatePlaylist"
          type="checkbox"
        />
        <label for="checkbox-private">设置为隐私歌单</label>
      </div>
    </template>
    <template #footer>
      <button class="primary block" @click="doCreatePlaylist">创建</button>
    </template>
  </Modal>
</template>

<script setup lang="ts">
import Modal from '@/components/Modal.vue';
import { getI18n } from '@/locale';
import { createPlaylist, addOrRemoveTrackFromPlaylist } from '@/api/playlist';
import { ref, computed } from 'vue';
import { useDataStore } from '@/stores/data';
import { useLikedStore } from '@/stores/liked';
import { useUiStore } from '@/stores/ui';
import { storeToRefs } from 'pinia';

const uiStore = useUiStore();
const dataStore = useDataStore();
const likedStore = useLikedStore();

const { modals } = storeToRefs(uiStore);

const updateModal = uiStore.updateModal;

const updateData = dataStore.updateData;

const showToast = uiStore.showToast;

const fetchLikedPlaylist = likedStore.fetchLikedPlaylist;

const title = ref<any>('');

const privatePlaylist = ref<any>(false);

const show = computed({
  get() {
    return modals.value.newPlaylistModal.show;
  },
  set(value) {
    updateModal({
      modalName: 'newPlaylistModal',
      key: 'show',
      value,
    });
    if (value) {
      uiStore.toggleScrolling(false);
    } else {
      uiStore.toggleScrolling(true);
    }
  },
});

function close() {
  show.value = false;
  title.value = '';
  privatePlaylist.value = false;
  resetAfterCreateAddTrackID();
}

function doCreatePlaylist() {
  let params: { name: string; type?: number } = { name: title.value };
  if (privatePlaylist.value) params.type = 10; // 修复原版 this.private 恒 undefined 的 bug
  createPlaylist(params).then(data => {
    if (data.code === 200) {
      if (modals.value.newPlaylistModal.afterCreateAddTrackID !== 0) {
        addOrRemoveTrackFromPlaylist({
          op: 'add',
          pid: data.id,
          tracks: modals.value.newPlaylistModal.afterCreateAddTrackID,
        }).then(data => {
          if (data.body.code === 200) {
            showToast((getI18n() as any).global.t('toast.savedToPlaylist'));
          } else {
            showToast(data.body.message);
          }
          resetAfterCreateAddTrackID();
        });
      }
      close();
      showToast('成功创建歌单');
      updateData({ key: 'libraryPlaylistFilter', value: 'mine' });
      fetchLikedPlaylist();
    }
  });
}

function resetAfterCreateAddTrackID() {
  updateModal({
    modalName: 'newPlaylistModal',
    key: 'AfterCreateAddTrackID',
    value: 0,
  });
}
</script>

<style lang="scss" scoped>
.add-playlist-modal {
  .content {
    display: flex;
    flex-direction: column;
    input {
      margin-bottom: 12px;
    }
    input[type='text'] {
      width: calc(100% - 24px);
      flex: 1;
      background: var(--color-secondary-bg-for-transparent);
      font-size: 16px;
      border: none;
      font-weight: 600;
      padding: 8px 12px;
      border-radius: 8px;
      margin-top: -1px;
      color: var(--color-text);
      &:focus {
        background: var(--color-primary-bg-for-transparent);
        opacity: 1;
      }
      [data-theme='light'] &:focus {
        color: var(--color-primary);
      }
    }
    .checkbox {
      input[type='checkbox' i] {
        margin: 3px 3px 3px 4px;
      }
      display: flex;
      align-items: center;
      label {
        font-size: 12px;
      }
      user-select: none;
    }
  }
}
</style>
