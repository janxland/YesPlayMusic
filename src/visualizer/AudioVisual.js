/**
 * AudioVisual (Facade)
 * --------------------------------------------------------------
 * 对外暴露的高内聚外观类，保持与旧版完全兼容的 API：
 *   const av = new AudioVisual(canvas, audioEl, options?);
 *   av.loadMusic(audioContext, audioEl);
 *   av.setSetting(partialOptions);
 *   av.destroy();
 *
 * 内部组合：AudioAnalyzer + BeatDetector + Renderer（策略模式）。
 * 负责：尺寸/DPR 管理、RAF 主循环、Renderer 切换。
 */
import { AudioAnalyzer } from './core/AudioAnalyzer.js';
import { BeatDetector } from './core/BeatDetector.js';
import { BarsRenderer } from './renderers/BarsRenderer.js';
import { RadialRenderer } from './renderers/RadialRenderer.js';
import { WaveformRenderer } from './renderers/WaveformRenderer.js';
import { ParticlesRenderer } from './renderers/ParticlesRenderer.js';
import { AuroraRenderer } from './renderers/AuroraRenderer.js';

const DEFAULTS = Object.freeze({
  centerX: 0.5,
  centerY: 0.7,
  lineWidth: 10,
  lineSpacing: 8,
  // INS 风默认调色：品牌玫红 + 中性深灰阴影
  lineColor: '#e1306c',
  lineColorO: 1,
  shadowColor: '#262626',
  shadowColorO: 1,
  shadowBlur: 10,
  isRound: true,
  circleEdge: 0.618,
  circleSplit: 2,
  circleRadius: 150,
  circleRange: 360,
  fftSize: 11, // 2^11 = 2048
  type: 1,
  // 新：渲染层级（z-index）、显示模式与窗口边界（0..1 归一化）
  zIndex: 0,
  mode: 'cover', // 'cover' 全屏 | 'window' 自由窗口（由外部容器决定 canvas 实际大小）
  bounds: { x: 0.1, y: 0.1, w: 0.5, h: 0.5 },
});

const RENDERER_FACTORY = {
  0: () => new BarsRenderer(),
  1: () => new RadialRenderer(),
  2: () => new WaveformRenderer(),
  3: () => new ParticlesRenderer(),
  4: () => new AuroraRenderer(),
};

/** 可选可视化类型元信息，供 UI 展示。 */
export const VISUAL_TYPES = Object.freeze([
  { id: 0, key: 'bars', label: '频谱柱', icon: 'bars' },
  { id: 1, key: 'radial', label: '环形脉动', icon: 'radial' },
  { id: 2, key: 'wave', label: '流动波形', icon: 'wave' },
  { id: 3, key: 'particles', label: '粒子爆发', icon: 'particles' },
  { id: 4, key: 'aurora', label: '氛围极光', icon: 'aurora' },
]);

export class AudioVisual {
  constructor(canvas, audio, options = {}) {
    if (!canvas) throw new Error('AudioVisual: canvas is required');
    this.canvas = canvas;
    this.audio = audio;
    this.ctx2d = canvas.getContext('2d');
    this.opt = this._normalize({ ...DEFAULTS, ...options });

    this.analyzer = null;
    this.beat = new BeatDetector();
    this.renderer = RENDERER_FACTORY[this.opt.type]();

    this._raf = 0;
    this._lastT = 0;
    this._running = false;
    this._dpr = Math.min(2, window.devicePixelRatio || 1);
    this._onResize = () => this._applySize();
    // 优先使用 ResizeObserver 监听 canvas 自身尺寸变化（支持自由布局窗口模式），
    // 同时保留 window.resize 作为兼容退路。
    if (typeof ResizeObserver !== 'undefined') {
      this._ro = new ResizeObserver(this._onResize);
      this._ro.observe(canvas);
    } else {
      window.addEventListener('resize', this._onResize);
    }
    this._applySize();
  }

  /** 兼容旧 API：建立 Web Audio 图并启动渲染。 */
  loadMusic(audioContext, audio) {
    if (audio) this.audio = audio;
    if (this.audio) this.audio.crossOrigin = 'anonymous';

    const ctx =
      audioContext || new (window.AudioContext || window.webkitAudioContext)();
    // 复用同一 audio 元素已创建的 source（避免 InvalidStateError）
    const source = this._cachedSourceFor(ctx, this.audio);

    this.analyzer = new AudioAnalyzer(ctx, source, {
      fftPow: this.opt.fftSize,
    });
    this.start();
  }

  /** 兼容旧 API：切换 audio 元素时调用。 */
  changeMediaElementSource(audio) {
    this.audio = audio;
    if (this.analyzer) {
      const ctx = this.analyzer.ctx;
      this.analyzer.destroy();
      const source = this._cachedSourceFor(ctx, audio);
      this.analyzer = new AudioAnalyzer(ctx, source, {
        fftPow: this.opt.fftSize,
      });
    }
  }

  /** 合并设置并按需切换 renderer / FFT 尺寸。 */
  setSetting(partial = {}) {
    const prevType = this.opt.type;
    this.opt = this._normalize({ ...this.opt, ...partial });
    if (this.analyzer) this.analyzer.setFftPow(this.opt.fftSize);
    if (this.opt.type !== prevType) {
      this.renderer.dispose();
      const factory = RENDERER_FACTORY[this.opt.type] || RENDERER_FACTORY[1];
      this.renderer = factory();
      this.renderer.resize(this.canvas.width, this.canvas.height, this._dpr);
    }
  }

