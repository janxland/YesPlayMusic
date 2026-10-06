<template>
  <div v-show="show">
    <div class="special-playlist">
      <div class="title gradient"> 每日歌曲推荐 </div>
      <div class="subtitle">根据你的音乐口味生成 · 每天6:00更新</div>
    </div>

    <TrackList
      :tracks="dailyTracks"
      type="playlist"
      dbclick-track-func="dailyTracks"
    />
  </div>
</template>

<script setup lang="ts">
import { loadWithProgress } from '@/utils/pageLoad';
import { dailyRecommendTracks } from '@/api/playlist';
import TrackList from '@/components/TrackList.vue';
import { ref } from 'vue';
import { useUiStore } from '@/stores';
import { storeToRefs } from 'pinia';
import { useAppScroll } from '@/composables/useAppScroll';

const uiStore = useUiStore();

const { dailyTracks } = storeToRefs(uiStore);

const updateDailyTracks = uiStore.updateDailyTracks;

const show = ref<any>(false);

function loadDailyTracks() {
  loadWithProgress(
    dailyRecommendTracks().then(result => {
      // 异常体缺 dailySongs 时赋 undefined 会让 TrackList 渲染期崩掉
      updateDailyTracks(result.data?.dailySongs ?? []);
      show.value = true;
    })
  );
}

if (dailyTracks.value.length === 0) {
  loadDailyTracks();
} else {
  show.value = true;
}
useAppScroll().scrollTo(0, 0);
</script>

<style lang="scss" scoped>
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

    letter-spacing: 4px;
    animation-duration: 0.8s;
    animation-name: letterSpacing4;
    -webkit-text-fill-color: transparent;
    background-clip: text;

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

.gradient {
  background: linear-gradient(to left, #dd2476, #ff512f);
}
</style>
