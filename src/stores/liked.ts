import { ref } from 'vue';
import { defineStore } from 'pinia';
import { isAccountLoggedIn, isLooseLoggedIn } from '@/utils/auth';
import { likeATrack, getTrackDetail } from '@/api/track';
import { getPlaylistDetail } from '@/api/playlist';
import {
  userPlaylist,
  userPlayHistory,
  userLikedSongsIDs,
  likedAlbums,
  likedArtists,
  likedMVs,
  cloudDisk,
} from '@/api/user';
import { usePlayerStore } from './player';
import { useDataStore } from './data';
import { useUiStore } from './ui';

// 红心与收藏域（不落盘，登录后拉取）
export const useLikedStore = defineStore('liked', () => {
  const liked = ref<Record<string, any>>({
    songs: [],
    songsWithDetails: [], // 只有前12首
    playlists: [],
    albums: [],
    artists: [],
    mvs: [],
    cloudDisk: [],
    playHistory: {
      weekData: [],
      allData: [],
    },
  });

  function updateLikedXXX({ name, data }: { name: string; data: unknown }) {
    liked.value[name] = data;
    if (name === 'songs') {
      usePlayerStore().player.sendSelfToIpcMain();
    }
  }
  function likeATrackAction(id: number) {
    if (!isAccountLoggedIn()) {
      useUiStore().showToast('此操作需要登录网易云账号');
      return;
    }
    const wasLiked = liked.value.songs.includes(id);
    const apply = (likedState: boolean) =>
      updateLikedXXX({
        name: 'songs',
        data: likedState
          ? [...liked.value.songs, id]
          : liked.value.songs.filter((d: number) => d !== id),
      });
    // 乐观更新：点击即刻翻转红心，失败回滚；原先 push 的是同一数组引用，
    // 依赖 songs 的组件可能根本不重渲染
    apply(!wasLiked);
    likeATrack({ id, like: !wasLiked })
      .then(() => {
        fetchLikedSongsWithDetails();
      })
      .catch(() => {
        apply(wasLiked);
        useUiStore().showToast('操作失败，专辑下架或版权锁定');
      });
  }
  function fetchLikedSongs() {
    if (!isLooseLoggedIn()) return;
    if (isAccountLoggedIn()) {
      return userLikedSongsIDs({
        uid: useDataStore().data.user.userId,
      }).then(result => {
        if (result.ids) {
          updateLikedXXX({
            name: 'songs',
            data: result.ids,
          });
        }
      });
    } else {
      // TODO:搜索ID登录的用户
    }
  }
  function fetchLikedSongsWithDetails() {
    return getPlaylistDetail(
      useDataStore().data.likedSongPlaylistID,
      true
    ).then(result => {
      if (result.playlist?.trackIds?.length === 0) {
        return Promise.resolve();
      }
      return getTrackDetail(
        result.playlist.trackIds
          .slice(0, 12)
          .map((t: { id: number }) => t.id)
          .join(',')
      ).then(result => {
        updateLikedXXX({
          name: 'songsWithDetails',
          data: result.songs,
        });
      });
    });
  }
  function fetchLikedPlaylist() {
    if (!isLooseLoggedIn()) return;
    if (isAccountLoggedIn()) {
      return userPlaylist({
        uid: useDataStore().data.user?.userId,
        limit: 2000, // 最多只加载2000个歌单（等有用户反馈问题再修）
        timestamp: new Date().getTime(),
      }).then(result => {
        if (result.playlist) {
          updateLikedXXX({
            name: 'playlists',
            data: result.playlist,
          });
          // 更新用户”喜欢的歌曲“歌单ID
          useDataStore().updateData({
            key: 'likedSongPlaylistID',
            value: result.playlist[0].id,
          });
        }
      });
    } else {
      // TODO:搜索ID登录的用户
    }
  }
  function fetchLikedAlbums() {
    if (!isAccountLoggedIn()) return;
    return likedAlbums({ limit: 2000 }).then(result => {
      if (result.data) {
        updateLikedXXX({
          name: 'albums',
          data: result.data,
        });
      }
    });
  }
  function fetchLikedArtists() {
    if (!isAccountLoggedIn()) return;
    return likedArtists({ limit: 2000 }).then(result => {
      if (result.data) {
        updateLikedXXX({
          name: 'artists',
          data: result.data,
        });
      }
    });
  }
  function fetchLikedMVs() {
    if (!isAccountLoggedIn()) return;
    return likedMVs({ limit: 1000 }).then(result => {
      if (result.data) {
        updateLikedXXX({
          name: 'mvs',
          data: result.data,
        });
      }
    });
  }
  function fetchCloudDisk() {
    if (!isAccountLoggedIn()) return;
    // FIXME: #1242
    return cloudDisk({ limit: 1000 }).then(result => {
      if (result.data) {
        updateLikedXXX({
          name: 'cloudDisk',
          data: result.data,
        });
      }
    });
  }
  function fetchPlayHistory() {
    if (!isAccountLoggedIn()) return;
    const uid = useDataStore().data.user?.userId;
    return Promise.all([
      userPlayHistory({ uid, type: 0 }),
      userPlayHistory({ uid, type: 1 }),
    ]).then(result => {
      const data: Record<string, unknown> = {};
      const dataType = { 0: 'allData', 1: 'weekData' };
      if (result[0] && result[1]) {
        for (let i = 0; i < result.length; i++) {
          const songData = result[i][dataType[i]].map((item: any) => {
            const song = item.song;
            song.playCount = item.playCount;
            return song;
          });
          data[dataType[i]] = songData;
        }
        updateLikedXXX({
          name: 'playHistory',
          data: data,
        });
      }
    });
  }

  return {
    liked,
    updateLikedXXX,
    likeATrack: likeATrackAction,
    fetchLikedSongs,
    fetchLikedSongsWithDetails,
    fetchLikedPlaylist,
    fetchLikedAlbums,
    fetchLikedArtists,
    fetchLikedMVs,
    fetchCloudDisk,
    fetchPlayHistory,
  };
});
