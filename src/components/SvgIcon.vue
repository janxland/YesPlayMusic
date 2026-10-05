<template>
  <svg :class="svgClass" aria-hidden="true">
    <use :xlink:href="iconName" />
  </svg>
</template>

<script setup lang="ts">
import { computed } from 'vue';

const props = defineProps({
  iconClass: {
    type: String,
    required: true,
  },
  className: {
    type: String,
    default: '',
  },
});

const iconName = computed(function iconName() {
  return `#icon-${props.iconClass}`;
});

const svgClass = computed(function svgClass() {
  if (props.className) {
    return 'svg-icon ' + props.className;
  } else {
    return 'svg-icon';
  }
});
</script>

<style scoped>
.svg-icon {
  fill: currentColor;
}
</style>
