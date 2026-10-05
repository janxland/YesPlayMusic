<template>
  <div
    class="track"
    :class="trackClass"
    :title="showUnavailableSongInGreyStyle ? track.reason : ''"
    @click="playTrack"
    @mouseover="hover = true"
    @mouseleave="hover = false"
  >
    <LazyImage
      v-if="!isAlbum"
      :src="imgUrl"
      :class="{ hover: focus }"
      referrerpolicy="no-referrer"
      @click.stop="goToAlbum"
    />
    <div v-if="showOrderNumber" class="no">
      <button v-show="focus && playable && !isPlaying" @click="playTrack">
        <svg-icon
          icon-class="play"
          style="height: 14px; width: 14px"
        ></svg-icon>
      </button>
      <span v-show="(!focus || !playable) && !isPlaying">{{ track.no }}</span>
      <button v-show="isPlaying">
        <svg-icon
          icon-class="volume"
          style="height: 16px; width: 16px"
        ></svg-icon>
      </button>
    </div>
    <div class="title-and-artist">
      <div class="container">
        <div class="title">
          {{ track.name }}
          <span v-if="isSubTitle" :title="subTitle" class="sub-title">
            ({{ subTitle }})
          </span>
          <span v-if="isAlbum" class="featured">
            <ArtistsInLine
              :artists="track.ar"
              :exclude="albumObject?.artist?.name"
              prefix="-"
          /></span>
          <span
            v-if="isAlbum && (track.mark & 1048576) === 1048576"
            class="explicit-symbol"
            ><ExplicitSymbol
          /></span>
        </div>
        <div v-if="!isAlbum" class="artist">
          <span
            v-if="(track.mark & 1048576) === 1048576"
            class="explicit-symbol before-artist"
            ><ExplicitSymbol :size="15"
          /></span>
          <ArtistsInLine
            :artists="artists"
            :other-server-access="otherServerAccess"
          />
        </div>
      </div>
      <div></div>
    </div>

    <div v-if="showAlbumName" class="album">
      <router-link
        v-if="album && album.id"
        :to="
          otherServerAccess ? `/album/${album.id}` : { path: $route.fullPath }
        "
        >{{ album.name }}</router-link
      >
      <div></div>
    </div>

    <div v-if="showLikeButton" class="actions">
      <button @click="likeThisSong">
        <svg-icon
          icon-class="heart"
          :style="{
            visibility: focus && !isLiked ? 'visible' : 'hidden',
          }"
        ></svg-icon>
        <svg-icon v-show="isLiked" icon-class="heart-solid"></svg-icon>
      </button>
    </div>
    <div v-if="showTrackTime" class="time">
      {{ timeText }}
    </div>

    <div v-if="track.playCount" class="count"> {{ track.playCount }}</div>
  </div>
</template>

<script setup lang="ts">
const router = useRouter();

import { isDesktop } from '@/platform/env';
import ArtistsInLine from '@/components/ArtistsInLine.vue';
import ExplicitSymbol from '@/components/ExplicitSymbol.vue';
import { COVER_FALLBACK } from '@/utils/imageFallback';
import { formatTime } from '@/utils/formatters';
import isNil from 'lodash/isNil';
import { computed, ref } from 'vue';
import { useLikedStore } from '@/stores/liked';
import { usePlayerStore } from '@/stores/player';
import { useSettingsStore } from '@/stores/settings';
import { storeToRefs } from 'pinia';

import { useRouter } from 'vue-router';
const { settings } = storeToRefs(useSettingsStore());
const likedStore = useLikedStore();
const { liked } = storeToRefs(likedStore);
const { player } = storeToRefs(usePlayerStore());

const props = defineProps({
  trackProp: Object,
  highlightPlayingTrack: {
    type: Boolean,
    default: true,
  },
  otherServerAccess: {
    type: Boolean,
    default: true,
  },
  // 列表类型（playlist/album/tracklist/cloudDisk…），原经 $parent.type 读取
  type: {
    type: String,
    default: 'tracklist',
  },
  // 专辑页用于「排除本专辑歌手」的专辑对象，原经 $parent.albumObject 读取
  albumObject: {
    type: Object,
    default: () => ({ artist: { name: '' } }),
  },
  // 当前行是否正被右键菜单选中，原经 $parent.rightClickedTrack 读取
  rightClickedTrackId: {
    type: Number,
    default: 0,
  },
});

