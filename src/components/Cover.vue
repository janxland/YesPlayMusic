<template>
  <div
    class="cover"
    :class="{ 'cover-hover': coverHover }"
    @mouseover="focus = true"
    @mouseleave="focus = false"
    @click="clickCoverToPlay ? play() : goTo()"
  >
    <div class="cover-container">
      <div class="shade">
        <button
          v-show="focus"
          class="play-button"
          :class="{ pending: isPendingSource }"
          :style="playButtonStyles"
          :aria-label="isPendingSource ? '正在准备播放' : '播放'"
          @click.stop="clickCoverToPlayFun ? clickCoverToPlayFun(id) : play()"
          ><svg-icon icon-class="play" />
        </button>
      </div>
      <LazyImage
        :src="imageUrl"
        referrerpolicy="no-referrer"
        :style="imageStyles"
      />
      <transition v-if="coverHover || alwaysShowShadow" name="fade">
        <div
          v-show="focus || alwaysShowShadow"
          class="shadow"
          :style="shadowStyles"
        ></div>
      </transition>
    </div>
  </div>
</template>

<script>
export default {
  props: {
    id: { type: Number, required: true },
    type: { type: String, required: true },
    imageUrl: { type: String, required: true },
    fixedSize: { type: Number, default: 0 },
    playButtonSize: { type: Number, default: 22 },
    coverHover: { type: Boolean, default: true },
    alwaysShowPlayButton: { type: Boolean, default: true },
    alwaysShowShadow: { type: Boolean, default: false },
    clickCoverToPlay: { type: Boolean, default: false },
    clickCoverToPlayFun: { type: Function, default: undefined },
    shadowMargin: { type: Number, default: 12 },
    radius: { type: Number, default: 12 },
  },
  data() {
    return {
      focus: false,
    };
  },
  computed: {
    /**
     * 本张封面正在装载音源。以前点击后 UI 完全静止，三跳串行要走一秒多，
     * 用户只能以为没点上。按当前播放列表来源去重到具体那一张。
     */
    isPendingSource() {
      const player = this.$store.state.player;
      return player.loading && player.playlistSource?.id === this.id;
    },
    imageStyles() {
      let styles = {};
      if (this.fixedSize !== 0) {
        styles.width = this.fixedSize + 'px';
        styles.height = this.fixedSize + 'px';
      }
      if (this.type === 'artist') styles.borderRadius = '50%';
      return styles;
    },
    playButtonStyles() {
      let styles = {};
      styles.width = this.playButtonSize + '%';
      styles.height = this.playButtonSize + '%';
      return styles;
    },
    shadowStyles() {
      let styles = {};
      styles.backgroundImage = `url(${this.imageUrl})`;
      if (this.type === 'artist') styles.borderRadius = '50%';
      return styles;
    },
  },
  methods: {
    play() {
      // 重复点击由 _playResource 的 key 与 playlistSource 的 inflight 两道防线
      // 挡住，这里不再做时间节流 —— 那会让正常的二次点击失效
      const player = this.$store.state.player;
      const playActions = {
        album: player.playAlbumByID,
        playlist: player.playPlaylistByID,
        artist: player.playArtistByID,
      };
      const fn = playActions[this.type];
      if (fn) fn.bind(player)(this.id);
    },
    goTo() {
      this.$router.push({
        name: this.type,
        params: { id: this.id },
        query: { server: this.$route.query.server },
      });
    },
  },
};
</script>

<style lang="scss" scoped>
.cover {
  position: relative;
  transition: transform 0.3s;
}
.cover-container {
  position: relative;
}
img {
  border-radius: 0.75em;
  width: 100%;
  user-select: none;
  aspect-ratio: 1 / 1;
  border: 1px solid rgba(0, 0, 0, 0.04);
}

.cover-hover {
  &:hover {
    cursor: pointer;
    /* transform: scale(1.02); */
  }
}

.shade {
  position: absolute;
  top: 0;
  height: calc(100% - 3px);
  width: 100%;
  background: transparent;
  display: flex;
  justify-content: center;
  align-items: center;
}
.play-button {
  display: flex;
  justify-content: center;
  align-items: center;
  color: white;
  backdrop-filter: blur(8px);
  background: rgba(255, 255, 255, 0.14);
  border: 1px solid rgba(255, 255, 255, 0.08);
  height: 22%;
  width: 22%;
  border-radius: 50%;
  cursor: default;
  transition: 0.2s;
  .svg-icon {
    width: 50%;
    margin: {
      left: 4px;
    }
  }
  &:hover {
    background: rgba(255, 255, 255, 0.28);
  }
  &:active {
    transform: scale(0.94);
  }
  &.pending {
    .svg-icon {
      display: none;
    }
    &::after {
      content: '';
      width: 42%;
      height: 42%;
      border: 2px solid rgba(255, 255, 255, 0.35);
      border-top-color: #fff;
      border-radius: 50%;
      animation: cover-spin 0.7s linear infinite;
    }
  }
}

@keyframes cover-spin {
  to {
    transform: rotate(360deg);
  }
}

.shadow {
  position: absolute;
  top: 12px;
  height: 100%;
  width: 100%;
  filter: blur(16px) opacity(0.8);
  transform: scale(0.92, 0.96);
  z-index: -1;
  background-size: cover;
  border-radius: 0.75em;
  aspect-ratio: 1 / 1;
}

.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.3s;
}
.fade-enter, .fade-leave-to /* .fade-leave-active below version 2.1.8 */ {
  opacity: 0;
}
</style>
