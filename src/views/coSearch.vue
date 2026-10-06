<template>
  <div class="search">
    <div class="search-topside">
      <span
        ><div class="dropdown">
          <font class="dropbtn"
            >{{ serverNameTable[server] }} <svg-icon icon-class="arrow-down"
          /></font>
          <div class="dropdown-content">
            <button
              v-for="(val, key, i) in serverNameTable"
              :key="key"
              @click="tranSearchType(undefined, key)"
              >{{ serverNameTable[key] }}</button
            >
          </div>
        </div>
        搜索
        <div class="dropdown">
          <font class="dropbtn"
            >{{ typeNameTable[type] }} <svg-icon icon-class="arrow-down"
          /></font>
          <div class="dropdown-content">
            <button
              v-for="(val, key, i) in typeNameTable"
              :key="key"
              @click="tranSearchType(key, undefined)"
              >{{ typeNameTable[key] }}</button
            >
          </div>
        </div></span
      >
      <div class="searchKeywords">"{{ keywords }}"</div>
    </div>
    <div v-if="type === 'tracks'">
      <TrackList
        :tracks="result"
        type="playlist"
        :max-size="'100'"
        :other-server-access="false"
        dbclick-track-func="none"
      />
    </div>
    <div v-if="type === 'playlists'">
      <CoverRow
        type="playlist"
        :click-cover-to-play-fun="playThisListByTrack"
        :items="result"
        sub-text="title"
      />
    </div>
    <div class="load-more">
      <ButtonTwoTone v-show="hasMore" color="grey" @click="fetchData(true)">{{
        $t('explore.loadMore')
      }}</ButtonTwoTone>
    </div>
  </div>
</template>

<script setup lang="ts">
const router = useRouter();

import { getI18n } from '@/locale';
import { camelCase } from 'change-case';
import request from '@/utils/request';
import TrackList from '@/components/TrackList.vue';
import CoverRow from '@/components/CoverRow.vue';
import ButtonTwoTone from '@/components/ButtonTwoTone.vue';
import { ref, computed, watch, onWatcherCleanup } from 'vue';
import { useUiStore } from '@/stores';
import { useCrossPlatformPlay } from '@/composables/useCrossPlatformPlay';

import { useRoute, useRouter } from 'vue-router';
const route = useRoute();

const result = ref<any>([]);

const hasMore = ref<any>(true);

const curpage = ref<any>(1);

const keywords = computed(function keywords() {
  return route.query.keywords;
});

const type = computed(function type() {
  // 路由 query 是 string | string[]，单值语义，取首元素收窄
  const rawType = route.query.type || 'tracks';
  return camelCase(Array.isArray(rawType) ? rawType[0] : rawType);
});

