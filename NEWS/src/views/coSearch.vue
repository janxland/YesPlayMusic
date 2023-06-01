<template>
  <div class="search">
    <div class="search-topside">
      <span
        ><div class="dropdown">
          <font class="dropbtn"
            >{{ serverNameTable[server] }} <svg-icon icon-class="arrow-down"
          /></font>
          <div class="dropdown-content">
            <button
              v-for="(val, key, i) in serverNameTable"
              :key="{ val: val, i: i }"
              @click="tranSearchType(undefined, key)"
              >{{ serverNameTable[key] }}</button
            >
          </div>
        </div>
        搜索
        <div class="dropdown">
          <font class="dropbtn"
            >{{ typeNameTable[type] }} <svg-icon icon-class="arrow-down"
          /></font>
          <div class="dropdown-content">
            <button
              v-for="(val, key, i) in typeNameTable"
              :key="{ val: val, i: i }"
              @click="tranSearchType(key, undefined)"
              >{{ typeNameTable[key] }}</button
            >
          </div>
        </div></span
      >
      <div class="searchKeywords">"{{ keywords }}"</div>
    </div>
    <div v-if="type === 'tracks'">
      <TrackList
        :tracks="result"
        type="playlist"
        :max-size="100"
        :other-server-access="false"
        dbclick-track-func="none"
      />
    </div>
    <div v-if="type === 'playlists'">
      <CoverRow
        type="playlist"
        :click-cover-to-play-fun="playThisListByTrack"
        :items="result"
        sub-text="title"
      />
    </div>
    <div class="load-more">
      <ButtonTwoTone
        v-show="hasMore"
        color="grey"
        @click.native="fetchData(true)"
        >{{ $t('explore.loadMore') }}</ButtonTwoTone
      >
    </div>
  </div>
</template>

<script>
import { getTrackDetail } from '@/api/track';
import { getPlaylistDetail } from '@/api/playlist';
import locale from '@/locale';
import { mapState, mapActions } from 'vuex';
import { camelCase } from 'change-case';
import request from '@/utils/request';
import TrackList from '@/components/TrackList.vue';
import CoverRow from '@/components/CoverRow.vue';
import ButtonTwoTone from '@/components/ButtonTwoTone.vue';
export default {
  name: 'Search',
  components: {
    TrackList,
    CoverRow,
    ButtonTwoTone,
  },
  data() {
    return { show: false, result: [], hasMore: true, curpage: 1 };
  },
  computed: {
    ...mapState(['player']),
    keywords() {
      return this.$route.query.keywords;
    },
    type() {
      return camelCase(this.$route.query.type || 'tracks');
    },
    server() {
      return camelCase(this.$route.query.server || 'tencent');
    },
    typeNameTable() {
      return {
        musicVideos: locale.t('search.mv'),
        tracks: locale.t('search.song'),
        albums: locale.t('search.album'),
        artists: locale.t('search.artist'),
        playlists: locale.t('search.playlist'),
      };
    },
    serverNameTable() {
      return {
        tencent: locale.t('server.tencent'),
        kugou: locale.t('server.kugou'),
      };
    },
  },
  watch: {
    $route: {
      immediate: true,
      handler() {
        this.fetchData();
      },
    },
  },
  methods: {
    ...mapActions(['showToast']),
    playThisListByTrack(id) {
      this.showToast('coSearch 正在进行其他平台播放');
      getPlaylistDetail(id, true, this.$route.query.server).then(data => {
        console.log(data);
        let playlist = data.playlist;
        let tracks = playlist.tracks.filter(_track => {
          return _track.playable == 1;
        });
        this.player.replacePlaylist(tracks, tracks[0], 'artist', tracks[0]);
      });
    },
    tranSearchType(type, server) {
      if (type) {
        this.$router.replace({ query: { ...this.$route.query, type } });
      }
      if (server) {
        this.$router.replace({ query: { ...this.$route.query, server } });
      }
    },
    playTrack(id) {
      this.player._replaceCurrentTrackByTrack(id, true);
    },
    formatTime(times) {
      let t = '';
      times /= 1000;
      if (times > -1) {
        var min = Math.floor(times / 60) % 60;
        var sec = times % 60;
        t += min + ':';
        if (sec < 10) {
          t += '0';
        }
        t += sec.toFixed(2);
      }
      t = t.substring(0, t.length - 3);
      return t;
    },
    fetchData(isPush = false) {
      const typeTable = {
        musicVideos: 1004,
        tracks: 1,
        albums: 10,
        artists: 100,
        playlists: 1000,
      };
      request({
        url: '/search',
        method: 'get',
        params: {
          curpage: isPush ? (this.curpage += 1) : (this.curpage = 1),
          ...this.$route.query,
          keywords: this.keywords || '群青',
          type: typeTable[this.type],
        },
      }).then(result => {
        result = result.result;
        this.hasMore = result.hasMore ?? true;
        switch (this.type) {
          case 'musicVideos':
            if (isPush) this.result.push(...result.mvs);
            else this.result = result.mvs;
            if (result.mvCount <= this.result.length) {
              this.hasMore = false;
            }
            break;
          case 'artists':
            if (isPush) this.result.push(...result.artists);
            else this.result = result.artists;
            break;
          case 'albums':
            if (isPush) this.result.push(...result.albums);
            else this.result = result.albums;
            if (result.albumCount <= this.result.length) {
              this.hasMore = false;
            }
            break;
          case 'tracks':
            if (isPush) this.result.push(...result.songs);
            else this.result = result.songs;
            break;
          case 'playlists':
            if (isPush) this.result.push(...result.playlists);
            else this.result = result.playlists;
            break;
        }
      });
    },
    getTracksDetail() {
      const trackIDs = this.result.map(t => t.id);
      if (trackIDs.length === 0) return;
      getTrackDetail(trackIDs.join(',')).then(result => {
        this.result = result.songs;
      });
    },
  },
};
</script>

