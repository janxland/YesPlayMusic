<template>
  <div v-show="show" class="album-page">
    <div class="playlist-info">
      <Cover
        :id="album.id"
        :image-url="resizeImage(album.picUrl, 1024)"
        :show-play-button="true"
        :always-show-shadow="true"
        :click-cover-to-play="true"
        type="album"
        :cover-hover="false"
        :play-button-size="18"
        @click.right="openMenu"
      />
      <div class="info">
        <div class="title" @click.right="openMenu"> {{ title }}</div>
        <div v-if="subtitle !== ''" class="subtitle" @click.right="openMenu">{{
          subtitle
        }}</div>
        <div class="artist">
          <span v-if="album.artist.id !== 104700">
            <span>{{ formatAlbumType(album.type, album) }} by </span
            ><router-link :to="`/artist/${album.artist.id}`">{{
              album.artist.name
            }}</router-link></span
          >
          <span v-else>Compilation by Various Artists</span>
        </div>
        <div class="date-and-count">
          <span
            v-if="(album.mark & 1048576) === 1048576"
            class="explicit-symbol"
            ><ExplicitSymbol
          /></span>
          <span :title="formatDate(album.publishTime)">{{
            new Date(album.publishTime).getFullYear()
          }}</span>
          <span> · {{ album.size }} {{ $t('common.songs') }}</span
          >,
          {{ formatTime(albumTime, 'Human') }}
        </div>
        <div class="description" @click="toggleFullDescription">
          {{ album.description }}
        </div>
        <div class="buttons" style="margin-top: 32px">
          <ButtonTwoTone icon-class="play" @click="playAlbumByID(album.id)">
            {{ $t('common.play') }}
          </ButtonTwoTone>
          <ButtonTwoTone
            :icon-class="dynamicDetail.isSub ? 'heart-solid' : 'heart'"
            :icon-button="true"
            :horizontal-padding="0"
            :color="dynamicDetail.isSub ? 'blue' : 'grey'"
            :text-color="dynamicDetail.isSub ? '#335eea' : ''"
            :background-color="
              dynamicDetail.isSub ? 'var(--color-secondary-bg)' : ''
            "
            @click="likeAlbum"
          >
          </ButtonTwoTone>
          <ButtonTwoTone
            v-if="!$route.query.server"
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
    <div v-if="tracksByDisc.length > 1">
      <div v-for="item in tracksByDisc" :key="item.disc">
        <h2 class="disc">Disc {{ item.disc }}</h2>
        <TrackList
          :id="album.id"
          :tracks="item.tracks"
          :type="'album'"
          :album-object="album"
        />
      </div>
    </div>
    <div v-else>
      <TrackList
        :id="album.id"
        :tracks="tracks"
        :type="'album'"
        :album-object="album"
      />
    </div>
    <div class="extra-info">
      <div class="album-time"></div>
      <div class="release-date">
        {{ $t('album.released') }}
        {{ formatDate(album.publishTime, 'MMMM D, YYYY') }}
      </div>
      <div v-if="album.company !== null" class="copyright">
        © {{ album.company }}
      </div>
    </div>
    <div v-if="filteredMoreAlbums.length !== 0" class="more-by">
      <div class="section-title">
        More by
        <router-link :to="`/artist/${album.artist.id}`"
          >{{ album.artist.name }}
        </router-link>
      </div>
      <div>
        <CoverRow
          type="album"
          :items="filteredMoreAlbums"
          sub-text="albumType+releaseYear"
        />
      </div>
    </div>
    <Modal
      v-model:show="showFullDescription"
      :show-footer="false"
      :click-outside-hide="true"
      :title="$t('album.albumDesc')"
    >
      <p class="description-fulltext">
        {{ album.description }}
      </p>
    </Modal>
    <ContextMenu ref="albumMenuRef">
      <div class="item" @click="likeAlbum(true)">{{
        dynamicDetail.isSub
          ? $t('contextMenu.removeFromLibrary')
          : $t('contextMenu.saveToLibrary')
      }}</div>
      <div class="item">{{ $t('contextMenu.addToPlaylist') }}</div>
      <div class="item" @click="copyUrl(album.id)">{{
        $t('contextMenu.copyUrl')
      }}</div>
      <div class="item" @click="openInBrowser(album.id)">{{
        $t('contextMenu.openInBrowser')
      }}</div>
    </ContextMenu>
  </div>
</template>

