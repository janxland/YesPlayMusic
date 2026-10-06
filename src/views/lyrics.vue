<template>
  <transition name="slide-up">
    <div
      class="lyrics-page"
      :class="{ 'no-lyric': noLyric }"
      :data-theme="theme"
    >
      <div
        v-if="
          settings.lyricsBackground === 'blur' ||
          settings.lyricsBackground === 'dynamic'
        "
        class="lyrics-background"
        :class="{
          'dynamic-background': settings.lyricsBackground === 'dynamic',
        }"
      >
        <div
          class="top-right"
          :style="{ backgroundImage: `url(${bgImageUrl})` }"
        />
        <div
          class="bottom-left"
          :style="{ backgroundImage: `url(${bgImageUrl})` }"
        />
      </div>
      <Visualization ref="visualization" :option="{}"></Visualization>
      <div
        v-if="settings.lyricsBackground === true"
        class="gradient-background"
        :style="{ background }"
      ></div>

      <div class="left-side">
        <div>
          <div
            v-if="settings.showLyricsTime"
            ref="dateElRef"
            class="date"
          ></div>
          <div class="cover">
            <div class="cover-container">
              <LazyImage :src="imageUrl" />
              <div
                class="shadow"
                :style="{ backgroundImage: `url(${imageUrl})` }"
              ></div>
            </div>
          </div>
          <div class="controls">
            <div class="top-part">
              <div class="track-info">
                <div class="title" :title="currentTrack.name">
                  <router-link
                    v-if="hasList()"
                    :to="`${getListPath()}`"
                    @click="toggleLyrics"
                    >{{ currentTrack.name }}
                  </router-link>
                  <span v-else>
                    {{ currentTrack.name }}
                  </span>
                </div>
                <div class="subtitle">
                  <router-link
                    v-if="artist.id !== 0"
                    :to="`/artist/${artist.id}`"
                    @click="toggleLyrics"
                    >{{ artist.name }}
                  </router-link>
                  <span v-else>
                    {{ artist.name }}
                  </span>
                  <span v-if="album.id !== 0">
                    -
                    <router-link
                      :to="`/album/${album.id}`"
                      :title="album.name"
                      @click="toggleLyrics"
                      >{{ album.name }}
                    </router-link>
                  </span>
                </div>
              </div>
              <div class="top-right">
                <div class="volume-control">
                  <button-icon :title="$t('player.mute')" @click="mute">
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
                <div class="buttons">
                  <button-icon
                    :title="$t('player.like')"
                    @click="likeATrack(player.currentTrack.id)"
                  >
                    <svg-icon
                      :icon-class="
                        player.isCurrentTrackLiked ? 'heart-solid' : 'heart'
                      "
                    />
                  </button-icon>
                  <button-icon
                    :title="$t('contextMenu.addToPlaylist')"
                    @click="addToPlaylist"
                  >
                    <svg-icon icon-class="plus" />
                  </button-icon>
                </div>
              </div>
            </div>
            <div class="progress-bar">
              <span>{{ formatTrackTime(player.progress) || '0:00' }}</span>
              <div class="slider">
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
              <span>{{ formatTrackTime(player.currentTrackDuration) }}</span>
            </div>
            <div class="media-controls">
              <button-icon
                v-show="!player.isPersonalFM"
                :title="
                  player.repeatMode === 'one'
                    ? $t('player.repeatTrack')
                    : $t('player.repeat')
                "
                :class="{ active: player.repeatMode !== 'off' }"
                @click="switchRepeatMode"
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
              <div class="middle">
                <button-icon
                  v-show="!player.isPersonalFM"
                  :title="$t('player.previous')"
                  @click="playPrevTrack"
                >
                  <svg-icon icon-class="previous" />
                </button-icon>
                <button-icon
                  v-show="player.isPersonalFM"
                  title="不喜欢"
                  @click="moveToFMTrash"
                >
                  <svg-icon icon-class="thumbs-down" />
                </button-icon>
                <button-icon
                  id="play"
                  :title="$t(player.playing ? 'player.pause' : 'player.play')"
                  @click="playOrPause"
                >
                  <svg-icon :icon-class="player.playing ? 'pause' : 'play'" />
                </button-icon>
                <button-icon :title="$t('player.next')" @click="playNextTrack">
                  <svg-icon icon-class="next" />
                </button-icon>
              </div>
              <button-icon
                v-show="!player.isPersonalFM"
                :title="$t('player.shuffle')"
                :class="{ active: player.shuffle }"
                @click="switchShuffle"
              >
                <svg-icon icon-class="shuffle" />
              </button-icon>
              <button-icon
                v-show="
                  isShowLyricTypeSwitch &&
                  settingsStore.settings.showLyricsTranslation &&
                  lyricType === 'translation'
                "
                :title="$t('player.translationLyric')"
                @click="switchLyricType"
              >
                <span class="lyric-switch-icon">译</span>
              </button-icon>
              <button-icon
                v-show="
                  isShowLyricTypeSwitch &&
                  settingsStore.settings.showLyricsTranslation &&
                  lyricType === 'romaPronunciation'
                "
                :title="$t('player.PronunciationLyric')"
                @click="switchLyricType"
              >
                <span class="lyric-switch-icon">音</span>
              </button-icon>
            </div>
          </div>
        </div>
      </div>
      <div
        class="right-side"
        :style="{
          transform: `perspective(${uiStore.visualSet.perspective}px) rotateY(${uiStore.visualSet.rotateY}deg)`,
        }"
      >
        <transition name="slide-fade">
          <div
            v-show="!noLyric"
            ref="lyricsContainerRef"
            class="lyrics-container"
            :style="lyricFontSize"
            @wheel="userBrowsing"
            @pointerdown="userBrowsing"
          >
            <div id="line-1" class="line"></div>
            <div
              v-for="(line, index) in lyricToShow"
              :key="`${line.time}-${index}`"
              class="line"
              :class="{
                highlight: highlightLyricIndex === index,
              }"
              @click="clickLyricLine(index)"
              @dblclick="clickLyricLine(index, true)"
            >
              <div class="content">
                <span
                  v-if="line.contents[0]"
                  @click.right="openLyricMenu($event, line, 0)"
                  >{{ line.contents[0] }}</span
                >
                <br />
                <span
                  v-if="
                    line.contents[1] &&
                    settingsStore.settings.showLyricsTranslation
                  "
                  class="translation"
                  @click.right="openLyricMenu($event, line, 1)"
                  >{{ line.contents[1] }}</span
                >
              </div>
            </div>
            <ContextMenu v-if="!noLyric" ref="lyricMenuRef">
              <div class="item" @click="copyLyric(false)">{{
                $t('contextMenu.copyLyric')
              }}</div>
              <div
                v-if="
                  rightClickLyric &&
                  rightClickLyric.contents[1] &&
                  settingsStore.settings.showLyricsTranslation
                "
                class="item"
                @click="copyLyric(true)"
                >{{ $t('contextMenu.copyLyricWithTranslation') }}</div
              >
            </ContextMenu>
          </div>
        </transition>
      </div>
      <div class="close-button" @click="toggleLyrics">
        <button>
          <svg-icon icon-class="arrow-down" />
        </button>
      </div>
      <div class="close-button" style="left: 24px" @click="fullscreen">
        <button>
          <svg-icon v-if="isFullscreen" icon-class="fullscreen-exit" />
          <svg-icon v-else icon-class="fullscreen" />
        </button>
      </div>
    </div>
  </transition>
