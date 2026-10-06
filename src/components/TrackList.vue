<template>
  <div class="track-list no-scrollbar">
    <ContextMenu ref="menuRef" @close="closeMenu">
      <div v-show="type !== 'cloudDisk'" class="item-info">
        <LazyImage
          :src="resizeImage(rightClickedTrackComputed.al.picUrl, 224)"
          referrerpolicy="no-referrer"
        />
        <div class="info">
          <div class="title">{{ rightClickedTrackComputed.name }}</div>
          <div class="subtitle">{{ rightClickedTrackComputed.ar[0].name }}</div>
        </div>
      </div>
      <hr v-show="type !== 'cloudDisk'" />
      <div class="item" @click="play">{{ $t('contextMenu.play') }}</div>
      <div class="item" @click="addToQueue">{{
        $t('contextMenu.addToQueue')
      }}</div>
      <div
        v-if="extraContextMenuItem.includes('removeTrackFromQueue')"
        class="item"
        @click="removeTrackFromQueue"
        >从队列删除</div
      >
      <hr v-show="type !== 'cloudDisk'" />
      <div
        v-show="!isRightClickedTrackLiked && type !== 'cloudDisk'"
        class="item"
        @click="like"
      >
        {{ $t('contextMenu.saveToMyLikedSongs') }}
      </div>
      <div
        v-show="isRightClickedTrackLiked && type !== 'cloudDisk'"
        class="item"
        @click="like"
      >
        {{ $t('contextMenu.removeFromMyLikedSongs') }}
      </div>
      <div
        v-if="extraContextMenuItem.includes('removeTrackFromPlaylist')"
        class="item"
        @click="removeTrackFromPlaylist"
        >从歌单中删除</div
      >
      <div
        v-show="type !== 'cloudDisk'"
        class="item"
        @click="addTrackToPlaylist"
        >{{ $t('contextMenu.addToPlaylist') }}</div
      >
      <div v-show="type !== 'cloudDisk'" class="item" @click="copyLink">{{
        $t('contextMenu.copyUrl')
      }}</div>
      <div
        v-if="extraContextMenuItem.includes('removeTrackFromCloudDisk')"
        class="item"
        @click="removeTrackFromCloudDisk"
        >从云盘中删除</div
      >
    </ContextMenu>

    <div :style="listStyles">
      <TrackListItem
        v-for="(track, index) in tracks"
        :key="itemKey === 'id' ? track.id : `${track.id}${index}`"
        :track-prop="track"
        :type="type"
        :album-object="albumObject"
        :right-clicked-track-id="rightClickedTrack.id"
        :highlight-playing-track="highlightPlayingTrack"
        :other-server-access="otherServerAccess"
        @play="playThisList"
        @dblclick="playThisList(track)"
        @click.right="openMenu($event, track, index)"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
// 「从歌单中删除」由歌单页经 @remove-track 事件处理（Vue3 下 $parent 桥不可靠，已移除）
const emit = defineEmits(['remove-track']);

import { addOrRemoveTrackFromPlaylist } from '@/api/playlist';
import { cloudDiskTrackDelete } from '@/api/user';
import { isAccountLoggedIn } from '@/utils/auth';
import { copyToClipboard } from '@/utils/clipboard';
import TrackListItem from '@/components/TrackListItem.vue';
import ContextMenu from '@/components/ContextMenu.vue';
import { getI18n } from '@/locale';
import { resizeImage } from '@/utils/formatters';
import { ref, computed, useTemplateRef } from 'vue';
import type { PropType } from 'vue';
import type { Track } from '@/types/entities';
import { useLikedStore } from '@/stores/liked';
import { usePlayerStore } from '@/stores/player';
import { useUiStore } from '@/stores/ui';
import { storeToRefs } from 'pinia';

// ContextMenu 实例 ref：useTemplateRef 类型更准
const menuRef = useTemplateRef<InstanceType<typeof ContextMenu>>('menuRef');
const uiStore = useUiStore();
const likedStore = useLikedStore();

