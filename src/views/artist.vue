<template>
  <div v-show="show" class="artist-page">
    <div class="artist-info">
      <div class="head">
        <LazyImage
          :src="resizeImage(artist.img1v1Url, 1024)"
          referrerpolicy="no-referrer"
        />
      </div>
      <div>
        <div class="name">{{ artist.name }}</div>
        <div class="artist">{{ $t('artist.artist') }}</div>
        <div class="statistics">
          <a @click="scrollTo('popularTracks')"
            >{{ artist.musicSize }} {{ $t('common.songs') }}</a
          >
          ·
          <a @click="scrollTo('seeMore', 'start')"
            >{{ artist.albumSize }} {{ $t('artist.withAlbums') }}</a
          >
          ·
          <a @click="scrollTo('mvs')"
            >{{ artist.mvSize }} {{ $t('artist.videos') }}</a
          >
        </div>
        <div class="description" @click="toggleFullDescription">
          {{ artist.briefDesc }}
        </div>
        <div class="buttons">
          <ButtonTwoTone icon-class="play" @click="playPopularSongs()">
            {{ $t('common.play') }}
          </ButtonTwoTone>
          <ButtonTwoTone color="grey" @click="followArtist">
            <span v-if="artist.followed">{{ $t('artist.following') }}</span>
            <span v-else>{{ $t('artist.follow') }}</span>
          </ButtonTwoTone>
          <ButtonTwoTone
            icon-class="more"
            :icon-button="true"
            :horizontal-padding="0"
            color="grey"
            @click="openMenu"
          >
          </ButtonTwoTone>
        </div>
      </div>
    </div>
    <div v-if="latestRelease !== undefined" class="latest-release">
      <div class="section-title">{{ $t('artist.latestRelease') }}</div>
      <div class="release">
        <div class="container">
          <Cover
            :id="latestRelease.id"
            :image-url="resizeImage(latestRelease.picUrl)"
            type="album"
            :fixed-size="128"
            :play-button-size="30"
          />
          <div class="info">
            <div class="name">
              <router-link :to="`/album/${latestRelease.id}`">{{
                latestRelease.name
              }}</router-link>
            </div>
            <div class="date">
              {{ formatDate(latestRelease.publishTime) }}
            </div>
            <div class="type">
              {{ formatAlbumType(latestRelease.type, latestRelease) }} ·
              {{ latestRelease.size }} {{ $t('common.songs') }}
            </div>
          </div>
        </div>
        <div v-show="latestMV.id" class="container latest-mv">
          <div
            class="cover"
            @mouseover="mvHover = true"
            @mouseleave="mvHover = false"
            @click="goToMv(latestMV.id)"
          >
            <LazyImage :src="latestMV.coverUrl" referrerpolicy="no-referrer" />
            <transition name="fade">
              <div
                v-show="mvHover"
                class="shadow"
                :style="{
                  background: 'url(' + latestMV.coverUrl + ')',
                }"
              ></div>
            </transition>
          </div>
          <div class="info">
            <div class="name">
              <router-link :to="'/mv/' + latestMV.id">{{
                latestMV.name
              }}</router-link>
            </div>
            <div class="date">
              {{ formatDate(latestMV.publishTime) }}
            </div>
            <div class="type">{{ $t('artist.latestMV') }}</div>
          </div>
        </div>
        <div v-show="!latestMV.id"></div>
      </div>
    </div>
    <div id="popularTracks" class="popular-tracks">
      <div class="section-title">{{ $t('artist.popularSongs') }}</div>
      <TrackList
        :tracks="popularTracks.slice(0, showMorePopTracks ? 24 : 12)"
        :type="'tracklist'"
      />

      <div id="seeMore" class="show-more">
        <button @click="showMorePopTracks = !showMorePopTracks">
          <span v-show="!showMorePopTracks">{{ $t('artist.showMore') }}</span>
          <span v-show="showMorePopTracks">{{ $t('artist.showLess') }}</span>
        </button>
      </div>
    </div>
    <div v-if="albums.length !== 0" id="albums" class="albums">
      <div class="section-title">{{ $t('artist.albums') }}</div>
      <CoverRow
        :type="'album'"
        :items="albums"
        :sub-text="'releaseYear'"
        :show-play-button="true"
      />
    </div>
    <div v-if="mvs.length !== 0" id="mvs" class="mvs">
      <div class="section-title"
        >MVs
        <router-link v-show="hasMoreMV" :to="`/artist/${artist.id}/mv`">{{
          $t('home.seeMore')
        }}</router-link>
      </div>
      <MvRow :mvs="mvs" subtitle="publishTime" />
    </div>
    <div v-if="eps.length !== 0" class="eps">
      <div class="section-title">{{ $t('artist.EPsSingles') }}</div>
      <CoverRow
        :type="'album'"
        :items="eps"
        :sub-text="'albumType+releaseYear'"
        :show-play-button="true"
      />
    </div>

    <div v-if="similarArtists.length !== 0" class="similar-artists">
      <div class="section-title">{{ $t('artist.similarArtists') }}</div>
      <CoverRow
        type="artist"
        :column-number="6"
        gap="36px 28px"
        :items="similarArtists.slice(0, 12)"
      />
    </div>

    <Modal
      v-model:show="showFullDescription"
      :show-footer="false"
      :click-outside-hide="true"
      :title="$t('artist.artistDesc')"
    >
      <p class="description-fulltext">
        {{ artist.briefDesc }}
      </p>
    </Modal>

    <ContextMenu ref="artistMenuRef">
      <div class="item" @click="copyUrl(artist.id)">{{
        $t('contextMenu.copyUrl')
      }}</div>
      <div class="item" @click="openInBrowser(artist.id)">{{
        $t('contextMenu.openInBrowser')
      }}</div>
    </ContextMenu>
  </div>
