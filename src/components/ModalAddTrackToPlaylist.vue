<template>
  <Modal
    class="add-track-to-playlist-modal"
    v-model:show="show"
    :show-footer="false"
    title="添加到歌单"
    width="25vw"
  >
    <!-- Vue2 的 slot="default" 在 Vue3 会编译成惰性 <template> 元素（内容不渲染），改用 v-slot 语法恢复迁移前行为 -->
    <template #default>
      <div class="new-playlist-button" @click="newPlaylist"
        ><svg-icon icon-class="plus" />新建歌单</div
      >
      <div
        v-for="playlist in ownPlaylists"
        :key="playlist.id"
        class="playlist"
        @click="addTrackToPlaylist(playlist.id)"
      >
        <LazyImage
          :src="resizeImage(playlist.coverImgUrl, 224)"
          referrerpolicy="no-referrer"
        />
        <div class="info">
          <div class="title">{{ playlist.name }}</div>
          <div class="track-count">{{ playlist.trackCount }} 首</div>
        </div>
      </div>
    </template>
  </Modal>
</template>

<script setup lang="ts">
import Modal from '@/components/Modal.vue';
import { getI18n } from '@/locale';
import { resizeImage } from '@/utils/formatters';
import { addOrRemoveTrackFromPlaylist } from '@/api/playlist';
import { computed } from 'vue';
import { useDataStore } from '@/stores/data';
import { useLikedStore } from '@/stores/liked';
import { useUiStore } from '@/stores/ui';
import { storeToRefs } from 'pinia';

const uiStore = useUiStore();

const { modals } = storeToRefs(uiStore);
const { data } = storeToRefs(useDataStore());
const { liked } = storeToRefs(useLikedStore());

const show = computed({
  get() {
    return modals.value.addTrackToPlaylistModal.show;
  },
  set(value) {
    uiStore.updateModal({
      modalName: 'addTrackToPlaylistModal',
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

const ownPlaylists = computed(function ownPlaylists() {
  return liked.value.playlists.filter(
    p =>
      p.creator.userId === data.value.user.userId &&
      p.id !== data.value.likedSongPlaylistID
  );
});

function close() {
  show.value = false;
}

function addTrackToPlaylist(playlistID) {
  addOrRemoveTrackFromPlaylist({
    op: 'add',
    pid: playlistID,
    tracks: modals.value.addTrackToPlaylistModal.selectedTrackID,
  }).then(data => {
    if (data.body.code === 200) {
      show.value = false;
      uiStore.showToast((getI18n() as any).global.t('toast.savedToPlaylist'));
    } else {
      uiStore.showToast(data.body.message);
    }
  });
}

function newPlaylist() {
  uiStore.updateModal({
    modalName: 'newPlaylistModal',
    key: 'afterCreateAddTrackID',
    value: modals.value.addTrackToPlaylistModal.selectedTrackID,
  });
  close();
  uiStore.updateModal({
    modalName: 'newPlaylistModal',
    key: 'show',
    value: true,
  });
}
</script>

<style lang="scss" scoped>
.new-playlist-button {
  display: flex;
  justify-content: center;
  align-items: center;
  font-size: 16px;
  font-weight: 500;
  color: var(--color-text);
  background: var(--color-secondary-bg-for-transparent);
  border-radius: 8px;
  height: 48px;
  margin-bottom: 16px;
  margin-right: 6px;
  margin-left: 6px;
  cursor: pointer;
  transition: 0.2s;
  .svg-icon {
    width: 16px;
    height: 16px;
    margin-right: 8px;
  }
  &:hover {
    color: var(--color-primary);
    background: var(--color-primary-bg-for-transparent);
  }
}
.playlist {
  display: flex;
  padding: 6px;
  border-radius: 8px;
  cursor: pointer;
  &:hover {
    background: var(--color-secondary-bg-for-transparent);
  }
  img {
    border-radius: 8px;
    height: 42px;
    width: 42px;
    margin-right: 12px;
    border: 1px solid rgba(0, 0, 0, 0.04);
  }
  .info {
    display: flex;
    flex-direction: column;
    justify-content: center;
  }
  .title {
    font-size: 16px;
    font-weight: 500;
    color: var(--color-text);
    padding-right: 16px;
    display: -webkit-box;
    -webkit-box-orient: vertical;
    -webkit-line-clamp: 1;
    overflow: hidden;
    word-break: break-all;
  }
  .track-count {
    margin-top: 2px;
    font-size: 13px;
    opacity: 0.68;
    color: var(--color-text);
  }
}
</style>
