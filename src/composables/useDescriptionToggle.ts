import { ref } from 'vue';
import { useUiStore } from '@/stores';

// 「点击简介展开完整介绍」弹窗开关 + 开时锁滚动/关时恢复
export function useDescriptionToggle() {
  const showFullDescription = ref(false);

  function toggleFullDescription() {
    showFullDescription.value = !showFullDescription.value;
    useUiStore().toggleScrolling(!showFullDescription.value);
  }

  return { showFullDescription, toggleFullDescription };
}