</template>

<script setup lang="ts">
// 时钟句柄（刻意非响应式）
let _clockTimer = null;
let _lineRows = null;
let _lyricRaf = null;
let _lyricsViewportHeight = null;
let _onFullscreenChange = null;
let _onKeydown = null;
let _resizeObserver = null;
let _scrolledTo = null;
let _userScrollUntil = null;
// 歌词请求代次：每次发起请求推进，落地时比对，丢弃已过期响应（见 getLyric）
let _lyricFetchEpoch = 0;

import { player as playerInstance } from '@/player/singleton';
import VueSlider from 'vue-slider-component';
import ContextMenu from '@/components/ContextMenu.vue';
import { formatTrackTime } from '@/utils/common';
import { getLyric as getLyricApi, getCloudLyric } from '@/api/track';
import {
  lyricParser,
  copyLyric as copyLyricToClipboard,
  parseLyric,
  findActiveLyricIndex,
} from '@/utils/lyrics';
import ButtonIcon from '@/components/ButtonIcon.vue';
import Visualization from '@/components/Visualization.vue';
import { getCoverPalette } from '@/utils/coverPalette';
import Color from 'color';
import { isAccountLoggedIn } from '@/utils/auth';
import { hasListSource, getListSourcePath } from '@/utils/playList';
import { getI18n } from '@/locale';
import { ref, computed, watch, onMounted, onBeforeUnmount } from 'vue';
import {
  useDataStore,
  useLikedStore,
  usePlayerStore,
  useSettingsStore,
  useUiStore,
} from '@/stores';
import { storeToRefs } from 'pinia';

