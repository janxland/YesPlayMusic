<template>
  <svg-icon icon-class="explicit" :style="svgStyle"></svg-icon>
</template>

<script setup lang="ts">
import SvgIcon from '@/components/SvgIcon.vue';
import { ref } from 'vue';

const props = defineProps({
  size: {
    type: Number,
    default: 16,
  },
});

const svgStyle = ref<any>({});
svgStyle.value = {
  height: props.size + 'px',
  width: props.size + 'px',
  position: 'relative',
  left: '-1px',
};
</script>

<style lang="scss" scoped></style>
