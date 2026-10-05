<template>
  <div class="mv-page">
    <div class="current-video">
      <div class="video">
        <video
          ref="videoPlayerRef"
          class="custom-video-player"
          controls
          preload="metadata"
          :poster="mv.data.cover"
        >
          <source
            v-for="source in videoSources"
            :key="source.size"
            :src="source.src"
            :type="source.type"
            :data-size="source.size"
          />
          您的浏览器不支持视频播放。
        </video>
      </div>
      <div class="video-info">
        <div class="title">
          <router-link :to="'/artist/' + mv.data.artistId">{{
            mv.data.artistName
          }}</router-link>
          -
          {{ mv.data.name }}
          <div class="buttons">
            <button-icon class="button" @click="likeMV">
              <svg-icon v-if="mv.subed" icon-class="heart-solid"></svg-icon>
              <svg-icon v-else icon-class="heart"></svg-icon>
            </button-icon>
            <button-icon class="button" @click="openMenu">
              <svg-icon icon-class="more"></svg-icon>
            </button-icon>
          </div>
        </div>
        <div class="info">
          {{ formatPlayCount(mv.data.playCount) }} Views ·
          {{ mv.data.publishTime }}
        </div>
      </div>
    </div>
    <div class="more-video">
      <div class="section-title">{{ $t('mv.moreVideo') }}</div>
      <MvRow :mvs="simiMvs" />
    </div>
    <ContextMenu ref="mvMenuRef">
      <div class="item" @click="copyUrl(mv.data.id)">{{
        $t('contextMenu.copyUrl')
      }}</div>
      <div class="item" @click="openInBrowser(mv.data.id)">{{
        $t('contextMenu.openInBrowser')
      }}</div>
    </ContextMenu>
  </div>
</template>

<script setup lang="ts">
import { mvDetail, mvUrl, simiMv, likeAMV } from '@/api/mv';
import { isAccountLoggedIn } from '@/utils/auth';
import { loadWithProgress, loadOptional } from '@/utils/pageLoad';
import { getI18n } from '@/locale';
import ButtonIcon from '@/components/ButtonIcon.vue';
import ContextMenu from '@/components/ContextMenu.vue';
import MvRow from '@/components/MvRow.vue';
import { formatPlayCount } from '@/utils/formatters';
import { ref, onMounted } from 'vue';
import { usePlayerStore, useUiStore } from '@/stores';
import { onBeforeRouteUpdate, useRoute } from 'vue-router';
import { useNeteaseLinkActions } from '@/composables/useNeteaseLinkActions';

const videoPlayerRef = ref<any>(null);
const mvMenuRef = ref<any>(null);
const route = useRoute();
const playerStore = usePlayerStore();
const uiStore = useUiStore();

// MvRow 经 $parent.player.playing 取当前播放态（跳 MV 带 autoplay 参数）
defineExpose({ player: playerStore.player });

const showToast = uiStore.showToast;

// 复制链接 / 浏览器打开（原与 album/artist 重复的实现收敛于此）
const { copyUrl, openInBrowser } = useNeteaseLinkActions('mv');

const mv = ref<any>({
  url: '',
  data: {
    name: '',
    artistName: '',
    playCount: '',
    publishTime: '',
    cover: '',
  },
});

const videoSources = ref<any>([]);

const simiMvs = ref<any>([]);

function getData(id) {
  loadWithProgress(
    mvDetail(id)
      .then(data => {
        mv.value = data;
        const requests = data.data.brs.map(br => {
          return mvUrl({ id, r: br.br });
        });
        return Promise.all(requests);
      })
      .then(results => {
        videoSources.value = results.map(result => {
          return {
            src: result.data.url.replace(/^http:/, 'https:'),
            type: 'video/mp4',
            size: result.data.r,
          };
        });
      })
  );
  loadOptional(
    simiMv(id).then(data => {
      simiMvs.value = data.mvs;
    })
  );
}

function likeMV() {
  if (!isAccountLoggedIn()) {
    showToast((getI18n() as any).global.t('toast.needToLogin'));
    return;
  }
  likeAMV({
    mvid: mv.value.data.id,
    t: mv.value.subed ? 0 : 1,
  }).then(data => {
    if (data.code === 200) mv.value.subed = !mv.value.subed;
  });
}

function openMenu(e) {
  mvMenuRef.value.openMenu(e);
}

onMounted(function mounted() {
  if (videoPlayerRef.value) {
    videoPlayerRef.value.volume = playerStore.player.volume;
    videoPlayerRef.value.addEventListener('play', () => {
      playerStore.player.pause();
    });
    if (route.query.autoplay === 'true') {
      videoPlayerRef.value.autoplay = true;
    }
  }

  getData(route.params.id);
});

onBeforeRouteUpdate((to, from, next) => {
  getData(to.params.id);
  next();
});
</script>
<style lang="scss" scoped>
.video {
  --video-control-color: #335eea;
  --video-control-radius: 8px;
}

.mv-page {
  width: 100%;
  margin-top: 32px;
}
.current-video {
  width: 100%;
}
.video {
  border-radius: 16px;
  background: transparent;
  overflow: hidden;
  max-height: 100vh;
}

.custom-video-player {
  width: 100%;
  height: auto;
  border-radius: 16px;
  background: #000;

  &::-webkit-media-controls-panel {
    background: linear-gradient(transparent, rgba(0, 0, 0, 0.7));
  }

  &::-webkit-media-controls-play-button,
  &::-webkit-media-controls-volume-slider,
  &::-webkit-media-controls-timeline {
    color: var(--video-control-color);
  }
}

.video-info {
  margin-top: 12px;
  color: var(--color-text);
  .title {
    font-size: 24px;
    font-weight: 600;
  }
  .artist {
    font-size: 14px;
    opacity: 0.88;
    margin-top: 2px;
    font-weight: 600;
  }
  .info {
    font-size: 12px;
    opacity: 0.68;
    margin-top: 12px;
  }
}

.more-video {
  margin-top: 48px;
  .section-title {
    font-size: 18px;
    font-weight: 600;
    color: var(--color-text);
    opacity: 0.88;
    margin-bottom: 12px;
  }
}

.buttons {
  display: inline-block;
  .button {
    display: inline-block;
  }
  .svg-icon {
    height: 18px;
    width: 18px;
    color: var(--color-primary);
  }
}
</style>
