<template>
  <div v-show="show" class="playlist">
    <div
      v-if="specialPlaylistInfo === undefined && !isLikeSongsPage"
      class="playlist-info"
    >
      <Cover
        :id="parseInt(playlist.id)"
        :image-url="resizeImage(playlist.picUrl || playlist.coverImgUrl, 1024)"
        :show-play-button="true"
        :always-show-shadow="true"
        :click-cover-to-play="true"
        type="playlist"
        :cover-hover="false"
        :play-button-size="18"
        @click.right="openMenu"
      />
      <div class="info">
        <div class="title" @click.right="openMenu"
          ><span v-if="playlist.privacy === 10" class="lock-icon">
            <svg-icon icon-class="lock" /></span
          >{{ playlist.name }}</div
        >
        <div class="artist">
          Playlist by
          <span
            v-if="
              [
                5277771961, 5277965913, 5277969451, 5277778542, 5278068783,
              ].includes(playlist.id)
            "
            style="font-weight: 600"
            >Apple Music</span
          >
          <a
            v-else
            :href="`https://music.163.com/#/user/home?id=${playlist.creator.userId}`"
            target="blank"
            >{{ playlist.creator.nickname }}</a
          >
        </div>
        <div class="date-and-count">
          {{ $t('playlist.updatedAt') }}
          {{ formatDate(playlist.updateTime) }} · {{ playlist.trackCount }}
          {{ $t('common.songs') }}
        </div>
        <div
          class="description"
          @click="toggleFullDescription"
          v-html="playlist.description"
        >
        </div>
        <div class="buttons">
          <ButtonTwoTone icon-class="play" @click="playPlaylistByID()">
            {{ $t('common.play') }}
          </ButtonTwoTone>
          <ButtonTwoTone
            v-if="playlist.creator.userId !== data.user.userId"
            :icon-class="playlist.subscribed ? 'heart-solid' : 'heart'"
            :icon-button="true"
            :horizontal-padding="0"
            :color="playlist.subscribed ? 'blue' : 'grey'"
            :text-color="playlist.subscribed ? '#335eea' : ''"
            :background-color="
              playlist.subscribed ? 'var(--color-secondary-bg)' : ''
            "
            @click="likePlaylist"
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
      <div v-if="displaySearchInPlaylist" class="search-box">
        <div class="container" :class="{ active: inputFocus }">
          <svg-icon icon-class="search" />
          <div class="input">
            <input
              v-model.trim="inputSearchKeyWords"
              v-focus
              :placeholder="inputFocus ? '' : $t('playlist.search')"
              @input="inputDebounce()"
              @focus="inputFocus = true"
              @blur="inputFocus = false"
            />
          </div>
        </div>
      </div>
    </div>
    <div v-if="specialPlaylistInfo !== undefined" class="special-playlist">
      <div
        class="title"
        :class="specialPlaylistInfo.gradient"
        @click.right="openMenu"
      >
        <!-- <img :src="resizeImage(playlist.coverImgUrl)" /> -->
        {{ specialPlaylistInfo.name }}
      </div>
      <div class="subtitle"
        >{{ playlist.englishTitle }} · {{ playlist.updateFrequency }}
      </div>

      <div class="buttons">
        <ButtonTwoTone
          class="play-button"
          icon-class="play"
          color="grey"
          @click="playPlaylistByID()"
        >
          {{ $t('common.play') }}
        </ButtonTwoTone>
        <ButtonTwoTone
          v-if="playlist.creator.userId !== data.user.userId"
          :icon-class="playlist.subscribed ? 'heart-solid' : 'heart'"
          :icon-button="true"
          :horizontal-padding="0"
          :color="playlist.subscribed ? 'blue' : 'grey'"
          :text-color="playlist.subscribed ? '#335eea' : ''"
          :background-color="
            playlist.subscribed ? 'var(--color-secondary-bg)' : ''
          "
          @click="likePlaylist"
        >
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

    <div v-if="isLikeSongsPage" class="user-info">
      <h1>
        <LazyImage
          class="avatar"
          :src="resizeImage(data.user.avatarUrl)"
          referrerpolicy="no-referrer"
        />
        {{ data.user.nickname }}{{ $t('library.sLikedSongs') }}
      </h1>
      <div class="search-box-likepage" @click="searchInPlaylist()">
        <div class="container" :class="{ active: inputFocus }">
          <svg-icon icon-class="search" />
          <div class="input" :style="{ width: searchInputWidth }">
            <input
              v-if="displaySearchInPlaylist"
              v-model.trim="inputSearchKeyWords"
              v-focus
              :placeholder="inputFocus ? '' : $t('playlist.search')"
              @input="inputDebounce()"
              @focus="inputFocus = true"
              @blur="inputFocus = false"
            />
          </div>
        </div>
      </div>
    </div>

    <TrackList
      :tracks="filteredTracks"
      max-size="20"
      type="playlist"
      dbclick-track-func="none"
      :extra-context-menu-item="
        isUserOwnPlaylist ? ['removeTrackFromPlaylist'] : []
      "
      @remove-track="removeTrack"
    />

    <div class="load-more">
      <ButtonTwoTone
        v-show="hasMore"
        color="grey"
        :loading="loadingMore"
        @click="loadMore(100)"
        >{{ $t('explore.loadMore') }}</ButtonTwoTone
      >
    </div>

    <Modal
      v-model:show="showFullDescription"
      :show-footer="false"
      :click-outside-hide="true"
      title="歌单介绍"
      >{{ playlist.description }}</Modal
    >

    <ContextMenu ref="playlistMenuRef">
      <!-- <div class="item">{{ $t('contextMenu.addToQueue') }}</div> -->
      <div class="item" @click="likePlaylist(true)">{{
        playlist.subscribed
          ? $t('contextMenu.removeFromLibrary')
          : $t('contextMenu.saveToLibrary')
      }}</div>
      <div class="item" @click="searchInPlaylist()">{{
        $t('contextMenu.searchInPlaylist')
      }}</div>
      <div
        v-if="playlist.creator.userId === data.user.userId"
        class="item"
        @click="editPlaylist"
        >编辑歌单信息</div
      >
      <div
        v-if="playlist.creator.userId === data.user.userId"
        class="item"
        @click="deletePlaylist"
        >删除歌单</div
      >
    </ContextMenu>
  </div>
