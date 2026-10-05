<template>
  <div class="newAlbum">
    <h1>{{ $t('home.newAlbum') }}</h1>
    <div class="playlist-row">
      <div class="playlists">
        <CoverRow
          type="album"
          :items="albums"
          sub-text="artist"
          :show-play-button="true"
        />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { newAlbums } from '@/api/album';
import { loadWithProgress } from '@/utils/pageLoad';
import CoverRow from '@/components/CoverRow.vue';
import { ref } from 'vue';

const albums = ref<any>([]);

loadWithProgress(
  newAlbums({
    area: 'EA',
    limit: 100,
  }).then(data => {
    albums.value = data.albums;
  })
);
</script>

<style lang="scss" scoped>
h1 {
  color: var(--color-text);
  font-size: 56px;
}
</style>
