/**
 * P0.7 实体类型地基（宽松起步）。
 *
 * 规则：
 * - 纯类型文件，零运行时影响，可被任何层 import（依赖方向铁律的最底层）。
 * - 未知字段先以索引签名 `any` 放行，随 D4 API 层 TS 化逐步收紧为具体类型。
 * - 字段命名与网易云 API 返回结构对齐（ar/al/dt 等缩写字段保留原名）。
 */

/** 用户账号 */
export interface User {
  userId: number;
  nickname: string;
  avatarUrl: string;
  signature?: string;
  backgroundUrl?: string;
  vipType?: number;
  [key: string]: any;
}

/** 歌手 */
export interface Artist {
  id: number;
  name: string;
  img1v1Url?: string;
  picUrl?: string;
  alias?: string[];
  briefDesc?: string;
  albumSize?: number;
  mvSize?: number;
  musicSize?: number;
  [key: string]: any;
}

/** 专辑 */
export interface Album {
  id: number;
  name: string;
  picUrl?: string;
  publishTime?: number;
  size?: number;
  company?: string;
  artists?: Artist[];
  type?: string;
  [key: string]: any;
}

/** 歌曲 */
export interface Track {
  id: number;
  name: string;
  ar?: Artist[];
  artists?: Artist[];
  al?: Album;
  album?: Album;
  dt?: number;
  duration?: number;
  t?: number;
  fee?: number;
  privilege?: Privilege;
  [key: string]: any;
}

/** 播放权限 */
export interface Privilege {
  id: number;
  fee: number;
  pl: number;
  dl: number;
  st: number;
  [key: string]: any;
}

/** 歌单 */
export interface Playlist {
  id: number;
  name: string;
  coverImgUrl?: string;
  picUrl?: string;
  userId?: number;
  playCount?: number;
  trackCount?: number;
  updateTime?: number;
  createTime?: number;
  description?: string;
  creator?: User;
  tracks?: Track[];
  trackIds?: { id: number; [key: string]: any }[];
  [key: string]: any;
}

/** MV */
export interface MV {
  id: number;
  name: string;
  cover?: string;
  coverUrl?: string;
  playCount?: number;
  duration?: number;
  publishTime?: string;
  artists?: Artist[];
  artistName?: string;
  artistId?: number;
  data?: MVDetail;
  [key: string]: any;
}

/** MV 详情接口返回 */
export interface MVDetail {
  id?: number;
  cover?: string;
  playCount?: number;
  publishTime?: string;
  artists?: Artist[];
  brs?: { [quality: string]: string };
  [key: string]: any;
}

/** 每日推荐歌曲（日推接口） */
export interface DailyTrack {
  id: number;
  name?: string;
  mainSong?: Track;
  [key: string]: any;
}
