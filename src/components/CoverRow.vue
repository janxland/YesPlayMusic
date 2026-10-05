<template>
  <div class="cover-row no-scrollbar" :style="rowStyles">
    <div
      v-for="row in rows"
      :key="row.id"
      class="item"
      :class="{ artist: type === 'artist' }"
    >
      <Cover
        :id="row.coverId"
        :image-url="row.imageUrl"
        :type="type"
        :click-cover-to-play="clickCoverToPlay"
        :click-cover-to-play-fun="clickCoverToPlayFun"
        :play-button-size="type === 'artist' ? 26 : playButtonSize"
      />
      <div class="text">
        <div v-if="showPlayCount" class="info">
          <span class="play-count"
            ><svg-icon icon-class="play" />{{ row.playCount }}
          </span>
        </div>
        <div class="title" :style="{ fontSize: subTextFontSize }">
          <span v-if="row.explicit" class="explicit-symbol"
            ><ExplicitSymbol
          /></span>
          <span v-if="row.privacy" class="lock-icon">
            <svg-icon icon-class="lock"
          /></span>
          <router-link :to="row.titleLink">{{ row.name }}</router-link>
        </div>
        <div v-if="type !== 'artist' && subText !== 'none'" class="info">
          <span v-html="row.subText"></span>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
const route = useRoute();

import Cover from '@/components/Cover.vue';
import ExplicitSymbol from '@/components/ExplicitSymbol.vue';
import { formatPlayCount } from '@/utils/formatters';
import { computed } from 'vue';
import type { PropType } from 'vue';
import type { Album, Artist, MV, Playlist } from '@/types/entities';

import { useRoute } from 'vue-router';
const props = defineProps({
  // 歌单/专辑/歌手/MV 混用，实体字段均有索引签名兜底
  items: {
    type: Array as PropType<(Playlist | Album | Artist | MV)[]>,
    required: true,
  },
  type: { type: String, required: true },
  subText: { type: String, default: 'none' },
  subTextFontSize: { type: String, default: '16px' },
  showPlayCount: { type: Boolean, default: false },
  columnNumber: { type: Number, default: 5 },
  gap: { type: String, default: '44px 16px' },
  playButtonSize: { type: Number, default: 22 },
  clickCoverToPlay: { type: Boolean, default: false },
  clickCoverToPlayFun: { type: Function, default: undefined },
});

const rowStyles = computed(function rowStyles() {
  return {
    'grid-template-columns': `repeat(${props.columnNumber}, 1fr)`,
    gap: props.gap,
  };
});

// 行内展示字段在 computed 里一次算齐：原方法每次重渲染对每行重复执行，items 不变时纯属浪费
const rows = computed(function rows() {
  return props.items.map(item => ({
    id: item.id,
    name: item.name,
    coverId: parseInt(String(item.id)),
    imageUrl: getImageUrl(item),
    playCount: formatPlayCount(item.playCount),
    explicit: isExplicit(item),
    privacy: isPrivacy(item),
    titleLink: getTitleLink(item),
    subText: getSubText(item),
  }));
});

function getSubText(item) {
  if (props.subText === 'copywriter') return item.copywriter;
  if (props.subText === 'description') return item.description;
  if (props.subText === 'updateFrequency') return item.updateFrequency;
  if (props.subText === 'creator') return 'by ' + item.creator.nickname;
  if (props.subText === 'releaseYear')
    return new Date(item.publishTime).getFullYear();
  if (props.subText === 'artist') {
    if (item.artist !== undefined)
      return `<a href="/artist/${item.artist.id}">${item.artist.name}</a>`;
    if (item.artists !== undefined)
      return `<a href="/artist/${item.artists[0].id}">${item.artists[0].name}</a>`;
  }
  if (props.subText === 'albumType+releaseYear') {
    let albumType = item.type;
    if (item.type === 'EP/Single') {
      albumType = item.size === 1 ? 'Single' : 'EP';
    } else if (item.type === 'Single') {
      albumType = 'Single';
    } else if (item.type === '专辑') {
      albumType = 'Album';
    }
    return `${albumType} · ${new Date(item.publishTime).getFullYear()}`;
  }
  if (props.subText === 'appleMusic') return 'by Apple Music';
}

function isPrivacy(item) {
  return props.type === 'playlist' && item.privacy === 10;
}

function isExplicit(item) {
  return props.type === 'album' && (item.mark & 1048576) === 1048576;
}

function getTitleLink(item) {
  let server = route.query.server;
  return `/${props.type}/${item.id}?${server ? 'server=' + server : ''}`;
}

function getImageUrl(item) {
  if (item.img1v1Url) {
    let img1v1ID = item.img1v1Url.split('/');
    img1v1ID = img1v1ID[img1v1ID.length - 1];
    if (img1v1ID === '5639395138885805.jpg') {
      // 没有头像的歌手，网易云返回的img1v1Url并不是正方形的 😅😅😅
      return 'https://p2.music.126.net/VnZiScyynLG7atLIZ2YPkw==/18686200114669622.jpg?param=512y512';
    }
  }
  let img = item.img1v1Url || item.picUrl || item.coverImgUrl;
  return `${img?.replace('http://', 'https://')}?param=512y512`;
}
</script>

<style lang="scss" scoped>
.cover-row {
  display: grid;
}

.item {
  color: var(--color-text);
  min-width: 100px;
  .text {
    margin-top: 8px;
    .title {
      font-size: 16px;
      font-weight: 600;
      line-height: 20px;
      display: -webkit-box;
      -webkit-box-orient: vertical;
      -webkit-line-clamp: 2;
      overflow: hidden;
      word-break: break-all;
    }
    .info {
      font-size: 12px;
      opacity: 0.68;
      line-height: 18px;
      display: -webkit-box;
      -webkit-box-orient: vertical;
      -webkit-line-clamp: 2;
      overflow: hidden;
      word-break: break-word;
    }
  }
}

.item.artist {
  display: flex;
  flex-direction: column;
  text-align: center;
  .cover {
    display: flex;
  }
  .title {
    margin-top: 4px;
  }
}

@media (max-width: 576px) {
  .cover-row {
    display: grid;
    overflow-x: auto;
  }
  .item .text .title {
    font-size: 14px;
  }
}

.explicit-symbol {
  opacity: 0.28;
  color: var(--color-text);
  float: right;
  .svg-icon {
    margin-bottom: -3px;
  }
}

.lock-icon {
  opacity: 0.28;
  color: var(--color-text);
  margin-right: 4px;
  .svg-icon {
    height: 12px;
    width: 12px;
  }
}

.play-count {
  font-weight: 600;
  opacity: 0.58;
  color: var(--color-text);
  font-size: 12px;
  .svg-icon {
    margin-right: 3px;
    height: 8px;
    width: 8px;
  }
}
</style>
