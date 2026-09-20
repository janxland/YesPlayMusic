import Cookies from 'js-cookie';
import { logout } from '@/api/auth';
import store from '@/store';

// 传入「多条 Set-Cookie 用 ;; 连接」的串。每条以 `name=value; 属性...` 形式
// 交给浏览器解析，同时把键值镜像到 localStorage 作为 getCookie 的兜底。
export function setCookies(string) {
  String(string ?? '')
    .split(';;')
    .filter(Boolean)
    .forEach(cookie => {
      document.cookie = cookie;
      const pair = cookie.split(';')[0];
      const idx = pair.indexOf('=');
      if (idx <= 0) return;
      const name = pair.slice(0, idx).trim();
      const value = pair.slice(idx + 1).trim();
      if (name) localStorage.setItem(`cookie-${name}`, value);
    });
}

const COOKIE_TTL_MS = 100 * 365 * 24 * 60 * 60 * 1000;

/**
 * 解析从浏览器复制出来的凭据，支持三种输入：
 *   1. 完整 Cookie 头 `MUSIC_U=x; __csrf=y`
 *   2. 单条赋值 `MUSIC_U=x`
 *   3. 裸值 `x`（按 fallbackName 收下）
 * 值中的 `=` 不会被截断（base64 常见）。
 */
export function parseCookieJar(input, fallbackName = 'MUSIC_U') {
  const raw = String(input ?? '').trim();
  if (!raw) return {};
  // 裸值：拒绝含分隔符/空白的输入，避免把粘贴错的内容当成令牌
  if (!raw.includes('=')) {
    return /[\s;]/.test(raw) ? {} : { [fallbackName]: raw };
  }

  const jar = {};
  for (const segment of raw.split(';')) {
    const idx = segment.indexOf('=');
    if (idx <= 0) continue;
    const name = segment.slice(0, idx).trim();
    const value = segment.slice(idx + 1).trim();
    if (name && value) jar[name] = value;
  }
  return jar;
}

// 把 cookie 键值对写进当前站点（与 setCookies 共用同一存储通道）
export function writeCookieJar(jar) {
  const expires = new Date(Date.now() + COOKIE_TTL_MS).toUTCString();
  const secure = location.protocol === 'https:' ? '; Secure' : '';
  const list = Object.entries(jar).map(
    ([name, value]) =>
      `${name}=${value}; expires=${expires}; path=/; SameSite=Lax${secure}`
  );
  setCookies(list.join(';;'));
}

// 还原成 HTTP `Cookie` 请求头形态，供服务端注入使用
export function cookieHeaderOf(jar) {
  return Object.entries(jar)
    .map(([name, value]) => `${name}=${value}`)
    .join('; ');
}

export function getCookie(key) {
  return Cookies.get(key) ?? localStorage.getItem(`cookie-${key}`);
}

export function removeCookie(key) {
  Cookies.remove(key);
  localStorage.removeItem(`cookie-${key}`);
}

// MUSIC_U 只有在账户登录的情况下才有
export function isLoggedIn() {
  return getCookie('MUSIC_U') !== undefined;
}

// 账号登录
export function isAccountLoggedIn() {
  return (
    getCookie('MUSIC_U') !== undefined &&
    store.state.data.loginMode === 'account'
  );
}

// 用户名搜索（用户数据为只读）
export function isUsernameLoggedIn() {
  return store.state.data.loginMode === 'username';
}

// 账户登录或者用户名搜索都判断为登录，宽松检查
export function isLooseLoggedIn() {
  return isAccountLoggedIn() || isUsernameLoggedIn();
}

export function doLogout() {
  logout();
  removeCookie('MUSIC_U');
  removeCookie('__csrf');
  // 更新状态仓库中的用户信息
  store.commit('updateData', { key: 'user', value: {} });
  // 更新状态仓库中的登录状态
  store.commit('updateData', { key: 'loginMode', value: null });
  // 更新状态仓库中的喜欢列表
  store.commit('updateData', { key: 'likedSongPlaylistID', value: undefined });
}