<style lang="scss" scoped>
.search-topside {
  position: relative;
  color: var(--color-text);
  font-size: 1.4em;
  margin: 1em auto;
  .searchKeywords {
    display: inline-block;
    text-align: center;
  }
}
@media (max-width: 576px) {
  .searchKeywords {
    display: block !important;
    margin: 15px auto !important;
    text-align: center !important;
  }
}
.dropdown {
  line-height: 100%;
  height: 100%;
  font-size: 0.9em;
  padding: 10px;
  margin: 0 10px;
  position: relative;
  display: inline-block;
  background-color: var(--color-primary-bg-for-transparent);
  color: var(--color-primary);
  box-sizing: border-box;
  border-radius: 5px;
  svg {
    width: 12px;
    height: 12px;
    margin-left: 5px;
  }
}
.dropdown-content {
  pointer-events: none;
  font-size: 1em;
  opacity: 0;
  transition: 0.5s;
  position: absolute;
  background-color: var(--color-body-bg);
  width: 100%;
  padding: 8px;
  right: 0;
  border-radius: 12px;
  z-index: 55;
  box-shadow: 0px 8px 16px 0px rgba(0, 0, 0, 0.2);
  button {
    padding: 0;
    margin: 0;
    width: 100%;
    font-weight: 600;
    font-size: 14px;
    padding: 10px 12px;
    border-radius: 8px;
    cursor: default;
    color: var(--color-text);
    display: flex;
    align-items: center;
    &:hover {
      color: var(--color-primary);
      background: var(--color-primary-bg-for-transparent);
    }
  }
}
.dropdown:hover,
.dropdown:focus {
  .dropdown-content:hover {
    pointer-events: auto;
  }
  .dropdown-content {
    pointer-events: auto;
    opacity: 1;
    transition: 0.5s;
  }
}
button {
  display: flex;
  justify-content: center;
  align-items: center;
  padding: 8px;
  background: transparent;
  border-radius: 25%;
  transition: transform 0.2s;
  .svg-icon {
    height: 16px;
    width: 16px;
    color: var(--color-primary);
  }
  &:hover {
    transform: scale(1.08);
  }
  &:active {
    transform: scale(0.96);
  }
}

