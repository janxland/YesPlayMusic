<template>
  <div class="player" @click="handleClick" @mousedown="handleMouseDown">
    <div
      class="progress-bar"
      :class="{
        nyancat: settings.nyancatStyle,
        'nyancat-stop': settings.nyancatStyle && !player.playing,
      }"
      @click.stop
    >
      <vue-slider
        v-model="player.progress"
        :min="0"
        :max="player.currentTrackDuration"
        :interval="1"
        :drag-on-click="true"
        :duration="0"
        :dot-size="12"
        :height="2"
        :tooltip-formatter="formatTrackTime"
        :lazy="true"
        :silent="true"
      ></vue-slider>
    </div>
    <div class="controls no-scrollbar">
      <div class="playing">
        <div class="container" @click.stop>
          <div class="cover-wrap">
            <LazyImage
              :src="
                currentTrack.al && currentTrack.al.picUrl | resizeImage(224)
              "
              referrerpolicy="no-referrer"
              @click="goToAlbum"
            />
            <span
              v-if="player.loading"
              class="cover-spinner"
              role="status"
              aria-label="正在加载音频"
            ></span>
          </div>
          <div class="track-info" :title="audioSource">
            <div
              :class="['name', { 'has-list': hasList() }]"
              @click="hasList() && goToList()"
            >
              {{ currentTrack.name }}
            </div>
            <div class="artist">
              <span
                v-for="(ar, index) in currentTrack.ar"
                :key="ar.id"
                @click="ar.id && goToArtist(ar.id)"
              >
                <span :class="{ ar: ar.id }"> {{ ar.name }} </span
                ><span v-if="index !== currentTrack.ar.length - 1">, </span>
              </span>
            </div>
          </div>
          <div class="like-button">
            <button-icon
              :title="
                player.isCurrentTrackLiked
                  ? $t('player.unlike')
                  : $t('player.like')
              "
              @click.native="likeATrack(player.currentTrack.id)"
            >
              <svg-icon
                v-show="!player.isCurrentTrackLiked"
                icon-class="heart"
              ></svg-icon>
              <svg-icon
                v-show="player.isCurrentTrackLiked"
                icon-class="heart-solid"
              ></svg-icon>
            </button-icon>
          </div>
          <button-icon class="secondary-control" @click.native="Download">
            <svg-icon icon-class="download" />
          </button-icon>
          <button-icon
            class="secondary-control"
            @click.native="player.loadLocalMusic()"
          >
            <svg-icon icon-class="upload" />
          </button-icon>
        </div>
        <div class="blank"></div>
      </div>
      <div class="middle-control-buttons">
        <div class="blank"></div>
        <div class="container" @click.stop>
          <button-icon
            :title="$t('player.previous')"
            @click.native="playPrevTrack"
            ><svg-icon icon-class="previous"
          /></button-icon>
          <button-icon
            class="play"
            :title="$t(player.playing ? 'player.pause' : 'player.play')"
            @click.native="playOrPause"
          >
            <svg-icon :icon-class="player.playing ? 'pause' : 'play'"
          /></button-icon>
          <button-icon :title="$t('player.next')" @click.native="playNextTrack"
            ><svg-icon icon-class="next"
          /></button-icon>
        </div>
        <div class="blank"></div>
      </div>
      <div class="right-control-buttons">
        <div class="blank"></div>
        <div class="container" @click.stop>
          <button-icon
            class="secondary-control"
            :title="$t('player.nextUp')"
            :class="{
              active: $route.name === 'next',
              disabled: player.isPersonalFM,
            }"
            @click.native="goToNextTracksPage"
            ><svg-icon icon-class="list"
          /></button-icon>
          <button-icon
            class="secondary-control"
            :class="{
              active: player.repeatMode !== 'off',
              disabled: player.isPersonalFM,
            }"
            :title="
              player.repeatMode === 'one'
                ? $t('player.repeatTrack')
                : $t('player.repeat')
            "
            @click.native="switchRepeatMode"
          >
            <svg-icon
              v-show="player.repeatMode !== 'one'"
              icon-class="repeat"
            />
            <svg-icon
              v-show="player.repeatMode === 'one'"
              icon-class="repeat-1"
            />
          </button-icon>
          <button-icon
            class="secondary-control"
            :class="{ active: player.shuffle, disabled: player.isPersonalFM }"
            :title="$t('player.shuffle')"
            @click.native="switchShuffle"
            ><svg-icon icon-class="shuffle"
          /></button-icon>
          <button-icon
            v-if="settings.enableReversedMode"
            class="secondary-control"
            :class="{ active: player.reversed, disabled: player.isPersonalFM }"
            :title="$t('player.reversed')"
            @click.native="switchReversed"
            ><svg-icon icon-class="sort-up"
          /></button-icon>
          <div class="volume-control secondary-control">
            <button-icon :title="$t('player.mute')" @click.native="mute">
              <svg-icon v-show="volume > 0.5" icon-class="volume" />
              <svg-icon v-show="volume === 0" icon-class="volume-mute" />
              <svg-icon
                v-show="volume <= 0.5 && volume !== 0"
                icon-class="volume-half"
              />
            </button-icon>
            <div class="volume-bar">
              <vue-slider
                v-model="volume"
                :min="0"
                :max="1"
                :interval="0.01"
                :drag-on-click="true"
                :duration="0"
                tooltip="none"
                :dot-size="12"
              ></vue-slider>
            </div>
          </div>

          <button-icon
            v-if="desktopLyricsSupported"
            class="desktop-lyrics-button secondary-control"
            :class="{ active: desktopLyricsActive }"
            title="桌面歌词"
            @click.native="toggleDesktopLyrics"
            ><svg-icon icon-class="desktop-lyrics"
          /></button-icon>
          <button-icon
            v-if="!isElectron"
            class="open-client-button secondary-control"
            title="用桌面客户端打开（支持透明桌面歌词）"
            @click.native="openDesktopClient"
            ><svg-icon icon-class="monitor"
          /></button-icon>
          <div class="more-menu">
            <button-icon title="更多" @click.native="toggleMoreMenu">
              <svg-icon icon-class="more" />
            </button-icon>
            <div
              v-if="moreMenuOpen"
              ref="moreMenu"
              class="more-dropdown"
              tabindex="-1"
              @mousedown.prevent
              @click="moreMenuOpen = false"
              @blur="moreMenuOpen = false"
            >
              <div
                v-show="!player.isPersonalFM"
                class="item"
                @click="goToNextTracksPage"
              >
                <svg-icon icon-class="list" />
                播放队列
              </div>
              <div class="item" @click="Download">
                <svg-icon icon-class="download" />
                下载
              </div>
              <div class="item" @click="player.loadLocalMusic()">
                <svg-icon icon-class="upload" />
                本地音乐
              </div>
              <hr />
              <div
                v-show="!player.isPersonalFM"
                class="item"
                :class="{ active: player.repeatMode !== 'off' }"
                @click="switchRepeatMode"
              >
                <svg-icon
                  :icon-class="
                    player.repeatMode === 'one' ? 'repeat-1' : 'repeat'
                  "
                />
                {{
                  player.repeatMode === 'one'
                    ? $t('player.repeatTrack')
                    : $t('player.repeat')
                }}
              </div>
              <div
                v-show="!player.isPersonalFM"
                class="item"
                :class="{ active: player.shuffle }"
                @click="switchShuffle"
              >
                <svg-icon icon-class="shuffle" />
                {{ $t('player.shuffle') }}
              </div>
            </div>
          </div>
          <button-icon
            class="lyrics-button"
            title="歌词"
            @click.native="toggleLyrics"
            ><svg-icon icon-class="arrow-up"
          /></button-icon>
        </div>
      </div>
    </div>
  </div>
