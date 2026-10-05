<template>
  <div v-show="show" class="search">
    <h1>
      <span>{{ $t('search.searchFor') }} {{ typeNameTable[type] }}</span> "{{
        keywords
      }}"
    </h1>

    <div v-if="type === 'artists'">
      <CoverRow type="artist" :items="result" :column-number="6" />
    </div>
    <div v-if="type === 'albums'">
      <CoverRow
        type="album"
        :items="result"
        sub-text="artist"
        sub-text-font-size="14px"
      />
    </div>
    <div v-if="type === 'tracks'">
      <TrackList
        :tracks="result"
        type="playlist"
        dbclick-track-func="playAList"
      />
    </div>
    <div v-if="type === 'musicVideos'">
      <MvRow :mvs="result" />
    </div>
    <div v-if="type === 'playlists'">
      <CoverRow type="playlist" :items="result" sub-text="title" />
    </div>

    <div class="load-more">
      <ButtonTwoTone v-show="hasMore" color="grey" @click="fetchData">{{
        $t('explore.loadMore')
      }}</ButtonTwoTone>
    </div>
  </div>
</template>

<script setup lang="ts">
const route = useRoute();

import { getTrackDetail } from '@/api/track';
import { search } from '@/api/others';
import { getI18n } from '@/locale';
import { camelCase } from 'change-case';
import { loadWithProgress, loadOptional } from '@/utils/pageLoad';
import TrackList from '@/components/TrackList.vue';
import MvRow from '@/components/MvRow.vue';
import CoverRow from '@/components/CoverRow.vue';
import ButtonTwoTone from '@/components/ButtonTwoTone.vue';
import { ref, computed } from 'vue';
import { usePlayerStore } from '@/stores';

import { useRoute } from 'vue-router';
const playerStore = usePlayerStore();

// MvRow 经 $parent.player.playing 取当前播放态（跳 MV 带 autoplay 参数）
defineExpose({ player: playerStore.player });

const show = ref<any>(false);

const result = ref<any>([]);

const hasMore = ref<any>(true);

const keywords = computed(function keywords() {
  return route.params.keywords;
});

const type = computed(function type() {
  // 路由参数类型是 string | string[]，单段 param 实际只会是 string，取首元素收窄
  const rawType = route.params.type;
  return camelCase(Array.isArray(rawType) ? rawType[0] : rawType);
});

const typeNameTable = computed(function typeNameTable() {
  return {
    musicVideos: (getI18n() as any).global.t('search.mv'),
    tracks: (getI18n() as any).global.t('search.song'),
    albums: (getI18n() as any).global.t('search.album'),
    artists: (getI18n() as any).global.t('search.artist'),
    playlists: (getI18n() as any).global.t('search.playlist'),
  };
});

function fetchData() {
  const typeTable = {
    musicVideos: 1004,
    tracks: 1,
    albums: 10,
    artists: 100,
    playlists: 1000,
  };
  return loadWithProgress(
    search({
      keywords: keywords.value,
      type: typeTable[type.value],
      offset: result.value.length,
    }).then(data => {
      // 局部改名避免遮蔽同名 ref（原 this.result 与 then 回调的 result 是两个东西）
      const res = data.result;
      hasMore.value = res.hasMore ?? true;
      switch (type.value) {
        case 'musicVideos':
          result.value.push(...res.mvs);
          if (res.mvCount <= result.value.length) {
            hasMore.value = false;
          }
          break;
        case 'artists':
          result.value.push(...res.artists);
          // artists 接口不给总数，靠「空页」判定到底，否则按钮永不出户
          if (res.artists.length === 0) hasMore.value = false;
          break;
        case 'albums':
          result.value.push(...res.albums);
          if (res.albumCount <= result.value.length) {
            hasMore.value = false;
          }
          break;
        case 'tracks':
          result.value.push(...res.songs);
          getTracksDetail();
          break;
        case 'playlists':
          result.value.push(...res.playlists);
          if (res.playlists.length === 0) hasMore.value = false;
          break;
      }
      show.value = true;
    })
  );
}

function getTracksDetail() {
  const trackIDs = result.value.map(t => t.id);
  if (trackIDs.length === 0) return;
  loadOptional(
    getTrackDetail(trackIDs.join(',')).then(data => {
      result.value = data.songs;
    })
  );
}

fetchData();
</script>

<style lang="scss" scoped>
h1 {
  margin-top: 32px;
  margin-bottom: 28px;
  color: var(--color-text);
  span {
    opacity: 0.58;
  }
}
.load-more {
  display: flex;
  justify-content: center;
  margin-top: 32px;
}

.button.more {
  .svg-icon {
    height: 24px;
    width: 24px;
  }
}
</style>