</template>

<script setup lang="ts">
const router = useRouter();

// 原 Vue2 实例字段：记录当前歌单 id，路由复用组件时取消陈旧请求
let id; // Vue2 时代挂在实例上的私有句柄（非响应式），降为模块级变量
let _loadingMore = null;

import NProgress from 'nprogress';
import { loadWithProgress } from '@/utils/pageLoad';
import {
  getPlaylistDetail,
  subscribePlaylist,
  // 与同名本地函数撞名，导入改名（Options API 时代的 this 遮蔽在 setup 里不成立）
  deletePlaylist as deletePlaylistApi,
} from '@/api/playlist';
import { getTrackDetail } from '@/api/track';
import { isAccountLoggedIn } from '@/utils/auth';
import nativeAlert from '@/utils/nativeAlert';
import { getI18n } from '@/locale';
import { cancelRequestsByTag } from '@/utils/request';
import ButtonTwoTone from '@/components/ButtonTwoTone.vue';
import ContextMenu from '@/components/ContextMenu.vue';
import TrackList from '@/components/TrackList.vue';
import Cover from '@/components/Cover.vue';
import Modal from '@/components/Modal.vue';
import { formatDate, resizeImage } from '@/utils/formatters';
import { ref, computed, onBeforeUnmount } from 'vue';
import { useDataStore, usePlayerStore, useUiStore } from '@/stores';
import { storeToRefs } from 'pinia';
import { onBeforeRouteUpdate } from 'vue-router';
import { useDescriptionToggle } from '@/composables/useDescriptionToggle';
import { useCrossPlatformPlay } from '@/composables/useCrossPlatformPlay';

import { useRoute, useRouter } from 'vue-router';