</template>

<script setup lang="ts">
const router = useRouter();
const appScroll = useAppScroll();

import {
  getArtist,
  getArtistAlbum,
  artistMv,
  followAArtist,
  // 与同名本地 ref 撞名，导入改名（Options API 时代的 this 遮蔽在 setup 里不成立）
  similarArtists as similarArtistsApi,
} from '@/api/artist';
import { getTrackDetail } from '@/api/track';
import { getI18n } from '@/locale';
import { isAccountLoggedIn } from '@/utils/auth';
import { loadWithProgress, loadOptional } from '@/utils/pageLoad';
import ButtonTwoTone from '@/components/ButtonTwoTone.vue';
import ContextMenu from '@/components/ContextMenu.vue';
import TrackList from '@/components/TrackList.vue';
import CoverRow from '@/components/CoverRow.vue';
import Cover from '@/components/Cover.vue';
import MvRow from '@/components/MvRow.vue';
import Modal from '@/components/Modal.vue';
import { formatAlbumType, formatDate, resizeImage } from '@/utils/formatters';
import { computed, ref } from 'vue';
import { useAppScroll } from '@/composables/useAppScroll';
import { useKeepAliveLoad } from '@/composables/useKeepAliveLoad';
import { useDescriptionToggle } from '@/composables/useDescriptionToggle';
import { useNeteaseLinkActions } from '@/composables/useNeteaseLinkActions';
import { usePlayerStore, useUiStore } from '@/stores';
import { storeToRefs } from 'pinia';
import { onBeforeRouteUpdate } from 'vue-router';

import { useRoute, useRouter } from 'vue-router';
const artistMenuRef = ref<any>(null);
const route = useRoute();
const playerStore = usePlayerStore();
const uiStore = useUiStore();

const { player } = storeToRefs(playerStore);

// MvRow 经 $parent.player.playing 取当前播放态（跳 MV 带 autoplay 参数）
defineExpose({ player });

const showToast = uiStore.showToast;

const show = ref<any>(false);

const artist = ref<any>({
  img1v1Url:
    'https://p1.music.126.net/VnZiScyynLG7atLIZ2YPkw==/18686200114669622.jpg',
});

const popularTracks = ref<any>([]);

