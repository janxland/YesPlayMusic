<template>
  <div v-show="show" ref="library">
    <h1>
      <LazyImage
        class="avatar"
        :src="resizeImage(data.user.avatarUrl)"
        referrerpolicy="no-referrer"
      />{{ data.user.nickname }}{{ $t('library.sLibrary') }}
    </h1>
    <div class="section-one">
      <div class="liked-songs" @click="goToLikedSongsList">
        <div class="top">
          <p>
            <span
              v-for="(line, index) in pickedLyric"
              v-show="line !== ''"
              :key="`${line}${index}`"
              >{{ line }}<br
            /></span>
          </p>
        </div>
        <div class="bottom">
          <div class="titles">
            <div class="title">{{ $t('library.likedSongs') }}</div>
            <div class="sub-title">
              {{ liked.songs.length }} {{ $t('common.songs') }}
            </div>
          </div>
          <button @click.stop="openPlayModeTabMenu">
            <svg-icon icon-class="play" />
          </button>
        </div>
      </div>
      <div class="songs no-scrollbar">
        <TrackList
          :id="liked.playlists.length > 0 ? liked.playlists[0].id : 0"
          :tracks="liked.songsWithDetails"
          :column-number="3"
          type="tracklist"
          dbclick-track-func="playPlaylistByID"
        />
      </div>
    </div>

    <div class="section-two">
      <div class="tabs-row">
        <div class="tabs">
          <div
            class="tab dropdown"
            :class="{ active: currentTab === 'playlists' }"
            @click="updateCurrentTab('playlists')"
          >
            <span class="text">{{
              {
                all: $t('contextMenu.allPlaylists'),
                mine: $t('contextMenu.minePlaylists'),
                liked: $t('contextMenu.likedPlaylists'),
              }[playlistFilter]
            }}</span>
            <span class="icon" @click.stop="openPlaylistTabMenu"
              ><svg-icon icon-class="dropdown"
            /></span>
          </div>
          <div
            class="tab"
            :class="{ active: currentTab === 'albums' }"
            @click="updateCurrentTab('albums')"
          >
            {{ $t('library.albums') }}
          </div>
          <div
            class="tab"
            :class="{ active: currentTab === 'artists' }"
            @click="updateCurrentTab('artists')"
          >
            {{ $t('library.artists') }}
          </div>
          <div
            class="tab"
            :class="{ active: currentTab === 'mvs' }"
            @click="updateCurrentTab('mvs')"
          >
            {{ $t('library.mvs') }}
          </div>
          <div
            class="tab"
            :class="{ active: currentTab === 'cloudDisk' }"
            @click="updateCurrentTab('cloudDisk')"
          >
            {{ $t('library.cloudDisk') }}
          </div>
          <div
            class="tab"
            :class="{ active: currentTab === 'playHistory' }"
            @click="updateCurrentTab('playHistory')"
          >
            {{ $t('library.playHistory.title') }}
          </div>
        </div>
        <button
          v-show="currentTab === 'playlists'"
          class="tab-button"
          @click="openAddPlaylistModal"
          ><svg-icon icon-class="plus" />{{ $t('library.newPlayList') }}
        </button>
        <button
          v-show="currentTab === 'cloudDisk'"
          class="tab-button"
          @click="selectUploadFiles"
          ><svg-icon icon-class="arrow-up-alt" />{{ $t('library.uploadSongs') }}
        </button>
      </div>

      <div v-show="currentTab === 'playlists'">
        <div v-if="liked.playlists.length > 1">
          <CoverRow
            :items="filterPlaylists"
            type="playlist"
            sub-text="creator"
            :show-play-button="true"
          />
        </div>
      </div>

      <div v-show="currentTab === 'albums'">
        <CoverRow
          :items="liked.albums"
          type="album"
          sub-text="artist"
          :show-play-button="true"
        />
      </div>

      <div v-show="currentTab === 'artists'">
        <CoverRow
          :items="liked.artists"
          type="artist"
          :show-play-button="true"
        />
      </div>

      <div v-show="currentTab === 'mvs'">
        <MvRow :mvs="liked.mvs" />
      </div>

      <div v-show="currentTab === 'cloudDisk'">
        <TrackList
          :id="'-8'"
          :tracks="liked.cloudDisk"
          :column-number="3"
          type="cloudDisk"
          dbclick-track-func="playCloudDisk"
          :extra-context-menu-item="['removeTrackFromCloudDisk']"
        />
      </div>

      <div v-show="currentTab === 'playHistory'">
        <button
          :class="{
            'playHistory-button': true,
            'playHistory-button--selected': playHistoryMode === 'week',
          }"
          @click="playHistoryMode = 'week'"
        >
          {{ $t('library.playHistory.week') }}
        </button>
        <button
          :class="{
            'playHistory-button': true,
            'playHistory-button--selected': playHistoryMode === 'all',
          }"
          @click="playHistoryMode = 'all'"
        >
          {{ $t('library.playHistory.all') }}
        </button>
        <TrackList
          :tracks="playHistoryList"
          :column-number="1"
          type="tracklist"
        />
      </div>
    </div>

    <input
      ref="cloudDiskUploadInputRef"
      type="file"
      style="display: none"
      @change="uploadSongToCloudDisk"
    />

    <ContextMenu ref="playlistTabMenuRef">
      <div class="item" @click="changePlaylistFilter('all')">{{
        $t('contextMenu.allPlaylists')
      }}</div>
      <hr />
      <div class="item" @click="changePlaylistFilter('mine')">{{
        $t('contextMenu.minePlaylists')
      }}</div>
      <div class="item" @click="changePlaylistFilter('liked')">{{
        $t('contextMenu.likedPlaylists')
      }}</div>
    </ContextMenu>

    <ContextMenu ref="playModeTabMenuRef">
      <div class="item" @click="playLikedSongs">{{
        $t('library.likedSongs')
      }}</div>
      <hr />
      <div class="item" @click="playIntelligenceList">{{
        $t('contextMenu.cardiacMode')
      }}</div>
    </ContextMenu>
  </div>
