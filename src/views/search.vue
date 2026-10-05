<template>
  <div v-show="show" class="search-page">
    <div v-show="tracks.length > 0" class="tracks">
      <div class="section-title"
        >{{ $t('search.song')
        }}<router-link :to="`/search/${keywords}/tracks`">{{
          $t('home.seeMore')
        }}</router-link></div
      >
      <TrackList :tracks="tracks" type="tracklist" />
    </div>
    <div v-show="artists.length > 0 || albums.length > 0" class="row">
      <div v-show="artists.length > 0" class="artists">
        <div v-show="artists.length > 0" class="section-title"
          >{{ $t('search.artist')
          }}<router-link :to="`/search/${keywords}/artists`">{{
            $t('home.seeMore')
          }}</router-link></div
        >
        <CoverRow
          type="artist"
          :column-number="3"
          :items="artists.slice(0, 3)"
          gap="34px 24px"
        />
      </div>

      <div class="albums">
        <div v-show="albums.length > 0" class="section-title"
          >{{ $t('search.album')
          }}<router-link :to="`/search/${keywords}/albums`">{{
            $t('home.seeMore')
          }}</router-link></div
        >
        <CoverRow
          type="album"
          :items="albums.slice(0, 3)"
          sub-text="artist"
          :column-number="3"
          sub-text-font-size="14px"
          gap="34px 24px"
          :play-button-size="26"
        />
      </div>
    </div>
    <div v-show="playlists.length > 0" class="playlists">
      <div class="section-title"
        >{{ $t('search.playlist')
        }}<router-link :to="`/search/${keywords}/playlists`">{{
          $t('home.seeMore')
        }}</router-link></div
      >
      <CoverRow
        type="playlist"
        :items="playlists.slice(0, 12)"
        sub-text="title"
        :column-number="6"
        sub-text-font-size="14px"
        gap="34px 24px"
        :play-button-size="26"
      />
    </div>
    <div v-show="musicVideos.length > 0" class="music-videos">
      <div class="section-title"
        >{{ $t('search.mv')
        }}<router-link :to="`/search/${keywords}/music-videos`">{{
          $t('home.seeMore')
        }}</router-link></div
      >
      <MvRow :mvs="musicVideos.slice(0, 5)" />
    </div>
    <div v-show="!haveResult" class="no-results">
      <div
        ><svg-icon icon-class="search" />
        {{
          keywords.length === 0 ? '输入关键字搜索' : $t('search.noResult')
        }}</div
      >
    </div>
  </div>
</template>

<script setup lang="ts">
const route = useRoute();

import { getTrackDetail } from '@/api/track';
// 与同名本地函数撞名，导入改名（Options API 时代的 this 遮蔽在 setup 里不成立）
import { search as searchApi } from '@/api/others';
import { loadWithProgress, loadOptional } from '@/utils/pageLoad';
import TrackList from '@/components/TrackList.vue';
import MvRow from '@/components/MvRow.vue';
import CoverRow from '@/components/CoverRow.vue';
import { ref, computed, watch } from 'vue';
import { usePlayerStore, useUiStore } from '@/stores';

import { useRoute } from 'vue-router';
const playerStore = usePlayerStore();
const uiStore = useUiStore();

// MvRow 经 $parent.player.playing 取当前播放态（跳 MV 带 autoplay 参数）
defineExpose({ player: playerStore.player });

const showToast = uiStore.showToast;

const show = ref<any>(false);

const tracks = ref<any>([]);

const artists = ref<any>([]);

const albums = ref<any>([]);

const playlists = ref<any>([]);

const musicVideos = ref<any>([]);

const keywords = computed(function keywords() {
  return route.params.keywords ?? '';
});

const haveResult = computed(function haveResult() {
  return (
    tracks.value.length +
      artists.value.length +
      albums.value.length +
      playlists.value.length +
      musicVideos.value.length >
    0
  );
});

function playTrackInSearchResult(id) {
  let track = tracks.value.find(t => t.id === id);
  playerStore.player.appendTrackToPlayerList(track, true);
}

function search(type = 'all') {
  const typeTable = {
    all: 1018,
    musicVideos: 1004,
    tracks: 1,
    albums: 10,
    artists: 100,
    playlists: 1000,
  };
  return searchApi({
    keywords: keywords.value,
    type: typeTable[type],
    limit: 16,
  })
    .then(result => {
      return { result: result.result, type };
    })
    .catch(err => {
      // 网络级失败（超时/断网）没有 err.response，旧写法在此处直接 TypeError，让整个结果区永久隐藏
      showToast(err?.response?.data?.msg ?? '该类型搜索失败，请检查网络后重试');
    });
}

function getData() {
  show.value = false;

  const requestAll = requests => {
    const prevKeywords = keywords.value;
    loadWithProgress(
      Promise.all(requests).then(results => {
        if (prevKeywords != keywords.value) return;
        results.forEach(result => {
          // 单个类型失败时 search() 的 catch 返回 undefined，跳过即可
          if (!result || result.result === undefined) return;
          const { type: searchType, result: data } = result;
          switch (searchType) {
            case 'musicVideos':
              musicVideos.value = data.mvs ?? [];
              break;
            case 'artists':
              artists.value = data.artists ?? [];
              break;
            case 'albums':
              albums.value = data.albums ?? [];
              break;
            case 'tracks':
              tracks.value = data.songs ?? [];
              getTracksDetail();
              break;
            case 'playlists':
              playlists.value = data.playlists ?? [];
              break;
          }
        });
        show.value = true;
      })
    );
  };

  const requests = [search('artists'), search('albums'), search('tracks')];
  const requests2 = [search('musicVideos'), search('playlists')];

  requestAll(requests);
  requestAll(requests2);
}

function getTracksDetail() {
  const trackIDs = tracks.value.map(t => t.id);
  if (trackIDs.length === 0) return;
  loadOptional(
    getTrackDetail(trackIDs.join(',')).then(result => {
      tracks.value = result.songs;
    })
  );
}

getData();

watch(keywords, function (newKeywords) {
  if (newKeywords.length === 0) return;
  getData();
});
</script>

<style lang="scss" scoped>
.section-title {
  font-weight: 600;
  font-size: 22px;
  opacity: 0.88;
  color: var(--color-text);
  margin-bottom: 16px;

  display: flex;
  justify-content: space-between;
  align-items: center;
  a {
    font-size: 13px;
    font-weight: 600;
    opacity: 0.68;
  }
}

.row {
  display: flex;
  flex-wrap: wrap;
  margin-top: 32px;

  .artists {
    flex: 1;
    margin-right: 8rem;
  }
  .albums {
    flex: 1;
  }
}

.tracks,
.music-videos,
.playlists {
  margin-top: 46px;
}

.no-results {
  position: absolute;
  top: 64px;
  right: 0;
  left: 0;
  bottom: 64px;
  font-size: 24px;
  color: var(--color-text);
  opacity: 0.38;
  display: flex;
  justify-content: center;
  align-items: center;
  div {
    display: flex;
    align-items: center;
  }
  .svg-icon {
    height: 24px;
    width: 24px;
    margin-right: 16px;
  }
}
</style>
