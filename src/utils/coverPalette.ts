// 用 dist 纯主线程 UMD 包：包默认入口在 Vite 下 worker 装配会崩（WorkerClass not a constructor）
import Vibrant from 'node-vibrant/dist/vibrant.min.js';

// 按 URL 缓存 promise 去重（切歌回退、重进歌词页会原样重算）；失败不缓存可重试
const cache = new Map();
const MAX_CACHE = 50;

export function getCoverPalette(cover) {
  if (!cache.has(cover)) {
    // 主线程同步取色（256/512px 封面可接受）；from(src) 单参即可
    const p = Vibrant.from(cover).getPalette();
    p.catch(() => cache.delete(cover));
    cache.set(cover, p);
    if (cache.size > MAX_CACHE) {
      const oldest = cache.keys().next().value;
      if (oldest !== cover) cache.delete(oldest);
    }
  }
  return cache.get(cover);
}
