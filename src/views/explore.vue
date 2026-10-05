<template>
  <div class="explore-page">
    <h1>{{ $t('explore.explore') }}</h1>
    <div class="buttons">
      <div
        v-for="category in settings.enabledPlaylistCategories"
        :key="category"
        class="button"
        :class="{ active: category === activeCategory && !showCatOptions }"
        @click="goToCategory(category)"
      >
        {{ category }}
      </div>
      <div
        class="button more"
        :class="{ active: showCatOptions }"
        @click="showCatOptions = !showCatOptions"
      >
        <svg-icon icon-class="more"></svg-icon>
      </div>
    </div>

    <div v-show="showCatOptions" class="panel">
      <div v-for="bigCat in allBigCats" :key="bigCat" class="big-cat">
        <div class="name">{{ bigCat }}</div>
        <div class="cats">
          <div
            v-for="cat in getCatsByBigCat(bigCat)"
            :key="cat.name"
            class="cat"
            :class="{
              active: settings.enabledPlaylistCategories.includes(cat.name),
            }"
            @click="toggleCat(cat.name)"
            ><span>{{ cat.name }}</span></div
          >
        </div>
      </div>
    </div>

    <div class="playlists">
      <CoverRow
        type="playlist"
        :items="playlists"
        :sub-text="subText"
        :show-play-button="true"
        :show-play-count="activeCategory !== '排行榜' ? true : false"
        :image-size="activeCategory !== '排行榜' ? 512 : 1024"
      />
    </div>
    <div
      v-show="['推荐歌单', '排行榜'].includes(activeCategory) === false"
      class="load-more"
    >
      <ButtonTwoTone
        v-show="showLoadMoreButton && hasMore"
        color="grey"
        :loading="loadingMore"
        @click="getPlaylist"
        >{{ $t('explore.loadMore') }}</ButtonTwoTone
      >
    </div>
  </div>
</template>

<script setup lang="ts">
const router = useRouter();

import { loadWithProgress } from '@/utils/pageLoad';
import { topPlaylist, highQualityPlaylist, toplists } from '@/api/playlist';
import { playlistCategories } from '@/utils/staticData';
// 与同名本地函数撞名，导入改名（Options API 时代的 this 遮蔽在 setup 里不成立）
import { getRecommendPlayList as fetchRecommendPlayList } from '@/utils/playList';
import ButtonTwoTone from '@/components/ButtonTwoTone.vue';
import CoverRow from '@/components/CoverRow.vue';
import SvgIcon from '@/components/SvgIcon.vue';
import { computed, ref } from 'vue';
import { useSettingsStore } from '@/stores';
import { storeToRefs } from 'pinia';
import { onBeforeRouteUpdate } from 'vue-router';
import { useKeepAliveLoad } from '@/composables/useKeepAliveLoad';

import { useRoute, useRouter } from 'vue-router';
const route = useRoute();
const settingsStore = useSettingsStore();

const { settings } = storeToRefs(settingsStore);

const togglePlaylistCategory = settingsStore.togglePlaylistCategory;

const show = ref<any>(false);

const playlists = ref<any>([]);

const activeCategory = ref<any>('全部');

const loadingMore = ref<any>(false);

const showLoadMoreButton = ref<any>(false);

const hasMore = ref<any>(true);

const allBigCats = ref<any>(['语种', '风格', '场景', '情感', '主题']);

const showCatOptions = ref<any>(false);

const reqToken = ref<any>(0);

const subText = computed(function subText() {
  if (activeCategory.value === '排行榜') return 'updateFrequency';
  if (activeCategory.value === '推荐歌单') return 'copywriter';
  return 'none';
});

function loadData() {
  const queryCategory = route.query.category;
  if (queryCategory === undefined) {
    playlists.value = [];
    activeCategory.value = '全部';
  } else {
    activeCategory.value = queryCategory;
  }
  reqToken.value++;
  getPlaylist();
}

function goToCategory(Category) {
  showCatOptions.value = false;
  router.push({ name: 'explore', query: { category: Category } });
}

function updatePlaylist(incomingPlaylists, token) {
  // 丢弃已过期（分类切换前）的响应
  if (token !== reqToken.value) return;
  // 参数改名避免遮蔽同名 ref（原 this.playlists 与参数 playlists 是两个东西）
  const incoming = Array.isArray(incomingPlaylists) ? incomingPlaylists : [];
  const existingIds = new Set(playlists.value.map(p => p.id));
  const deduped = [];
  const seen = new Set();
  for (const p of incoming) {
    if (!p || p.id == null) continue;
    if (existingIds.has(p.id) || seen.has(p.id)) continue;
    seen.add(p.id);
    deduped.push(p);
  }
  if (deduped.length === 0 && incoming.length > 0) {
    // 后端返回的全是重复项，视为没有更多
    hasMore.value = false;
  }
  if (deduped.length > 0) {
    playlists.value.push(...deduped);
  }
  loadingMore.value = false;
  showLoadMoreButton.value = true;
  show.value = true;
}

