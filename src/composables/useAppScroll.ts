import { inject, provide, type InjectionKey } from 'vue';

// 滚动控制桥：App.vue 持有 main/Scrollbar 实例，视图层经 provide/inject 调用
// （替代 Vue2 的 $root.$refs.main，避免 Vue3 ref 名对不上时静默拿到 undefined）
export interface AppScrollControl {
  scrollTo: (options: ScrollToOptions | number, y?: number) => void;
  restorePosition: () => void;
}

const key: InjectionKey<AppScrollControl> = Symbol('appScroll');

export function provideAppScroll(control: AppScrollControl) {
  provide(key, control);
}

export function useAppScroll(): AppScrollControl {
  const control = inject(key);
  if (!control) {
    throw new Error(
      'useAppScroll() 只能在 App.vue provideAppScroll 之后调用（视图层直接用即可）'
    );
  }
  return control;
}