</template>

<script>
import { mapState, mapMutations, mapActions } from 'vuex';
import '@/assets/css/slider.css';

import ButtonIcon from '@/components/ButtonIcon.vue';
import VueSlider from 'vue-slider-component';
import { goToListSource, hasListSource } from '@/utils/playList';
import {
  isDesktopLyricsSupported,
  isDesktopLyricsOpen,
  onDesktopLyricsStateChange,
  toggleDesktopLyrics as toggleDesktopLyricsAction,
} from '@/utils/desktopLyrics';

export default {
  name: 'Player',
  components: {
    ButtonIcon,
    VueSlider,
  },
  data() {
    return {
      mouseDownTarget: null,
      moreMenuOpen: false,
      isElectron: process.env.IS_ELECTRON === true,
      desktopLyricsSupported: isDesktopLyricsSupported(),
      desktopLyricsActive: isDesktopLyricsOpen(),
    };
  },
  computed: {
    ...mapState(['player', 'settings', 'data']),
    currentTrack() {
      return this.player.currentTrack;
    },
    volume: {
      get() {
        return this.player.volume;
      },
      set(value) {
        this.player.volume = value;
      },
    },
    playing() {
      return this.player.playing;
    },
    audioSource() {
      return this.player._howler?._src.includes('kuwo.cn')
        ? '音源来自酷我音乐'
        : '';
    },
  },
  mounted() {
    this.setupMediaControls();
    window.addEventListener('keydown', this.handleKeydown);
    this.offDesktopLyricsState = onDesktopLyricsStateChange(open => {
      this.desktopLyricsActive = open;
    });
  },
  beforeDestroy() {
    window.removeEventListener('keydown', this.handleKeydown);
    this.offDesktopLyricsState?.();
  },
  methods: {
    ...mapMutations(['toggleLyrics']),
    ...mapActions(['showToast', 'likeATrack']),
    toggleDesktopLyrics() {
      toggleDesktopLyricsAction().catch(err => {
        console.warn('[desktopLyrics] toggle failed:', err);
        this.showToast('当前浏览器不支持桌面歌词');
      });
    },
    openDesktopClient() {
      // 未安装客户端时自定义协议静默失败：页面保持可见且握有焦点 → 引导去下载页
      window.open('yesplaymusic://desktop-lyrics', '_blank');
      setTimeout(() => {
        if (!document.hidden && document.hasFocus()) {
          this.$router.push('/download');
        }
      }, 2000);
    },
    toggleMoreMenu() {
      this.moreMenuOpen = !this.moreMenuOpen;
      if (this.moreMenuOpen) {
        this.$nextTick(() => this.$refs.moreMenu.focus());
      }
    },
    handleClick(event) {
      if (event.target == this.mouseDownTarget) {
        this.toggleLyrics();
      }
    },
    handleMouseDown(event) {
      this.mouseDownTarget = event.target;
    },
    playPrevTrack() {
      this.player.playPrevTrack();
    },
    playOrPause() {
      this.player.playOrPause();
    },
    playNextTrack() {
      if (this.player.isPersonalFM) {
        this.player.playNextFMTrack();
      } else {
        this.player.playNextTrack();
      }
    },
    goToNextTracksPage() {
      if (this.player.isPersonalFM) return;
      this.$route.name === 'next'
        ? this.$router.go(-1)
        : this.$router.push({ name: 'next' });
    },
    formatTrackTime(value) {
      if (!value) return '';
      let min = ~~((value / 60) % 60);
      let sec = (~~(value % 60)).toString().padStart(2, '0');
      return `${min}:${sec}`;
    },
    hasList() {
      return hasListSource();
    },
    /* eslint-disable */
    Download() {
      const { name, ar } = this.currentTrack;
      const newMp3Url = this.player.nowMp3Url.split(':')[1];
      fetch(newMp3Url)
        .then(response => response.blob())
        .then(blob => {
          const link = document.createElement('a');
          link.href = URL.createObjectURL(blob);
          link.download = `${name}-${ar[0].name}`;
          link.style.display = 'none';
          document.body.appendChild(link);
          link.click();
          document.body.removeChild(link);
          URL.revokeObjectURL(link.href);
        })
        .catch(() => window.open(newMp3Url, '_blank'));
    },
    goToList() {
      goToListSource();
    },
    goToAlbum() {
      if (this.player.currentTrack.al.id === 0) return;
      this.$router.push({ path: '/album/' + this.player.currentTrack.al.id });
    },
    goToArtist(id) {
      this.$router.push({ path: '/artist/' + id });
    },
    moveToFMTrash() {
      this.player.moveToFMTrash();
    },
    switchRepeatMode() {
      this.player.switchRepeatMode();
    },
    switchShuffle() {
      this.player.switchShuffle();
    },
    switchReversed() {
      this.player.switchReversed();
    },
    mute() {
      this.player.mute();
    },

    setupMediaControls() {
      if ('mediaSession' in navigator) {
        navigator.mediaSession.setActionHandler('play', () => {
          this.playOrPause();
        });
        navigator.mediaSession.setActionHandler('pause', () => {
          this.playOrPause();
        });
        navigator.mediaSession.setActionHandler('previoustrack', () => {
          this.playPrevTrack();
        });
        navigator.mediaSession.setActionHandler('nexttrack', () => {
          this.playNextTrack();
        });
      }
    },

    handleKeydown(event) {
      switch (event.code) {
        case 'MediaPlayPause':
          this.playOrPause();
          break;
        case 'MediaTrackPrevious':
          this.playPrevTrack();
          break;
        case 'MediaTrackNext':
          this.playNextTrack();
          break;
        default:
          break;
      }
    },
  },
};
</script>

