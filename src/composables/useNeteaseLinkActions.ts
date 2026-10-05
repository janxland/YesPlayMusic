import { copyToClipboard } from '@/utils/clipboard';
import { getI18n } from '@/locale';
import { useUiStore } from '@/stores';

// 「复制链接 / 在浏览器打开」网易云分享动作，entityPath 为 album/artist/mv
export function useNeteaseLinkActions(entityPath: string) {
  const showToast = useUiStore().showToast;

  function neteaseUrl(id) {
    return `https://music.163.com/#/${entityPath}?id=${id}`;
  }

  function copyUrl(id) {
    copyToClipboard(neteaseUrl(id))
      .then(function () {
        showToast((getI18n() as any).global.t('toast.copied'));
      })
      .catch(error => {
        showToast(`${(getI18n() as any).global.t('toast.copyFailed')}${error}`);
      });
  }

  function openInBrowser(id) {
    window.open(neteaseUrl(id));
  }

  return { copyUrl, openInBrowser };
}
