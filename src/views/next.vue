<template>
  <div class="next-tracks">
    <h1>{{ $t('next.nowPlaying') }}</h1>
    <TrackList
      :tracks="[currentTrack]"
      type="playlist"
      dbclick-track-func="none"
    />
    <h1 v-show="playNextList.length > 0"
      >插队播放
      <button @click="player.clearPlayNextList()">清除队列</button>
    </h1>
    <TrackList
      v-show="playNextList.length > 0"
      :tracks="playNextTracks"
      type="playlist"
      :highlight-playing-track="false"
      dbclick-track-func="playTrackOnListByID"
      item-key="id+index"
      :extra-context-menu-item="['removeTrackFromQueue']"
    />
    <h1>{{ $t('next.nextUp') }}</h1>
    <TrackList
      :tracks="filteredTracks"
      type="playlist"
      :highlight-playing-track="false"
      dbclick-track-func="playTrackOnListByID"
    />
  </div>
</template>

<script setup lang="ts">
import { getTrackDetail } from '@/api/track';

const appScroll = useAppScroll();
import TrackList from '@/components/TrackList.vue';
import { computed, ref, watch } from 'vue';
import { usePlayerStore } from '@/stores';
import { useAppScroll } from '@/composables/useAppScroll';
import { useKeepAliveLoad } from '@/composables/useKeepAliveLoad';
import { storeToRefs } from 'pinia';

const playerStore = usePlayerStore();

const { player } = storeToRefs(playerStore);

const tracks = ref<any>([]);

const currentTrack = computed(function currentTrack() {
  return player.value.currentTrack;
});

const playerShuffle = computed(function playerShuffle() {
  return player.value.shuffle;
});

const filteredTracks = computed(function filteredTracks() {
  let trackIDs = player.value.list.slice(
    player.value.current + 1,
    player.value.current + 100
  );
  return trackIDs
    .map(tid => tracks.value.find(t => t.id === tid))
    .filter(t => t);
});

const playNextList = computed(function playNextList() {
  return player.value.playNextList;
});

const playNextTracks = computed(function playNextTracks() {
  return playNextList.value
    .map(tid => tracks.value.find(t => t.id === tid))
    // 详情接口响应前的占位 undefined 会让 TrackListItem 读 track.id 崩渲染，先过滤
    .filter(t => t);
});

function loadTracks() {
  let trackIDs = player.value.list.slice(
    player.value.current + 1,
    player.value.current + 100
  );
  trackIDs.push(...playNextList.value);
  let loadedTrackIDs = tracks.value.map(t => t.id);

  if (trackIDs.length > 0) {
    // 由切歌/shuffle watch 自动触发，失败静默等下次 watch 重试即可，不打扰用户
    getTrackDetail(trackIDs.join(','))
      .then(data => {
        tracks.value.push(
          ...(data?.songs ?? []).filter(t => !loadedTrackIDs.includes(t.id))
        );
      })
      .catch(err => console.warn('[next] loadTracks failed:', err));
  }
}

watch(currentTrack, function () {
  loadTracks();
});

watch(playerShuffle, function () {
  loadTracks();
});

watch(playNextList, function () {
  loadTracks();
});

// /next 是 keepAlive 路由：Vue3 首挂会同帧先后触发 onMounted 与 onActivated，两处都注册 loadTracks 会把同一批歌推两遍；useKeepAliveLoad 保证首挂载只执行一次
useKeepAliveLoad(function loadNextData() {
  loadTracks();
  appScroll.restorePosition();
});
</script>

<style lang="scss" scoped>
h1 {
  margin-top: 36px;
  margin-bottom: 18px;
  cursor: default;
  color: var(--color-text);
  display: flex;
  justify-content: space-between;
  button {
    color: var(--color-text);
    border-radius: 8px;
    padding: 0 14px;
    display: flex;
    justify-content: center;
    align-items: center;
    transition: 0.2s;
    opacity: 0.68;
    font-weight: 500;
    &:hover {
      opacity: 1;
      background: var(--color-secondary-bg);
    }
    &:active {
      opacity: 1;
      transform: scale(0.92);
    }
  }
}
</style>
