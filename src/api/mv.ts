import request from '@/utils/request';
import { bust } from './internal';

// mv 数据：视频地址有防盗链，播放需另调 mvUrl；mvid 可在搜索时传 type=1004 获得
export function mvDetail(mvid: any) {
  return request({
    url: '/mv/detail',
    method: 'get',
    params: {
      mvid,
      timestamp: bust(),
    },
  });
}

// mv 播放地址：r 分辨率默认 1080，可选值来自 mvDetail 的分辨率列表
export function mvUrl(params: any) {
  return request({
    url: '/mv/url',
    method: 'get',
    params,
  });
}

// 相似 mv
export function simiMv(mvid: any) {
  return request({
    url: '/simi/mv',
    method: 'get',
    params: { mvid },
  });
}

// 收藏/取消收藏 MV：t=1 收藏，其他取消

export function likeAMV(params: any) {
  params.timestamp = bust();
  return request({
    url: '/mv/sub',
    method: 'post',
    params,
  });
}
