import { onActivated, onMounted } from 'vue';

// keep-alive 视图数据加载钩子：Vue3 首次挂载会同帧触发 onMounted + onActivated，
// 首次激活跳过以保证 loadData 首屏只跑一遍，之后每次重新激活再跑。
export function useKeepAliveLoad(load: () => void) {
  let firstActivation = true;
  onMounted(load);
  onActivated(function activated() {
    if (firstActivation) {
      firstActivation = false;
      return;
    }
    load();
  });
}