const server = computed(function server() {
  const rawServer = route.query.server || 'tencent';
  return camelCase(Array.isArray(rawServer) ? rawServer[0] : rawServer);
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

const serverNameTable = computed(function serverNameTable() {
  return {
    tencent: (getI18n() as any).global.t('server.tencent'),
    kugou: (getI18n() as any).global.t('server.kugou'),
  };
});

// 第三方平台歌单播放（与 playlist/album 同款逻辑，收敛在 useCrossPlatformPlay）：模板只传 id，这里包一层补上 server 与提示文案
const { playThisListByTrack: playCrossPlatformList } = useCrossPlatformPlay();

function playThisListByTrack(id) {
  playCrossPlatformList(
    id,
    route.query.server,
    'coSearch 正在进行其他平台播放'
  );
}

function tranSearchType(type, server) {
  if (type) {
    router.replace({ query: { ...route.query, type } });
  }
  if (server) {
    router.replace({ query: { ...route.query, server } });
  }
}

// 路由代次：watch(route) 的 onWatcherCleanup 在下次路由变化时推进它，旧 keywords/type 的响应晚到即被丢弃（翻页 push 请求捕获当时 token，路由一变同样作废）
const reqToken = ref(0);

function fetchData(isPush = false) {
  const token = reqToken.value;
  const typeTable = {
    musicVideos: 1004,
    tracks: 1,
    albums: 10,
    artists: 100,
    playlists: 1000,
  };
  request({
    url: '/search',
    method: 'get',
    params: {
      curpage: isPush ? (curpage.value += 1) : (curpage.value = 1),
      ...route.query,
      keywords: keywords.value || '群青',
      type: typeTable[type.value],
    },
  }).then(data => {
    // 已过期代次（路由已变）的响应直接丢弃
    if (token !== reqToken.value) return;
    // 局部改名避免遮蔽同名 ref（原 this.result 与 then 回调的 result 是两个东西）
    const res = data.result;
    hasMore.value = res.hasMore ?? true;
    switch (type.value) {
      case 'musicVideos':
        if (isPush) result.value.push(...(res.mvs ?? []));
        else result.value = res.mvs ?? [];
        if (res.mvCount <= result.value.length) {
          hasMore.value = false;
        }
        break;
      case 'artists':
        if (isPush) result.value.push(...(res.artists ?? []));
        else result.value = res.artists ?? [];
        break;
      case 'albums':
        if (isPush) result.value.push(...(res.albums ?? []));
        else result.value = res.albums ?? [];
        if (res.albumCount <= result.value.length) {
          hasMore.value = false;
        }
        break;
      case 'tracks':
        if (isPush) result.value.push(...(res.songs ?? []));
        // 首屏赋值：异常体缺 songs 时 undefined 会直达 TrackList 渲染
        else result.value = res.songs ?? [];
        break;
      case 'playlists':
        if (isPush) result.value.push(...(res.playlists ?? []));
        else result.value = res.playlists ?? [];
        break;
    }
  }).catch(err => {
    console.warn('[coSearch]', err?.message || err);
    useUiStore().showToast('搜索失败，请检查网络后重试');
  });
}

// onWatcherCleanup：watcher 下次重跑（路由再变）或停止时，先作废在飞请求的落地资格再发起新查询
watch(
  route,
  () => {
    onWatcherCleanup(() => reqToken.value++);
    fetchData();
  },
  {
    immediate: true,
  }
);
</script>

<style lang="scss" scoped>
.search-topside {
  position: relative;
  color: var(--color-text);
  font-size: 1.4em;
  margin: 1em auto;
  .searchKeywords {
    display: inline-block;
    text-align: center;
  }
}
@media (max-width: 576px) {
  .searchKeywords {
    display: block !important;
    margin: 15px auto !important;
    text-align: center !important;
  }
}
.dropdown {
  line-height: 100%;
  height: 100%;
  font-size: 0.9em;
  padding: 10px;
  margin: 0 10px;
  position: relative;
  display: inline-block;
  background-color: var(--color-primary-bg-for-transparent);
  color: var(--color-primary);
  box-sizing: border-box;
  border-radius: 5px;
  svg {
    width: 12px;
    height: 12px;
    margin-left: 5px;
  }
}
.dropdown-content {
  pointer-events: none;
  font-size: 1em;
  opacity: 0;
  transition: 0.5s;
  position: absolute;
  background-color: var(--color-body-bg);
  width: 100%;
  padding: 8px;
  right: 0;
  border-radius: 12px;
  z-index: 55;
  box-shadow: 0px 8px 16px 0px rgba(0, 0, 0, 0.2);
  button {
    padding: 0;
    margin: 0;
    width: 100%;
    font-weight: 600;
    font-size: 14px;
    padding: 10px 12px;
    border-radius: 8px;
    cursor: default;
    color: var(--color-text);
    display: flex;
    align-items: center;
    &:hover {
      color: var(--color-primary);
      background: var(--color-primary-bg-for-transparent);
    }
  }
}
.dropdown:hover,
.dropdown:focus {
  .dropdown-content:hover {
    pointer-events: auto;
  }
  .dropdown-content {
    pointer-events: auto;
    opacity: 1;
    transition: 0.5s;
  }
}
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
    transform: scale(1.08);
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
.load-more {
  display: flex;
  justify-content: center;
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
</style>
