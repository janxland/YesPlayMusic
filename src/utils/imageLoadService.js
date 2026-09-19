import store from '@/store';

export const imageLoadStrategies = Object.freeze({
  blur: Object.freeze({
    useLqip: true,
    placeholderClass: 'lazy-image-blur',
    fadeClass: '',
  }),
  glass: Object.freeze({
    useLqip: false,
    placeholderClass: 'lazy-image-glass',
    fadeClass: 'lazy-image-fading',
  }),
  fade: Object.freeze({
    useLqip: false,
    placeholderClass: 'lazy-image-fade',
    fadeClass: 'lazy-image-fading',
  }),
  none: Object.freeze({
    useLqip: false,
    placeholderClass: '',
    fadeClass: '',
  }),
});

const DEFAULT_STRATEGY = 'blur';

class ImageLoadService {
  constructor() {
    this.loadedUrls = new Set();
    this.callbacks = new WeakMap();
    this.observer = null;
    this.handleIntersect = this.handleIntersect.bind(this);
  }

  get currentStrategy() {
    const name = store.state.settings.imageLoadEffect;
    return imageLoadStrategies[name] ? name : DEFAULT_STRATEGY;
  }

  observe(el, callback) {
    this.callbacks.set(el, callback);
    this.getObserver().observe(el);
  }

  unobserve(el) {
    if (this.observer) this.observer.unobserve(el);
    this.callbacks.delete(el);
  }

  isLoaded(src) {
    return this.loadedUrls.has(src);
  }

  markLoaded(src) {
    if (src) this.loadedUrls.add(src);
  }

  getLqipUrl(src, size = 32) {
    if (!src || !/^https?:/i.test(src)) return src;
    // 网易云 CDN 同一图片不同 param 即不同 URL，需先剥离 resizeImage 已拼的 param 再生成微缩图
    const [base, query] = src.split('?');
    const rest = query
      ? query
          .split('&')
          .filter(p => p && !p.startsWith('param='))
          .join('&')
      : '';
    return `${base}${rest ? '?' + rest + '&' : '?'}param=${size}y${size}`;
  }

  getObserver() {
    if (!this.observer) {
      this.observer = new IntersectionObserver(this.handleIntersect, {
        rootMargin: '200px',
      });
    }
    return this.observer;
  }

  handleIntersect(entries) {
    entries.forEach(entry => {
      if (!entry.isIntersecting) return;
      const callback = this.callbacks.get(entry.target);
      this.unobserve(entry.target);
      if (callback) callback(entry.target);
    });
  }
}

export default new ImageLoadService();