  start() {
    if (this._running) return;
    this._running = true;
    this._lastT = performance.now();
    const tick = now => {
      if (!this._running) return;
      const dt = now - this._lastT;
      this._lastT = now;
      this._renderFrame(now, dt);
      this._raf = requestAnimationFrame(tick);
    };
    this._raf = requestAnimationFrame(tick);
  }

  stop() {
    this._running = false;
    if (this._raf) cancelAnimationFrame(this._raf);
    this._raf = 0;
  }

  /** 手动触发一次尺寸重算（外部改变容器大小后调用）。 */
  refresh() {
    this._applySize();
  }

  destroy() {
    this.stop();
    if (this._ro) this._ro.disconnect();
    else window.removeEventListener('resize', this._onResize);
    if (this.analyzer) this.analyzer.destroy();
    this.renderer.dispose();
    this.analyzer = null;
  }

  // ---------- 内部 ----------

  _renderFrame(now, dt) {
    if (!this.analyzer) return;
    this.analyzer.update();
    const spectrum = this.analyzer.spectrum;
    const bandCount = pickBandCount(this.opt);
    const bands = this.analyzer.getBands(bandCount);
    const { beat, intensity, kick } = this.beat.update(spectrum, now);
    // 仅波形类型需要时域采样，避免无谓开销
    const waveform = this.opt.type === 2 ? this.analyzer.getWaveform() : null;

    this.renderer.draw(
      this.ctx2d,
      {
        bands,
        spectrum,
        waveform,
        bass: this.analyzer.bass,
        mid: this.analyzer.mid,
        treble: this.analyzer.treble,
        loudness: this.analyzer.loudness,
        centroid: this.analyzer.centroid,
        beat,
        intensity,
        kick,
        time: now,
      },
      this.opt,
      dt
    );
  }

  _applySize() {
    const cssW = this.canvas.clientWidth || window.innerWidth;
    const cssH = this.canvas.clientHeight || window.innerHeight;
    const w = Math.max(1, Math.floor(cssW * this._dpr));
    const h = Math.max(1, Math.floor(cssH * this._dpr));
    if (this.canvas.width !== w) this.canvas.width = w;
    if (this.canvas.height !== h) this.canvas.height = h;
    this.renderer.resize(w, h, this._dpr);
  }

  /** 强制类型转换 + 范围校验，避免脏数据破坏算法。 */
  _normalize(o) {
    const n = { ...o };
    n.centerX = clamp01(num(n.centerX, 0.5));
    n.centerY = clamp01(num(n.centerY, 0.7));
    n.lineWidth = clamp(num(n.lineWidth, 10), 1, 50);
    n.lineSpacing = clamp(num(n.lineSpacing, 8), 0.1, 50);
    n.shadowBlur = clamp(num(n.shadowBlur, 10), 0, 50);
    n.lineColorO = clamp01(num(n.lineColorO, 1));
    n.shadowColorO = clamp01(num(n.shadowColorO, 1));
    n.circleRadius = clamp(num(n.circleRadius, 150), 10, 1000);
    n.circleEdge = clamp(num(n.circleEdge, 0.618), 0.05, 3);
    n.circleSplit = clamp(Math.round(num(n.circleSplit, 2)), 1, 60);
    n.circleRange = clamp(num(n.circleRange, 360), 60, 1080);
    n.fftSize = clamp(Math.round(num(n.fftSize, 11)), 5, 15);
    n.type = num(n.type, 1) | 0;
    if (!(n.type in RENDERER_FACTORY)) n.type = 1;
    n.isRound = Boolean(n.isRound);
    if (typeof n.lineColor !== 'string') n.lineColor = DEFAULTS.lineColor;
    if (typeof n.shadowColor !== 'string') n.shadowColor = DEFAULTS.shadowColor;
    // 新增字段：层级 / 模式 / 边界
    n.zIndex = clamp(Math.round(num(n.zIndex, 0)), -99, 999);
    n.mode = n.mode === 'window' ? 'window' : 'cover';
    const b = n.bounds && typeof n.bounds === 'object' ? n.bounds : {};
    n.bounds = {
      x: clamp01(num(b.x, 0.1)),
      y: clamp01(num(b.y, 0.1)),
      w: clamp(num(b.w, 0.5), 0.05, 1),
      h: clamp(num(b.h, 0.5), 0.05, 1),
    };
    return n;
  }

  /** 每个 HTMLMediaElement 只能创建一次 MediaElementSource，使用 WeakMap 缓存。 */
  _cachedSourceFor(ctx, audio) {
    if (!audio) throw new Error('AudioVisual: audio element is required');
    const store = (ctx.__avSourceMap__ ||= new WeakMap());
    let src = store.get(audio);
    if (!src) {
      src = ctx.createMediaElementSource(audio);
      store.set(audio, src);
    }
    return src;
  }
}

function pickBandCount(opt) {
  if (opt.type === 0) return 96;
  // 极坐标：用户的 split/range 决定光刺数
  return Math.max(
    48,
    Math.floor(
      (Number(opt.circleRange) || 360) / (Number(opt.circleSplit) || 2)
    )
  );
}

const num = (v, d) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : d;
};
const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
const clamp01 = v => clamp(v, 0, 1);
