import { shallowReactive } from 'vue';
import { defineStore } from 'pinia';
import { createPlayerMirror, onPlayerChange } from '@/player/singleton';

// 播放器域：挂 singleton 的响应式镜像（纯数据 + 方法委托 + 访问器），
// 由 onPlayerChange 单向同步，player 永不反向 import store。
// 用 shallowReactive：Player 侧数据字段均整体重赋值、绝不就地改嵌套，
// 深层 reactive 只会给每首曲目/每个列表包 Proxy 纯属开销；若引入就地嵌套变更须先恢复深 reactive。
export const usePlayerStore = defineStore('player', () => {
  const player = shallowReactive(createPlayerMirror()) as Record<string, any>;

  onPlayerChange((prop, val) => {
    if (typeof val !== 'function')
      (player as Record<PropertyKey, any>)[prop] = val;
  });

  return { player };
});