function onLoadFailed() {
  loadingMore.value = false;
  show.value = true;
}

function pageLoad(promise) {
  return loadWithProgress(promise, {
    onError: () => onLoadFailed(),
  });
}

function getPlaylist() {
  loadingMore.value = true;
  if (activeCategory.value === '推荐歌单') {
    return getRecommendPlayList();
  }
  if (activeCategory.value === '精品歌单') {
    return getHighQualityPlaylist();
  }
  if (activeCategory.value === '排行榜') {
    return getTopLists();
  }
  return getTopPlayList();
}

function getRecommendPlayList() {
  const token = reqToken.value;
  pageLoad(
    fetchRecommendPlayList(100, true).then(list => {
      if (token !== reqToken.value) return;
      playlists.value = [];
      updatePlaylist(list, token);
    })
  );
}

function getHighQualityPlaylist() {
  const token = reqToken.value;
  // 局部改名避免遮蔽同名 ref（原 this.playlists 与本地 playlists 是两个东西）
  let currentPlaylists = playlists.value;
  let before =
    currentPlaylists.length !== 0
      ? currentPlaylists[currentPlaylists.length - 1].updateTime
      : 0;
  pageLoad(
    highQualityPlaylist({ limit: 50, before }).then(data => {
      if (token !== reqToken.value) return;
      updatePlaylist(data.playlists, token);
      hasMore.value = data.more;
    })
  );
}

function getTopLists() {
  const token = reqToken.value;
  pageLoad(
    toplists().then(data => {
      if (token !== reqToken.value) return;
      playlists.value = [];
      updatePlaylist(data.list, token);
    })
  );
}

function getTopPlayList() {
  const token = reqToken.value;
  pageLoad(
    topPlaylist({
      cat: activeCategory.value,
      offset: playlists.value.length,
    }).then(data => {
      if (token !== reqToken.value) return;
      updatePlaylist(data.playlists, token);
      hasMore.value = data.more;
    })
  );
}

function getCatsByBigCat(name) {
  return playlistCategories.filter(c => c.bigCat === name);
}

function toggleCat(name) {
  togglePlaylistCategory(name);
}

// /explore 是 keepAlive 路由：Vue3 首挂会同帧先后触发 onMounted 与 onActivated，两处都注册 loadData 会把歌单列表拉两遍；useKeepAliveLoad 保证「首挂载 + 缓存重入」各执行一次
useKeepAliveLoad(function loadExploreData() {
  loadData();
});

onBeforeRouteUpdate((to, from, next) => {
  showLoadMoreButton.value = false;
  hasMore.value = true;
  playlists.value = [];
  activeCategory.value = to.query.category;
  reqToken.value++; // 作废所有在飞请求
  getPlaylist();
  next();
});
</script>

<style lang="scss" scoped>
h1 {
  color: var(--color-text);
  font-size: 56px;
}
.buttons {
  display: flex;
  flex-wrap: wrap;
}
.button {
  user-select: none;
  cursor: pointer;
  padding: 8px 16px;
  margin: 10px 16px 6px 0;
  display: flex;
  justify-content: center;
  align-items: center;
  font-weight: 600;
  font-size: 18px;
  border-radius: 10px;
  background-color: var(--color-secondary-bg);
  color: var(--color-secondary);
  transition: 0.2s;

  &:hover {
    background-color: var(--color-primary-bg);
    color: var(--color-primary);
  }
}
.button.active {
  background-color: var(--color-primary-bg);
  color: var(--color-primary);
}
.panel {
  margin-top: 10px;
  background: var(--color-secondary-bg);
  border-radius: 10px;
  padding: 8px;
  color: var(--color-text);

  .big-cat {
    display: flex;
    margin-bottom: 32px;
  }

  .name {
    font-size: 24px;
    font-weight: 700;
    opacity: 0.68;
    margin-left: 24px;
    min-width: 54px;
    height: 26px;
    margin-top: 8px;
  }
  .cats {
    margin-left: 24px;
    display: flex;
    flex-wrap: wrap;
  }
  .cat {
    user-select: none;
    margin: 4px 0px 0 0;
    display: flex;
    align-items: center;
    font-weight: 500;
    font-size: 16px;
    transition: 0.2s;
    min-width: 98px;

    span {
      display: flex;
      justify-content: center;
      align-items: center;
      cursor: pointer;
      padding: 6px 12px;
      height: 26px;
      border-radius: 10px;
      opacity: 0.88;
      &:hover {
        opacity: 1;
        background-color: var(--color-primary-bg);
        color: var(--color-primary);
      }
    }
  }
  .cat.active {
    color: var(--color-primary);
  }
}

.playlists {
  margin-top: 24px;
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