const specialPlaylist = {
  2829816518: {
    name: '欧美私人订制',
    gradient: 'gradient-pink-purple-blue',
  },
  2890490211: {
    name: '助眠鸟鸣声',
    gradient: 'gradient-green',
  },
  5089855855: {
    name: '夜的胡思乱想',
    gradient: 'gradient-moonstone-blue',
  },
  2888212971: {
    name: '全球百大DJ',
    gradient: 'gradient-orange-red',
  },
  2829733864: {
    name: '睡眠伴侣',
    gradient: 'gradient-midnight-blue',
  },
  2829844572: {
    name: '洗澡时听的歌',
    gradient: 'gradient-yellow',
  },
  2920647537: {
    name: '还是会想你',
    gradient: 'gradient-dark-blue-midnight-blue',
  },
  2890501416: {
    name: '助眠白噪声',
    gradient: 'gradient-sky-blue',
  },
  5217150082: {
    name: '摇滚唱片行',
    gradient: 'gradient-yellow-red',
  },
  2829961453: {
    name: '古风音乐大赏',
    gradient: 'gradient-fog',
  },
  4923261701: {
    name: 'Trance',
    gradient: 'gradient-light-red-light-blue ',
  },
  5212729721: {
    name: '欧美点唱机',
    gradient: 'gradient-indigo-pink-yellow',
  },
  3103434282: {
    name: '甜蜜少女心',
    gradient: 'gradient-pink',
  },
  2829896389: {
    name: '日系私人订制',
    gradient: 'gradient-yellow-pink',
  },
  2829779628: {
    name: '运动随身听',
    gradient: 'gradient-orange-red',
  },
  2860654884: {
    name: '独立女声精选',
    gradient: 'gradient-sharp-blue',
  },
  898150: {
    name: '浪漫婚礼专用',
    gradient: 'gradient-pink',
  },
  2638104052: {
    name: '牛奶泡泡浴',
    gradient: 'gradient-fog',
  },
  5317236517: {
    name: '后朋克精选',
    gradient: 'gradient-pink-purple-blue',
  },
  2821115454: {
    name: '一周原创发现',
    gradient: 'gradient-blue-purple',
  },
  2829883282: {
    name: '华语私人雷达',
    gradient: 'gradient-yellow-red',
  },
  3136952023: {
    name: '私人雷达',
    gradient: 'gradient-radar',
  },
};

const playlistMenuRef = ref<any>(null);
const route = useRoute();
const dataStore = useDataStore();
const playerStore = usePlayerStore();
const uiStore = useUiStore();

const { data } = storeToRefs(dataStore);

const showToast = uiStore.showToast;

const show = ref<any>(false);

const playlist = ref<any>({
  id: 0,
  coverImgUrl: '',
  creator: {
    userId: '',
  },
  trackIds: [],
});

// 简介弹窗开关 + 页面滚动锁定（原与 album/artist 重复的实现收敛于此）
const { showFullDescription, toggleFullDescription } = useDescriptionToggle();

// 第三方平台歌单播放（与 album/coSearch 同款逻辑收敛于此，仅文案不同）
const { playThisListByTrack: playCrossPlatformList } = useCrossPlatformPlay();

const tracks = ref<any>([]);

const loadingMore = ref<any>(false);

const hasMore = ref<any>(false);

const lastLoadedTrackIndex = ref<any>(9);

const displaySearchInPlaylist = ref<any>(false);

const searchKeyWords = ref<any>('');

const inputSearchKeyWords = ref<any>('');

const inputFocus = ref<any>(false);

// 搜索防抖定时器句柄（非响应式）：同 lyrics.vue 的 _clockTimer 一样
// 用普通变量，避免无意义的响应式开销
let _searchDebounceTimeout: ReturnType<typeof setTimeout> | null = null;

const searchInputWidth = ref<any>('0px');

const isLikeSongsPage = computed(function isLikeSongsPage() {
  return route.name === 'likedSongs';
});

const specialPlaylistInfo = computed(function specialPlaylistInfo() {
  return specialPlaylist[playlist.value.id];
});

const isUserOwnPlaylist = computed(function isUserOwnPlaylist() {
  return (
    playlist.value.creator.userId === data.value.user.userId &&
    playlist.value.id !== data.value.likedSongPlaylistID
  );
});

const filteredTracks = computed(function filteredTracks() {
  return tracks.value.filter(
    track =>
      (track.name &&
        track.name
          .toLowerCase()
          .includes(searchKeyWords.value.toLowerCase())) ||
      (track.al.name &&
        track.al.name
          .toLowerCase()
          .includes(searchKeyWords.value.toLowerCase())) ||
      track.ar.find(
        artist =>
          artist.name &&
          artist.name.toLowerCase().includes(searchKeyWords.value.toLowerCase())
      )
  );
});

function playPlaylistByID(trackID = 'first') {
  if (route.query.server) {
    playCrossPlatformList(
      playlist.value.id,
      route.query.server,
      'Playlist:正在进行其他平台播放'
    );
    return;
  }
  let trackIDs = playlist.value.trackIds.map(t => t.id);
  playerStore.player.replacePlaylist(
    trackIDs,
    playlist.value.id,
    'playlist',
    trackID
  );
}

