<template>
  <transition name="slide-up">
    <div
      class="lyrics-page"
      :class="{ 'no-lyric': noLyric }"
      :data-theme="theme"
    >
      <div
        v-if="
          (settings.lyricsBackground === 'blur') |
            (settings.lyricsBackground === 'dynamic')
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
          <div v-if="settings.showLyricsTime" class="date">
            {{ date }}
          </div>
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
                    @click.native="toggleLyrics"
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
                    @click.native="toggleLyrics"
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
                      @click.native="toggleLyrics"
                      >{{ album.name }}
                    </router-link>
                  </span>
                </div>
              </div>
              <div class="top-right">
                <div class="volume-control">
                  <button-icon :title="$t('player.mute')" @click.native="mute">
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
                    @click.native="likeATrack(player.currentTrack.id)"
                  >
                    <svg-icon
                      :icon-class="
                        player.isCurrentTrackLiked ? 'heart-solid' : 'heart'
                      "
                    />
                  </button-icon>
                  <button-icon
                    :title="$t('contextMenu.addToPlaylist')"
                    @click.native="addToPlaylist"
                  >
                    <svg-icon icon-class="plus" />
                  </button-icon>
                  <!-- <button-icon @click.native="openMenu" title="Menu"
                    ><svg-icon icon-class="more"
                  /></button-icon> -->
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
                @click.native="switchRepeatMode"
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
                  @click.native="playPrevTrack"
                >
                  <svg-icon icon-class="previous" />
                </button-icon>
                <button-icon
                  v-show="player.isPersonalFM"
                  title="不喜欢"
                  @click.native="moveToFMTrash"
                >
                  <svg-icon icon-class="thumbs-down" />
                </button-icon>
                <button-icon
                  id="play"
                  :title="$t(player.playing ? 'player.pause' : 'player.play')"
                  @click.native="playOrPause"
                >
                  <svg-icon :icon-class="player.playing ? 'pause' : 'play'" />
                </button-icon>
                <button-icon
                  :title="$t('player.next')"
                  @click.native="playNextTrack"
                >
                  <svg-icon icon-class="next" />
                </button-icon>
              </div>
              <button-icon
                v-show="!player.isPersonalFM"
                :title="$t('player.shuffle')"
                :class="{ active: player.shuffle }"
                @click.native="switchShuffle"
              >
                <svg-icon icon-class="shuffle" />
              </button-icon>
              <button-icon
                v-show="
                  isShowLyricTypeSwitch &&
                  $store.state.settings.showLyricsTranslation &&
                  lyricType === 'translation'
                "
                :title="$t('player.translationLyric')"
                @click.native="switchLyricType"
              >
                <span class="lyric-switch-icon">译</span>
              </button-icon>
              <button-icon
                v-show="
                  isShowLyricTypeSwitch &&
                  $store.state.settings.showLyricsTranslation &&
                  lyricType === 'romaPronunciation'
                "
                :title="$t('player.PronunciationLyric')"
                @click.native="switchLyricType"
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
          transform: `perspective(${$store.state.visualSet.perspective}px) rotateY(${$store.state.visualSet.rotateY}deg)`,
        }"
      >
        <transition name="slide-fade">
          <div
            v-show="!noLyric"
            ref="lyricsContainer"
            class="lyrics-container"
            :style="lyricFontSize"
            @wheel="userBrowsing"
            @pointerdown="userBrowsing"
          >
            <div id="line-1" class="line"></div>
            <div
              v-for="(line, index) in lyricToShow"
              :key="index"
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
                    $store.state.settings.showLyricsTranslation
                  "
                  class="translation"
                  @click.right="openLyricMenu($event, line, 1)"
                  >{{ line.contents[1] }}</span
                >
              </div>
            </div>
            <ContextMenu v-if="!noLyric" ref="lyricMenu">
              <div class="item" @click="copyLyric(false)">{{
                $t('contextMenu.copyLyric')
              }}</div>
              <div
                v-if="
                  rightClickLyric &&
                  rightClickLyric.contents[1] &&
                  $store.state.settings.showLyricsTranslation
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

<script>
// The lyrics page of Apple Music is so gorgeous, so I copy the design.
// Some of the codes are from https://github.com/sl1673495/vue-netease-music

