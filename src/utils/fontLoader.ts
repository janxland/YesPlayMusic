import { useUiStore } from '@/stores/ui';

// 字体注入的唯一实现（App.vue 启动链与 settings store 换字体共用，收口消重复）：
// media="print" 技巧避免阻塞渲染，加载完成后切换为 all；
// onerror 死链自愈：字体 CSS 不可达时把该条目移出字体列表（ui store deep watch 自动落盘），
// 避免每次启动重复请求失效链接；flexiSite 恢复下发后会自动补回。
export function applyFont(fontFamilyName?: string | null) {
  const fontFamily = useUiStore().fonts.find(
    (font: { name: string }) => font.name === fontFamilyName
  );
  const fontUrl = fontFamily?.href;
  if (!fontUrl) return;

  const fontLink = document.createElement('link');
  fontLink.setAttribute('rel', 'stylesheet');
  fontLink.setAttribute('href', fontUrl);
  fontLink.setAttribute('media', 'print');
  fontLink.onload = () => {
    fontLink.media = 'all';
  };
  fontLink.onerror = () => {
    useUiStore().fonts = useUiStore().fonts.filter(
      f => f?.name !== fontFamily?.name
    );
  };
  document.head.appendChild(fontLink);
  document.documentElement.style.setProperty(
    '--globalFont',
    fontFamily?.import
  );
}
