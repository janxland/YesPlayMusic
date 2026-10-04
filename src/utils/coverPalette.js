import * as Vibrant from 'node-vibrant/dist/vibrant.worker.min.js';

// 同一张封面重复取色（起 worker + 解码图片）代价高：切歌回退、重进歌词页
// 都会原样重算。按 URL 缓存 promise 去重；失败不缓存，下次可重试。
const cache = new Map();
const MAX_CACHE = 50;

export function getCoverPalette(cover) {
  if (!cache.has(cover)) {
    const p = Vibrant.from(cover, { colorCount: 1 }).getPalette();
    p.catch(() => cache.delete(cover));
    cache.set(cover, p);
    if (cache.size > MAX_CACHE) {
      const oldest = cache.keys().next().value;
      if (oldest !== cover) cache.delete(oldest);
    }
  }
  return cache.get(cover);
}