function likePlaylist(toast = false) {
  if (!isAccountLoggedIn()) {
    showToast((getI18n() as any).global.t('toast.needToLogin'));
    return;
  }
  subscribePlaylist({
    id: playlist.value.id,
    t: playlist.value.subscribed ? 2 : 1,
  }).then(data => {
    if (data.code === 200) {
      playlist.value.subscribed = !playlist.value.subscribed;
      if (toast === true)
        showToast(
          playlist.value.subscribed ? '已保存到音乐库' : '已从音乐库删除'
        );
    }
    getPlaylistDetail(id, true).then(data => {
      playlist.value = data.playlist;
    });
  });
}

function loadData(newId, next = undefined) {
  // 切换歌单时先取消上一次未完成的详情请求，避免旧请求晚到覆盖新页面
  if (id && id !== newId) {
    cancelRequestsByTag(`playlist:${id}`);
  }
  id = newId;
  // 默认走缓存（带 30s 内存缓存 + 后端 apicache）；只有 server 跨平台时才打时间戳
  const noCache = !!route.query.server;
  loadWithProgress(
    getPlaylistDetail(id, noCache, route.query.server || undefined)
      .then(data => {
        playlist.value = data.playlist;
        tracks.value = data.playlist.tracks;
        if (next !== undefined) next();
        show.value = true;
        lastLoadedTrackIndex.value = data.playlist.tracks.length - 1;
        return data;
      })
      .then(() => {
        if (playlist.value.trackCount > tracks.value.length) {
          loadingMore.value = true;
          loadMore();
        }
      }),
    {
      // pageLoad.ts 的 options 参数类型暂未包含 onError，utils 层收窄前局部断言
      onError: () => {
        // 失败也要交出页面壳（返回可点、导航在位），并复位忙态
        show.value = true;
        loadingMore.value = false;
      },
    }
  );
}

function loadMore(loadNum = 100) {
  let trackIDs = playlist.value.trackIds.filter((t, index) => {
    if (
      index > lastLoadedTrackIndex.value &&
      index <= lastLoadedTrackIndex.value + loadNum
    ) {
      return t;
    }
  });
  // 并发锁 + 兜底：按钮原本既无 disabled 也无 in-flight 判断，连点会把
  // 同一批 trackIds 请求多次；请求一失败 loadingMore 就永远停在 true，
  // 按钮转圈不止且再也无法重试。
  if (_loadingMore) return;
  _loadingMore = true;
  trackIDs = trackIDs.map(t => t.id);
  getTrackDetail(trackIDs.join(','))
    .then(data => {
      tracks.value.push(...(data?.songs ?? []));
      lastLoadedTrackIndex.value += trackIDs.length;
      hasMore.value =
        lastLoadedTrackIndex.value + 1 < playlist.value.trackIds.length;
    })
    .catch(() => {
      showToast('加载更多歌曲失败，请重试');
    })
    .finally(() => {
      _loadingMore = false;
      loadingMore.value = false;
    });
}

function openMenu(e) {
  playlistMenuRef.value.openMenu(e);
}

function deletePlaylist() {
  if (!isAccountLoggedIn()) {
    showToast((getI18n() as any).global.t('toast.needToLogin'));
    return;
  }
  let confirmation = confirm(`确定要删除歌单 ${playlist.value.name}？`);
  if (confirmation === true) {
    deletePlaylistApi(playlist.value.id).then(data => {
      if (data.code === 200) {
        nativeAlert(`已删除歌单 ${playlist.value.name}`);
        router.go(-1);
      } else {
        nativeAlert('发生错误');
      }
    });
  }
}

function editPlaylist() {
  nativeAlert('此功能开发中');
}

function searchInPlaylist() {
  displaySearchInPlaylist.value =
    !displaySearchInPlaylist.value || isLikeSongsPage.value;
  if (displaySearchInPlaylist.value == false) {
    searchKeyWords.value = '';
    inputSearchKeyWords.value = '';
  } else {
    searchInputWidth.value = '172px';
    loadMore(500);
  }
}

function removeTrack(trackID) {
  if (!isAccountLoggedIn()) {
    showToast((getI18n() as any).global.t('toast.needToLogin'));
    return;
  }
  tracks.value = tracks.value.filter(t => t.id !== trackID);
}

function inputDebounce() {
  if (_searchDebounceTimeout) clearTimeout(_searchDebounceTimeout);
  _searchDebounceTimeout = setTimeout(() => {
    searchKeyWords.value = inputSearchKeyWords.value;
  }, 600);
}

if (route.name === 'likedSongs') {
  loadData(data.value.likedSongPlaylistID);
} else {
  loadData(route.params.id);
}

