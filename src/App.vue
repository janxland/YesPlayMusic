<template>
  <div
    id="app"
    class="no-scrollbar"
    :class="{ 'user-select-none': userSelectNone }"
  >
    <!-- 桌面歌词独立窗口：只渲染歌词视图，不挂载播放器/导航栏 -->
    <template v-if="isDesktopLyricsWindow">
      <router-view></router-view>
    </template>
    <template v-else>
      <Scrollbar
        v-show="!showLyrics"
        ref="scrollbarRef"
        :scroll-target="mainEl"
        @dragging="userSelectNone = $event"
      />
      <transition name="slide-up">
        <Player v-if="enablePlayer" v-show="showPlayer" ref="playerRef" />
      </transition>
      <Navbar v-show="showNavbar" ref="navbarRef" />
      <main
        ref="mainEl"
        :style="{ overflow: enableScrolling ? 'auto' : 'hidden' }"
        @scroll="handleScroll"
      >
        <!-- keepAlive 路由按 route.name 缓存（vue-router 4 要求 transition/keep-alive 移入 v-slot）；非 keepAlive 路由走普通分支不进缓存 -->
        <router-view v-slot="{ Component, route: viewRoute }">
          <keep-alive>
            <component
              :is="Component"
              v-if="viewRoute.meta.keepAlive"
              :key="viewRoute.name"
            />
          </keep-alive>
          <component
            :is="Component"
            v-if="!viewRoute.meta.keepAlive"
            :key="viewRoute.name"
          />
        </router-view>
      </main>

      <Toast />
      <SwUpdatePrompt />
      <ModalAddTrackToPlaylist v-if="isAccountLoggedIn" />
      <ModalNewPlaylist v-if="isAccountLoggedIn" />
      <transition v-if="enablePlayer" name="slide-up">
        <Lyrics v-if="lyricsMounted" v-show="showLyrics" />
      </transition>
    </template>
  </div>
</template>

<script setup lang="ts">
const router = useRouter();
const route = useRoute();

import { computed, defineAsyncComponent, onMounted, ref, watch } from 'vue';
import ModalAddTrackToPlaylist from './components/ModalAddTrackToPlaylist.vue';
import { player as playerSingleton } from '@/player/singleton';
import ModalNewPlaylist from './components/ModalNewPlaylist.vue';
import Scrollbar from './components/Scrollbar.vue';
import Navbar from './components/Navbar.vue';
import Player from './components/Player.vue';
import Toast from './components/Toast.vue';
import SwUpdatePrompt from './components/SwUpdatePrompt.vue';
import { wireDesktopIpc } from './electron/ipcRenderer';
import {
  isAccountLoggedIn as isAccountLoggedInUtil,
  isLooseLoggedIn,
} from '@/utils/auth';
import { flexiSite } from '@/api/others';
import {
  initDesktopLyricsSync,
  isDesktopLyricsView,
} from '@/utils/desktopLyrics';
import { isDesktop } from '@/platform/env';
import { useRoute, useRouter } from 'vue-router';
import {
  useSettingsStore,
  useLikedStore,
  usePlayerStore,
  useUiStore,
} from '@/stores';
import { storeToRefs } from 'pinia';
import { provideAppScroll } from '@/composables/useAppScroll';

const scrollbarRef = ref<InstanceType<typeof Scrollbar> | null>(null);
const playerRef = ref<InstanceType<typeof Player> | null>(null);
const navbarRef = ref<InstanceType<typeof Navbar> | null>(null);
const mainEl = ref<HTMLElement | null>(null);

// 视图层滚动控制（原 Vue2 $root.$refs.main / $refs.scrollbarRef 桥的替代）
provideAppScroll({
  scrollTo: (options, y) => {
    const el = mainEl.value;
    if (!el) return;
    if (typeof options === 'number') el.scrollTo(options, y ?? 0);
    else el.scrollTo(options);
  },
  restorePosition: () => scrollbarRef.value?.restorePosition(),
});
const settingsStore = useSettingsStore();
const likedStore = useLikedStore();
const uiStore = useUiStore();