<style lang="scss" scoped>
.player {
  position: absolute;
  bottom: 0;
  left: 0;
  display: flex;
  flex-direction: column;
  justify-content: space-around;
  height: 64px;
  width: 100%;
  backdrop-filter: saturate(180%) blur(30px);
  background-color: var(--color-navbar-bg);
  z-index: 100;
}

@supports (-moz-appearance: none) {
  .player {
    background-color: var(--color-body-bg);
  }
}

.progress-bar {
  margin-top: -6px;
  margin-bottom: -6px;
  width: 100%;
}

.controls {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  overflow-x: scroll;
  height: 100%;
  padding: {
    right: 10vw;
    left: 10vw;
  }
}

.blank {
  flex-grow: 1;
}

.playing {
  display: flex;
}

.playing .container {
  display: flex;
  align-items: center;
  img {
    height: 46px;
    border-radius: 5px;
    box-shadow: 0 6px 8px -2px rgba(0, 0, 0, 0.16);
    cursor: pointer;
    user-select: none;
  }
  .cover-wrap {
    position: relative;
    display: flex;
  }
  .cover-spinner {
    position: absolute;
    left: 0;
    top: 0;
    width: 100%;
    height: 100%;
    border-radius: 5px;
    background: rgba(0, 0, 0, 0.45);
    &::after {
      content: '';
      position: absolute;
      left: 50%;
      top: 50%;
      width: 16px;
      height: 16px;
      margin: -8px 0 0 -8px;
      border: 2px solid rgba(255, 255, 255, 0.35);
      border-top-color: #fff;
      border-radius: 50%;
      animation: cover-spin 0.7s linear infinite;
    }
  }
  .track-info {
    height: 46px;
    margin-left: 12px;
    min-width: 100px;
    display: flex;
    flex-direction: column;
    justify-content: center;
    .name {
      font-weight: 600;
      font-size: 16px;
      opacity: 0.88;
      color: var(--color-text);
      margin-bottom: 4px;
      display: -webkit-box;
      -webkit-box-orient: vertical;
      -webkit-line-clamp: 1;
      overflow: hidden;
      word-break: break-all;
    }
    .has-list {
      cursor: pointer;
      &:hover {
        text-decoration: underline;
      }
    }
    .artist {
      font-size: 12px;
      opacity: 0.58;
      color: var(--color-text);
      display: -webkit-box;
      -webkit-box-orient: vertical;
      -webkit-line-clamp: 1;
      overflow: hidden;
      word-break: break-all;
      span.ar {
        cursor: pointer;
        &:hover {
          text-decoration: underline;
        }
      }
    }
  }
}

