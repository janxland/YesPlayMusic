import request from '@/utils/request';
import { bust } from './internal';
import { mapTrackPlayableStatus } from '@/utils/common';
import { isAccountLoggedIn } from '@/utils/auth';
import { getTrackDetail } from '@/api/track';

// 歌手单曲：部分信息 + 热门歌曲（id 可由搜索接口获得）
export function getArtist(id: any) {
  return request({
    url: '/artists',
    method: 'get',
    params: {
      id,
      timestamp: bust(),
    },
  }).then(async data => {
    if (!isAccountLoggedIn()) {
      const trackIDs = data.hotSongs.map(t => t.id);
      const tracks = await getTrackDetail(trackIDs.join(','));
      data.hotSongs = tracks.songs;
      return data;
    }
    data.hotSongs = mapTrackPlayableStatus(data.hotSongs);
    return data;
  });
}

// 歌手专辑：limit 默认 50，offset 分页偏移
export function getArtistAlbum(params: any) {
  return request({
    url: '/artist/album',
    method: 'get',
    params,
  });
}

// 歌手榜：type 地区 1 华语 / 2 欧美 / 3 韩国 / 4 日本
export function toplistOfArtists(type: any = null) {
  let params: Record<string, any> = {};
  if (type) {
    params.type = type;
  }
  return request({
    url: '/toplist/artist',
    method: 'get',
    params,
  });
}
// 歌手 MV：将 mvid 传给 /mv 可取播放地址
export function artistMv(params: any) {
  return request({
    url: '/artist/mv',
    method: 'get',
    params,
  });
}

// 收藏歌手：t=1 收藏，其他取消
export function followAArtist(params: any) {
  return request({
    url: '/artist/sub',
    method: 'post',
    params,
  });
}

// 相似歌手
export function similarArtists(id: any) {
  return request({
    url: '/simi/artist',
    method: 'post',
    params: { id },
  });
}