</template>

<script setup lang="ts">
const router = useRouter();

import { randomNum, dailyTask } from '@/utils/common';

const appScroll = useAppScroll();
import { isAccountLoggedIn } from '@/utils/auth';
import { uploadSong } from '@/api/user';
import { getLyric } from '@/api/track';
import { loadWithProgress, loadOptional } from '@/utils/pageLoad';
import { getI18n } from '@/locale';
import ContextMenu from '@/components/ContextMenu.vue';
import TrackList from '@/components/TrackList.vue';
import CoverRow from '@/components/CoverRow.vue';
import SvgIcon from '@/components/SvgIcon.vue';
import MvRow from '@/components/MvRow.vue';
import { resizeImage } from '@/utils/formatters';
import { useAppScroll } from '@/composables/useAppScroll';
import { computed, ref } from 'vue';
import {
  useDataStore,
  useLikedStore,
  usePlayerStore,
  useUiStore,
} from '@/stores';
import { storeToRefs } from 'pinia';
import { useKeepAliveLoad } from '@/composables/useKeepAliveLoad';

import { useRouter } from 'vue-router';

function extractLyricPart(rawLyric) {
  return rawLyric.split(']').pop().trim();
}

const cloudDiskUploadInputRef = ref<any>(null);
const playModeTabMenuRef = ref<any>(null);
const playlistTabMenuRef = ref<any>(null);
const dataStore = useDataStore();
const likedStore = useLikedStore();
const playerStore = usePlayerStore();
const uiStore = useUiStore();

const { data } = storeToRefs(dataStore);
const { liked } = storeToRefs(likedStore);

// MvRow 经 $parent.player.playing 取当前播放态（跳 MV 带 autoplay 参数）
defineExpose({ player: playerStore.player });

const showToast = uiStore.showToast;

const updateModal = uiStore.updateModal;

const updateData = dataStore.updateData;

const show = ref<any>(false);

const lyric = ref(undefined);

const currentTab = ref<any>('playlists');

const playHistoryMode = ref<any>('week');

const pickedLyric = computed(function pickedLyric() {
  // 局部改名避免遮蔽同名 ref（原 this.lyric 与本地 lyric 是两个东西）
  const lyricText = lyric.value;
  if (!lyricText) return [];

  const lyricLine = lyricText
    .split('\n')
    .filter(line => !line.includes('作词') && !line.includes('作曲'));

  const lyricsToPick = Math.min(lyricLine.length, 3);
  const randomUpperBound = lyricLine.length - lyricsToPick;
  const startLyricLineIndex = randomNum(0, randomUpperBound - 1);

  return lyricLine
    .slice(startLyricLineIndex, startLyricLineIndex + lyricsToPick)
    .map(extractLyricPart);
});

const playlistFilter = computed(function playlistFilter() {
  return data.value.libraryPlaylistFilter || 'all';
});

