import request from '@/utils/request';
import { bust } from './internal';
import { mapTrackPlayableStatus } from '@/utils/common';

// 推荐歌单：limit 默认 30（不支持 offset）
export function recommendPlaylist(params: any) {
  return request({
    url: '/personalized',
    method: 'get',
    params,
  });
}
// 每日推荐歌单（需登录）
export function dailyRecommendPlaylist(params?: any) {
  return request({
    url: '/recommend/resource',
    method: 'get',
    params: {
      params,
      timestamp: bust(),
    },
  });
}
// 歌单详情：tracks 不完整但 trackIds 完整，可用全部 trackIds 再请求 song/detail；
// 未登录只能取不完整歌单。s 为最近收藏者数量，默认 8。
export function getPlaylistDetail(
  id: any,
  noCache: boolean = false,
  server: any = undefined
) {
  let params: Record<string, any> = { id };
  // noCache 即击穿缓存（改 timestamp 换 key）：当前传 true 的调用点都是有意的
  // fresh 请求（收藏后回读歌单 / liked 详情刷新 / 专项歌单回填），server 只是
  // 音源选择，与是否击穿无关
  if (noCache) params.timestamp = bust();
  return request({
    url: '/playlist/detail',
    method: 'get',
    params: {
      ...params,
      server,
    },
    // 30s 内存级 SWR：连续点同一歌单封面 / 多组件共用，直接命中。
    memoryCache: { ttl: 30_000 },
    requestTag: `playlist:${id}`,
  }).then(data => {
    if (data.playlist) {
      if (data.playlist.source) {
        return data;
      }
      data.playlist.tracks = mapTrackPlayableStatus(
        data.playlist.tracks,
        data.privileges || []
      );
    }
    return data;
  });
}
// 精品歌单：cat tag 默认 "全部"（列表见 /playlist/highquality/tags）；limit 默认 20；before 取上一页最后歌单的 updateTime 分页
export function highQualityPlaylist(params: any) {
  return request({
    url: '/top/playlist/highquality',
    method: 'get',
    params,
  });
}

// 网友精选碟歌单：order 'new'/'hot' 默认 'hot'；cat 默认 "全部"（分类见 /playlist/catlist）；limit 默认 50
export function topPlaylist(params: any) {
  return request({
    url: '/top/playlist',
    method: 'get',
    params,
  });
}

// 歌单分类（含 category 信息）
export function playlistCatlist() {
  return request({
    url: '/playlist/catlist',
    method: 'get',
  });
}

// 所有榜单
export function toplists() {
  return request({
    url: '/toplist',
    method: 'get',
  });
}

// 收藏/取消收藏歌单：t 1 收藏 / 2 取消
export function subscribePlaylist(params: any) {
  params.timestamp = bust();
  return request({
    url: '/playlist/subscribe',
    method: 'post',
    params,
  });
}

// 删除歌单：id 可多个，逗号隔开
export function deletePlaylist(id: any) {
  return request({
    url: '/playlist/delete',
    method: 'post',
    params: { id },
  });
}

// 新建歌单：privacy 传 '10' 为隐私歌单；type 传 'VIDEO' 为视频歌单
export function createPlaylist(params: any) {
  params.timestamp = bust();
  return request({
    url: '/playlist/create',
    method: 'post',
    params,
  });
}

// 歌单增删歌曲（需登录）：op 'add'/'del'，pid 歌单 id，tracks 歌曲 id 逗号隔开
export function addOrRemoveTrackFromPlaylist(params: any) {
  params.timestamp = bust();
  return request({
    url: '/playlist/tracks',
    method: 'post',
    params,
  });
}

// 每日推荐歌曲（需登录）
export function dailyRecommendTracks() {
  return request({
    url: '/recommend/songs',
    method: 'get',
    params: { timestamp: bust() },
  }).then(result => {
    result.data.dailySongs = mapTrackPlayableStatus(
      result.data.dailySongs,
      result.data.privileges
    );
    return result;
  });
}

// 心动模式/智能播放（需登录）：id 歌曲 id，pid 歌单 id，sid 起播歌曲 id（可选）
export function intelligencePlaylist(params: any) {
  return request({
    url: '/playmode/intelligence/list',
    method: 'get',
    params,
  });
}