function formatClock(value) {
  const pad = n => String(n).padStart(2, '0');
  return `${pad(value.getHours())}:${pad(value.getMinutes())}:${pad(
    value.getSeconds()
  )}`;
}

const lyricsContainerRef = ref<any>(null);
const lyricMenuRef = ref<any>(null);
const dateElRef = ref<any>(null);
const playerStore = usePlayerStore();
const settingsStore = useSettingsStore();
const uiStore = useUiStore();
const likedStore = useLikedStore();
const dataStore = useDataStore();

const { player } = storeToRefs(playerStore);
const { settings } = storeToRefs(settingsStore);
const { showLyrics } = storeToRefs(uiStore);

const toggleLyrics = uiStore.toggleLyrics;

const updateModal = uiStore.updateModal;

const likeATrack = likedStore.likeATrack;

const showToast = uiStore.showToast;

const lyric = ref<any>([]);

const tlyric = ref<any>([]);

const romalyric = ref<any>([]);

const lyricType = ref<any>('translation');

const highlightLyricIndex = ref(-1);

const background = ref<any>('');

const isFullscreen = ref(!!document.fullscreenElement);

const rightClickLyric = ref<any>(null);

const currentTrack = computed(function currentTrack() {
  return player.value.currentTrack;
});

const volume = computed({
  get() {
    return player.value.volume;
  },
  set(value) {
    // 直写真身（镜像写入单向同步）
    playerInstance.volume = value;
  },
});

const imageUrl = computed(function imageUrl() {
  return player.value.currentTrack?.al?.picUrl + '?param=1024y1024';
});

const bgImageUrl = computed(function bgImageUrl() {
  return player.value.currentTrack?.al?.picUrl + '?param=512y512';
});

const isShowLyricTypeSwitch = computed(function isShowLyricTypeSwitch() {
  return romalyric.value.length > 0 && tlyric.value.length > 0;
});

const lyricToShow = computed(function lyricToShow() {
  return lyricType.value === 'translation'
    ? lyricWithTranslation.value
    : lyricWithRomaPronunciation.value;
});

const lyricTimes = computed(function lyricTimes() {
  return lyricToShow.value.map(({ time }) => time);
});

const lyricWithTranslation = computed(function lyricWithTranslation() {
  return mergeSecondaryLyric(tlyric.value);
});

const lyricWithRomaPronunciation = computed(
  function lyricWithRomaPronunciation() {
    return mergeSecondaryLyric(romalyric.value);
  }
);

const lyricFontSize = computed(function lyricFontSize() {
  const scale = uiStore.visualSet.lyricsScale || 1;
  return {
    // 可视化面板「歌词大小」：缩放 font-size 而非 transform: scale —— transform 只放大已栅格化的文字图层会发虚，
    // 字号缩放让字形按目标尺寸重渲染，任意倍率都清晰；变化限制在滚动容器内部，高亮行由 centerHighlightLine 钉在中心
    fontSize: `${(settingsStore.settings.lyricFontSize || 28) * scale}px`,
  };
});

const noLyric = computed(function noLyric() {
  return lyric.value.length == 0;
});

const lyricPageOpen = computed(function lyricPageOpen() {
  return showLyrics.value && !noLyric.value;
});

