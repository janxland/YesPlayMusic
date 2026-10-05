import request from '@/utils/request';
import { bust } from './internal';
import { mapTrackPlayableStatus } from '@/utils/common';
import { cacheAlbum, getAlbumFromCache } from '@/utils/db';

// 获取专辑内容：传入专辑 id
export function getAlbum(id: any) {
  const fetchLatest = () => {
    return request({
      url: '/album',
      method: 'get',
      params: {
        id,
      },
    }).then(data => {
      cacheAlbum(id, data);
      data.songs = mapTrackPlayableStatus(data.songs);
      return data;
    });
  };
  return getAlbumFromCache(id).then(result => {
    return result ?? fetchLatest();
  });
}

// 全部新碟（需登录）：limit 默认 30，offset 分页偏移，area: ALL 全部 / ZH 华语 / EA 欧美 / KR 韩国 / JP 日本
export function newAlbums(params: any) {
  return request({
    url: '/album/new',
    method: 'get',
    params,
  });
}

// 专辑动态信息：是否收藏、收藏数、评论数、分享数
export function albumDynamicDetail(id: any) {
  return request({
    url: '/album/detail/dynamic',
    method: 'get',
    params: { id, timestamp: bust() },
  });
}

// 收藏/取消收藏专辑：t=1 收藏，其他取消
export function likeAAlbum(params: any) {
  return request({
    url: '/album/sub',
    method: 'post',
    params,
  });
}