// 播放该行：payload 为整条 track（本地音源）或 track id，由 TrackList.playThisList 分派
const emit = defineEmits(['play']);

const hover = ref<any>(false);

const track = computed(function track() {
  return type.value === 'cloudDisk'
    ? props.trackProp.simpleSong
    : props.trackProp;
});

const playable = computed(function playable() {
  return track.value?.privilege?.pl > 0 || track.value?.playable;
});

const imgUrl = computed(function imgUrl() {
  let image =
    track.value?.picUrl ??
    track.value?.al?.picUrl ??
    track.value?.album?.picUrl ??
    COVER_FALLBACK;
  if (image.startsWith('data:')) return image;
  return image + '?param=224y224';
});

const artists = computed(function artists() {
  const { ar, artists } = track.value;
  if (!isNil(ar)) return ar;
  if (!isNil(artists)) return artists;
  return [];
});

const album = computed(function album() {
  return track.value.album || track.value.al || track.value?.simpleSong?.al;
});

const subTitle = computed(function subTitle() {
  let tn = undefined;
  if (track.value?.tns?.length > 0 && track.value.name !== track.value.tns[0]) {
    tn = track.value.tns[0];
  }

  //优先显示alia
  if (settings.value.subTitleDefault) {
    return track.value?.alia?.length > 0 ? track.value.alia[0] : tn;
  } else {
    return tn === undefined ? track.value.alia[0] : tn;
  }
});

const type = computed(function type() {
  return props.type;
});

const isAlbum = computed(function isAlbum() {
  return type.value === 'album';
});

const isSubTitle = computed(function isSubTitle() {
  return (
    (track.value?.tns?.length > 0 && track.value.name !== track.value.tns[0]) ||
    track.value.alia?.length > 0
  );
});

const isPlaylist = computed(function isPlaylist() {
  return type.value === 'playlist';
});

const isLiked = computed(function isLiked() {
  return liked.value.songs.includes(track.value?.id);
});

const isPlaying = computed(function isPlaying() {
  return player.value.currentTrack.id === track.value?.id;
});

const trackClass = computed(function trackClass() {
  let trackClass = [type.value];
  if (!playable.value && showUnavailableSongInGreyStyle.value)
    trackClass.push('disable');
  if (isPlaying.value && props.highlightPlayingTrack)
    trackClass.push('playing');
  if (focus.value) trackClass.push('focus');
  return trackClass;
});

const isMenuOpened = computed(function isMenuOpened() {
  return props.rightClickedTrackId === track.value.id ? true : false;
});

const focus = computed(function focus() {
  return (hover.value && props.rightClickedTrackId === 0) || isMenuOpened.value;
});

const showUnavailableSongInGreyStyle = computed(
  function showUnavailableSongInGreyStyle() {
    return isDesktop() ? !settings.value.enableUnblockNeteaseMusic : true;
  }
);

const showLikeButton = computed(function showLikeButton() {
  return type.value !== 'tracklist' && type.value !== 'cloudDisk';
});

const showOrderNumber = computed(function showOrderNumber() {
  return type.value === 'album';
});

const showAlbumName = computed(function showAlbumName() {
  return type.value !== 'album' && type.value !== 'tracklist';
});

const showTrackTime = computed(function showTrackTime() {
  return type.value !== 'tracklist';
});

// 每行模板里的 formatTime(track.dt) 收敛为 computed，行不重渲染就不重算
const timeText = computed(function timeText() {
  return formatTime(track.value.dt);
});

function goToAlbum() {
  if (track.value.al.id === 0) return;
  if (track.value.sourceUrl) {
    window.open(track.value.sourceUrl);
    return;
  }
  router.push({ path: '/album/' + track.value.al.id });
}

function playTrack() {
  emit('play', track.value.source ? track.value : track.value.id);
}

function likeThisSong() {
  likedStore.likeATrack(track.value.id);
}
</script>

<style lang="scss" scoped>
button {
  display: flex;
  justify-content: center;
  align-items: center;
  padding: 8px;
  background: transparent;
  border-radius: 25%;
  transition: transform 0.2s;
  .svg-icon {
    height: 16px;
    width: 16px;
    color: var(--color-primary);
  }
  &:hover {
    transform: scale(1.12);
  }
  &:active {
    transform: scale(0.96);
  }
}