const isPureMusicLyric = computed(function isPureMusicLyric() {
  return lyric.value.some(({ content }) => content === '纯音乐，请欣赏');
});

const artist = computed(function artist() {
  return currentTrack.value?.ar
    ? currentTrack.value.ar[0]
    : { id: 0, name: 'unknown' };
});

const album = computed(function album() {
  return currentTrack.value?.al || { id: 0, name: 'unknown' };
});

const theme = computed(function theme() {
  return settings.value.lyricsBackground === true ? 'dark' : 'auto';
});

function initDate() {
  // 时钟不走响应式：赋 date 会让整页（数百行歌词）每秒重渲染一次，直接写 DOM 文本节点只更新那几个字符
  const tick = () => {
    if (dateElRef.value) {
      dateElRef.value.textContent = formatClock(new Date());
    }
  };
  tick();
  clearInterval(_clockTimer);
  _clockTimer = setInterval(tick, 1000);
}

function fullscreen() {
  if (document.fullscreenElement) {
    document.exitFullscreen();
  } else {
    document.documentElement.requestFullscreen();
  }
}

function addToPlaylist() {
  if (!isAccountLoggedIn()) {
    showToast((getI18n() as any).global.t('toast.needToLogin'));
    return;
  }
  likedStore.fetchLikedPlaylist();
  updateModal({
    modalName: 'addTrackToPlaylistModal',
    key: 'show',
    value: true,
  });
  updateModal({
    modalName: 'addTrackToPlaylistModal',
    key: 'selectedTrackID',
    value: currentTrack.value?.id,
  });
}

function playPrevTrack() {
  player.value.playPrevTrack();
}

function playOrPause() {
  player.value.playOrPause();
}

function playNextTrack() {
  if (player.value.isPersonalFM) {
    player.value.playNextFMTrack();
  } else {
    player.value.playNextTrack();
  }
}

function getLyric() {
  if (!currentTrack.value.id) return;
  // 竞态守卫：快速切歌时旧歌的歌词响应可能晚到并覆盖新歌歌词，onWatcherCleanup 的清理时机覆盖不到 created 路径，
  // 故用代次计数：发起时推进，落地时比对，已过期（期间又发起过请求）则整体丢弃
  const epoch = ++_lyricFetchEpoch;
  // 请求发出前先清空：旧实现直到响应回来都挂着上一首歌词，切歌瞬间新歌进度会在旧词时间轴上滚动（穿帮），失败后旧词也永久残留
  lyric.value = [];
  tlyric.value = [];
  romalyric.value = [];
  const onFail = () => {
    // 已过期请求的失败不弹 toast：用户早已切走，弹了只会张冠李戴
    if (epoch !== _lyricFetchEpoch) return;
    uiStore.showToast('歌词加载失败');
  };
  if (
    currentTrack.value.pc !== null &&
    currentTrack.value.cd === null &&
    dataStore.data.user?.userId
  ) {
    //云盘未设置关联的歌曲获取其内置歌词
    return getCloudLyric(currentTrack.value.id, dataStore.data.user?.userId)
      .then(data => {
        if (epoch !== _lyricFetchEpoch) return true;
        lyric.value = data?.lrc?.length > 0 ? parseLyric(data.lrc) : [];
        lyricType.value = 'translation';
        return true;
      })
      .catch(onFail);
  }
  return getLyricApi(currentTrack.value.id, undefined)
    .then(data => {
      if (epoch !== _lyricFetchEpoch) return false;
      if (!data?.lrc?.lyric) {
        lyric.value = [];
        tlyric.value = [];
        romalyric.value = [];
        return false;
      }
      // 解构结果改名，避免遮蔽同名 ref（Options API 时代靠 this. 区分）
      let {
        lyric: parsedLyric,
        tlyric: parsedTlyric,
        romalyric: parsedRomaLyric,
      } = lyricParser(data);
      parsedLyric = parsedLyric.filter(
        l => !/^作(词|曲)\s*(:|：)\s*无$/.exec(l.content)
      );
      const includeAM =
        parsedLyric.length <= 10 &&
        parsedLyric.map(l => l.content).includes('纯音乐，请欣赏');
      if (includeAM) {
        const reg = /^作(词|曲)\s*(:|：)\s*/;
        const author = currentTrack.value?.ar[0]?.name;
        parsedLyric = parsedLyric.filter(l => {
          const regExpArr = l.content.match(reg);
          return !regExpArr || l.content.replace(regExpArr[0], '') !== author;
        });
      }
      // 只剩「纯音乐，请欣赏」一行 → 按无歌词处理
      if (parsedLyric.length === 1 && includeAM) {
        lyric.value = [];
        tlyric.value = [];
        romalyric.value = [];
        return false;
      }
      lyric.value = parsedLyric;
      tlyric.value = parsedTlyric;
      romalyric.value = parsedRomaLyric;
      lyricType.value =
        parsedTlyric.length && parsedRomaLyric.length
          ? 'translation'
          : parsedLyric.length
          ? 'translation'
          : 'romaPronunciation';
      return true;
    })
    .catch(onFail);
}

