import { getPlaylistDetail } from '@/api/playlist';
import { usePlayerStore, useUiStore } from '@/stores';

// 播放第三方平台歌单：拉详情、过滤可播曲目后整单替换进播放器
export function useCrossPlatformPlay() {
  const playerStore = usePlayerStore();
  const showToast = useUiStore().showToast;

  function playThisListByTrack(id, server, toastText?) {
    if (toastText) showToast(toastText);
    getPlaylistDetail(id, true, server)
      .then(data => {
        const playlist = data.playlist;
        // playable == 1 沿用原弱等于判断：部分平台返回字符串 "1"
        const tracks = (playlist?.tracks ?? []).filter(_track => {
          return _track.playable == 1;
        });
        if (tracks.length === 0) {
          showToast('该歌单没有可播放的曲目');
          return;
        }
        playerStore.player.replacePlaylist(
          tracks,
          playlist.id || id,
          'artist',
          tracks[0]
        );
      })
      .catch(err => {
        console.warn('[useCrossPlatformPlay]', err?.message || err);
        showToast('播放列表加载失败');
      });
  }

  return { playThisListByTrack };
}
