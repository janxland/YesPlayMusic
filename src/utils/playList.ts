import router from '../router';
import { usePlayerStore, useDataStore } from '@/stores';
import {
  recommendPlaylist,
  dailyRecommendPlaylist,
  getPlaylistDetail,
} from '@/api/playlist';
import { isAccountLoggedIn } from '@/utils/auth';

export function hasListSource() {
  return (
    !usePlayerStore().player.isPersonalFM &&
    usePlayerStore().player.playlistSource.id !== 0
  );
}

export function goToListSource() {
  router.push({ path: getListSourcePath() });
}

export function getListSourcePath() {
  if (
    usePlayerStore().player.playlistSource.id ===
    useDataStore().data.likedSongPlaylistID
  ) {
    return '/library/liked-songs';
  } else if (usePlayerStore().player.playlistSource.type === 'url') {
    return usePlayerStore().player.playlistSource.id;
  } else if (usePlayerStore().player.playlistSource.type === 'cloudDisk') {
    return '/library';
  } else {
    return `/${usePlayerStore().player.playlistSource.type}/${
      usePlayerStore().player.playlistSource.id
    }`;
  }
}

export async function getRecommendPlayList(limit, removePrivateRecommand) {
  if (isAccountLoggedIn()) {
    const playlists = await Promise.all([
      dailyRecommendPlaylist(),
      recommendPlaylist({ limit }),
    ]);
    let recommend = playlists[0].recommend ?? [];
    if (recommend.length) {
      if (removePrivateRecommand) recommend = recommend.slice(1);
      await replaceRecommendResult(recommend);
    }
    return recommend.concat(playlists[1].result).slice(0, limit);
  } else {
    const response = await recommendPlaylist({ limit });
    return response.result;
  }
}

async function replaceRecommendResult(recommend) {
  for (let r of recommend) {
    if (specialPlaylist.indexOf(r.id) > -1) {
      const data = await getPlaylistDetail(r.id, true);
      const playlist = data.playlist;
      if (playlist) {
        r.name = playlist.name;
        r.picUrl = playlist.coverImgUrl;
      }
    }
  }
}

const specialPlaylist = [3136952023, 2829883282, 2829816518, 2829896389];
