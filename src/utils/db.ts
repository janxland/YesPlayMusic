import axios from 'axios';
import { isDesktop } from '@/platform/env';
import { useSettingsStore } from '@/stores';
import type Dexie from 'dexie';
import type { Table } from 'dexie';
// import pkg from "../../package.json";

// dexie 主包 82KB（主 chunk 最大单体依赖），只有 IndexedDB 缓存路径才需要。
// 改为首次真正访问 DB 时再动态加载，之后复用同一个 DB promise。
type YPMDB = Dexie & {
  trackSources: Table;
  trackDetail: Table;
  lyric: Table;
  album: Table;
};

let dbPromise: Promise<YPMDB> | null = null;

function getDb(): Promise<YPMDB> {
  dbPromise ??= import('dexie').then(({ default: Dexie }) => {
    // 声明 4 张表的实例类型：调用方直接 db.trackDetail 等（Dexie 基类上没有这些属性）
    const db = new Dexie('yesplaymusic') as YPMDB;

    db.version(4).stores({
      trackDetail: '&id, updateTime',
      lyric: '&id, updateTime',
      album: '&id, updateTime',
    });

    db.version(3)
      .stores({
        trackSources: '&id, createTime',
      })
      .upgrade(tx =>
        tx
          .table('trackSources')
          .toCollection()
          .modify(
            track =>
              !track.createTime && (track.createTime = new Date().getTime())
          )
      );

    db.version(1).stores({
      trackSources: '&id',
    });

    return db;
  });
  return dbPromise;
}

let tracksCacheBytes = 0;

// 等待 settings 可用
async function waitForSettingsReady(timeoutMs = 5000) {
  const interval = 100;
  const maxTries = Math.ceil(timeoutMs / interval);
  let tries = 0;
  while (
    (useSettingsStore().settings == null ||
      useSettingsStore().settings.cacheLimit === undefined) &&
    tries < maxTries
  ) {
    await new Promise(resolve => setTimeout(resolve, interval));
    tries++;
  }
  return useSettingsStore().settings;
}

// 初始化现有缓存总大小，确保应用启动时能正确判断并清理超限缓存
async function initTracksCacheBytes() {
  if (!isDesktop()) return;
  try {
    await waitForSettingsReady();
    const db = await getDb();
    const all = await db.trackSources.toArray();
    tracksCacheBytes = all.reduce(
      (sum, t) => sum + (t?.source?.byteLength || 0),
      0
    );
    console.debug(
      '[debug][db.js] initTracksCacheBytes, total bytes:',
      tracksCacheBytes
    );
    deleteExcessCache();
  } catch (err) {
    console.debug('[debug][db.js] initTracksCacheBytes failed', err);
  }
}

// 模块加载时触发初始化（DB 本体仍是懒加载，这里只登记）
initTracksCacheBytes();

async function deleteExcessCache() {
  if (
    useSettingsStore().settings.cacheLimit === false ||
    tracksCacheBytes <
      useSettingsStore().settings.cacheLimit * Math.pow(1024, 2)
  ) {
    return;
  }
  try {
    const db = await getDb();
    const delCache = await db.trackSources.orderBy('createTime').first();
    await db.trackSources.delete(delCache.id);
    tracksCacheBytes -= delCache.source.byteLength;
    console.debug(
      `[debug][db.js] deleteExcessCacheSucces, track: ${delCache.name}, size: ${delCache.source.byteLength}, cacheSize:${tracksCacheBytes}`
    );
    deleteExcessCache();
  } catch (error) {
    console.debug('[debug][db.js] deleteExcessCacheFailed', error);
  }
}

