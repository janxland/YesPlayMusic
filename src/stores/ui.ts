import { ref, shallowRef, watch } from 'vue';
import { defineStore } from 'pinia';
import type { Track } from '@/types/entities';
import { readLocalStorageJSON } from '@/utils/storage';

/**
 * 界面状态域：歌词页开关、滚动、toast、模态框、每日推荐、字体与可视化设置。
 * fonts/visualSet 各自落盘（localStorage key: 'fonts' / 'visualSet'，冻结不变）。
 */
export const useUiStore = defineStore('ui', () => {
  const showLyrics = ref(false);
  const enableScrolling = ref(true);
  const title = ref('YesPlayMusic');

  const toast = ref({
    show: false,
    text: '',
    timer: null as ReturnType<typeof setTimeout> | null,
  });

  // Service Worker 已装上新版本、等待用户点「刷新应用」时置 true
  const swNeedsRefresh = ref(false);

  const modals = ref({
    addTrackToPlaylistModal: {
      show: false,
      selectedTrackID: 0,
    },
    newPlaylistModal: {
      show: false,
      afterCreateAddTrackID: 0,
    },
  });

  // 只会整体替换（updateDailyTracks），用 shallowRef 免去对每首曲目对象的
  // 深层 Proxy 包裹；消费方只读展示，不就地改嵌套字段
  const dailyTracks = shallowRef<Track[]>([]);

  const fonts = ref<any[]>(readLocalStorageJSON('fonts', []));

  // 字体名单一事实源是 settings.fontFamilyName + localStorage('fontFamilyName')
  // （settings.vue 直写），这里不再放一份永远脱节的镜像状态

  // 歌词透视 / 旋转 / 大小（可视化面板调节，持久化到 localStorage）
  const visualSet = ref<Record<string, any>>({
    perspective: 1000,
    rotateY: 0,
    lyricsScale: 1,
    ...readLocalStorageJSON('visualSet', {}),
  });

  // ---- 持久化 ----
  watch(fonts, v => localStorage.setItem('fonts', JSON.stringify(v)), {
    deep: true,
  });
  watch(visualSet, v => localStorage.setItem('visualSet', JSON.stringify(v)), {
    deep: true,
  });

  function updateToast(toastPayload: {
    show: boolean;
    text: string;
    timer: ReturnType<typeof setTimeout> | null;
  }) {
    toast.value = toastPayload;
  }
  function showToast(text: string) {
    if (toast.value.timer !== null) {
      clearTimeout(toast.value.timer);
      updateToast({ show: false, text: '', timer: null });
    }
    updateToast({
      show: true,
      text,
      timer: setTimeout(() => {
        updateToast({
          show: false,
          text: toast.value.text,
          timer: null,
        });
      }, 3200),
    });
  }
  function updateModal({
    modalName,
    key,
    value,
  }: {
    modalName: string;
    key: string;
    value: unknown;
  }) {
    modals.value[modalName][key] = value;
    if (key === 'show') {
      // 100ms的延迟是为等待右键菜单blur之后再disableScrolling
      value === true
        ? setTimeout(() => (enableScrolling.value = false), 100)
        : (enableScrolling.value = true);
    }
  }
  function toggleLyrics() {
    showLyrics.value = !showLyrics.value;
  }
  function toggleScrolling(status: boolean | null = null) {
    // ?? 而非真值判断：调用点传 false 意为「禁滚动」，
    // 真值判断会在已禁用时把 false 误判成「切换」而错误解锁
    enableScrolling.value = status ?? !enableScrolling.value;
  }
  function updateTitle(titlePayload: string) {
    title.value = titlePayload;
  }
  function updateSwNeedsRefresh(value: boolean) {
    swNeedsRefresh.value = value;
  }
  function updateDailyTracks(dailyTracksPayload: Track[]) {
    dailyTracks.value = dailyTracksPayload;
  }

  return {
    showLyrics,
    enableScrolling,
    title,
    toast,
    swNeedsRefresh,
    modals,
    dailyTracks,
    fonts,
    visualSet,
    showToast,
    updateModal,
    toggleLyrics,
    toggleScrolling,
    updateTitle,
    updateSwNeedsRefresh,
    updateDailyTracks,
  };
});