.middle-control-buttons {
  display: flex;
}

.middle-control-buttons .container {
  flex: 1;
  display: flex;
  justify-content: center;
  align-items: center;
  padding: 0 8px;
  .button-icon {
    margin: 0 8px;
  }
  .play {
    height: 42px;
    width: 42px;
    .svg-icon {
      width: 24px;
      height: 24px;
    }
  }
}

.right-control-buttons {
  display: flex;
}

.right-control-buttons .container {
  display: flex;
  justify-content: flex-end;
  align-items: center;
  .expand {
    margin-left: 24px;
    .svg-icon {
      height: 24px;
      width: 24px;
    }
  }
  .active .svg-icon {
    color: var(--color-primary);
  }
  .volume-control {
    margin-left: 4px;
    display: flex;
    align-items: center;
    .volume-bar {
      width: 84px;
    }
  }
  .more-menu {
    display: none;
    position: relative;
  }
}

.button-icon.disabled {
  cursor: default;
  opacity: 0.38;
  &:hover {
    background: none;
  }
  &:active {
    transform: unset;
  }
}

.more-dropdown {
  position: absolute;
  bottom: calc(100% + 12px);
  right: 0;
  z-index: 300;
  display: flex;
  flex-direction: column;
  min-width: 148px;
  padding: 6px;
  border-radius: 12px;
  background: #fff;
  border: 1px solid rgba(0, 0, 0, 0.08);
  box-shadow: 0 8px 24px -6px rgba(0, 0, 0, 0.28);
  user-select: none;
  .item {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 10px 14px;
    border-radius: 8px;
    font-size: 14px;
    font-weight: 600;
    color: var(--color-text);
    cursor: default;
    .svg-icon {
      height: 16px;
      width: 16px;
    }
    &:active {
      opacity: 0.75;
      transform: scale(0.96);
    }
  }
  .item.active {
    color: var(--color-primary);
  }
  hr {
    border: none;
    height: 1px;
    margin: 4px 10px;
    background: rgba(128, 128, 128, 0.18);
  }
}

[data-theme='dark'] .more-dropdown {
  background: #242424;
  border-color: rgba(255, 255, 255, 0.1);
}

@media (max-width: 576px) {
  .controls {
    display: flex;
    align-items: center;
    overflow: visible;
    padding: 0 8px;
  }
  .blank {
    display: none;
  }
  .playing {
    flex: 1;
    min-width: 0;
  }
  .playing .container {
    flex: 1;
    min-width: 0;
    .cover-wrap img {
      height: 40px;
      width: 40px;
    }
    .track-info {
      min-width: 0;
      height: 40px;
      margin-left: 8px;
      .name {
        font-size: 14px;
      }
    }
    .secondary-control {
      display: none;
    }
  }
  .middle-control-buttons .container {
    flex: none;
    padding: 0;
    .button-icon {
      margin: 0 3px;
    }
  }
  .right-control-buttons .container {
    .button-icon {
      margin: 0 3px;
    }
    .secondary-control {
      display: none;
    }
    .more-menu {
      display: flex;
      align-items: center;
    }
  }
}

@keyframes cover-spin {
  to {
    transform: rotate(360deg);
  }
}
</style>