const { showLyrics, enableScrolling } = storeToRefs(uiStore);
const { player } = storeToRefs(usePlayerStore());

const isElectron = ref(isDesktop());

const userSelectNone = ref(false);

const lyricsMounted = ref(false);

// 歌词页按需加载：首次点开才拉 chunk（onMounted 里的空闲预热提前下载），勿改为同步 import
const Lyrics = defineAsyncComponent(() => import('./views/lyrics.vue'));

const isAccountLoggedIn = computed(() => isAccountLoggedInUtil());

const showPlayer = computed(function showPlayer() {
  return (
    ['mv', 'loginUsername', 'login', 'loginAccount', 'lastfmCallback'].includes(
      route.name as string
    ) === false
  );
});

const enablePlayer = computed(function enablePlayer() {
  return player.value.enabled && route.name !== 'lastfmCallback';
});

const showNavbar = computed(function showNavbar() {
  return route.name !== 'lastfmCallback';
});

const isDesktopLyricsWindow = computed(function isDesktopLyricsWindow() {
  return isDesktopLyricsView();
});

function desktopIpcHandlers() {
  return {
    onRouteChange: path => {
      router.push(path);
      if (showLyrics.value) {
        uiStore.toggleLyrics();
      }
    },
    onFocusSearch: () => {
      // Navbar 已 defineExpose searchInput，不必绕 $refs
      navbarRef.value?.searchInput?.focus();
      navbarRef.value.inputFocus = true;
    },
    onPlayPause: () => player.value.playOrPause(),
    onNext: () =>
      player.value.isPersonalFM
        ? player.value.playNextFMTrack()
        : player.value.playNextTrack(),
    onPrev: () => player.value.playPrevTrack(),
    onVolumeDelta: delta => {
      // 直写真身（镜像写入单向同步，见 store/index.js P0.2 注释）
      playerSingleton.volume = Math.max(
        Math.min(playerSingleton.volume + delta, 1),
        0
      );
    },
    onLike: () => likedStore.likeATrack(player.value.currentTrack.id),
    onRepeat: () => player.value.switchRepeatMode(),
    onShuffle: () => player.value.switchShuffle(),
    onNavbarGo: where => navbarRef.value.go(where),
    onNextUp: () => playerRef.value.goToNextTracksPage(),
    onCloseAppOption: value =>
      settingsStore.updateSettings({
        key: 'closeAppOption',
        value,
      }),
    onSeekTo: position => playerSingleton._howler.seek(position),
  };
}

function handleKeydown(e) {
  if (e.code === 'Space') {
    if (e.target.tagName === 'INPUT') return false;
    if (route.name === 'mv') return false;
    e.preventDefault();
    player.value.playOrPause();
  }
}

function loadFont(fontFamily) {
  fontFamily = uiStore.fonts.find(font => font.name === fontFamily);
  const fontUrl = fontFamily?.href;
  if (!fontUrl) return;

  // 使用 media="print" 技巧避免阻塞渲染，加载完成后切换为 all
  const fontLink = document.createElement('link');
  fontLink.setAttribute('rel', 'stylesheet');
  fontLink.setAttribute('href', fontUrl);
  fontLink.setAttribute('media', 'print');
  fontLink.onload = () => {
    fontLink.media = 'all';
  };
  fontLink.onerror = () => {
    // 死链自愈：字体 CSS 不可达时把该条目从字体列表移除（ui store deep watch 自动落盘），避免每次启动重复请求失效链接；flexiSite 恢复下发后会自动补回
    uiStore.fonts = uiStore.fonts.filter(f => f?.name !== fontFamily?.name);
  };
  document.head.appendChild(fontLink);
  document.documentElement.style.setProperty(
    '--globalFont',
    fontFamily?.import
  );
}

