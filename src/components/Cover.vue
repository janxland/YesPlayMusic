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

<script setup lang="ts">
const router = useRouter();
const route = useRoute();

import { ref, computed } from 'vue';
import type { CSSProperties } from 'vue';
import { usePlayerStore } from '@/stores/player';

import { useRoute } from 'vue-router';
import { useRouter } from 'vue-router';
const playerStore = usePlayerStore();

const props = defineProps({
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
});

const focus = ref<any>(false);

const isPendingSource = computed(function isPendingSource() {
  const player = playerStore.player;
  return player.loading && player.playlistSource?.id === props.id;
});

const imageStyles = computed(function imageStyles() {
  let styles: CSSProperties = {};
  if (props.fixedSize !== 0) {
    styles.width = props.fixedSize + 'px';
    styles.height = props.fixedSize + 'px';
  }
  if (props.type === 'artist') styles.borderRadius = '50%';
  return styles;
});

const playButtonStyles = computed(function playButtonStyles() {
  let styles: CSSProperties = {};
  styles.width = props.playButtonSize + '%';
  styles.height = props.playButtonSize + '%';
  return styles;
});

const shadowStyles = computed(function shadowStyles() {
  let styles: CSSProperties = {};
  styles.backgroundImage = `url(${props.imageUrl})`;
  if (props.type === 'artist') styles.borderRadius = '50%';
  return styles;
});

function play() {
  // 重复点击由 _playResource key 与 playlistSource inflight 挡住，这里不做时间节流（会误伤正常二次点击）
  const player = playerStore.player;
  const playActions = {
    album: player.playAlbumByID,
    playlist: player.playPlaylistByID,
    artist: player.playArtistByID,
  };
  const fn = playActions[props.type];
  if (fn) fn.bind(player)(props.id);
}

function goTo() {
  router.push({
    name: props.type,
    params: { id: props.id },
    query: { server: route.query.server },
  });
}
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
.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}
</style>