const { liked } = storeToRefs(likedStore);
const { player } = storeToRefs(usePlayerStore());

const updateModal = uiStore.updateModal;

const showToast = uiStore.showToast;

const likeATrack = likedStore.likeATrack;

const props = defineProps({
  tracks: {
    type: Array as PropType<Track[]>,
    default: () => {
      return [];
    },
  },
  type: {
    type: String,
    default: 'tracklist',
  }, // tracklist | album | playlist | cloudDisk
  id: {
    type: String,
    default: '0',
  },
  maxSize: {
    type: String,
    default: '20',
  },
  dbclickTrackFunc: {
    type: String,
    default: 'default',
  },
  albumObject: {
    type: Object,
    default: () => {
      return {
        artist: {
          name: '',
        },
      };
    },
  },
  extraContextMenuItem: {
    type: Array,
    default: () => {
      return [];
    },
  },
  columnNumber: {
    type: Number,
    default: 4,
  },
  highlightPlayingTrack: {
    type: Boolean,
    default: true,
  },
  itemKey: {
    type: String,
    default: 'id',
  },
  otherServerAccess: {
    type: Boolean,
    default: true,
  },
});

const rightClickedTrack = ref<any>({
  id: 0,
  name: '',
  ar: [{ name: '' }],
  al: { picUrl: '' },
});

const rightClickedTrackIndex = ref(-1);

const listStyles = ref<any>({});

const isRightClickedTrackLiked = computed(function isRightClickedTrackLiked() {
  return liked.value.songs.includes(rightClickedTrack.value?.id);
});

const rightClickedTrackComputed = computed(
  function rightClickedTrackComputed() {
    if (props.type === 'cloudDisk') {
      return {
        id: 0,
        name: '',
        ar: [{ name: '' }],
        al: { picUrl: '' },
      };
    }
    // /search 旧格式行是 artists/album 结构，详情回填前右键会裸读 ar/al
    const t = rightClickedTrack.value;
    return {
      ...t,
      ar: t.ar ?? t.artists ?? [{ name: '' }],
      al: t.al ?? t.album ?? { picUrl: '' },
    };
  }
);

function openMenu(e, track, index = -1) {
  rightClickedTrack.value = track;
  rightClickedTrackIndex.value = index;
  menuRef.value.openMenu(e);
}

function closeMenu() {
  rightClickedTrack.value = {
    id: 0,
    name: '',
    ar: [{ name: '' }],
    al: { picUrl: '' },
  };
  rightClickedTrackIndex.value = -1;
}

function playThisListByTrack(track) {
  showToast('TrackList 正在进行其他平台播放');
  const tracks = props.tracks.filter(_track => {
    return _track.playable == 1;
  });
  // playlistSourceID 必须是 id：传对象会让 goToListSource 产出 "/artist/[object Object]"
  player.value.replacePlaylist(tracks, track.id || track.songId, 'artist', track);
}

function playThisList(trackID) {
  if (trackID.source) {
    playThisListByTrack(trackID);
    return;
  }
  trackID = trackID.id || trackID.songId;
  if (props.dbclickTrackFunc === 'default') {
    playThisListDefault(trackID);
  } else if (props.dbclickTrackFunc === 'none') {
  } else if (props.dbclickTrackFunc === 'playTrackOnListByID') {
    player.value.playTrackOnListByID(trackID);
  } else if (props.dbclickTrackFunc === 'playPlaylistByID') {
    player.value.playPlaylistByID(props.id, trackID);
  } else if (props.dbclickTrackFunc === 'playAList') {
    let trackIDs = props.tracks.map(t => t.id || t.songId);
    player.value.replacePlaylist(trackIDs, props.id, 'artist', trackID);
  } else if (props.dbclickTrackFunc === 'dailyTracks') {
    let trackIDs = props.tracks.map(t => t.id);
    player.value.replacePlaylist(trackIDs, '/daily/songs', 'url', trackID);
  } else if (props.dbclickTrackFunc === 'playCloudDisk') {
    let trackIDs = props.tracks.map(t => t.id || t.songId);
    player.value.replacePlaylist(trackIDs, props.id, 'cloudDisk', trackID);
  }
}