function fetchData() {
  if (!isLooseLoggedIn()) return;
  likedStore.fetchLikedSongs();
  likedStore.fetchLikedSongsWithDetails();
  likedStore.fetchLikedPlaylist();
  if (isAccountLoggedIn.value) {
    likedStore.fetchLikedAlbums();
    likedStore.fetchLikedArtists();
    likedStore.fetchLikedMVs();
    likedStore.fetchCloudDisk();
  }
}

function handleScroll() {
  scrollbarRef.value.handleScroll();
}

if (isElectron.value) wireDesktopIpc(desktopIpcHandlers());
if (isElectron.value && !isDesktopLyricsWindow.value) {
  initDesktopLyricsSync();
}
window.addEventListener('keydown', handleKeydown);
fetchData();
const cachedFonts = localStorage.getItem('fonts');
if (cachedFonts) {
  try {
    const fonts = JSON.parse(cachedFonts);
    if (Array.isArray(fonts) && fonts.length) {
      loadFont(localStorage.getItem('fontFamilyName') || fonts[2]?.name);
    }
  } catch (_) {
    /* ignore */
  }
}
flexiSite(2)
  .then(res => {
    if (res && res.code === 200) {
      // 写入 ui store（deep watch 自动落盘 localStorage）——直写 localStorage 会让 store.fonts 停在首屏快照
      uiStore.fonts = res.data.value.fonts;
      if (!cachedFonts) {
        loadFont(
          localStorage.getItem('fontFamilyName') || res.data.value.fonts[2].name
        );
      }
    }
  })
  .catch(err => {
    // 字体配置是可选增强：代理网关未开放 /api/kv/key-value/query 时恒 403；已有 localStorage 缓存/默认字体降级，故仅 debug 级日志
    console.debug('[App] flexiSite skipped:', err?.message || err);
  });

watch(showLyrics, function (opened) {
  if (opened) lyricsMounted.value = true;
});

onMounted(function mounted() {
  // 空闲预热：把歌词 chunk 提前拽下来，用户点开时不再有一次性下载延迟
  const warmUp = () =>
    import('./views/lyrics.vue').catch(() => {
      /* 预热失败不影响按需加载 */
    });
  if (typeof window.requestIdleCallback === 'function') {
    window.requestIdleCallback(warmUp);
  } else {
    setTimeout(warmUp, 3000);
  }
});

// 暴露给 Scrollbar：拖动期间禁止全局文本选中
defineExpose({ userSelectNone });
</script>

<style lang="scss">
:root {
  --globalFont: '';
}
/* 挂载容器是 index.html 的 #app-root（Vue3 mount 保留容器，与 App 根 #app 分离）；视口盒子必须落在它身上，否则 #app 的 height:100% 对 auto 父级求解 → 塌陷成 0 → 全页空白 */
html,
body,
#app-root {
  position: fixed;
  width: 100%;
  height: 100%;
  font-family: var(--globalFont);
}
* {
  padding: 0;
  margin: 0;
}
#app {
  position: relative;
  width: 100%;
  height: 100%;
  transition: all 0.4s;
}

main {
  position: absolute;
  top: 0;
  bottom: 0;
  right: 0;
  left: 0;
  padding: 64px 10vw 96px 10vw;
  box-sizing: border-box;
  scrollbar-width: none; // firefox
}
.no-scrollbar::-webkit-scrollbar {
  display: none;
}
.no-scrollbar {
  overflow: scroll;
}
@media (max-width: 576px) {
  main {
    padding: 64px 5vw 96px 5vw;
  }
}

main::-webkit-scrollbar {
  width: 0px;
}

.slide-up-enter-active,
.slide-up-leave-active {
  transition: transform 0.4s;
}
.slide-up-enter-from,
.slide-up-leave-to {
  transform: translateY(100%);
}
</style>