const albumsData = ref<any>([]);

const latestRelease = ref<any>({
  picUrl: '',
  publishTime: 0,
  id: 0,
  name: '',
  type: '',
  size: '',
});

const showMorePopTracks = ref<any>(false);

const mvs = ref<any>([]);

const hasMoreMV = ref<any>(false);

const similarArtists = ref<any>([]);

const mvHover = ref<any>(false);

// 简介弹窗开关（原与 playlist/album 重复的实现收敛于此）
const { showFullDescription, toggleFullDescription } = useDescriptionToggle();

// 复制链接 / 浏览器打开（原与 album/mv 重复的实现收敛于此）
const { copyUrl, openInBrowser } = useNeteaseLinkActions('artist');

const albums = computed(function albums() {
  return albumsData.value.filter(a => a.type === '专辑');
});

const eps = computed(function eps() {
  return albumsData.value.filter(a =>
    ['EP/Single', 'EP', 'Single'].includes(a.type)
  );
});

const latestMV = computed(function latestMV() {
  const mv = mvs.value[0] || {};
  return {
    id: mv.id || mv.vid,
    name: mv.name || mv.title,
    coverUrl: `${mv.imgurl16v9 || mv.cover || mv.coverUrl}?param=464y260`,
    publishTime: mv.publishTime,
  };
});

function loadData(id, next = undefined) {
  show.value = false;
  appScroll.scrollTo({ top: 0 });
  loadWithProgress(
    getArtist(id).then(data => {
      artist.value = data.artist;
      setPopularTracks(data.hotSongs);
      if (next !== undefined) next();
      show.value = true;
    })
  );
  loadOptional(
    getArtistAlbum({ id: id, limit: 200 }).then(data => {
      albumsData.value = data.hotAlbums;
      latestRelease.value = data.hotAlbums[0];
    })
  );
  loadOptional(
    artistMv({ id }).then(data => {
      mvs.value = data.mvs;
      hasMoreMV.value = data.hasMore;
    })
  );
  if (isAccountLoggedIn()) {
    loadOptional(
      similarArtistsApi(id).then(data => {
        similarArtists.value = data.artists;
      })
    );
  }
}

function setPopularTracks(hotSongs) {
  const trackIDs = hotSongs.map(t => t.id);
  loadOptional(
    getTrackDetail(trackIDs.join(',')).then(data => {
      popularTracks.value = data.songs;
    })
  );
}

function goToMv(id) {
  router.push({ path: '/mv/' + id });
}

function playPopularSongs(trackID = 'first') {
  let trackIDs = popularTracks.value.map(t => t.id);
  playerStore.player.replacePlaylist(
    trackIDs,
    artist.value.id,
    'artist',
    trackID
  );
}

function followArtist() {
  if (!isAccountLoggedIn()) {
    showToast((getI18n() as any).global.t('toast.needToLogin'));
    return;
  }
  followAArtist({
    id: artist.value.id,
    t: artist.value.followed ? 0 : 1,
  }).then(data => {
    if (data.code === 200) artist.value.followed = !artist.value.followed;
  });
}

function scrollTo(div, block: ScrollLogicalPosition = 'center') {
  document.getElementById(div).scrollIntoView({
    behavior: 'smooth',
    block,
  });
}

function openMenu(e) {
  artistMenuRef.value.openMenu(e);
}

// /artist 是 keepAlive 路由：Vue3 首挂会同帧先后触发 onMounted 与 onActivated，两处都注册会把艺人接口拉两遍；useKeepAliveLoad 保证「首挂载 + 缓存重入」各执行一次
useKeepAliveLoad(function loadArtistData() {
  if (artist.value?.id?.toString() !== route.params.id) {
    loadData(route.params.id);
  } else {
    appScroll.restorePosition();
  }
});

onBeforeRouteUpdate((to, from, next) => {
  artist.value.img1v1Url =
    'https://p1.music.126.net/VnZiScyynLG7atLIZ2YPkw==/18686200114669622.jpg';
  loadData(to.params.id, next);
});
</script>