.track {
  display: flex;
  align-items: center;
  padding: 8px;
  border-radius: 12px;
  user-select: none;

  .no {
    display: flex;
    justify-content: center;
    align-items: center;
    border-radius: 8px;
    margin: 0 20px 0 10px;
    width: 12px;
    color: var(--color-text);
    cursor: default;
    span {
      opacity: 0.58;
    }
  }

  .explicit-symbol {
    opacity: 0.28;
    color: var(--color-text);
    .svg-icon {
      margin-bottom: -3px;
    }
  }

  .explicit-symbol.before-artist {
    .svg-icon {
      margin-bottom: -3px;
    }
  }

  img {
    border-radius: 8px;
    height: 46px;
    width: 46px;
    margin-right: 14px;
    border: 1px solid rgba(0, 0, 0, 0.04);
    cursor: pointer;
  }

  img.hover {
    filter: drop-shadow(100 200 0 black);
  }

  .title-and-artist {
    min-width: 120px;
    flex: 1;
    display: flex;
    .container {
      display: flex;
      flex-direction: column;
    }
    .title {
      font-size: 16px;
      font-weight: 600;
      color: var(--color-text);
      cursor: default;
      padding-right: 12px;
      display: -webkit-box;
      -webkit-box-orient: vertical;
      -webkit-line-clamp: 1;
      overflow: hidden;
      word-break: break-all;
      .featured {
        margin-right: 2px;
        font-weight: 500;
        font-size: 14px;
        opacity: 0.72;
      }
      .sub-title {
        color: #7a7a7a;
        opacity: 0.7;
        margin-left: 4px;
      }
    }
    .artist {
      margin-top: 2px;
      font-size: 13px;
      opacity: 0.68;
      color: var(--color-text);
      display: -webkit-box;
      -webkit-box-orient: vertical;
      -webkit-line-clamp: 1;
      overflow: hidden;
      a {
        span {
          margin-right: 3px;
          opacity: 0.8;
        }
        &:hover {
          text-decoration: underline;
          cursor: pointer;
        }
      }
    }
  }
  .album {
    flex: 1;
    display: flex;
    font-size: 16px;
    min-width: 80px;
    opacity: 0.88;
    color: var(--color-text);
    display: -webkit-box;
    -webkit-box-orient: vertical;
    -webkit-line-clamp: 2;
    overflow: hidden;
  }
  .time,
  .count {
    font-size: 16px;
    width: 50px;
    cursor: default;
    display: flex;
    justify-content: flex-end;
    margin-right: 10px;
    font-variant-numeric: tabular-nums;
    opacity: 0.88;
    color: var(--color-text);
  }
  .count {
    font-weight: bold;
    font-size: 22px;
    line-height: 22px;
  }
}

.track.focus {
  transition: all 0.3s;
  background: var(--color-secondary-bg);
}

.track.disable {
  img {
    filter: grayscale(1) opacity(0.6);
  }
  .title,
  .artist,
  .album,
  .time,
  .no,
  .featured {
    opacity: 0.28 !important;
  }
  &:hover {
    background: none;
  }
}

.track.tracklist {
  img {
    height: 36px;
    width: 36px;
    border-radius: 6px;
    margin-right: 14px;
    cursor: pointer;
  }
  .title {
    font-size: 16px;
  }
  .artist {
    font-size: 12px;
  }
}
.load-more {
  display: flex;
  justify-content: center;
}
.track.album {
  height: 32px;
}

.actions {
  width: 80px;
  display: flex;
  justify-content: flex-end;
}

.track.playing {
  background: var(--color-primary-bg);
  color: var(--color-primary);
  .title,
  .album,
  .time,
  .title-and-artist .sub-title {
    color: var(--color-primary);
  }
  .title .featured,
  .artist,
  .explicit-symbol,
  .count {
    color: var(--color-primary);
    opacity: 0.88;
  }
  .no span {
    color: var(--color-primary);
    opacity: 0.78;
  }
}
</style>
