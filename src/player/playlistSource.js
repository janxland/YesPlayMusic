/**
 * 把「资源类型 + id」翻译成可播放队列。
 *
 * 三类详情接口在返回曲目 id 序列的同时都会附带完整曲目对象（歌单 tracks、
 * 专辑 songs、歌手 hotSongs）。旧实现只取 id 序列，再单独请求 /song/detail
 * 取首曲详情，白多一跳串行。这里把曲目对象一并带回，让调用方能跳过那一跳。
 */
import { getAlbum } from '@/api/album';
import { getArtist } from '@/api/artist';
import { getPlaylistDetail } from '@/api/playlist';

/** @param {unknown} tracks @returns {Map<number, object>} */
export function buildTrackIndex(tracks) {
  const index = new Map();
  if (!Array.isArray(tracks)) return index;
  for (const track of tracks) {
    if (track && track.id != null) index.set(track.id, track);
  }
  return index;
}

/**
 * 各资源解析器。
 * 歌单 id 序列必须取自 trackIds（全量），tracks 只是前若干条的详情；
 * 专辑与歌手两处同源。
 */
const LOADERS = {
  album: id =>
    getAlbum(id).then(({ songs = [] }) => ({
      tracks: songs,
      trackIDs: songs.map(t => t.id),
    })),
  playlist: (id, noCache) =>
    getPlaylistDetail(id, noCache).then(({ playlist = {} }) => ({
      tracks: playlist.tracks ?? [],
      trackIDs: (playlist.trackIds ?? []).map(t => t.id),
    })),
  artist: id =>
    getArtist(id).then(({ hotSongs = [] }) => ({
      tracks: hotSongs,
      trackIDs: hotSongs.map(t => t.id),
    })),
};

/** 同一资源正在进行的装载请求，用于合并重复点击 */
const inflight = new Map();

/**
 * @param {'album'|'playlist'|'artist'} type
 * @param {number|string} id
 * @param {{ noCache?: boolean }} [options]
 * @returns {Promise<{ trackIDs: number[], trackIndex: Map<number, object> }>}
 */
export function loadPlaylistSource(type, id, { noCache = false } = {}) {
  const loader = LOADERS[type];
  if (!loader) {
    return Promise.reject(
      new Error(`[playlistSource] unknown source: ${type}`)
    );
  }

  const key = `${type}:${id}`;
  if (inflight.has(key)) return inflight.get(key);

  const pending = loader(id, noCache)
    .then(({ tracks, trackIDs }) => ({
      trackIDs,
      trackIndex: buildTrackIndex(tracks),
    }))
    .finally(() => inflight.delete(key));

  inflight.set(key, pending);
  return pending;
}
