/**
 * 音源解析：给定曲目，找出它此刻能播放的地址。
 *
 * 三级降级：本机 IndexedDB → 网易云直链 → UnblockNeteaseMusic 回源。
 * 同曲目并发在此层去重（连点 / 重试 / 预缓存重叠只会发一次 /song/url）。
 */
import { getMP3, unblock } from '@/api/track';
import { cacheTrackSource, getTrackSource } from '@/utils/db';
import { decode as base642Buffer } from '@/utils/base64';
import { ipcRenderer } from '@/utils/platform';
import store from '@/store';

/** 解析中的请求，按 `trackId|allowUnblock` 去重 */
const inflight = new Map();

/** 当前在用的 blob URL，下一首产生时释放，否则音频数据会随切歌单调增长 */
let activeBlobURL = null;

/** 用户显式开启「自动缓存歌曲」才写 IndexedDB */
const shouldPersist = () =>
  store.state.settings.automaticallyCacheSongs === true;

/** UNM 检索策略，主进程侧按数字区分 */
const searchModeCode = mode => (mode === 'order-first' ? 1 : 0);

/** 包成可播放地址，并释放上一首占用的 URL */
function toBlobURL(data) {
  if (activeBlobURL) URL.revokeObjectURL(activeBlobURL);
  activeBlobURL = URL.createObjectURL(new Blob([data]));
  return activeBlobURL;
}

/** 本机缓存命中即可直接播放，连网都不用发 */
function fromCache(trackId) {
  return getTrackSource(trackId)
    .then(cached => (cached?.source ? toBlobURL(cached.source) : null))
    .catch(err => {
      console.warn(
        '[audioSource] read track source cache failed:',
        err?.message || err
      );
      return null;
    });
}

/** freeTrialInfo 非空代表只有试听片段，判为无源让上层跳下一首 */
function fromNetease(track) {
  return getMP3(track.id)
    .then(result => {
      const [item] = result?.data ?? [];
      if (!item?.url) return null;
      if (item.freeTrialInfo !== null) return null;
      const url = item.url.replace(/^http:/, 'https:');
      if (shouldPersist()) cacheTrackSource(track, url, item.br);
      return url;
    })
    .catch(err => {
      console.warn(
        '[audioSource] getMP3 failed:',
        err?.message || err,
        'trackId=',
        track.id
      );
      return null;
    });
}

/** Web 端（或用户关闭桌面端解灰）走服务端代理解灰 */
function unblockViaServer(track) {
  return unblock(track.id)
    .then(result => result?.url ?? null)
    .catch(err => {
      console.warn('[audioSource] unblock failed:', err?.message || err);
      return null;
    });
}

/** 桌面端解灰。参数顺序与 ipcMain.js 的 unblock-music handler 对应，需两侧同步 */
async function unblockViaElectron(track) {
  const info = await ipcRenderer.invoke(
    'unblock-music',
    store.state.settings.unmSource,
    track,
    {
      enableFlac: store.state.settings.unmEnableFlac || null,
      proxyUri: store.state.settings.unmProxyUri || null,
      searchMode: searchModeCode(store.state.settings.unmSearchMode),
      config: {
        'joox:cookie': store.state.settings.unmJooxCookie || null,
        'qq:cookie': store.state.settings.unmQQCookie || null,
        'ytdl:exe': store.state.settings.unmYtDlExe || null,
      },
    }
  );
  if (!info?.url) return null;

  // bilibili 返回的是音频数据的 base64，其余是直链
  if (info.source !== 'bilibili') return info.url;

  const buffer = base642Buffer(info.url);
  const blobURL = toBlobURL(buffer);
  if (shouldPersist()) {
    const playableURL = `data:application/octet-stream;base64,${info.url}`;
    cacheTrackSource(track, playableURL, 128000, `unm:${info.source}`);
  }
  return blobURL;
}

/**
 * @param {object} track
 * @returns {Promise<string|null>}
 */
function fromUnblockMusic(track) {
  if (
    process.env.IS_ELECTRON !== true ||
    store.state.settings.enableUnblockNeteaseMusic === false
  ) {
    return unblockViaServer(track);
  }
  return unblockViaElectron(track).catch(err => {
    console.warn(
      '[audioSource] unblock(Electron) failed:',
      err?.message || err,
      'trackId=',
      track.id
    );
    return null;
  });
}

/**
 * 解析出 track 的可播放地址。
 *
 * @param {object} track
 * @param {{ allowUnblock?: boolean }} [options] 预缓存应传 false：
 *   只为下一首提前拿官方源，不值得触发解灰的多源搜索。
 * @returns {Promise<string|null>}
 */
export function resolveAudioSource(track, { allowUnblock = true } = {}) {
  const key = `${track.id}|${allowUnblock}`;
  if (inflight.has(key)) return inflight.get(key);

  const pending = fromCache(String(track.id))
    .then(cached => {
      if (cached) return cached;
      return fromNetease(track).then(
        netease => netease ?? (allowUnblock ? fromUnblockMusic(track) : null)
      );
    })
    .finally(() => inflight.delete(key));

  inflight.set(key, pending);
  return pending;
}
