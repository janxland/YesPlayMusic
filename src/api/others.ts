import request from '@/utils/request';
import { bust } from './internal';
import { mapTrackPlayableStatus } from '@/utils/common';
import axios from 'axios';
// 搜索：keywords 空格分隔多关键词；limit 默认 30；type 默认 1 单曲，10 专辑 / 100 歌手 / 1000 歌单 / 1002 用户 / 1004 MV / 1006 歌词 / 1009 电台 / 1014 视频 / 1018 综合；所得 mp3url 不可直接用，需经 /song/url
export function search(params: any) {
  return request({
    url: '/search',
    method: 'get',
    params: {
      ...params,
    },
  }).then(data => {
    if (data.result?.song !== undefined)
      data.result.song.songs = mapTrackPlayableStatus(data.result.song.songs);
    return data;
  });
}

export function personalFM() {
  return request({
    url: '/personal_fm',
    method: 'get',
    params: {
      timestamp: bust(),
    },
  });
}

export function fmTrash(id: any) {
  return request({
    url: '/fm_trash',
    method: 'post',
    params: {
      timestamp: bust(),
      id,
    },
  });
}

/** 全域管理配置里的字体设置（App.vue 启动时拉取并落盘 localStorage.fonts） */
interface FlexiSiteResponse {
  code?: number;
  data?: {
    value?: {
      fonts: { name: string; href?: string; import?: string }[];
    };
  };
}

// 获取全域管理配置 无需理会
export function flexiSite(id: any): Promise<FlexiSiteResponse> {
  return new Promise((resolve, reject) => {
    axios
      .get('/api/kv/key-value/public/query', {
        params: { id },
      })
      .then(res => {
        resolve(res.data);
      })
      .catch(err => {
        reject(err);
      });
  });
}
