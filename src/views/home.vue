<template>
  <div v-show="show" class="home">
    <div
      v-if="settings.showPlaylistsByAppleMusic !== false"
      class="index-row first-row"
    >
      <div class="title"> by Apple Music </div>
      <CoverRow
        :type="'playlist'"
        :items="byAppleMusic"
        sub-text="appleMusic"
        :image-size="1024"
      />
    </div>
    <div class="index-row">
      <div class="title">
        {{ $t('home.recommendPlaylist') }}
        <router-link to="/explore?category=推荐歌单">{{
          $t('home.seeMore')
        }}</router-link>
      </div>
      <CoverRow
        :type="'playlist'"
        :items="recommendPlaylist.items"
        sub-text="copywriter"
      />
    </div>
    <div class="index-row">
      <div class="title"> For You </div>
      <div class="for-you-row no-scrollbar">
        <DailyTracksCard ref="DailyTracksCardRef" />
        <FMCard />
      </div>
    </div>
    <div class="index-row">
      <div class="title">{{ $t('home.recommendArtist') }}</div>
      <CoverRow
        type="artist"
        :column-number="6"
        :items="recommendArtists.items"
      />
    </div>
    <div class="index-row">
      <div class="title">
        {{ $t('home.newAlbum') }}
        <router-link to="/new-album">{{ $t('home.seeMore') }}</router-link>
      </div>
      <CoverRow
        type="album"
        :items="newReleasesAlbum.items"
        sub-text="artist"
      />
    </div>
    <div class="index-row">
      <div class="title">
        {{ $t('home.charts') }}
        <router-link to="/explore?category=排行榜">{{
          $t('home.seeMore')
        }}</router-link>
      </div>
      <CoverRow
        type="playlist"
        :items="topList.items"
        sub-text="updateFrequency"
        :image-size="1024"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import { toplists } from '@/api/playlist';
import { toplistOfArtists } from '@/api/artist';
import { newAlbums } from '@/api/album';
// 与同名本地 computed 撞名，导入改名（Options API 时代的 this 遮蔽在 setup 里不成立）
import { byAppleMusic as byAppleMusicPlaylists } from '@/utils/staticData';
import { getRecommendPlayList } from '@/utils/playList';
import { loadWithProgress, loadOptional } from '@/utils/pageLoad';
import CoverRow from '@/components/CoverRow.vue';
import FMCard from '@/components/FMCard.vue';
import DailyTracksCard from '@/components/DailyTracksCard.vue';
import { computed, ref } from 'vue';
import { useSettingsStore } from '@/stores';
import { storeToRefs } from 'pinia';
import { useKeepAliveLoad } from '@/composables/useKeepAliveLoad';

const DailyTracksCardRef = ref<any>(null);
const settingsStore = useSettingsStore();

const { settings } = storeToRefs(settingsStore);

const show = ref<any>(false);

const recommendPlaylist = ref<any>({ items: [] });

const newReleasesAlbum = ref<any>({ items: [] });

const topList = ref<any>({
  items: [],
  ids: [19723756, 180106, 60198, 3812895, 60131],
});

const recommendArtists = ref<any>({
  items: [],
  indexs: [],
});

const byAppleMusic = computed(function byAppleMusic() {
  return byAppleMusicPlaylists;
});

function loadData() {
  loadWithProgress(
    getRecommendPlayList(10, false).then(items => {
      recommendPlaylist.value.items = items;
      show.value = true;
    })
  );
  loadOptional(
    newAlbums({
      area: settings.value.musicLanguage ?? 'ALL',
      limit: 10,
    }).then(data => {
      newReleasesAlbum.value.items = data.albums;
    })
  );

  const toplistOfArtistsAreaTable = {
    all: null,
    zh: 1,
    ea: 2,
    jp: 4,
    kr: 3,
  };
  loadOptional(
    toplistOfArtists(
      toplistOfArtistsAreaTable[settings.value.musicLanguage ?? 'all']
    ).then(data => {
      let indexs = [];
      while (indexs.length < 6) {
        let tmp = ~~(Math.random() * 100);
        if (!indexs.includes(tmp)) indexs.push(tmp);
      }
      recommendArtists.value.indexs = indexs;
      recommendArtists.value.items = data.list.artists.filter((l, index) =>
        indexs.includes(index)
      );
    })
  );
  loadOptional(
    toplists().then(data => {
      topList.value.items = data.list.filter(l =>
        topList.value.ids.includes(l.id)
      );
    })
  );
  DailyTracksCardRef.value.loadDailyTracks();
}

// /home 是 keepAlive 路由：Vue3 首挂会同帧先后触发 onMounted 与 onActivated，两处都注册会把首页接口拉两遍；useKeepAliveLoad 保证「首挂载 + 缓存重入」各执行一次
useKeepAliveLoad(function loadHomeData() {
  loadData();
});
</script>

<style lang="scss" scoped>
.index-row {
  margin-top: 54px;
}
.index-row.first-row {
  margin-top: 32px;
}
.playlists {
  display: flex;
  flex-wrap: wrap;
  margin: {
    right: -12px;
    left: -12px;
  }
  .index-playlist {
    margin: 12px 12px 24px 12px;
  }
}

.title {
  display: flex;
  justify-content: space-between;
  align-items: flex-end;
  margin-bottom: 20px;
  font-size: 28px;
  font-weight: 700;
  color: var(--color-text);
  a {
    font-size: 13px;
    font-weight: 600;
    opacity: 0.68;
  }
}

footer {
  display: flex;
  justify-content: center;
  margin-top: 48px;
}

.for-you-row {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 24px;
  margin-bottom: 78px;
}
@media (max-width: 576px) {
  .for-you-row {
    overflow: auto;
    grid-template-columns: 100%;
    margin-bottom: 0;
  }
}
</style>