function switchLyricType() {
  lyricType.value =
    lyricType.value === 'translation' ? 'romaPronunciation' : 'translation';
}

function clickLyricLine(index, startPlay = false) {
  // 歌词文字本身是 user-select: none，页面残留的旧选区不该把跳转一起挡掉 —— 清掉选区，「点哪句跳到哪句」无条件成立
  window.getSelection()?.removeAllRanges();
  const line = lyricToShow.value[index];
  if (!line || isPureMusicLyric.value) return;
  // 点行是「我要看这句」：撤销此前 pointerdown 申请的让位窗口
  _userScrollUntil = 0;
  player.value.seek(line.time);
  // 乐观落点：点击的那一行立刻高亮并居中，不等下一帧回读播放进度
  highlightLyricIndex.value = index;
  _scrolledTo = centerHighlightLine() ? index : null;
  if (startPlay === true) {
    player.value.play();
  }
}

function openLyricMenu(e, lyric, idx) {
  rightClickLyric.value = { ...lyric, idx };
  lyricMenuRef.value.openMenu(e);
  e.preventDefault();
}

function copyLyric(withTranslation) {
  if (rightClickLyric.value) {
    const idx = rightClickLyric.value.idx;
    if (!withTranslation) {
      copyLyricToClipboard(rightClickLyric.value.contents[idx]);
    } else {
      copyLyricToClipboard(rightClickLyric.value.contents.join(' '));
    }
  }
}

function mergeSecondaryLyric(subLyrics) {
  const contentByRawTime = new Map();
  for (const { rawTime, content } of subLyrics) {
    if (!contentByRawTime.has(rawTime)) {
      contentByRawTime.set(rawTime, content);
    }
  }
  const merged = [];
  for (const line of lyric.value) {
    if (!line.content) continue;
    const contents = [line.content];
    const subContent = contentByRawTime.get(line.rawTime);
    if (subContent) contents.push(subContent);
    merged.push({ time: line.time, content: line.content, contents });
  }
  return merged;
}

function invalidateLyricGeometry() {
  _lineRows = null;
  _scrolledTo = null;
}

function userBrowsing() {
  _userScrollUntil = Date.now() + 5000;
}

function startLyricSync() {
  if (_lyricRaf) return;
  // 关闭期间 v-show 会把容器 scrollTop 归零，重开必须重新定位居中一次
  invalidateLyricGeometry();
  const tick = () => {
    _lyricRaf = requestAnimationFrame(tick);
    syncHighlightIndex();
  };
  _lyricRaf = requestAnimationFrame(tick);
}

function stopLyricSync() {
  if (!_lyricRaf) return;
  cancelAnimationFrame(_lyricRaf);
  _lyricRaf = 0;
}

function syncHighlightIndex() {
  const progress = player.value.seek(null, false) ?? 0;
  const index = findActiveLyricIndex(lyricTimes.value, progress);
  // 未换行且已滚到位 → 立即返回：稳定播放期每帧零 DOM 访问、零回流
  if (index === highlightLyricIndex.value && index === _scrolledTo) {
    return;
  }
  highlightLyricIndex.value = index;
  if (Date.now() < (_userScrollUntil ?? 0)) {
    // 让位期内只切高亮；置空 _scrolledTo 使窗口结束后下一帧补回居中
    _scrolledTo = null;
    return;
  }
  if (centerHighlightLine()) _scrolledTo = index;
}