.track {
  display: flex;
  align-items: center;
  padding: 8px;
  border-radius: 12px;
  user-select: none;

  .no {
    display: flex;
    justify-content: center;
    align-items: center;
    border-radius: 8px;
    margin: 0 20px 0 10px;
    width: 12px;
    color: var(--color-text);
    cursor: default;
    span {
      opacity: 0.58;
    }
  }

  .explicit-symbol {
    opacity: 0.28;
    color: var(--color-text);
    .svg-icon {
      margin-bottom: -3px;
    }
  }

  .explicit-symbol.before-artist {
    .svg-icon {
      margin-bottom: -3px;
    }
  }

  img {
    border-radius: 8px;
    height: 46px;
    width: 46px;
    margin-right: 14px;
    border: 1px solid rgba(0, 0, 0, 0.04);
    cursor: pointer;
  }

  img.hover {
    filter: drop-shadow(100 200 0 black);
  }

  .title-and-artist {
    min-width: 120px;
    flex: 1;
    display: flex;
    .container {
      display: flex;
      flex-direction: column;
    }
    .title {
      font-size: 16px;
      font-weight: 600;
      color: var(--color-text);
      cursor: default;
      padding-right: 12px;
      display: -webkit-box;
      -webkit-box-orient: vertical;
      -webkit-line-clamp: 1;
      overflow: hidden;
      word-break: break-all;
      .featured {
        margin-right: 2px;
        font-weight: 500;
        font-size: 14px;
        opacity: 0.72;
      }
      .sub-title {
        color: #7a7a7a;
        opacity: 0.7;
        margin-left: 4px;
      }
    }
    .artist {
      margin-top: 2px;
      font-size: 13px;
      opacity: 0.68;
      color: var(--color-text);
      display: -webkit-box;
      -webkit-box-orient: vertical;
      -webkit-line-clamp: 1;
      overflow: hidden;
      a {
        span {
          margin-right: 3px;
          opacity: 0.8;
        }
        &:hover {
          text-decoration: underline;
          cursor: pointer;
        }
      }
    }
  }
  .album {
    flex: 1;
    display: flex;
    font-size: 16px;
    min-width: 80px;
    opacity: 0.88;
    color: var(--color-text);
    display: -webkit-box;
    -webkit-box-orient: vertical;
    -webkit-line-clamp: 2;
    overflow: hidden;
  }
  .time,
  .count {
    font-size: 16px;
    width: 50px;
    cursor: default;
    display: flex;
    justify-content: flex-end;
    margin-right: 10px;
    font-variant-numeric: tabular-nums;
    opacity: 0.88;
    color: var(--color-text);
  }
  .count {
    font-weight: bold;
    font-size: 22px;
    line-height: 22px;
  }
}

.track.focus {
  transition: all 0.3s;
  background: var(--color-secondary-bg);
}

.track.disable {
  img {
    filter: grayscale(1) opacity(0.6);
  }
  .title,
  .artist,
  .album,
  .time,
  .no,
  .featured {
    opacity: 0.28 !important;
  }
  &:hover {
    background: none;
  }
}

.track.tracklist {
  img {
    height: 36px;
    width: 36px;
    border-radius: 6px;
    margin-right: 14px;
    cursor: pointer;
  }
  .title {
    font-size: 16px;
  }
  .artist {
    font-size: 12px;
  }
}

.track.album {
  height: 32px;
}

.actions {
  width: 80px;
  display: flex;
  justify-content: flex-end;
}

.track.playing {
  background: var(--color-primary-bg);
  color: var(--color-primary);
  .title,
  .album,
  .time,
  .title-and-artist .sub-title {
    color: var(--color-primary);
  }
  .title .featured,
  .artist,
  .explicit-symbol,
  .count {
    color: var(--color-primary);
    opacity: 0.88;
  }
  .no span {
    color: var(--color-primary);
    opacity: 0.78;
  }
}

@media (max-width: 576px) {
  .track {
    .album,
    .time {
      display: none;
    }
    .title-and-artist {
      min-width: 0;
    }
    img {
      margin-right: 10px;
    }
  }
  .track.tracklist img {
    margin-right: 10px;
  }
  .actions {
    width: 40px;
  }
}
</style>
