<template>
  <div class="fm" :style="{ background }" data-theme="dark">
    <img
      v-if="nextTrackCover"
      :src="nextTrackCover"
      style="display: none"
      referrerpolicy="no-referrer"
      onerror="this.onerror=null"
      loading="lazy"
    />
    <LazyImage
      class="cover"
      :src="resizeImage(track.album && track.album.picUrl, 512)"
      referrerpolicy="no-referrer"
      @click="goToAlbum"
    />
    <div class="right-part">
      <div class="info">
        <div class="title">{{ track.name }}</div>
        <div class="artist"><ArtistsInLine :artists="artists" /></div>
      </div>
      <div class="controls">
        <div class="buttons">
          <button-icon :title="$t('player.previous')" @click="playPrevTrack">
            <svg-icon icon-class="previous" />
          </button-icon>
          <button-icon
            :title="$t(isPlaying ? 'player.pause' : 'player.play')"
            class="play"
            @click="play"
          >
            <svg-icon :icon-class="isPlaying ? 'pause' : 'play'" />
          </button-icon>
          <button-icon :title="$t('player.next')" @click="next">
            <svg-icon icon-class="next" />
          </button-icon>
        </div>
        <div class="card-name"><svg-icon icon-class="fm" />私人FM</div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
const router = useRouter();

import ButtonIcon from '@/components/ButtonIcon.vue';
import ArtistsInLine from '@/components/ArtistsInLine.vue';
import { getCoverPalette } from '@/utils/coverPalette';
import { resizeImage } from '@/utils/formatters';
import Color from 'color';
import { ref, computed, watch } from 'vue';
import { usePlayerStore } from '@/stores/player';
import { storeToRefs } from 'pinia';

import { useRouter } from 'vue-router';
const { player } = storeToRefs(usePlayerStore());

const background = ref<any>('');

const track = computed(function track() {
  return player.value.personalFMTrack;
});

const isPlaying = computed(function isPlaying() {
  return player.value.playing && player.value.isPersonalFM;
});

const artists = computed(function artists() {
  return track.value.artists || track.value.ar || [];
});

const nextTrackCover = computed(function nextTrackCover() {
  // _personalFMNextTrack 初始为 {id:0}、加载失败会被置 undefined，
  // 链式取值必须兜底，否则 undefined.replace 在渲染期抛 TypeError 打崩 FM 卡片
  const picUrl = player.value._personalFMNextTrack?.album?.picUrl;
  return picUrl
    ? `${picUrl.replace('http://', 'https://')}?param=512y512`
    : '';
});

function play() {
  player.value.playPersonalFM();
}

function next() {
  player.value.playNextFMTrack();
}

function playPrevTrack() {
  player.value.playPrevTrack();
}

function goToAlbum() {
  // 初始 _personalFMTrack = {id:0} 无 album 字段，冷启动点击会 TypeError
  if (!track.value.album?.id) return;
  router.push({ path: '/album/' + track.value.album.id });
}

function getColor() {
  if (!player.value.personalFMTrack?.album?.picUrl) return;
  const cover = `${player.value.personalFMTrack.album.picUrl.replace(
    'http://',
    'https://'
  )}?param=512y512`;
  getCoverPalette(cover)
    .then(palette => {
      // 快速切 FM 时旧取色后到达，不能覆盖新歌的背景
      if (
        `${player.value.personalFMTrack?.album?.picUrl?.replace(
          'http://',
          'https://'
        )}?param=512y512` !== cover
      )
        return;
      // 某些封面提取不出 Vibrant 色板，裸读 _rgb 会 TypeError
      if (!palette.Vibrant) return;
      const color = Color.rgb(palette.Vibrant._rgb).darken(0.1).rgb().string();
      const color2 = Color.rgb(palette.Vibrant._rgb)
        .lighten(0.28)
        .rotate(-30)
        .rgb()
        .string();
      background.value = `linear-gradient(to top left, ${color}, ${color2})`;
    })
    .catch(() => {});
}

getColor();

watch(track, function () {
  getColor();
});
</script>

<style lang="scss" scoped>
.fm {
  padding: 1rem;
  background: var(--color-secondary-bg);
  border-radius: 1rem;
  display: flex;
  height: 198px;
  box-sizing: border-box;
}
.cover {
  height: 100%;
  clip-path: border-box;
  border-radius: 0.75rem;
  margin-right: 1.2rem;
  cursor: pointer;
  user-select: none;
}
.right-part {
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  color: var(--color-text);
  width: 100%;
  .title {
    font-size: 1.6rem;
    font-weight: 600;
    margin-bottom: 0.6rem;
    display: -webkit-box;
    -webkit-box-orient: vertical;
    -webkit-line-clamp: 2;
    overflow: hidden;
    word-break: break-all;
  }
  .artist {
    opacity: 0.68;
    display: -webkit-box;
    -webkit-box-orient: vertical;
    -webkit-line-clamp: 2;
    overflow: hidden;
    word-break: break-all;
  }
  .controls {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    margin-left: -0.4rem;
    .buttons {
      display: flex;
    }
    .button-icon {
      margin: 0 8px 0 0;
    }
    .svg-icon {
      width: 24px;
      height: 24px;
    }
    .svg-icon#thumbs-down {
      width: 22px;
      height: 22px;
    }
    .card-name {
      font-size: 1rem;
      opacity: 0.18;
      display: flex;
      align-items: center;
      font-weight: 600;
      user-select: none;
      .svg-icon {
        width: 18px;
        height: 18px;
        margin-right: 6px;
      }
    }
  }
}
@media (max-width: 576px) {
  .fm .card-name {
    display: none !important;
  }
}
</style>
