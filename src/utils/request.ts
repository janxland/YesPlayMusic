import { doLogout, getCookie } from '@/utils/auth';
import { isDesktop } from '@/platform/env';
import axios from 'axios';

/**
 * api 层不得反向依赖 store/router（依赖方向铁律，拆 R14）：会话过期该做什么，
 * 由入口在启动时通过 configureRequest 注入。未注入时静默丢弃，不影响请求本身。
 */
let _onSessionExpired: (() => void) | null = null;
export function configureRequest({
  onSessionExpired,
}: {
  onSessionExpired?: () => void;
}) {
  if (onSessionExpired) _onSessionExpired = onSessionExpired;
}

let baseURL = '/api';
if (isDesktop()) {
  if (import.meta.env.PROD) {
    baseURL = import.meta.env.VITE_ELECTRON_API_URL;
  } else {
    baseURL = import.meta.env.VITE_ELECTRON_API_URL_DEV;
  }
} else {
  baseURL = import.meta.env.VITE_NETEASE_API_URL;
}

const service = axios.create({
  baseURL,
  withCredentials: true,
  timeout: 15000,
});

/* settings 内存缓存：避免拦截器重复 JSON.parse(localStorage) */
let _cachedSettings: Record<string, any> | null = null;
function readSettings(): Record<string, any> {
  if (_cachedSettings) return _cachedSettings;
  try {
    _cachedSettings =
      JSON.parse(localStorage.getItem('settings') || 'null') || {};
  } catch (_) {
    _cachedSettings = {};
  }
  return _cachedSettings!;
}
window.addEventListener('storage', e => {
  if (e.key === 'settings') _cachedSettings = null;
});

/* 请求并发去重 + requestTag 可取消 + 可选内存缓存 */
const inflightMap = new Map<string, Promise<any>>();
const tagControllers = new Map<string, Set<AbortController>>();
const memoryCache = new Map<string, { expireAt: number; data: unknown }>();

function sortKeys(obj: unknown) {
  if (!obj || typeof obj !== 'object') return obj;
  return Object.keys(obj as Record<string, unknown>)
    .sort()
    .reduce((acc: Record<string, unknown>, k: string) => {
      acc[k] = (obj as Record<string, unknown>)[k];
      return acc;
    }, {});
}
function buildKey(config: Record<string, any>) {
  const params = config.params ? JSON.stringify(sortKeys(config.params)) : '';
  const data = config.data
    ? typeof config.data === 'string'
      ? config.data
      : JSON.stringify(sortKeys(config.data))
    : '';
  return `${(config.method || 'get').toLowerCase()}|${
    config.url
  }|${params}|${data}`;
}

export function cancelRequestsByTag(tag: string) {
  const set = tagControllers.get(tag);
  if (!set) return;
  set.forEach(c => {
    try {
      c.abort();
    } catch (_) {
      // 已 settle 的请求再 abort 会抛，属预期行为
      void 0;
    }
  });
  tagControllers.delete(tag);
}

service.interceptors.request.use(function (config) {
  if (!config.params) config.params = {};

  if (baseURL && baseURL.length) {
    if (baseURL[0] !== '/' && !isDesktop()) {
      config.params.cookie = `MUSIC_U=${getCookie('MUSIC_U')};`;
    }
  } else {
    console.error("You must set up the baseURL in the service's config");
  }

  if (!isDesktop() && !config.url.includes('/login')) {
    config.params.realIP = '211.161.244.70';
  }

  const settings = readSettings();
  if (import.meta.env.VITE_REAL_IP) {
    config.params.realIP = import.meta.env.VITE_REAL_IP;
  } else if (settings.enableRealIP) {
    config.params.realIP = settings.realIP;
  }

  const proxy = settings.proxyConfig;
  if (proxy && ['HTTP', 'HTTPS'].includes(proxy.protocol)) {
    config.params.proxy = `${proxy.protocol}://${proxy.server}:${proxy.port}`;
  }

  return config;
});