import { mapState, mapMutations, mapActions } from 'vuex';
import VueSlider from 'vue-slider-component';
import ContextMenu from '@/components/ContextMenu.vue';
import { formatTrackTime } from '@/utils/common';
import { getLyric, getCloudLyric } from '@/api/track';
import {
  lyricParser,
  copyLyric,
  parseLyric,
  findActiveLyricIndex,
} from '@/utils/lyrics';
import ButtonIcon from '@/components/ButtonIcon.vue';
import Visualization from '@/components/Visualization';
import * as Vibrant from 'node-vibrant/dist/vibrant.worker.min.js';
import Color from 'color';
import { isAccountLoggedIn } from '@/utils/auth';
import { hasListSource, getListSourcePath } from '@/utils/playList';
import locale from '@/locale';

export default {
  name: 'Lyrics',
  components: {
    VueSlider,
    ButtonIcon,
    Visualization,
    ContextMenu,
  },
  data() {
    return {
      lyric: [],
      tlyric: [],
      romalyric: [],
      lyricType: 'translation', // or 'romaPronunciation'
      highlightLyricIndex: -1,
      background: '',
      date: this.formatTime(new Date()),
      isFullscreen: !!document.fullscreenElement,
      rightClickLyric: null,
    };
  },
  computed: {
    ...mapState(['player', 'settings', 'showLyrics']),
    currentTrack() {
      return this.player.currentTrack;
    },
    volume: {
      get() {
        return this.player.volume;
      },
      set(value) {
        this.player.volume = value;
      },
    },
    imageUrl() {
      return this.player.currentTrack?.al?.picUrl + '?param=1024y1024';
    },
    bgImageUrl() {
      return this.player.currentTrack?.al?.picUrl + '?param=512y512';
    },
    isShowLyricTypeSwitch() {
      return this.romalyric.length > 0 && this.tlyric.length > 0;
    },
    lyricToShow() {
      return this.lyricType === 'translation'
        ? this.lyricWithTranslation
        : this.lyricWithRomaPronunciation;
    },
    // 高亮定位与渲染必须用同一份时间轴：先前是对未过滤的 this.lyric 求下标、
    // 再把下标套到过滤后的 lyricToShow 上，一旦两者行数不同就会点不亮/跳错行。
    lyricTimes() {
      return this.lyricToShow.map(({ time }) => time);
    },
    lyricWithTranslation() {
      return this.mergeSecondaryLyric(this.tlyric);
    },
    lyricWithRomaPronunciation() {
      return this.mergeSecondaryLyric(this.romalyric);
    },
    lyricFontSize() {
      const scale = this.$store.state.visualSet.lyricsScale || 1;
      return {
        // 可视化面板「歌词大小」：直接缩放字号而非 transform: scale ——
        // transform 只是放大已栅格化的文字图层，放大后发虚；字号缩放让
        // 字形按目标尺寸重新渲染，任意倍率都清晰。内容变化被限制在
        // 滚动容器内部（height:100% + overflow），不挤压其他布局；
        // 高亮行由 centerHighlightLine 钉在容器中心。
        fontSize: `${
          (this.$store.state.settings.lyricFontSize || 28) * scale
        }px`,
      };
    },
    noLyric() {
      return this.lyric.length == 0;
    },
    // 歌词页可见且有歌词可滚动时才需要逐帧定位；组件是 v-show 常驻的，
    // 关掉页面后继续轮询纯属浪费。
    lyricPageOpen() {
      return this.showLyrics && !this.noLyric;
    },
    // 「纯音乐，请欣赏」这类占位行不支持点击跳转
    isPureMusicLyric() {
      return this.lyric.some(({ content }) => content === '纯音乐，请欣赏');
    },
    artist() {
      return this.currentTrack?.ar
        ? this.currentTrack.ar[0]
        : { id: 0, name: 'unknown' };
    },
    album() {
      return this.currentTrack?.al || { id: 0, name: 'unknown' };
    },
    theme() {
      return this.settings.lyricsBackground === true ? 'dark' : 'auto';
    },
  },
  watch: {
    currentTrack() {
      this.getLyric();
      this.getCoverColor();
    },
    // immediate 是必须的：组件由 <Lyrics v-if="lyricsMounted"> 按需创建，
    // 创建时 showLyrics 已经是 true，非 immediate 的 watcher 永不触发，
    // 于是首次打开歌词页时定位循环根本没启动（歌词「失活」、不跟随不跳转）。
    showLyrics: {
      handler(show) {
        this.$store.commit('enableScrolling', !show);
      },
      immediate: true,
    },
    lyricPageOpen: {
      handler(open) {
        if (open) this.startLyricSync();
        else this.stopLyricSync();
      },
      immediate: true,
    },
    // 换歌 / 切换译文行 / 换字号都会改变行数与行高：几何缓存作废，
    // 高亮下标归 -1，让下一帧重新定位并把正确的行滚回中心。
    lyricToShow() {
      this.invalidateLyricGeometry();
      this.highlightLyricIndex = -1;
    },
    lyricFontSize() {
      this.invalidateLyricGeometry();
    },
  },
  created() {
    this.getLyric();
    this.getCoverColor();
    this.initDate();
    document.addEventListener('keydown', e => {
      if (e.key === 'F11') {
        e.preventDefault();
        this.fullscreen();
      }
    });
    document.addEventListener('fullscreenchange', () => {
      this.isFullscreen = !!document.fullscreenElement;
    });
  },
  mounted() {
    // 容器尺寸变化（窗口缩放、全屏、窄屏断点隐藏左侧封面）同时改变行高与居中
    // 基线；RO 只在尺寸真的变了时回调，比每帧回读布局便宜。
    this._resizeObserver = new ResizeObserver(() =>
      this.invalidateLyricGeometry()
    );
    this._resizeObserver.observe(this.$refs.lyricsContainer);
  },
  beforeDestroy: function () {
    if (this.timer) {
      clearInterval(this.timer);
    }
    this.stopLyricSync();
    this._resizeObserver?.disconnect();
  },
  methods: {
    ...mapMutations(['toggleLyrics', 'updateModal']),
    ...mapActions(['likeATrack', 'showToast']),
    initDate() {
      var _this = this;
      clearInterval(this.timer);
      this.timer = setInterval(function () {
        _this.date = _this.formatTime(new Date());
      }, 1000);
    },
    formatTime(value) {
      let hour = value.getHours().toString();
      let minute = value.getMinutes().toString();
      let second = value.getSeconds().toString();
      return (
        hour.padStart(2, '0') +
        ':' +
        minute.padStart(2, '0') +
        ':' +
        second.padStart(2, '0')
      );
    },
    fullscreen() {
      if (document.fullscreenElement) {
        document.exitFullscreen();
      } else {
        document.documentElement.requestFullscreen();
      }
    },
    addToPlaylist() {
      if (!isAccountLoggedIn()) {
        this.showToast(locale.t('toast.needToLogin'));
        return;
      }
      this.$store.dispatch('fetchLikedPlaylist');
      this.updateModal({
        modalName: 'addTrackToPlaylistModal',
        key: 'show',
        value: true,
      });
      this.updateModal({
        modalName: 'addTrackToPlaylistModal',
        key: 'selectedTrackID',
        value: this.currentTrack?.id,
      });
    },
    playPrevTrack() {
      this.player.playPrevTrack();
    },
    playOrPause() {
      this.player.playOrPause();
    },
    playNextTrack() {
      if (this.player.isPersonalFM) {
        this.player.playNextFMTrack();
      } else {
        this.player.playNextTrack();
      }
    },
    getLyric() {
      if (!this.currentTrack.id) return;
      // 请求发出前先清空：旧实现直到响应回来都还挂着上一首的歌词，
      // 切歌瞬间新歌进度会在旧词时间轴上滚动（穿帮），且失败后旧词永久残留
      this.lyric = [];
      this.tlyric = [];
      this.romalyric = [];
      const onFail = () => {
        this.$store.dispatch('showToast', '歌词加载失败');
      };
      if (
        this.currentTrack.pc !== null &&
        this.currentTrack.cd === null &&
        this.$store.state.data.user?.userId
      ) {
        //云盘未设置关联的歌曲获取其内置歌词
        return getCloudLyric(
          this.currentTrack.id,
          this.$store.state.data.user?.userId
        )
          .then(data => {
            this.lyric = data?.lrc?.length > 0 ? parseLyric(data.lrc) : [];
            this.lyricType = 'translation';
            return true;
          })
          .catch(onFail);
      }
      return getLyric(this.currentTrack.id)
        .then(data => {
          if (!data?.lrc?.lyric) {
            this.lyric = [];
            this.tlyric = [];
            this.romalyric = [];
            return false;
          }
          let { lyric, tlyric, romalyric } = lyricParser(data);
          lyric = lyric.filter(
            l => !/^作(词|曲)\s*(:|：)\s*无$/.exec(l.content)
          );
          const includeAM =
            lyric.length <= 10 &&
            lyric.map(l => l.content).includes('纯音乐，请欣赏');
          if (includeAM) {
            const reg = /^作(词|曲)\s*(:|：)\s*/;
            const author = this.currentTrack?.ar[0]?.name;
            lyric = lyric.filter(l => {
              const regExpArr = l.content.match(reg);
              return (
                !regExpArr || l.content.replace(regExpArr[0], '') !== author
              );
            });
          }
          // 只剩「纯音乐，请欣赏」一行 → 按无歌词处理
          if (lyric.length === 1 && includeAM) {
            this.lyric = [];
            this.tlyric = [];
            this.romalyric = [];
            return false;
          }
          this.lyric = lyric;
          this.tlyric = tlyric;
          this.romalyric = romalyric;
          this.lyricType =
            tlyric.length && romalyric.length
              ? 'translation'
              : lyric.length
              ? 'translation'
              : 'romaPronunciation';
          return true;
        })
        .catch(onFail);
    },
    switchLyricType() {
      this.lyricType =
        this.lyricType === 'translation' ? 'romaPronunciation' : 'translation';
    },
    formatTrackTime(value) {
      return formatTrackTime(value);
    },
    clickLyricLine(index, startPlay = false) {
      // 歌词文字本身是 user-select: none，页面上残留的旧选区（比如事先选中过歌名）
      // 不该把跳转一起挡掉 —— 清掉选区，「点哪句跳到哪句」无条件成立
      window.getSelection()?.removeAllRanges();
      const line = this.lyricToShow[index];
      if (!line || this.isPureMusicLyric) return;
      // 点行是「我要看这句」：撤销此前 pointerdown 申请的让位窗口
      this._userScrollUntil = 0;
      this.player.seek(line.time);
      // 乐观落点：点击的那一行立刻高亮并居中，不等下一帧回读播放进度
      this.highlightLyricIndex = index;
      this._scrolledTo = this.centerHighlightLine() ? index : null;
      if (startPlay === true) {
        this.player.play();
      }
    },
    openLyricMenu(e, lyric, idx) {
      this.rightClickLyric = { ...lyric, idx };
      this.$refs.lyricMenu.openMenu(e);
      e.preventDefault();
    },
    copyLyric(withTranslation) {
      if (this.rightClickLyric) {
        const idx = this.rightClickLyric.idx;
        if (!withTranslation) {
          copyLyric(this.rightClickLyric.contents[idx]);
        } else {
          copyLyric(this.rightClickLyric.contents.join(' '));
        }
      }
    },
    /**
     * 主歌词按 rawTime 合并副歌词（译文/音译）。
     * 旧实现对每行都做一遍全量 find —— O(主行数 × 副行数)；换 Map 后两趟线性搞定。
     * 同时保证渲染出来的行数与高亮定位所用的时间轴完全同源。
     */
    mergeSecondaryLyric(subLyrics) {
      const contentByRawTime = new Map();
      for (const { rawTime, content } of subLyrics) {
        if (!contentByRawTime.has(rawTime)) {
          contentByRawTime.set(rawTime, content);
        }
      }
      const merged = [];
      for (const line of this.lyric) {
        if (!line.content) continue;
        const contents = [line.content];
        const subContent = contentByRawTime.get(line.rawTime);
        if (subContent) contents.push(subContent);
        merged.push({ time: line.time, content: line.content, contents });
      }
      return merged;
    },
    invalidateLyricGeometry() {
      this._lineRows = null;
      this._scrolledTo = null;
    },
    /**
     * 用户滚轮/拖滚动条浏览歌词时申请「让位窗口」：期间换行只切高亮、不抢
     * 滚动条（旧实现往前看几句，下一句时间点就被拽回中央）。窗口结束后
     * 由 syncHighlightIndex 的补居中把当前行带回中心。
     */
    userBrowsing() {
      this._userScrollUntil = Date.now() + 5000;
    },
    startLyricSync() {
      if (this._lyricRaf) return;
      // 关闭期间 v-show 会把容器 scrollTop 归零，重开必须重新定位居中一次
      this.invalidateLyricGeometry();
      const tick = () => {
        this._lyricRaf = requestAnimationFrame(tick);
        this.syncHighlightIndex();
      };
      this._lyricRaf = requestAnimationFrame(tick);
    },
    stopLyricSync() {
      if (!this._lyricRaf) return;
      cancelAnimationFrame(this._lyricRaf);
      this._lyricRaf = 0;
    },
    syncHighlightIndex() {
      const progress = this.player.seek(null, false) ?? 0;
      const index = findActiveLyricIndex(this.lyricTimes, progress);
      // 未换行且已滚到位 → 立即返回：稳定播放期每帧零 DOM 访问、零回流
      if (index === this.highlightLyricIndex && index === this._scrolledTo) {
        return;
      }
      this.highlightLyricIndex = index;
      if (Date.now() < (this._userScrollUntil ?? 0)) {
        // 让位期内只切高亮；置空 _scrolledTo 使窗口结束后下一帧补回居中
        this._scrolledTo = null;
        return;
      }
      if (this.centerHighlightLine()) this._scrolledTo = index;
    },
    /**
     * 一次性批量读取全部行的几何并缓存。循环内只读不写，故整趟测量只触发一次
     * 强制布局；此后每次换行都只是「读缓存 + 写 scrollTop」。
     * @returns {boolean} 是否测到可用几何（未挂载或被 v-show 隐藏时为 false）
     */
    measureLines() {
      const container = this.$refs.lyricsContainer;
      if (!container) return false;
      const viewportHeight = container.clientHeight;
      if (viewportHeight === 0) return false;
      const rows = [];
      for (const el of container.querySelectorAll('.line')) {
        rows.push({ top: el.offsetTop, height: el.offsetHeight });
      }
      this._lineRows = rows;
      this._lyricsViewportHeight = viewportHeight;
      return true;
    },
    /** 把高亮行滚到容器垂直中心。@returns {boolean} 是否已滚到位 */
    centerHighlightLine() {
      // 手动 scrollTo 而非 scrollIntoView：只滚动歌词容器本身，
      // 避免连带祖先/页面一起滚导致定位漂移。
      if (!this._lineRows && !this.measureLines()) return false;
      // rows[0] 是模板里的占位行 #line-1，歌词行整体后移一位
      const row = this._lineRows[this.highlightLyricIndex + 1];
      if (!row) return false;
      this.$refs.lyricsContainer.scrollTo({
        top: row.top - (this._lyricsViewportHeight - row.height) / 2,
        behavior: 'smooth',
      });
      return true;
    },
    moveToFMTrash() {
      this.player.moveToFMTrash();
    },
    switchRepeatMode() {
      this.player.switchRepeatMode();
    },
    switchShuffle() {
      this.player.switchShuffle();
    },
    getCoverColor() {
      if (this.settings.lyricsBackground !== true) return;
      const cover = this.currentTrack.al?.picUrl + '?param=256y256';
      Vibrant.from(cover, { colorCount: 1 })
        .getPalette()
        .then(palette => {
          const originColor = Color.rgb(palette.DarkMuted._rgb);
          const color = originColor.darken(0.1).rgb().fade(0.28).string();
          const color2 = originColor
            .lighten(0.28)
            .rotate(-30)
            .rgb()
            .fade(0.4)
            .string();
          this.background = `linear-gradient(to top left, ${color}, ${color2})`;
        });
    },
    hasList() {
      return hasListSource();
    },
    getListPath() {
      return getListSourcePath();
    },
    mute() {
      this.player.mute();
    },
  },
};
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
      // em 单位随歌词字号等比缩放（默认 28px 时即 2px / 12px / 18px），
      // 保证大倍率下行的内边距/间距不与文字比例失调
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

.slide-up-enter,
.slide-up-leave-to

/* .fade-leave-active below version 2.1.8 */ {
  transform: translateY(100%);
}

.slide-fade-enter-active {
  transition: all 0.5s ease;
}

.slide-fade-leave-active {
  transition: all 0.5s cubic-bezier(0.2, 0.2, 0, 1);
}

.slide-fade-enter,
.slide-fade-leave-to {
  transform: translateX(27vh);
  opacity: 0;
}
</style>