const filterPlaylists = computed(function filterPlaylists() {
  const playlists = liked.value.playlists.slice(1);
  const userId = data.value.user.userId;
  if (playlistFilter.value === 'mine') {
    return playlists.filter(p => p.creator.userId === userId);
  } else if (playlistFilter.value === 'liked') {
    return playlists.filter(p => p.creator.userId !== userId);
  }
  return playlists;
});

const playHistoryList = computed(function playHistoryList() {
  if (show.value && playHistoryMode.value === 'week') {
    return liked.value.playHistory.weekData;
  }
  if (show.value && playHistoryMode.value === 'all') {
    return liked.value.playHistory.allData;
  }
  return [];
});

function loadData() {
  // 「我喜欢的音乐」前 12 首是本页主内容：失败要提示，不能白屏干等
  if (liked.value.songsWithDetails.length > 0) {
    // 已有缓存先渲染，后台静默刷新
    show.value = true;
    loadOptional(likedStore.fetchLikedSongsWithDetails());
    getRandomLyric();
  } else {
    loadWithProgress(
      likedStore.fetchLikedSongsWithDetails().then(() => {
        show.value = true;
        getRandomLyric();
      }),
      {
        onError: () => {
          show.value = true;
        },
      }
    );
  }
  [
    'fetchLikedSongs',
    'fetchLikedPlaylist',
    'fetchLikedAlbums',
    'fetchLikedArtists',
    'fetchLikedMVs',
    'fetchCloudDisk',
    'fetchPlayHistory',
  ].forEach(name => loadOptional(likedStore[name]()));
}

// fetchLikedPlaylist 失败/未返回时 playlists 可能为空，裸读 [0].id 会 TypeError
function getLikedPlaylistID() {
  const pid = liked.value.playlists[0]?.id;
  if (pid === undefined) showToast('歌单列表尚未加载完成，请稍后重试');
  return pid;
}

function playLikedSongs() {
  const pid = getLikedPlaylistID();
  if (pid === undefined) return;
  playerStore.player.playPlaylistByID(pid, 'first', true);
}

function playIntelligenceList() {
  const pid = getLikedPlaylistID();
  if (pid === undefined) return;
  playerStore.player.playIntelligenceListById(pid, 'first', true);
}

function updateCurrentTab(tab) {
  if (!isAccountLoggedIn() && tab !== 'playlists') {
    showToast((getI18n() as any).global.t('toast.needToLogin'));
    return;
  }
  currentTab.value = tab;
  appScroll.scrollTo({ top: 375, behavior: 'smooth' });
}

function goToLikedSongsList() {
  router.push({ path: '/library/liked-songs' });
}

function getRandomLyric() {
  if (liked.value.songs.length === 0) return;
  // server 参数在原 JS 里就是可选（调用只传 id），api 层收窄前显式传 undefined
  getLyric(
    liked.value.songs[randomNum(0, liked.value.songs.length - 1)],
    undefined
  ).then(data => {
    if (data.lrc !== undefined) {
      const isInstrumental = data.lrc.lyric
        .split('\n')
        .filter(l => l.includes('纯音乐，请欣赏'));
      if (isInstrumental.length === 0) {
        lyric.value = data.lrc.lyric;
      }
    }
  });
}

function openAddPlaylistModal() {
  if (!isAccountLoggedIn()) {
    showToast((getI18n() as any).global.t('toast.needToLogin'));
    return;
  }
  updateModal({
    modalName: 'newPlaylistModal',
    key: 'show',
    value: true,
  });
}

function openPlaylistTabMenu(e) {
  playlistTabMenuRef.value.openMenu(e);
}

function openPlayModeTabMenu(e) {
  playModeTabMenuRef.value.openMenu(e);
}

function changePlaylistFilter(type) {
  updateData({ key: 'libraryPlaylistFilter', value: type });
  window.scrollTo({ top: 375, behavior: 'smooth' });
}

function selectUploadFiles() {
  cloudDiskUploadInputRef.value.click();
}

function uploadSongToCloudDisk(e) {
  const files = e.target.files;
  uploadSong(files[0])
    .then(result => {
      if (result.code === 200) {
        let newCloudDisk = liked.value.cloudDisk;
        newCloudDisk.unshift(result.privateCloud);
        likedStore.updateLikedXXX({
          name: 'cloudDisk',
          data: newCloudDisk,
        });
      }
    })
    .catch(() => showToast('上传失败，请检查网络后重试'));
}

// /library 是 keepAlive 路由：Vue3 首挂会同帧先后触发 onMounted 与 onActivated，加上 created 一次会把 loadData 连跑三遍（每遍 ~8 个 store 请求）；改为首挂载只执行一次，缓存重入时再刷新
useKeepAliveLoad(function loadLibraryData() {
  loadData();
  dailyTask();
});
</script>

