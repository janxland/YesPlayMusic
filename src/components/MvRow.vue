<template>
  <div class="mv-row" :class="{ 'without-padding': withoutPadding }">
    <div v-for="row in rows" :key="row.id" class="mv">
      <div
        class="cover"
        @mouseover="hoverVideoID = row.id"
        @mouseleave="hoverVideoID = 0"
        @click="goToMv(row.id)"
      >
        <LazyImage :src="row.url" referrerpolicy="no-referrer" />
        <transition name="fade">
          <div
            v-show="hoverVideoID === row.id"
            class="shadow"
            :style="{ background: 'url(' + row.url + ')' }"
          ></div>
        </transition>
      </div>
      <div class="info">
        <div class="title">
          <router-link :to="'/mv/' + row.id">{{ row.title }}</router-link>
        </div>
        <div class="artist" v-html="row.subtitle"></div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
const router = useRouter();
// 跳 MV 时带上当前播放态做 autoplay 参数；原 $parent.player 与 store.state.player 同源，直接读 store 免去父级暴露
import { ref, computed } from 'vue';
import { usePlayerStore } from '@/stores/player';

import { useRouter } from 'vue-router';

const props = defineProps({
  mvs: Array,
  subtitle: {
    type: String,
    default: 'artist',
  },
  withoutPadding: { type: Boolean, default: false },
});

const hoverVideoID = ref<any>(0);

function goToMv(id) {
  const query = { autoplay: usePlayerStore().player.playing };
  router.push({ path: '/mv/' + id, query });
}

function getUrl(mv) {
  let url = mv.imgurl16v9 ?? mv.cover ?? mv.coverUrl;
  return url.replace(/^http:/, 'https:') + '?param=464y260';
}

function getID(mv) {
  if (mv.id !== undefined) return mv.id;
  if (mv.vid !== undefined) return mv.vid;
}

function getTitle(mv) {
  if (mv.name !== undefined) return mv.name;
  if (mv.title !== undefined) return mv.title;
}

function getSubtitle(mv) {
  if (props.subtitle === 'artist') {
    let artistName = 'null';
    let artistID = 0;
    if (mv.artistName !== undefined) {
      artistName = mv.artistName;
      artistID = mv.artistId;
    } else if (mv.creator !== undefined) {
      artistName = mv.creator[0].userName;
      artistID = mv.creator[0].userId;
    }
    return `<a href="/artist/${artistID}">${artistName}</a>`;
  } else if (props.subtitle === 'publishTime') {
    return mv.publishTime;
  }
}

// 行内展示字段一次算齐：原 getID 在每行模板里最多被调 5 次、getUrl 2 次，mvs 不变的重渲染全部白算
const rows = computed(function rows() {
  return (props.mvs || []).map(mv => ({
    id: getID(mv),
    url: getUrl(mv),
    title: getTitle(mv),
    subtitle: getSubtitle(mv),
  }));
});
</script>

<style lang="scss" scoped>
.mv-row {
  --col-num: 5;
  display: grid;
  grid-template-columns: repeat(var(--col-num), 1fr);
  gap: 36px 24px;
  padding: var(--main-content-padding);
}

.mv-row.without-padding {
  padding: 0;
}

@media (max-width: 900px) {
  .mv-row {
    --col-num: 4;
  }
}

@media (max-width: 800px) {
  .mv-row {
    --col-num: 3;
  }
}

@media (max-width: 700px) {
  .mv-row {
    --col-num: 3;
  }
}

@media (max-width: 550px) {
  .mv-row {
    --col-num: 3;
  }
}

.mv {
  color: var(--color-text);

  .title {
    font-size: 16px;
    font-weight: 600;
    opacity: 0.88;
    display: -webkit-box;
    -webkit-box-orient: vertical;
    -webkit-line-clamp: 2;
    overflow: hidden;
    word-break: break-all;
  }
  .artist {
    font-size: 12px;
    opacity: 0.68;
    display: -webkit-box;
    -webkit-box-orient: vertical;
    -webkit-line-clamp: 2;
    overflow: hidden;
  }
}

.cover {
  position: relative;
  transition: transform 0.3s;
  &:hover {
    cursor: pointer;
  }
}
img {
  border-radius: 0.75em;
  width: 100%;
  user-select: none;
}

.shadow {
  position: absolute;
  top: 6px;
  height: 100%;
  width: 100%;
  filter: blur(16px) opacity(0.4);
  transform: scale(0.9, 0.9);
  z-index: -1;
  background-size: cover;
  border-radius: 0.75em;
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
