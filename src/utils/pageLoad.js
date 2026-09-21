import NProgress from 'nprogress';
import store from '@/store';

/**
 * 页面主数据加载守卫：进度条立即启动（旧实现的 1s 延时是反馈真空）、
 * 失败必 toast（旧链路无 catch，一次网络失败即永久白屏）。
 * onError 用于失败时仍要交出页面骨架 / 释放忙态的场合。
 */
export function loadWithProgress(
  promise,
  { failText = '加载失败，请检查网络后重试', onError } = {}
) {
  NProgress.start();
  return promise
    .catch(err => {
      console.warn('[pageLoad]', err?.message || err);
      store.dispatch('showToast', failText);
      onError?.(err);
    })
    .finally(() => NProgress.done());
}

/** 次要请求（补充标记、推荐列表等）：失败静默，但不留未处理 rejection。 */
export function loadOptional(promise) {
  return promise.catch(err =>
    console.warn('[pageLoad][optional]', err?.message || err)
  );
}
