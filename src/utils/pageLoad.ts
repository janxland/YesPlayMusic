import NProgress from 'nprogress';
import { useUiStore } from '@/stores';

// 页面主数据加载守卫：进度条立即启动，失败必 toast（旧链路无 catch 一次失败即白屏）。
// onError 用于失败时仍要交出页面骨架 / 释放忙态的场合。
export function loadWithProgress(
  promise: Promise<unknown>,
  {
    failText = '加载失败，请检查网络后重试',
    onError,
  }: { failText?: string; onError?: (err: unknown) => void } = {}
) {
  NProgress.start();
  return promise
    .catch(err => {
      console.warn('[pageLoad]', err?.message || err);
      useUiStore().showToast(failText);
      onError?.(err);
    })
    .finally(() => NProgress.done());
}

/** 次要请求（补充标记、推荐列表等）：失败静默，但不留未处理 rejection。 */
export function loadOptional(promise: Promise<unknown> | undefined) {
  // fetchLikedSongs 等在宽松登录态下返回 undefined，不能直接 .catch
  return promise?.catch(err =>
    console.warn('[pageLoad][optional]', err?.message || err)
  );
}