function playThisListDefault(trackID) {
  if (props.type === 'playlist') {
    player.value.playPlaylistByID(props.id, trackID);
  } else if (props.type === 'album') {
    player.value.playAlbumByID(props.id, trackID);
  } else if (props.type === 'tracklist') {
    let trackIDs = props.tracks.map(t => t.id);
    player.value.replacePlaylist(trackIDs, props.id, 'artist', trackID);
  }
}

// 云盘行的曲目没有 id，只有 songId；取错会把 undefined 塞进插队队列
function play() {
  player.value.addTrackToPlayNext(
    rightClickedTrack.value.id ?? rightClickedTrack.value.songId,
    true
  );
}

function addToQueue() {
  player.value.addTrackToPlayNext(
    rightClickedTrack.value.id ?? rightClickedTrack.value.songId
  );
}

function like() {
  likeATrack(rightClickedTrack.value.id);
}

function addTrackToPlaylist() {
  if (!isAccountLoggedIn()) {
    showToast((getI18n() as any).global.t('toast.needToLogin'));
    return;
  }
  updateModal({
    modalName: 'addTrackToPlaylistModal',
    key: 'show',
    value: true,
  });
  updateModal({
    modalName: 'addTrackToPlaylistModal',
    key: 'selectedTrackID',
    value: rightClickedTrack.value.id,
  });
}

function removeTrackFromPlaylist() {
  if (!isAccountLoggedIn()) {
    showToast((getI18n() as any).global.t('toast.needToLogin'));
    return;
  }
  if (confirm(`确定要从歌单删除 ${rightClickedTrack.value.name}？`)) {
    let trackID = rightClickedTrack.value.id;
    addOrRemoveTrackFromPlaylist({
      op: 'del',
      pid: props.id,
      tracks: trackID,
    })
      .then(data => {
        showToast(
          data.body.code === 200
            ? (getI18n() as any).global.t('toast.removedFromPlaylist')
            : data.body.message
        );
        emit('remove-track', trackID);
      })
      .catch(() => {
        showToast('从歌单删除失败，请检查网络后重试');
      });
  }
}

function copyLink() {
  copyToClipboard(`https://music.163.com/song?id=${rightClickedTrack.value.id}`)
    .then(() => {
      showToast((getI18n() as any).global.t('toast.copied'));
    })
    .catch(err => {
      showToast(`${(getI18n() as any).global.t('toast.copyFailed')}${err}`);
    });
}

function removeTrackFromQueue() {
  player.value.removeTrackFromQueue(rightClickedTrackIndex.value);
}

function removeTrackFromCloudDisk() {
  if (confirm(`确定要从云盘删除 ${rightClickedTrack.value.songName}？`)) {
    let trackID = rightClickedTrack.value.songId;
    cloudDiskTrackDelete(trackID)
      .then(data => {
        showToast(data.code === 200 ? '已将此歌曲从云盘删除' : data.message);
        let newCloudDisk = liked.value.cloudDisk.filter(
          t => t.songId !== trackID
        );
        likedStore.updateLikedXXX({
          name: 'cloudDisk',
          data: newCloudDisk,
        });
      })
      .catch(() => {
        showToast('从云盘删除失败，请检查网络后重试');
      });
  }
}

if (props.type === 'tracklist') {
  listStyles.value = {
    display: 'grid',
    gap: '4px',
    gridTemplateColumns: `repeat(${props.columnNumber}, 1fr)`,
  };
}
</script>

<style lang="scss" scoped></style>