function measureLines() {
  const container = lyricsContainerRef.value;
  if (!container) return false;
  const viewportHeight = container.clientHeight;
  if (viewportHeight === 0) return false;
  const rows = [];
  for (const el of container.querySelectorAll('.line')) {
    rows.push({ top: el.offsetTop, height: el.offsetHeight });
  }
  _lineRows = rows;
  _lyricsViewportHeight = viewportHeight;
  return true;
}

function centerHighlightLine() {
  // 手动 scrollTo 而非 scrollIntoView：只滚歌词容器本身，避免连带祖先/页面一起滚导致定位漂移
  if (!_lineRows && !measureLines()) return false;
  // rows[0] 是模板里的占位行 #line-1，歌词行整体后移一位
  const row = _lineRows[highlightLyricIndex.value + 1];
  if (!row) return false;
  lyricsContainerRef.value.scrollTo({
    top: row.top - (_lyricsViewportHeight - row.height) / 2,
    behavior: 'smooth',
  });
  return true;
}

function moveToFMTrash() {
  player.value.moveToFMTrash();
}

function switchRepeatMode() {
  player.value.switchRepeatMode();
}

function switchShuffle() {
  player.value.switchShuffle();
}

function getCoverColor() {
  if (settings.value.lyricsBackground !== true) return;
  const picUrl = currentTrack.value.al?.picUrl;
  if (!picUrl) return;
  const cover = `${picUrl.replace('http://', 'https://')}?param=256y256`;
  getCoverPalette(cover)
    .then(palette => {
      // 快速切歌时旧取色后到达，不能覆盖新歌的背景
      const nowCover = `${currentTrack.value.al?.picUrl?.replace(
        'http://',
        'https://'
      )}?param=256y256`;
      if (nowCover !== cover) return;
      // 纯色/小图封面可能提取不出 DarkMuted 色板
      if (!palette.DarkMuted) return;
      const originColor = Color.rgb(palette.DarkMuted._rgb);
      const color = originColor.darken(0.1).rgb().fade(0.28).string();
      const color2 = originColor
        .lighten(0.28)
        .rotate(-30)
        .rgb()
        .fade(0.4)
        .string();
      background.value = `linear-gradient(to top left, ${color}, ${color2})`;
    })
    .catch(() => {});
}

function hasList() {
  return hasListSource();
}

function getListPath() {
  return getListSourcePath();
}

function mute() {
  player.value.mute();
}

getLyric();
getCoverColor();
_onKeydown = e => {
  if (e.key === 'F11') {
    e.preventDefault();
    fullscreen();
  }
};
_onFullscreenChange = () => {
  isFullscreen.value = !!document.fullscreenElement;
};
document.addEventListener('keydown', _onKeydown);
document.addEventListener('fullscreenchange', _onFullscreenChange);

watch(currentTrack, function () {
  getLyric();
  getCoverColor();
});

watch(
  showLyrics,
  show => {
    // toggleScrolling 本身是 toggle 语义，故传 !show
    uiStore.toggleScrolling(!show);
  },
  {
    immediate: true,
  }
);

watch(
  lyricPageOpen,
  open => {
    if (open) startLyricSync();
    else stopLyricSync();
  },
  {
    immediate: true,
  }
);

watch(lyricToShow, function () {
  invalidateLyricGeometry();
  highlightLyricIndex.value = -1;
});

watch(lyricFontSize, function () {
  invalidateLyricGeometry();
});

onMounted(function mounted() {
  initDate();
  // 尺寸变化（窗口缩放/全屏/窄屏断点）同时改变行高与居中基线；RO 只在尺寸真变时回调，比每帧回读布局便宜
  _resizeObserver = new ResizeObserver(() => invalidateLyricGeometry());
  _resizeObserver.observe(lyricsContainerRef.value);
});

onBeforeUnmount(function beforeUnmount() {
  clearInterval(_clockTimer);
  document.removeEventListener('keydown', _onKeydown);
  document.removeEventListener('fullscreenchange', _onFullscreenChange);
  stopLyricSync();
  _resizeObserver?.disconnect();
});
</script>

