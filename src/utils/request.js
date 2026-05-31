import router from '@/router';
import { doLogout, getCookie } from '@/utils/auth';
import axios from 'axios';

let baseURL = '/api';
if (process.env.IS_ELECTRON) {
  if (process.env.NODE_ENV === 'production') {
    baseURL = process.env.VUE_APP_ELECTRON_API_URL;
  } else {
    baseURL = process.env.VUE_APP_ELECTRON_API_URL_DEV;
  }
} else {
  baseURL = process.env.VUE_APP_NETEASE_API_URL;
}

const service = axios.create({
  baseURL,
  withCredentials: true,
  timeout: 15000,
});

/* settings 内存缓存：避免拦截器重复 JSON.parse(localStorage) */
let _cachedSettings = null;
function readSettings() {
  if (_cachedSettings) return _cachedSettings;
  try {
    _cachedSettings = JSON.parse(localStorage.getItem('settings')) || {};
  } catch (_) {
    _cachedSettings = {};
  }
  return _cachedSettings;
}
window.addEventListener('storage', e => {
  if (e.key === 'settings') _cachedSettings = null;
});
export function invalidateRequestSettingsCache() {
  _cachedSettings = null;
}

/* 请求并发去重 + requestTag 可取消 + 可选内存缓存 */
const inflightMap = new Map();
const tagControllers = new Map();
const memoryCache = new Map();

function sortKeys(obj) {
  if (!obj || typeof obj !== 'object') return obj;
  return Object.keys(obj)
    .sort()
    .reduce((acc, k) => {
      acc[k] = obj[k];
      return acc;
    }, {});
}
function buildKey(config) {
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

export function cancelRequestsByTag(tag) {
  const set = tagControllers.get(tag);
  if (!set) return;
  set.forEach(c => {
    try {
      c.abort();
    } catch (_) {}
  });
  tagControllers.delete(tag);
}

service.interceptors.request.use(function (config) {
  if (!config.params) config.params = {};

  if (baseURL && baseURL.length) {
    if (baseURL[0] !== '/' && !process.env.IS_ELECTRON) {
      config.params.cookie = `MUSIC_U=${getCookie('MUSIC_U')};`;
    }
  } else {
    console.error("You must set up the baseURL in the service's config");
  }

  if (!process.env.IS_ELECTRON && !config.url.includes('/login')) {
    config.params.realIP = '211.161.244.70';
  }

  const settings = readSettings();
  if (process.env.VUE_APP_REAL_IP) {
    config.params.realIP = process.env.VUE_APP_REAL_IP;
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
service.request = function patchedRequest(config) {
  const method = (config.method || 'get').toLowerCase();
  const cacheable = method === 'get';
  const key = buildKey(config);

  if (cacheable && config.memoryCache) {
    const hit = memoryCache.get(key);
    if (hit && hit.expireAt > Date.now()) {
      return Promise.resolve(hit.data);
    }
  }

  if (cacheable && inflightMap.has(key)) {
    return inflightMap.get(key);
  }

  const controller = new AbortController();
  config.signal = controller.signal;

  if (config.requestTag) {
    if (!tagControllers.has(config.requestTag)) {
      tagControllers.set(config.requestTag, new Set());
    }
    tagControllers.get(config.requestTag).add(controller);
  }

  const promise = rawRequest(config)
    .then(data => {
      if (cacheable && config.memoryCache) {
        memoryCache.set(key, {
          expireAt: Date.now() + (config.memoryCache.ttl || 30_000),
          data,
        });
      }
      return data;
    })
    .finally(() => {
      if (cacheable) inflightMap.delete(key);
      if (config.requestTag) {
        const set = tagControllers.get(config.requestTag);
        if (set) {
          set.delete(controller);
          if (set.size === 0) tagControllers.delete(config.requestTag);
        }
      }
    });

  if (cacheable) inflightMap.set(key, promise);
  return promise;
};

service.interceptors.response.use(
  response => response.data,
  async error => {
    // 主动取消的请求静默吞掉
    if (
      axios.isCancel?.(error) ||
      error?.code === 'ERR_CANCELED' ||
      error?.name === 'CanceledError' ||
      error?.name === 'AbortError'
    ) {
      return new Promise(() => {});
    }

    /** @type {import('axios').AxiosResponse | null} */
    let response;
    let data;
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
      console.warn('Token has expired. Logout now!');
      doLogout();
      if (process.env.IS_ELECTRON === true) {
        router.push({ name: 'loginAccount' });
      } else {
        router.push({ name: 'login' });
      }
    }
  }
);

export default service;
