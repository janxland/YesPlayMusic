import { createI18n } from 'vue-i18n';
import type { LocaleMessages } from 'vue-i18n';

/**
 * vue-i18n 11 composition 模式（legacy:true 已弃用且启动刷警告），
 * 语言包按需加载：启动只拉当前语言，其余在设置页切换时动态注入。
 * 非组件模块（formatters 等）经 getI18n() / getLocale() 读实例与当前 locale。
 */
const LOCALE_LOADERS: Record<
  string,
  () => Promise<{ default: LocaleMessages<Record<string, any>, string> | any }>
> = {
  en: () => import('./lang/en'),
  'zh-CN': () => import('./lang/zh-CN'),
  'zh-TW': () => import('./lang/zh-TW'),
  tr: () => import('./lang/tr'),
};

let _i18n: ReturnType<typeof createI18n> | null = null;
const loadedLocales = new Set<string>();

export async function setupI18n(locale: string) {
  // localStorage 里可能残留非法值，此时落回英文而不是渲染出 key 名
  const target = LOCALE_LOADERS[locale] ? locale : 'en';
  const messages = await LOCALE_LOADERS[target]();
  _i18n = createI18n({
    legacy: false,
    // 模板继续用 $t：composition 模式下由 globalInjection 注入 globalProperties
    globalInjection: true,
    locale: target,
    messages: { [target]: messages.default },
    missingWarn: false,
    fallbackWarn: false,
  });
  loadedLocales.add(target);
  return _i18n;
}

export async function changeI18nLocale(locale: string) {
  const i18n = getI18n();
  if (!loadedLocales.has(locale) && LOCALE_LOADERS[locale]) {
    const messages = await LOCALE_LOADERS[locale]();
    i18n.global.setLocaleMessage(locale, messages.default);
    loadedLocales.add(locale);
  }
  // composition 模式下 global.locale 是 WritableComputedRef，赋值要走 .value
  (i18n.global as unknown as { locale: { value: string } }).locale.value =
    locale;
}

export function getI18n() {
  return _i18n!;
}

// 当前语言字符串。composition 模式下 global.locale 是 ref，
// 直接 === 字符串恒 false，统一在此解包
export function getLocale(): string {
  if (!_i18n) return 'en';
  const locale = (_i18n.global as unknown as { locale: unknown }).locale;
  if (typeof locale === 'string') return locale;
  return (locale as { value?: string } | undefined)?.value ?? 'en';
}