<style lang="scss" scoped>
.lyrics-page {
  position: fixed;
  top: 0;
  right: 0;
  left: 0;
  bottom: 0;
  z-index: 200;
  background: var(--color-body-bg);
  display: flex;
  clip: rect(auto, auto, auto, auto);
}

.lyrics-background {
  --contrast-lyrics-background: 75%;
  --brightness-lyrics-background: 150%;
}

[data-theme='dark'] .lyrics-background {
  --contrast-lyrics-background: 125%;
  --brightness-lyrics-background: 50%;
}

.lyrics-background {
  filter: blur(50px) contrast(var(--contrast-lyrics-background))
    brightness(var(--brightness-lyrics-background));
  position: absolute;
  height: 100vh;
  width: 100vw;

  .top-right,
  .bottom-left {
    z-index: 0;
    width: 140vw;
    height: 140vw;
    opacity: 0.6;
    position: absolute;
    background-size: cover;
  }

  .top-right {
    right: 0;
    top: 0;
    mix-blend-mode: luminosity;
  }

  .bottom-left {
    left: 0;
    bottom: 0;
    animation-direction: reverse;
    animation-delay: 10s;
  }
}

.dynamic-background > div {
  animation: rotate 150s linear infinite;
}

@keyframes rotate {
  0% {
    transform: rotate(0deg);
  }

  100% {
    transform: rotate(360deg);
  }
}

.gradient-background {
  position: absolute;
  height: 100vh;
  width: 100vw;
}

.left-side {
  flex: 1;
  display: flex;
  justify-content: flex-end;
  margin-right: 32px;
  margin-top: 24px;
  align-items: center;
  transition: all 0.5s;

  z-index: 1;

  .date {
    max-width: 54vh;
    margin: 24px 0;
    color: var(--color-text);
    text-align: center;
    font-size: 4rem;
    font-weight: 600;
    opacity: 0.88;
    display: -webkit-box;
    -webkit-box-orient: vertical;
    -webkit-line-clamp: 1;
    overflow: hidden;
  }

  .controls {
    max-width: 54vh;
    margin-top: 24px;
    color: var(--color-text);

    .title {
      margin-top: 8px;
      font-size: 1.4rem;
      font-weight: 600;
      opacity: 0.88;
      display: -webkit-box;
      -webkit-box-orient: vertical;
      -webkit-line-clamp: 1;
      overflow: hidden;
    }

    .subtitle {
      margin-top: 4px;
      font-size: 1rem;
      opacity: 0.58;
      display: -webkit-box;
      -webkit-box-orient: vertical;
      -webkit-line-clamp: 1;
      overflow: hidden;
    }

    .top-part {
      display: flex;
      justify-content: space-between;

      .top-right {
        display: flex;
        justify-content: space-between;

        .volume-control {
          margin: 0 10px;
          display: flex;
          align-items: center;

          .volume-bar {
            width: 84px;
          }
        }

        .buttons {
          display: flex;
          align-items: center;

          button {
            margin: 0 0 0 4px;
          }

          .svg-icon {
            height: 18px;
            width: 18px;
          }
        }
      }
    }

    .progress-bar {
      margin-top: 22px;
      display: flex;
      align-items: center;
      justify-content: space-between;

      .slider {
        width: 100%;
        flex-grow: grow;
        padding: 0 10px;
      }

      span {
        font-size: 15px;
        opacity: 0.58;
        min-width: 28px;
      }
    }

    .media-controls {
      display: flex;
      justify-content: center;
      margin-top: 18px;
      align-items: center;

      button {
        margin: 0;
      }

      .svg-icon {
        opacity: 0.38;
        height: 14px;
        width: 14px;
      }

      .active .svg-icon {
        opacity: 0.88;
      }

      .middle {
        padding: 0 16px;
        display: flex;
        align-items: center;

        button {
          margin: 0 8px;
        }

        button#play .svg-icon {
          height: 28px;
          width: 28px;
          padding: 2px;
        }

        .svg-icon {
          opacity: 0.88;
          height: 22px;
          width: 22px;
        }
      }

      .lyric-switch-icon {
        color: var(--color-text);
        font-size: 14px;
        line-height: 14px;
        opacity: 0.88;
      }
    }
  }
}

