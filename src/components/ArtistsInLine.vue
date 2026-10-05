<template>
  <span class="artist-in-line">
    {{ computedPrefix }}
    <span v-for="(ar, index) in filteredArtists" :key="ar.id ?? ar.name">
      <router-link
        v-if="ar.id !== 0"
        :to="otherServerAccess ? `/artist/${ar.id}` : { path: $route.fullPath }"
        >{{ ar.name }}</router-link
      >
      <span v-else>{{ ar.name }}</span>
      <span v-if="index !== filteredArtists.length - 1" class="separator"
        >,</span
      >
    </span>
  </span>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import type { PropType } from 'vue';
import type { Artist } from '@/types/entities';

const props = defineProps({
  artists: {
    type: Array as PropType<Artist[]>,
    required: true,
  },
  exclude: {
    type: String,
    default: '',
  },
  prefix: {
    type: String,
    default: '',
  },
  otherServerAccess: {
    type: Boolean,
    default: true,
  },
});

const filteredArtists = computed(function filteredArtists() {
  return props.artists.filter(a => a.name !== props.exclude);
});

const computedPrefix = computed(function computedPrefix() {
  if (filteredArtists.value.length !== 0) return props.prefix;
  else return '';
});
</script>

<style lang="scss" scoped>
.separator {
  /* make separator distinct enough in long list */
  margin-left: 1px;
  margin-right: 4px;
  position: relative;
  top: 0.5px;
}
</style>