export function cacheTrackSource(trackInfo, url, bitRate, from = 'netease') {
  if (!isDesktop()) return;
  const name = trackInfo.name;
  const artist =
    (trackInfo.ar && trackInfo.ar[0]?.name) ||
    (trackInfo.artists && trackInfo.artists[0]?.name) ||
    'Unknown';
  // 云盘等非标准结构的曲目没有 al，预取封面只是可选优化，无 cover 直接跳过
  let cover = trackInfo.al?.picUrl;
  if (cover && cover.slice(0, 5) !== 'https') {
    cover = 'https' + cover.slice(4);
  }
  if (cover) {
    axios.get(`${cover}?param=512y512`).catch(() => {});
    axios.get(`${cover}?param=224y224`).catch(() => {});
    axios.get(`${cover}?param=1024y1024`).catch(() => {});
  }
  // 调用点均为 fire-and-forget，音频缓存失败只降级（下次播放走网络），不能悬成 unhandled rejection
  return axios
    .get(url, {
      responseType: 'arraybuffer',
    })
    .then(async response => {
      const db = await getDb();
      db.trackSources.put({
        id: trackInfo.id,
        source: response.data,
        bitRate,
        from,
        name,
        artist,
        createTime: new Date().getTime(),
      });
      console.debug(`[debug][db.js] cached track 👉 ${name} by ${artist}`);
      tracksCacheBytes += response.data.byteLength;
      deleteExcessCache();
      return { trackID: trackInfo.id, source: response.data, bitRate };
    })
    .catch(err => {
      console.warn(`[debug][db.js] cache track source failed: ${name}`, err);
    });
}

export function getTrackSource(id) {
  return getDb().then(db =>
    db.trackSources.get(Number(id)).then(track => {
      if (!track) return null;
      console.debug(
        `[debug][db.js] get track from cache 👉 ${track.name} by ${track.artist}`
      );
      return track;
    })
  );
}

export function cacheTrackDetail(track, privileges) {
  getDb()
    .then(db =>
      db.trackDetail.put({
        id: track.id,
        detail: track,
        privileges: privileges,
        updateTime: new Date().getTime(),
      })
    )
    // fire-and-forget 写缓存，失败只降级（下次请求走网络），不能悬成 unhandled rejection
    .catch(err => console.warn('[debug][db.js] cache track detail failed:', err));
}

export function getTrackDetailFromCache(ids) {
  return getDb()
    .then(db =>
      db.trackDetail
        .filter(track => {
          return ids.includes(String(track.id));
        })
        .toArray()
    )
    .then(tracks => {
      const result = { songs: [], privileges: [] };
      ids.map(id => {
        const one = tracks.find(t => String(t.id) === id);
        result.songs.push(one?.detail);
        result.privileges.push(one?.privileges);
      });
      if (result.songs.includes(undefined)) {
        return undefined;
      }
      return result;
    });
}

export function cacheLyric(id, lyrics) {
  getDb()
    .then(db =>
      db.lyric.put({
        id,
        lyrics,
        updateTime: new Date().getTime(),
      })
    )
    .catch(err => console.warn('[debug][db.js] cache lyric failed:', err));
}

export function getLyricFromCache(id) {
  return getDb()
    .then(db => db.lyric.get(id))
    .then(result => {
      if (!result) return undefined;
      return result.lyrics;
    });
}

export function cacheAlbum(id, album) {
  getDb()
    .then(db =>
      db.album.put({
        id: Number(id),
        album,
        updateTime: new Date().getTime(),
      })
    )
    .catch(err => console.warn('[debug][db.js] cache album failed:', err));
}

export function getAlbumFromCache(id) {
  return getDb()
    .then(db => db.album.get(Number(id)))
    .then(result => {
      if (!result) return undefined;
      return result.album;
    });
}

export function countDBSize() {
  const trackSizes = [];
  return getDb()
    .then(db =>
      db.trackSources.each(track => {
        // 写入中断可能留下无 source 的记录，裸读会让整次统计 reject（调用方 catch 后误显示 0KB）
        const size = track?.source?.byteLength;
        if (size) trackSizes.push(size);
      })
    )
    .then(() => {
      const res = {
        bytes: trackSizes.reduce((s1, s2) => s1 + s2, 0),
        length: trackSizes.length,
      };
      tracksCacheBytes = res.bytes;
      console.debug(
        `[debug][db.js] load tracksCacheBytes: ${tracksCacheBytes}`
      );
      return res;
    });
}

export function clearDB() {
  // clear() 本身异步，不等待的话调用方清完立即统计会读到清空前的旧值
  return getDb().then(db =>
    Promise.all(db.tables.map(table => table.clear()))
  );
}
