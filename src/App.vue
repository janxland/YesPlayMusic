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
      <Scrollbar v-show="!showLyrics" ref="scrollbar" />
      <transition name="slide-up">
        <Player v-if="enablePlayer" v-show="showPlayer" ref="player" />
      </transition>
      <Navbar v-show="showNavbar" ref="navbar" />
      <main
        ref="main"
        :style="{ overflow: enableScrolling ? 'auto' : 'hidden' }"
        @scroll="handleScroll"
      >
        <keep-alive>
          <router-view v-if="$route.meta.keepAlive"></router-view>
        </keep-alive>
        <router-view v-if="!$route.meta.keepAlive"></router-view>
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

<script>
import ModalAddTrackToPlaylist from './components/ModalAddTrackToPlaylist.vue';
import ModalNewPlaylist from './components/ModalNewPlaylist.vue';
import Scrollbar from './components/Scrollbar.vue';
import Navbar from './components/Navbar.vue';
import Player from './components/Player.vue';
import Toast from './components/Toast.vue';
import SwUpdatePrompt from './components/SwUpdatePrompt.vue';
import { ipcRenderer } from './electron/ipcRenderer';
import { isAccountLoggedIn, isLooseLoggedIn } from '@/utils/auth';
// 歌词页自带取色与歌词解析等只在打开歌词时才用得上的依赖，静态引入会把它们
// 一并塞进首屏 index.js（首屏最贵的一段解析在低端机上就是白屏时长）。改为
// 按 chunk 加载，并在浏览器空闲时预热 —— 用户点开时 chunk 已在内存里，
// 既省首屏也不用等待。
const Lyrics = () =>
  import(/* webpackChunkName: "lyrics" */ './views/lyrics.vue');
import { mapState } from 'vuex';
import { flexiSite } from '@/api/others';
import {
  initDesktopLyricsSync,
  isDesktopLyricsView,
} from '@/utils/desktopLyrics';
export default {
  name: 'App',
  components: {
    Navbar,
    Player,
    Toast,
    SwUpdatePrompt,
    ModalAddTrackToPlaylist,
    ModalNewPlaylist,
    Lyrics,
    Scrollbar,
  },
  data() {
    return {
      isElectron: process.env.IS_ELECTRON, // true || undefined
      userSelectNone: false,
      // 歌词页首次打开前不实例化；一旦打开就常驻，避免反复重建丢滚动状态
      lyricsMounted: false,
    };
  },
  computed: {
    ...mapState(['showLyrics', 'settings', 'player', 'enableScrolling']),
    isAccountLoggedIn() {
      return isAccountLoggedIn();
    },
    showPlayer() {
      return (
        [
          'mv',
          'loginUsername',
          'login',
          'loginAccount',
          'lastfmCallback',
        ].includes(this.$route.name) === false
      );
    },
    enablePlayer() {
      return this.player.enabled && this.$route.name !== 'lastfmCallback';
    },
    showNavbar() {
      return this.$route.name !== 'lastfmCallback';
    },
    isDesktopLyricsWindow() {
      return isDesktopLyricsView();
    },
  },
  watch: {
    showLyrics(opened) {
      if (opened) this.lyricsMounted = true;
    },
  },
  mounted() {
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
  },
  created() {
    // 创建音频上下文
    if (this.isElectron) ipcRenderer(this);
    // 桌面歌词：主窗口向歌词窗口同步播放状态（歌词窗口自身不需要）
    if (this.isElectron && !this.isDesktopLyricsWindow) {
      initDesktopLyricsSync();
    }
    window.addEventListener('keydown', this.handleKeydown);
    this.fetchData();

    // 字体配置：先用本地缓存即时上字体，再后台静默刷新远程配置。
    // 之前每次启动都同步等 flexiSite(2)，是首屏字体跳动 + 网络黏脚的来源之一。
    const cachedFonts = localStorage.getItem('fonts');
    if (cachedFonts) {
      try {
        const fonts = JSON.parse(cachedFonts);
        if (Array.isArray(fonts) && fonts.length) {
          this.loadFont(
            localStorage.getItem('fontFamilyName') || fonts[2]?.name
          );
        }
      } catch (_) {
        /* ignore */
      }
    }
    flexiSite(2)
      .then(res => {
        if (res && res.code === 200) {
          const settings = res.data.value;
          localStorage.setItem('fonts', JSON.stringify(settings.fonts));
          if (!cachedFonts) {
            this.loadFont(
              localStorage.getItem('fontFamilyName') || settings.fonts[2].name
            );
          }
        }
      })
      .catch(err => {
        console.warn('[App] flexiSite failed:', err?.message || err);
      });
  },
  methods: {
    handleKeydown(e) {
      if (e.code === 'Space') {
        if (e.target.tagName === 'INPUT') return false;
        if (this.$route.name === 'mv') return false;
        e.preventDefault();
        this.player.playOrPause();
      }
    },
    loadFont(fontFamily) {
      fontFamily = this.$store.state.fonts.find(
        font => font.name === fontFamily
      );
      const fontUrl = fontFamily?.href;
      if (!fontUrl) return;

      // 使用 media="print" 技巧避免阻塞渲染，加载完成后切换为 all
      const fontLink = document.createElement('link');
      fontLink.setAttribute('rel', 'stylesheet');
      fontLink.setAttribute('href', fontUrl);
      fontLink.setAttribute('media', 'print');
      fontLink.onload = function () {
        this.media = 'all';
      };
      document.head.appendChild(fontLink);
      document.documentElement.style.setProperty(
        '--globalFont',
        fontFamily?.import
      );
    },
    fetchData() {
      if (!isLooseLoggedIn()) return;
      this.$store.dispatch('fetchLikedSongs');
      this.$store.dispatch('fetchLikedSongsWithDetails');
      this.$store.dispatch('fetchLikedPlaylist');
      if (isAccountLoggedIn()) {
        this.$store.dispatch('fetchLikedAlbums');
        this.$store.dispatch('fetchLikedArtists');
        this.$store.dispatch('fetchLikedMVs');
        this.$store.dispatch('fetchCloudDisk');
      }
    },
    handleScroll() {
      this.$refs.scrollbar.handleScroll();
    },
  },
};
</script>

<style lang="scss">
:root {
  --globalFont: '';
}
html,
body,
#app {
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
.slide-up-enter,
.slide-up-leave-to {
  transform: translateY(100%);
}
</style>