<style lang="scss" scoped>
.artist-page {
  margin-top: 32px;
}

.artist-info {
  display: flex;
  align-items: center;
  margin-bottom: 26px;
  color: var(--color-text);
  img {
    height: 248px;
    width: 248px;
    border-radius: 50%;
    margin-right: 56px;
    box-shadow: rgba(0, 0, 0, 0.2) 0px 12px 16px -8px;
  }
  .name {
    font-size: 56px;
    font-weight: 700;
  }

  .artist {
    font-size: 18px;
    opacity: 0.88;
    margin-top: 24px;
  }

  .statistics {
    font-size: 14px;
    opacity: 0.68;
    margin-top: 2px;
  }

  .buttons {
    margin-top: 26px;
    display: flex;
    .shuffle {
      padding: 8px 11px;
      .svg-icon {
        margin: 0;
      }
    }
  }

  .description {
    user-select: none;
    font-size: 14px;
    opacity: 0.68;
    margin-top: 24px;
    display: -webkit-box;
    -webkit-box-orient: vertical;
    -webkit-line-clamp: 2;
    overflow: hidden;
    cursor: pointer;
    white-space: pre-line;
    &:hover {
      transition: opacity 0.3s;
      opacity: 0.88;
    }
  }
}

.section-title {
  font-weight: 600;
  font-size: 22px;
  opacity: 0.88;
  color: var(--color-text);
  margin-bottom: 16px;
  padding-top: 46px;

  display: flex;
  justify-content: space-between;
  align-items: flex-end;
  a {
    font-size: 13px;
    font-weight: 600;
    opacity: 0.68;
  }
}

.latest-release {
  color: var(--color-text);
  .release {
    display: flex;
  }
  .container {
    display: flex;
    flex: 1;
    align-items: center;
    border-radius: 12px;
  }
  img {
    height: 96px;
    border-radius: 8px;
  }
  .info {
    margin-left: 24px;
  }
  .name {
    font-size: 18px;
    font-weight: 600;
    margin-bottom: 8px;
  }
  .date {
    font-size: 14px;
    opacity: 0.78;
  }
  .type {
    margin-top: 2px;
    font-size: 12px;
    opacity: 0.68;
  }
}

.popular-tracks {
  .show-more {
    display: flex;

    button {
      padding: 4px 8px;
      margin-top: 8px;
      border-radius: 6px;
      font-size: 12px;
      opacity: 0.78;
      color: var(--color-secondary);
      font-weight: 600;
      &:hover {
        opacity: 1;
      }
    }
  }
}

.similar-artists {
  .section-title {
    margin-bottom: 24px;
  }
}

.latest-mv {
  .cover {
    position: relative;
    transition: transform 0.3s;
    &:hover {
      cursor: pointer;
    }
  }
  img {
    border-radius: 0.75em;
    height: 128px;
    object-fit: cover;
    user-select: none;
  }

  .shadow {
    position: absolute;
    top: 6px;
    height: 100%;
    width: 100%;
    filter: blur(16px) opacity(0.4);
    transform: scale(0.9, 0.9);
    z-index: -1;
    background-size: cover;
    border-radius: 0.75em;
  }

  .fade-enter-active,
  .fade-leave-active {
    transition: opacity 0.3s;
  }
  .fade-enter-from,
  .fade-leave-to {
    opacity: 0;
  }
}

.description-fulltext {
  font-size: 16px;
  margin-top: 24px;
  display: -webkit-box;
  -webkit-box-orient: vertical;
  overflow: hidden;
  white-space: pre-line;
}

@media (max-width: 576px) {
  .artist {
    margin-top: 14px;
  }
  .head {
    width: auto !important;
    height: auto !important;
  }
  .artist-info img {
    margin-right: 0;
  }
  .artist-info {
    margin: 0;
    flex-direction: column;
    .name {
      margin-top: 20px;
    }
  }
  .artist-info .info {
    padding: 14px;
    margin: 0;
  }
  .search-box-likepage {
    right: 8vw;
  }
}
</style>