<style lang="scss" scoped>
h1 {
  font-size: 42px;
  color: var(--color-text);
  display: flex;
  align-items: center;
  .avatar {
    height: 44px;
    margin-right: 12px;
    vertical-align: -7px;
    border-radius: 50%;
    border: rgba(0, 0, 0, 0.2);
  }
}

.section-one {
  display: flex;
  margin-top: 24px;
  .songs {
    flex: 7;
    margin-top: 8px;
    margin-left: 36px;
    overflow: hidden;
  }
}

.liked-songs {
  flex: 3;
  margin-top: 8px;
  cursor: pointer;
  border-radius: 16px;
  padding: 18px 24px;
  display: flex;
  flex-direction: column;
  transition: all 0.4s;
  box-sizing: border-box;

  background: var(--color-primary-bg);

  .bottom {
    display: flex;
    justify-content: space-between;
    align-items: center;
    color: var(--color-primary);

    .title {
      font-size: 24px;
      font-weight: 700;
    }
    .sub-title {
      font-size: 15px;
      margin-top: 2px;
    }

    button {
      margin-bottom: 2px;
      display: flex;
      justify-content: center;
      align-items: center;
      height: 44px;
      width: 44px;
      background: var(--color-primary-gradient);
      border-radius: 50%;
      transition: 0.2s;
      box-shadow: 0 6px 12px -4px rgba(0, 0, 0, 0.2);
      cursor: default;

      .svg-icon {
        color: var(--color-primary-bg);
        margin-left: 4px;
        height: 16px;
        width: 16px;
      }
      &:hover {
        transform: scale(1.06);
        box-shadow: 0 6px 12px -4px rgba(0, 0, 0, 0.4);
      }
      &:active {
        transform: scale(0.94);
      }
    }
  }

  .top {
    flex: 1;
    display: flex;
    flex-wrap: wrap;
    font-size: 14px;
    opacity: 0.88;
    color: var(--color-primary);
    p {
      margin-top: 2px;
    }
  }
}

.section-two {
  margin-top: 54px;
  min-height: calc(100vh - 182px);
}

.tabs-row {
  display: flex;
  justify-content: space-between;
  margin-bottom: 24px;
}

.tabs {
  display: flex;
  flex-wrap: wrap;
  font-size: 18px;
  color: var(--color-text);
  .tab {
    font-weight: 600;
    padding: 8px 14px;
    margin-right: 14px;
    border-radius: 8px;
    cursor: pointer;
    user-select: none;
    transition: 0.2s;
    opacity: 0.68;
    &:hover {
      opacity: 0.88;
      background-color: var(--color-secondary-bg);
    }
  }
  .tab.active {
    opacity: 0.88;
    background-color: var(--color-secondary-bg);
  }
  .tab.dropdown {
    display: flex;
    align-items: center;
    padding: 0;
    overflow: hidden;
    .text {
      padding: 8px 3px 8px 14px;
    }
    .icon {
      height: 100%;
      display: flex;
      align-items: center;
      padding: 0 8px 0 3px;
      .svg-icon {
        height: 16px;
        width: 16px;
      }
    }
  }
}

button.tab-button {
  color: var(--color-text);
  border-radius: 8px;
  padding: 0 14px;
  display: flex;
  justify-content: center;
  align-items: center;
  transition: 0.2s;
  opacity: 0.68;
  font-weight: 500;
  .svg-icon {
    width: 14px;
    height: 14px;
    margin-right: 8px;
  }
  &:hover {
    opacity: 1;
    background: var(--color-secondary-bg);
  }
  &:active {
    opacity: 1;
    transform: scale(0.92);
  }
}

button.playHistory-button {
  color: var(--color-text);
  border-radius: 8px;
  padding: 6px 8px;
  margin-bottom: 12px;
  margin-right: 4px;
  transition: 0.2s;
  opacity: 0.68;
  font-weight: 500;
  cursor: pointer;
  &:hover {
    opacity: 1;
    background: var(--color-secondary-bg);
  }
  &:active {
    transform: scale(0.95);
  }
}

button.playHistory-button--selected {
  color: var(--color-text);
  background: var(--color-secondary-bg);
  opacity: 1;
  font-weight: 700;
  &:active {
    transform: none;
  }
}
@media (max-width: 576px) {
  .section-one {
    flex-direction: column;
  }
  .section-one .songs {
    margin: 20px 0;
    overflow: auto;
  }
  .section-two {
    margin: 0;
  }
}
</style>
