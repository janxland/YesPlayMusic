<template>
  <div v-show="show" class="search">
    <h1>
      <span>{{ $t('search.searchFor') }} {{ typeNameTable[type] }}</span> "{{
        keywords
      }}"
    </h1>

    <div v-if="type === 'artists'">
      <CoverRow type="artist" :items="result" :column-number="6" />
    </div>
    <div v-if="type === 'albums'">
      <CoverRow
        type="album"
        :items="result"
        sub-text="artist"
        sub-text-font-size="14px"
      />
    </div>
    <div v-if="type === 'tracks'">
      <TrackList
        :tracks="result"
        type="playlist"
        dbclick-track-func="playAList"
      />
    </div>
    <div v-if="type === 'musicVideos'">
      <MvRow :mvs="result" />
    </div>
    <div v-if="type === 'playlists'">
      <CoverRow type="playlist" :items="result" sub-text="title" />
    </div>

    <div class="load-more">
      <ButtonTwoTone v-show="hasMore" color="grey" @click.native="fetchData">{{
        $t('explore.loadMore')
      }}</ButtonTwoTone>
    </div>
  </div>
</template>

<script>
import { getTrackDetail } from '@/api/track';
import { search } from '@/api/others';
import locale from '@/locale';
import { camelCase } from 'change-case';
import { loadWithProgress, loadOptional } from '@/utils/pageLoad';

import TrackList from '@/components/TrackList.vue';
import MvRow from '@/components/MvRow.vue';
import CoverRow from '@/components/CoverRow.vue';
import ButtonTwoTone from '@/components/ButtonTwoTone.vue';

export default {
  name: 'Search',
  components: {
    TrackList,
    MvRow,
    CoverRow,
    ButtonTwoTone,
  },
  data() {
    return { show: false, result: [], hasMore: true };
  },
  computed: {
    keywords() {
      return this.$route.params.keywords;
    },
    type() {
      return camelCase(this.$route.params.type);
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
  },
  created() {
    this.fetchData();
  },
  methods: {
    fetchData() {
      const typeTable = {
        musicVideos: 1004,
        tracks: 1,
        albums: 10,
        artists: 100,
        playlists: 1000,
      };
      return loadWithProgress(
        search({
          keywords: this.keywords,
          type: typeTable[this.type],
          offset: this.result.length,
        }).then(result => {
          result = result.result;
          this.hasMore = result.hasMore ?? true;
          switch (this.type) {
            case 'musicVideos':
              this.result.push(...result.mvs);
              if (result.mvCount <= this.result.length) {
                this.hasMore = false;
              }
              break;
            case 'artists':
              this.result.push(...result.artists);
              // artists 接口不给总数，靠「空页」判定到底，否则按钮永不出户
              if (result.artists.length === 0) this.hasMore = false;
              break;
            case 'albums':
              this.result.push(...result.albums);
              if (result.albumCount <= this.result.length) {
                this.hasMore = false;
              }
              break;
            case 'tracks':
              this.result.push(...result.songs);
              this.getTracksDetail();
              break;
            case 'playlists':
              this.result.push(...result.playlists);
              if (result.playlists.length === 0) this.hasMore = false;
              break;
          }
          this.show = true;
        })
      );
    },
    getTracksDetail() {
      const trackIDs = this.result.map(t => t.id);
      if (trackIDs.length === 0) return;
      loadOptional(
        getTrackDetail(trackIDs.join(',')).then(result => {
          this.result = result.songs;
        })
      );
    },
  },
};
</script>

<style lang="scss" scoped>
h1 {
  margin-top: 32px;
  margin-bottom: 28px;
  color: var(--color-text);
  span {
    opacity: 0.58;
  }
}
.load-more {
  display: flex;
  justify-content: center;
  margin-top: 32px;
}

.button.more {
  .svg-icon {
    height: 24px;
    width: 24px;
  }
}
</style>
