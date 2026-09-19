<template>
  <img
    ref="img"
    v-bind="$attrs"
    :src="displaySrc || undefined"
    :alt="alt"
    :class="rootClass"
    v-on="$listeners"
    @load="onLoad"
    @error="onError"
  />
</template>

<script>
import imageLoadService, {
  imageLoadStrategies,
} from '@/utils/imageLoadService';
import { COVER_FALLBACK } from '@/utils/imageFallback';

export default {
  name: 'LazyImage',
  inheritAttrs: false,
  props: {
    src: { type: String, required: true },
    alt: { type: String, default: '' },
    lqipSize: { type: Number, default: 32 },
  },
  data() {
    return {
      displaySrc: '',
      phase: 'idle', // idle | placeholder | loading | done | error
    };
  },
  computed: {
    strategyName() {
      const name = this.$store.state.settings.imageLoadEffect;
      return imageLoadStrategies[name] ? name : 'blur';
    },
    strategy() {
      return imageLoadStrategies[this.strategyName];
    },
    lqipUrl() {
      return imageLoadService.getLqipUrl(this.src, this.lqipSize);
    },
    rootClass() {
      const pending = this.phase !== 'done' && this.phase !== 'error';
      const classes = { 'lazy-image': true };
      if (pending && this.phase === 'idle' && this.src) {
        classes['lazy-image-idle'] = true;
      }
      if (pending && this.displaySrc && this.strategy.placeholderClass) {
        classes[this.strategy.placeholderClass] = true;
      }
      if (this.phase === 'loading' && this.strategy.fadeClass) {
        classes[this.strategy.fadeClass] = true;
      }
      return classes;
    },
  },
  watch: {
    src() {
      this.start();
    },
    strategyName() {
      if (this.phase !== 'done' && this.phase !== 'error') this.start();
    },
  },
  mounted() {
    this.preloadImg = null;
    this.start();
  },
  beforeDestroy() {
    this.cleanup();
  },
  methods: {
    start() {
      this.cleanup();
      if (!this.src) return;
      if (
        this.src.startsWith('data:') ||
        this.src.startsWith('blob:') ||
        imageLoadService.isLoaded(this.src)
      ) {
        this.showFullImmediately();
        return;
      }
      imageLoadService.observe(this.$el, this.onIntersect);
    },
    showFullImmediately() {
      this.displaySrc = this.src;
      this.phase = 'done';
      imageLoadService.markLoaded(this.src);
    },
    onIntersect() {
      if (this.strategy.useLqip && this.lqipUrl && this.lqipUrl !== this.src) {
        this.displaySrc = this.lqipUrl;
        this.phase = 'placeholder';
        this.preloadFull();
      } else {
        this.beginLoad();
      }
    },
    beginLoad() {
      if (this.phase === 'done' || this.phase === 'error') return;
      this.displaySrc = this.src;
      this.phase = 'loading';
    },
    preloadFull() {
      const img = new Image();
      if (this.$attrs.referrerpolicy)
        img.referrerPolicy = this.$attrs.referrerpolicy;
      this.preloadImg = img;
      img.onload = () => {
        if (this.preloadImg !== img) return;
        this.beginLoad();
      };
      img.onerror = () => {
        if (this.preloadImg !== img) return;
        this.showError();
      };
      img.src = this.src;
    },
    onLoad() {
      if (this.displaySrc !== this.src) return;
      const el = this.$refs.img;
      if (el && el.decode) {
        // 后台标签页中 decode() 可能永不 resolve，超时兜底防止图片卡在模糊态
        const timeout = new Promise(resolve => setTimeout(resolve, 300));
        Promise.race([el.decode().catch(() => {}), timeout]).then(
          this.markDone
        );
      } else {
        this.markDone();
      }
    },
    markDone() {
      if (this.phase === 'done' || this.phase === 'error') return;
      this.phase = 'done';
      imageLoadService.markLoaded(this.src);
    },
    onError() {
      // LQIP 加载失败静默跳过，继续等全图
      if (this.displaySrc === this.lqipUrl) return;
      this.showError();
    },
    showError() {
      if (this.phase === 'error') return;
      this.phase = 'error';
      this.displaySrc = COVER_FALLBACK;
    },
    cleanup() {
      imageLoadService.unobserve(this.$el);
      if (this.preloadImg) {
        this.preloadImg.onload = null;
        this.preloadImg.onerror = null;
        this.preloadImg.src = '';
        this.preloadImg = null;
      }
      this.phase = 'idle';
      this.displaySrc = '';
    },
  },
};
</script>

<style lang="scss" scoped>
.lazy-image {
  transition: opacity 0.4s ease, filter 0.4s ease, transform 0.4s ease;
}

.lazy-image-idle {
  background-color: var(--color-secondary-bg);
}

.lazy-image-blur {
  filter: blur(20px);
  transform: scale(1.1);
}

.lazy-image-glass {
  background-color: var(--color-secondary-bg-for-transparent);
  backdrop-filter: blur(12px);
}

.lazy-image-fade {
  background-color: var(--color-secondary-bg);
}

.lazy-image-fading {
  opacity: 0;
}
</style>