onBeforeUnmount(function beforeUnmount() {
  if (id) cancelRequestsByTag(`playlist:${id}`);
  NProgress.done();
});

onBeforeRouteUpdate((to, from, next) => {
  show.value = false;
  tracks.value = [];
  if (to.name === 'likedSongs') {
    loadData(data.value.likedSongPlaylistID, next);
  } else {
    loadData(to.params.id, next);
  }
});
</script>

<style lang="scss" scoped>
.playlist {
  margin-top: 32px;
}
.playlist-info {
  display: flex;
  margin-bottom: 72px;
  position: relative;
  .info {
    display: flex;
    flex-direction: column;
    justify-content: center;
    flex: 1;
    margin-left: 56px;
    .title {
      font-size: 36px;
      font-weight: 700;
      color: var(--color-text);

      .lock-icon {
        opacity: 0.28;
        color: var(--color-text);
        margin-right: 8px;
        .svg-icon {
          height: 26px;
          width: 26px;
        }
      }
    }
    .artist {
      font-size: 18px;
      opacity: 0.88;
      color: var(--color-text);
      margin-top: 24px;
    }
    .date-and-count {
      font-size: 14px;
      opacity: 0.68;
      color: var(--color-text);
      margin-top: 2px;
    }
    .description {
      font-size: 14px;
      opacity: 0.68;
      color: var(--color-text);
      margin-top: 24px;
      display: -webkit-box;
      -webkit-box-orient: vertical;
      -webkit-line-clamp: 3;
      overflow: hidden;
      cursor: pointer;
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

.special-playlist {
  margin-top: clamp(64px, 21vw, 192px);
  margin-bottom: clamp(40px, 14vw, 128px);
  border-radius: 1.25em;
  text-align: center;

  @keyframes letterSpacing4 {
    from {
      letter-spacing: 0px;
    }

    to {
      letter-spacing: 4px;
    }
  }

  @keyframes letterSpacing1 {
    from {
      letter-spacing: 0px;
    }

    to {
      letter-spacing: 1px;
    }
  }

  .title {
    font-size: clamp(40px, 11vw, 84px);
    line-height: 1.05;
    font-weight: 700;
    text-transform: uppercase;
    word-break: break-word;

    letter-spacing: 4px;
    animation-duration: 0.8s;
    animation-name: letterSpacing4;
    -webkit-text-fill-color: transparent;
    background-clip: text;
    // background-image: linear-gradient(
    //   225deg,
    //   var(--color-primary),
    //   var(--color-primary)
    // );

    img {
      height: 78px;
      border-radius: 0.125em;
      margin-right: 24px;
    }
  }
  .subtitle {
    font-size: clamp(13px, 4vw, 18px);
    letter-spacing: 1px;
    margin: clamp(16px, 6vw, 28px) 0 clamp(28px, 12vw, 54px) 0;
    animation-duration: 0.8s;
    animation-name: letterSpacing1;
    text-transform: uppercase;
    color: var(--color-text);
  }
  .buttons {
    margin-top: 32px;
    display: flex;
    justify-content: center;
    button {
      margin-right: 16px;
    }
  }
}

.gradient-test {
  background-image: linear-gradient(to left, #92fe9d 0%, #00c9ff 100%);
}

[data-theme='dark'] {
  .gradient-radar {
    background-image: linear-gradient(to left, #92fe9d 0%, #00c9ff 100%);
  }
}

.gradient-radar {
  background-image: linear-gradient(to left, #0ba360 0%, #3cba92 100%);
}

.gradient-blue-purple {
  background-image: linear-gradient(
    45deg,
    #89c4f5 0%,
    #6284ff 42%,
    #ff0000 100%
  );
}

.gradient-sharp-blue {
  background-image: linear-gradient(45deg, #00c6fb 0%, #005bea 100%);
}

.gradient-yellow-pink {
  background-image: linear-gradient(45deg, #f6d365 0%, #fda085 100%);
}

.gradient-pink {
  background-image: linear-gradient(45deg, #ee9ca7 0%, #ffdde1 100%);
}

.gradient-indigo-pink-yellow {
  background-image: linear-gradient(
    43deg,
    #4158d0 0%,
    #c850c0 46%,
    #ffcc70 100%
  );
}

.gradient-light-red-light-blue {
  background-image: linear-gradient(
    225deg,
    hsl(190, 30%, 50%) 0%,
    #081abb 38%,
    #ec3841 58%,
    hsl(13, 99%, 49%) 100%
  );
}

.gradient-fog {
  background: linear-gradient(-180deg, #bcc5ce 0%, #929ead 98%),
    radial-gradient(
      at top left,
      rgba(255, 255, 255, 0.3) 0%,
      rgba(0, 0, 0, 0.3) 100%
    );
  background-blend-mode: screen;
}

.gradient-red {
  background-image: linear-gradient(213deg, #ff0844 0%, #ffb199 100%);
}

.gradient-sky-blue {
  background-image: linear-gradient(147deg, #48c6ef 0%, #6f86d6 100%);
}

.gradient-dark-blue-midnight-blue {
  background-image: linear-gradient(213deg, #09203f 0%, #537895 100%);
}

.gradient-yellow-red {
  background: linear-gradient(147deg, #fec867 0%, #f72c61 100%);
}

.gradient-yellow {
  background: linear-gradient(147deg, #fceb02 0%, #fec401 100%);
}

.gradient-midnight-blue {
  background-image: linear-gradient(-20deg, #2b5876 0%, #4e4376 100%);
}

.gradient-orange-red {
  background-image: linear-gradient(147deg, #ffe53b 0%, #ff2525 74%);
}

.gradient-moonstone-blue {
  background-image: linear-gradient(
    147deg,
    hsl(200, 34%, 8%) 0%,
    hsl(204, 35%, 38%) 50%,
    hsl(200, 34%, 18%) 100%
  );
}

.gradient-pink-purple-blue {
  background-image: linear-gradient(
    to right,
    #ff3cac 0%,
    #784ba0 50%,
    #2b86c5 100%
  ) !important;
}

.gradient-green {
  background-image: linear-gradient(
    90deg,
    #c6f6d5,
    #68d391,
    #38b2ac
  ) !important;
}

.user-info {
  h1 {
    font-size: 42px;
    position: relative;
    color: var(--color-text);
    .avatar {
      height: 44px;
      margin-right: 12px;
      vertical-align: -7px;
      border-radius: 50%;
      border: rgba(0, 0, 0, 0.2);
    }
  }
}

.search-box {
  display: flex;
  position: absolute;
  right: 20px;
  bottom: -55px;
  justify-content: flex-end;
  -webkit-app-region: no-drag;

  .container {
    display: flex;
    align-items: center;
    height: 32px;
    background: var(--color-secondary-bg-for-transparent);
    border-radius: 8px;
    width: 200px;
  }

  .svg-icon {
    height: 15px;
    width: 15px;
    color: var(--color-text);
    opacity: 0.28;
    margin: {
      left: 8px;
      right: 4px;
    }
  }

  input {
    font-size: 16px;
    border: none;
    background: transparent;
    width: 96%;
    font-weight: 600;
    margin-top: -1px;
    color: var(--color-text);
  }

  .active {
    background: var(--color-primary-bg-for-transparent);
    input,
    .svg-icon {
      opacity: 1;
      color: var(--color-primary);
    }
  }
}

[data-theme='dark'] {
  .search-box {
    .active {
      input,
      .svg-icon {
        color: var(--color-text);
      }
    }
  }
}

.search-box-likepage {
  display: flex;
  position: absolute;
  right: 12vw;
  top: 95px;
  justify-content: flex-end;
  -webkit-app-region: no-drag;

  .input {
    transition: all 0.5s;
  }

  .container {
    display: flex;
    align-items: center;
    height: 32px;
    background: var(--color-secondary-bg-for-transparent);
    border-radius: 8px;
  }

  .svg-icon {
    height: 15px;
    width: 15px;
    color: var(--color-text);
    opacity: 0.28;
    margin: {
      left: 8px;
      right: 8px;
    }
  }

  input {
    font-size: 16px;
    border: none;
    background: transparent;
    width: 96%;
    font-weight: 600;
    margin-top: -1px;
    color: var(--color-text);
  }

  .active {
    background: var(--color-primary-bg-for-transparent);
    input,
    .svg-icon {
      opacity: 1;
      color: var(--color-primary);
    }
  }
}

[data-theme='dark'] {
  .search-box-likepage {
    .active {
      input,
      .svg-icon {
        color: var(--color-text);
      }
    }
  }
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
    margin: 0;
    flex-direction: column;
  }
  .playlist-info .info {
    padding: 14px;
    margin: 0;
  }
  .search-box-likepage {
    right: 8vw;
  }
}

.load-more {
  display: flex;
  justify-content: center;
  margin-top: 32px;
}
</style>