// 包一层 service.request，插入缓存 / 去重 / 可取消 逻辑
const rawRequest = service.request.bind(service);
(service as any).request = function patchedRequest(
  config: Record<string, any>
) {
  const method = (config.method || 'get').toLowerCase();
  const cacheable = method === 'get';
  const key = buildKey(config);

  if (cacheable && config.memoryCache) {
    const hit = memoryCache.get(key);
    if (hit && hit.expireAt > Date.now()) {
      return Promise.resolve(hit.data);
    }
  }

  // 调用方自带 signal（新可选能力，向后兼容）：语义是「这一次调用可被
  // 外部取消」，与并发去重共享 inflight promise 会把取消扩散给其他调用方，
  // 因此带 signal 的请求绕过去重，各自独立发请求。
  const externalSignal = config.signal as AbortSignal | undefined;
  const dedup = cacheable && !externalSignal && inflightMap.has(key);

  if (dedup) {
    return inflightMap.get(key)!;
  }

  const controller = new AbortController();
  config.signal = controller.signal;

  // 外部 signal → 内部 controller 的单向桥：外部 abort 时联动 abort，
  // 请求收尾后摘掉监听避免泄漏
  let onExternalAbort: (() => void) | null = null;
  if (externalSignal) {
    if (externalSignal.aborted) {
      controller.abort();
    } else {
      onExternalAbort = () => controller.abort();
      externalSignal.addEventListener('abort', onExternalAbort, {
        once: true,
      });
    }
  }

  if (config.requestTag) {
    if (!tagControllers.has(config.requestTag)) {
      tagControllers.set(config.requestTag, new Set());
    }
    tagControllers.get(config.requestTag)!.add(controller);
  }

  const promise = rawRequest(config)
    .then((data: unknown) => {
      if (cacheable && config.memoryCache) {
        memoryCache.set(key, {
          expireAt: Date.now() + (config.memoryCache.ttl || 30_000),
          data,
        });
      }
      return data;
    })
    .finally(() => {
      if (onExternalAbort && externalSignal) {
        externalSignal.removeEventListener('abort', onExternalAbort);
      }
      if (cacheable && !externalSignal) inflightMap.delete(key);
      if (config.requestTag) {
        const set = tagControllers.get(config.requestTag);
        if (set) {
          set.delete(controller);
          if (set.size === 0) tagControllers.delete(config.requestTag);
        }
      }
    });

  if (cacheable && !externalSignal) inflightMap.set(key, promise);
  return promise;
};

service.interceptors.response.use(
  response => response.data,
  async (error: any) => {
    // 主动取消的请求静默吞掉
    if (
      axios.isCancel?.(error) ||
      error?.code === 'ERR_CANCELED' ||
      error?.name === 'CanceledError' ||
      error?.name === 'AbortError'
    ) {
      return new Promise(() => {});
    }

    let response: any;
    let data: any;
    if (error === 'TypeError: baseURL is undefined') {
      response = error;
      data = error;
      console.error("You must set up the baseURL in the service's config");
    } else if (error.response) {
      response = error.response;
      data = response.data;
    }

    if (
      response &&
      typeof data === 'object' &&
      data.code === 301 &&
      data.msg === '需要登录'
    ) {
      // 并发请求可能同时撞上过期会话，只处理第一次：
      // 否则会连发多个 toast / router.push（NavigationDuplicated 刷屏）
      const svc = service as any;
      if (!svc._expiredNotified) {
        svc._expiredNotified = true;
        setTimeout(() => (svc._expiredNotified = false), 3000);
        console.warn('Token has expired. Logout now!');
        if (_onSessionExpired) _onSessionExpired();
        else doLogout();
      }
    }

    // 之前这里没有返回值，等于把 404/500/网络失败统一「翻译」成 undefined
    // 交还调用方：要么在下一行读属性时抛 TypeError，要么被静默忽略——加载
    // 失败没有任何提示，页面就停在 loading 态。错误必须继续往下抛。
    return Promise.reject(error);
  }
);

// 拦截器已把响应解包为 response.data（见上），运行时调用方拿到的不是
// AxiosResponse —— 按真实形态导出，api 层与 store 的 .then(result => result.xxx)
// 才与类型系统一致。
export default service as any;