.cover {
  position: relative;

  .cover-container {
    position: relative;
  }

  img {
    border-radius: 0.75em;
    width: 54vh;
    height: 54vh;
    user-select: none;
    object-fit: cover;
  }

  .shadow {
    position: absolute;
    top: 12px;
    height: 54vh;
    width: 54vh;
    filter: blur(16px) opacity(0.6);
    transform: scale(0.92, 0.96);
    z-index: -1;
    background-size: cover;
    border-radius: 0.75em;
  }
}

.right-side {
  flex: 1;
  font-weight: 600;
  color: var(--color-text);
  margin-right: 24px;
  z-index: 0;

  .lyrics-container {
    height: 100%;
    display: flex;
    flex-direction: column;
    padding-left: 78px;
    max-width: 460px;
    overflow-y: auto;
    // 使其成为歌词行的 offsetParent，高亮定位用 offsetTop 精确计算
    position: relative;
    transition: 0.5s;
    scrollbar-width: none; // firefox

    .line {
      // em 单位随歌词字号等比缩放（默认 28px 时即 2px / 12px / 18px），保证大倍率下行的内边距/间距不与文字比例失调
      margin: 0.07em 0;
      padding: 0.43em 0.64em;
      transition: 0.5s;
      border-radius: 12px;

      &:hover {
        background: var(--color-secondary-bg-for-transparent);
      }

      .content {
        transform-origin: center left;
        transform: scale(0.95);
        transition: all 0.35s cubic-bezier(0.25, 0.46, 0.45, 0.94);
        user-select: none;

        span {
          opacity: 0.28;
          cursor: default;
          font-size: 1em;
          transition: all 0.35s cubic-bezier(0.25, 0.46, 0.45, 0.94);
        }

        span.translation {
          opacity: 0.2;
          font-size: 0.925em;
        }
      }
    }

    .line#line-1:hover {
      background: unset;
    }

    .translation {
      margin-top: 0.1em;
    }

    .highlight div.content {
      transform: scale(1);

      span {
        opacity: 0.98;
        display: inline-block;
      }

      span.translation {
        opacity: 0.65;
      }
    }
  }

  ::-webkit-scrollbar {
    display: none;
  }

  .lyrics-container .line:first-child {
    margin-top: 50vh;
  }

  .lyrics-container .line:last-child {
    margin-bottom: calc(50vh - 128px);
  }
}

.close-button {
  position: fixed;
  top: 24px;
  right: 24px;
  z-index: 300;
  border-radius: 0.75rem;
  height: 44px;
  width: 44px;
  display: flex;
  justify-content: center;
  align-items: center;
  opacity: 0.28;
  transition: 0.2s;
  -webkit-app-region: no-drag;

  .svg-icon {
    color: var(--color-text);
    padding-top: 5px;
    height: 22px;
    width: 22px;
  }

  &:hover {
    background: var(--color-secondary-bg-for-transparent);
    opacity: 0.88;
  }
}

.lyrics-page.no-lyric {
  .left-side {
    transition: all 0.5s;
    transform: translateX(27vh);
    margin-right: 0;
  }
}

@media (max-aspect-ratio: 10/9) {
  .left-side {
    display: none;
  }

  .right-side .lyrics-container {
    max-width: 100%;
  }
}

@media screen and (min-width: 1200px) {
  .right-side .lyrics-container {
    max-width: 600px;
  }
}

.slide-up-enter-active,
.slide-up-leave-active {
  transition: all 0.4s;
}

.slide-up-enter-from,
.slide-up-leave-to {
  transform: translateY(100%);
}

.slide-fade-enter-active {
  transition: all 0.5s ease;
}

.slide-fade-leave-active {
  transition: all 0.5s cubic-bezier(0.2, 0.2, 0, 1);
}

.slide-fade-enter-from,
.slide-fade-leave-to {
  transform: translateX(27vh);
  opacity: 0;
}
</style>