<script setup lang="ts">
import { getArtistAlbum } from '@/api/artist';
import { getTrackDetail } from '@/api/track';
import { getAlbum, albumDynamicDetail, likeAAlbum } from '@/api/album';
import { getI18n } from '@/locale';
import { splitSoundtrackAlbumTitle, splitAlbumTitle } from '@/utils/common';
import { loadWithProgress, loadOptional } from '@/utils/pageLoad';
import { isAccountLoggedIn } from '@/utils/auth';
import groupBy from 'lodash/groupBy';
import toPairs from 'lodash/toPairs';
import sortBy from 'lodash/sortBy';
import ExplicitSymbol from '@/components/ExplicitSymbol.vue';
import ButtonTwoTone from '@/components/ButtonTwoTone.vue';
import ContextMenu from '@/components/ContextMenu.vue';
import TrackList from '@/components/TrackList.vue';
import CoverRow from '@/components/CoverRow.vue';
import Cover from '@/components/Cover.vue';
import Modal from '@/components/Modal.vue';
import {
  formatAlbumType,
  formatDate,
  formatTime,
  resizeImage,
} from '@/utils/formatters';
import { ref, computed } from 'vue';
import { usePlayerStore, useUiStore } from '@/stores';
import { onBeforeRouteUpdate, useRoute } from 'vue-router';
import { useDescriptionToggle } from '@/composables/useDescriptionToggle';
import { useNeteaseLinkActions } from '@/composables/useNeteaseLinkActions';
import { useCrossPlatformPlay } from '@/composables/useCrossPlatformPlay';

const albumMenuRef = ref<any>(null);
const route = useRoute();
const playerStore = usePlayerStore();
const uiStore = useUiStore();

const showToast = uiStore.showToast;

const show = ref<any>(false);

const album = ref<any>({
  id: 0,
  picUrl: '',
  artist: {
    id: 0,
  },
});

const tracks = ref<any>([]);

const moreAlbums = ref<any>([]);

const dynamicDetail = ref<any>({});

const subtitle = ref<any>('');

const title = ref<any>('');

// 简介弹窗开关（原与 playlist/artist 重复的实现收敛于此）
const { showFullDescription, toggleFullDescription } = useDescriptionToggle();

// 复制链接 / 浏览器打开（原与 artist/mv 重复的实现收敛于此）
const { copyUrl, openInBrowser } = useNeteaseLinkActions('album');

// 第三方平台歌单播放（原与 playlist/coSearch 重复的实现收敛于此）
const { playThisListByTrack: playCrossPlatformList } = useCrossPlatformPlay();

const albumTime = computed(function albumTime() {
  let time = 0;
  tracks.value.map(t => (time = time + t.dt));
  return time;
});

const filteredMoreAlbums = computed(function filteredMoreAlbums() {
  // 局部改名避免遮蔽同名 ref（原 this.moreAlbums 与本地 moreAlbums 是两个东西）
  let albums = moreAlbums.value.filter(a => a.id !== album.value.id);
  let realAlbums = albums.filter(a => a.type === '专辑');
  let eps = albums.filter(
    a => a.type === 'EP' || (a.type === 'EP/Single' && a.size > 1)
  );
  let restItems = albums.filter(
    a =>
      realAlbums.find(a1 => a1.id === a.id) === undefined &&
      eps.find(a1 => a1.id === a.id) === undefined
  );
  if (realAlbums.length === 0) {
    return [...realAlbums, ...eps, ...restItems].slice(0, 5);
  } else {
    return [...realAlbums, ...restItems].slice(0, 5);
  }
});

const tracksByDisc = computed(function tracksByDisc() {
  if (tracks.value.length <= 1) return [];
  const pairs = toPairs(groupBy(tracks.value, 'cd'));
  return sortBy(pairs, p => p[0]).map(items => ({
    disc: items[0],
    tracks: items[1],
  }));
});

function playAlbumByID(id, trackID = 'first') {
  if (route.query.server) {
    playCrossPlatformList(id, route.query.server);
    return;
  }
  playerStore.player.playAlbumByID(id, trackID);
}

function likeAlbum(toast = false) {
  if (!isAccountLoggedIn()) {
    showToast((getI18n() as any).global.t('toast.needToLogin'));
    return;
  }
  likeAAlbum({
    id: album.value.id,
    t: dynamicDetail.value.isSub ? 0 : 1,
  })
    .then(data => {
      if (data.code === 200) {
        dynamicDetail.value.isSub = !dynamicDetail.value.isSub;
        if (toast === true)
          showToast(
            dynamicDetail.value.isSub ? '已保存到音乐库' : '已从音乐库删除'
          );
      }
    })
    .catch(error => {
      // 网络级失败没有 error.response，裸读会二次抛 TypeError
      showToast(`${error?.response?.data?.message || error}`);
    });
}

