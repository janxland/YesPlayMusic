<template>
  <div class="mv-page">
    <div class="current-video">
      <div class="video">
        <video
          ref="videoPlayer"
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
            <button-icon class="button" @click.native="likeMV">
              <svg-icon v-if="mv.subed" icon-class="heart-solid"></svg-icon>
              <svg-icon v-else icon-class="heart"></svg-icon>
            </button-icon>
            <button-icon class="button" @click.native="openMenu">
              <svg-icon icon-class="more"></svg-icon>
            </button-icon>
          </div>
        </div>
        <div class="info">
          {{ mv.data.playCount | formatPlayCount }} Views ·
          {{ mv.data.publishTime }}
        </div>
      </div>
    </div>
    <div class="more-video">
      <div class="section-title">{{ $t('mv.moreVideo') }}</div>
      <MvRow :mvs="simiMvs" />
    </div>
    <ContextMenu ref="mvMenu">
      <div class="item" @click="copyUrl(mv.data.id)">{{
        $t('contextMenu.copyUrl')
      }}</div>
      <div class="item" @click="openInBrowser(mv.data.id)">{{
        $t('contextMenu.openInBrowser')
      }}</div>
    </ContextMenu>
  </div>
</template>

<script>
import { mvDetail, mvUrl, simiMv, likeAMV } from '@/api/mv';
import { isAccountLoggedIn } from '@/utils/auth';
import { loadWithProgress, loadOptional } from '@/utils/pageLoad';
import locale from '@/locale';

import ButtonIcon from '@/components/ButtonIcon.vue';
import ContextMenu from '@/components/ContextMenu.vue';
import MvRow from '@/components/MvRow.vue';
import { mapActions } from 'vuex';

export default {
  name: 'Mv',
  components: {
    MvRow,
    ButtonIcon,
    ContextMenu,
  },
  beforeRouteUpdate(to, from, next) {
    this.getData(to.params.id);
    next();
  },
  data() {
    return {
      mv: {
        url: '',
        data: {
          name: '',
          artistName: '',
          playCount: '',
          publishTime: '',
          cover: '',
        },
      },
      videoSources: [],
      simiMvs: [],
    };
  },
  mounted() {
    // 设置音量
    if (this.$refs.videoPlayer) {
      this.$refs.videoPlayer.volume = this.$store.state.player.volume;

      // 监听播放事件
      this.$refs.videoPlayer.addEventListener('play', () => {
        this.$store.state.player.pause();
      });

      // 自动播放
      if (this.$route.query.autoplay === 'true') {
        this.$refs.videoPlayer.autoplay = true;
      }
    }

    this.getData(this.$route.params.id);
    console.log('网易云你这mv音频码率也太糊了吧🙄');
  },
  methods: {
    ...mapActions(['showToast']),
    getData(id) {
      loadWithProgress(
        mvDetail(id)
          .then(data => {
            this.mv = data;
            const requests = data.data.brs.map(br => {
              return mvUrl({ id, r: br.br });
            });
            return Promise.all(requests);
          })
          .then(results => {
            this.videoSources = results.map(result => {
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
          this.simiMvs = data.mvs;
        })
      );
    },
    likeMV() {
      if (!isAccountLoggedIn()) {
        this.showToast(locale.t('toast.needToLogin'));
        return;
      }
      likeAMV({
        mvid: this.mv.data.id,
        t: this.mv.subed ? 0 : 1,
      }).then(data => {
        if (data.code === 200) this.mv.subed = !this.mv.subed;
      });
    },
    openMenu(e) {
      this.$refs.mvMenu.openMenu(e);
    },
    copyUrl(id) {
      let showToast = this.showToast;
      this.$copyText(`https://music.163.com/#/mv?id=${id}`)
        .then(function () {
          showToast(locale.t('toast.copied'));
        })
        .catch(error => {
          showToast(`${locale.t('toast.copyFailed')}${error}`);
        });
    },
    openInBrowser(id) {
      const url = `https://music.163.com/#/mv?id=${id}`;
      window.open(url);
    },
  },
};
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
