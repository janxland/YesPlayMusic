<template>
  <div v-show="show">
    <h1>
      <LazyImage
        class="avatar"
        :src="resizeImage(artist.img1v1Url, 1024)"
        referrerpolicy="no-referrer"
      />{{ artist.name }}'s Music Videos
    </h1>
    <MvRow :mvs="mvs" subtitle="publishTime" />
    <div class="load-more">
      <ButtonTwoTone v-show="hasMore" color="grey" @click="loadMVs">{{
        $t('explore.loadMore')
      }}</ButtonTwoTone>
    </div>
  </div>
</template>

<script setup lang="ts">
import { artistMv, getArtist } from '@/api/artist';
import { loadWithProgress, loadOptional } from '@/utils/pageLoad';
import ButtonTwoTone from '@/components/ButtonTwoTone.vue';
import MvRow from '@/components/MvRow.vue';
import { resizeImage } from '@/utils/formatters';
import { ref, onActivated, onMounted } from 'vue';
import { onBeforeRouteUpdate, useRoute } from 'vue-router';
import { usePlayerStore } from '@/stores';

const playerStore = usePlayerStore();

// MvRow 经 $parent.player.playing 取当前播放态（跳 MV 带 autoplay 参数）
defineExpose({ player: playerStore.player });

const route = useRoute();
const id = ref<any>(0);

const show = ref<any>(false);

const hasMore = ref<any>(true);

const artist = ref<any>({});

const mvs = ref<any>([]);

function loadData() {
  loadOptional(
    getArtist(id.value).then(data => {
      artist.value = data.artist;
    })
  );
  loadMVs();
}

function loadMVs() {
  // 「加载更多」的每次翻页都是主内容：失败必须提示并复位忙态，否则按钮原地消失/卡死，用户只能整页重进
  loadWithProgress(
    artistMv({ id: id.value, limit: 100, offset: mvs.value.length }).then(
      data => {
        mvs.value.push(...data.mvs);
        hasMore.value = data.hasMore;
        show.value = true;
      }
    )
  );
}

id.value = route.params.id;
loadData();

onActivated(function activated() {
  if (route.params.id !== id.value) {
    id.value = route.params.id;
    mvs.value = [];
    artist.value = {};
    show.value = false;
    hasMore.value = true;
    loadData();
  }
});

onMounted(function activatedOnMount() {
  if (route.params.id !== id.value) {
    id.value = route.params.id;
    mvs.value = [];
    artist.value = {};
    show.value = false;
    hasMore.value = true;
    loadData();
  }
});

onBeforeRouteUpdate((to, from, next) => {
  id.value = to.params.id;
  loadData();
  next();
});
</script>

<style lang="scss" scoped>
h1 {
  font-size: 42px;
  color: var(--color-text);
  .avatar {
    height: 44px;
    margin-right: 12px;
    vertical-align: -7px;
    border-radius: 50%;
    border: rgba(0, 0, 0, 0.2);
  }
}
.load-more {
  display: flex;
  justify-content: center;
}
</style>