function formatTitle() {
  let splitTitle = splitSoundtrackAlbumTitle(album.value.name);
  let splitTitle2 = splitAlbumTitle(splitTitle.title);
  title.value = splitTitle2.title;
  if (splitTitle.subtitle !== '' && splitTitle2.subtitle !== '') {
    subtitle.value = splitTitle.subtitle + ' · ' + splitTitle2.subtitle;
  } else {
    subtitle.value =
      splitTitle.subtitle === '' ? splitTitle2.subtitle : splitTitle.subtitle;
  }
}

function loadData(id) {
  loadWithProgress(
    getAlbum(id).then(data => {
      album.value = data.album;
      // 异常体缺 songs 时下一行的 .map 直接 TypeError，让成功响应整页进错误态
      tracks.value = data.songs ?? [];
      formatTitle();
      show.value = true;

      // to get explicit mark
      let trackIDs = tracks.value.map(t => t.id);
      loadOptional(
        getTrackDetail(trackIDs.join(',')).then(data => {
          // 异常体缺 songs 时赋 undefined 会让 TrackList 渲染期 .filter 崩掉
          tracks.value = data.songs ?? [];
        })
      );

      // get more album by this artist
      loadOptional(
        getArtistAlbum({ id: album.value.artist.id, limit: 100 }).then(data => {
          // filteredMoreAlbums computed 的 .filter 渲染期会读它
          moreAlbums.value = data.hotAlbums ?? [];
        })
      );
    })
  );
  loadOptional(
    albumDynamicDetail(id).then(data => {
      dynamicDetail.value = data;
    })
  );
}

function openMenu(e) {
  albumMenuRef.value.openMenu(e);
}

loadData(route.params.id);

onBeforeRouteUpdate((to, from, next) => {
  show.value = false;
  loadData(to.params.id);
  next();
});
</script>

<style lang="scss" scoped>
.album-page {
  margin-top: 32px;
}
.playlist-info {
  display: flex;
  width: 78vw;
  margin-bottom: 72px;
  .info {
    display: flex;
    flex-direction: column;
    justify-content: center;
    flex: 1;
    margin-left: 56px;
    color: var(--color-text);
    .title {
      font-size: 56px;
      font-weight: 700;
    }
    .subtitle {
      font-size: 22px;
      font-weight: 600;
    }
    .artist {
      font-size: 18px;
      opacity: 0.88;
      margin-top: 24px;
      a {
        font-weight: 600;
      }
    }
    .date-and-count {
      font-size: 14px;
      opacity: 0.68;
      margin-top: 2px;
    }
    .description {
      user-select: none;
      font-size: 14px;
      opacity: 0.68;
      margin-top: 24px;
      display: -webkit-box;
      -webkit-box-orient: vertical;
      -webkit-line-clamp: 3;
      overflow: hidden;
      cursor: pointer;
      white-space: pre-line;
      &:hover {
        transition: opacity 0.3s;
        opacity: 0.88;
      }
    }
    .buttons {
      margin-top: 32px;
      display: flex;
      button {
        margin-right: 16px;
      }
    }
  }
}
.disc {
  color: var(--color-text);
}

.explicit-symbol {
  opacity: 0.28;
  color: var(--color-text);
  margin-right: 4px;
  .svg-icon {
    margin-bottom: -3px;
  }
}

.extra-info {
  margin-top: 36px;
  margin-bottom: 36px;
  font-size: 12px;
  opacity: 0.48;
  color: var(--color-text);
  div {
    margin-bottom: 4px;
  }
  .album-time {
    opacity: 0.68;
  }
}

.more-by {
  border-top: 1px solid rgba(128, 128, 128, 0.18);

  padding-top: 22px;
  .section-title {
    font-size: 22px;
    font-weight: 600;
    opacity: 0.88;
    color: var(--color-text);
    margin-bottom: 20px;
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
.cover {
  height: 288px;
  width: 288px;
}
@media (max-width: 576px) {
  .playlist {
    margin-top: 14px;
  }
  .cover {
    width: auto !important;
    height: auto !important;
  }
  .playlist-info {
    width: auto;
    margin: 0;
    flex-direction: column;
  }
  .playlist-info .info .title {
    font-size: 24px;
    font-weight: 700;
  }
  .playlist-info .info {
    padding: 14px;
    margin: 0;
  }
  .search-box-likepage {
    right: 8vw;
  }
}
</style>
