/** 本地 SVG 占位图，避免 fallback 再次触发网络 404 被埋点捕获 */
export const COVER_FALLBACK =
  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='300' height='300'%3E%3Crect fill='%23e1e3e8' width='300' height='300' rx='24'/%3E%3C/svg%3E";

if (typeof window !== 'undefined') {
  window.__YPM_COVER_FALLBACK__ = COVER_FALLBACK;
}
