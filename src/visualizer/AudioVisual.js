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
import { WorkerAnalyzer } from './core/WorkerAnalyzer.js';
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

/**
 * 模块级 AudioContext 单例。
 * --------------------------------------------------------------
 *  HTMLMediaElement 一旦被 createMediaElementSource() 绑定到某个
 *  AudioContext，就永远只能处于这个 context 上（再在别的 ctx 上调
 *  createMediaElementSource(同个 audio) 会抛 InvalidStateError）。
 *  所以“关闭可视化 → 重新打开”不能重复创建 AudioContext，
 *  必须复用整个应用生命周期内的唯一一个 context。
 */
function getSharedAudioContext() {
  const g =
    typeof window !== 'undefined'
      ? window
      : typeof self !== 'undefined'
      ? self
      : this;
  if (!g.__AV_SHARED_CTX__) {
    const Ctor = g.AudioContext || g.webkitAudioContext;
    if (!Ctor) throw new Error('AudioVisual: AudioContext not supported');
    g.__AV_SHARED_CTX__ = new Ctor();
  }
  return g.__AV_SHARED_CTX__;
}

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

    // 始终使用全局单例以避免「HTMLMediaElement 已绑定到别的 ctx」报错：
    // - 传入的 audioContext 只有在与已有绑定 context 一致时才安全，不一致一律忽略。
    const ctx = getSharedAudioContext();
    const source = this._cachedSourceFor(ctx, this.audio);

    // 恢复被挂起的 context（主音频不受影响，仅唤醒分析路径）
    if (ctx.state === 'suspended' && typeof ctx.resume === 'function') {
      ctx.resume().catch(() => {});
    }

    this.analyzer = this._createAnalyzer(ctx, source);
    this.start();
  }

  /** 兼容旧 API：切换 audio 元素时调用。 */
  changeMediaElementSource(audio) {
    this.audio = audio;
    if (this.analyzer) {
      const ctx = this.analyzer.ctx;
      this.analyzer.destroy();
      const source = this._cachedSourceFor(ctx, audio);
      this.analyzer = this._createAnalyzer(ctx, source);
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
    const bandCount = pickBandCount(this.opt);
    const needWave = this.opt.type === 2;

    if (this._workerMode) {
      // 1) 通知 worker 算下一帧（异步）
      this.analyzer.update(now, bandCount, needWave);
      // 2) 用上一帧 worker 回传的结果绘制（首帧未到达则跳过绘制）
      const f = this.analyzer.latestFrame;
      if (!f) return;
      this.renderer.draw(
        this.ctx2d,
        {
          bands: f.bands,
          spectrum: f.spectrum,
          waveform: f.waveform,
          bass: f.bass,
          mid: f.mid,
          treble: f.treble,
          loudness: f.loudness,
          centroid: f.centroid,
          beat: f.beat,
          intensity: f.intensity,
          kick: f.kick,
          time: now,
        },
        this.opt,
        dt
      );
      return;
    }

    // 主线程回退路径（与旧实现完全一致）
    this.analyzer.update();
    const spectrum = this.analyzer.spectrum;
    const bands = this.analyzer.getBands(bandCount);
    const { beat, intensity, kick } = this.beat.update(spectrum, now);
    const waveform = needWave ? this.analyzer.getWaveform() : null;

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

  /**
   * 优先使用 WorkerAnalyzer（把 envelope/band/beat 等计算挪到后台线程），
   * 在 Worker 不可用或构造失败时静默回退到 AudioAnalyzer，保证兼容。
   */
  _createAnalyzer(ctx, source) {
    const canUseWorker =
      typeof window !== 'undefined' &&
      typeof window.Worker === 'function' &&
      this.opt.useWorker !== false;
    if (canUseWorker) {
      try {
        const a = new WorkerAnalyzer(ctx, source, { fftPow: this.opt.fftSize });
        this._workerMode = true;
        return a;
      } catch (_) {
        /* fallthrough to main-thread analyzer */
      }
    }
    this._workerMode = false;
    return new AudioAnalyzer(ctx, source, { fftPow: this.opt.fftSize });
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

  /**
   * 「无侵入旁路 tap」：
   *   首选 HTMLMediaElement.captureStream() + MediaStreamAudioSourceNode
   *   ─────────────────────────────────────────────────────────────────
   *   - 不会重定向 <audio> 元素的原生扬声器输出，主音频完全不被触碰
   *     → 开/关可视化、切换歌词页都绝对不会静音；
   *   - 跨域无 CORS（如网易云 CDN）最坏情况下分析数据为 0，可视化没动静，
   *     但绝不会像 createMediaElementSource 那样把声音整段清零；
   *   - 不依赖用户手势 / AudioContext.resume，永远兼容自动播放策略；
   *   - 不需要把 source 接到 destination，AnalyserNode 是单纯的 tap。
   *
   *   兼容性回退：
   *   captureStream 在极个别环境（老 Safari、特殊 WebView）不存在时，
   *   退回到 createMediaElementSource 旧路径，但保留 GainNode 干线 +
   *   永久 destination 连接 + 30ms 淡入，使旧路径下的主音频也不会被切断。
   */
  _cachedSourceFor(ctx, audio) {
    if (!audio) throw new Error('AudioVisual: audio element is required');

    // 优先从 audio 元素本身上拿已缓存的 source，
    // 保证「关闭可视化 → 重新打开」能复用同一个 node，不再重复创建。
    if (audio.__avSource__ && audio.__avSource__.context === ctx) {
      return audio.__avSource__;
    }

    // ── 路径 A：captureStream 旁路（首选） ──
    const capture =
      typeof audio.captureStream === 'function'
        ? () => audio.captureStream()
        : typeof audio.mozCaptureStream === 'function'
        ? () => audio.mozCaptureStream()
        : null;
    if (capture) {
      try {
        const stream = capture.call(audio);
        if (stream && stream.getAudioTracks && stream.getAudioTracks().length) {
          const src = ctx.createMediaStreamSource(stream);
          src.__avMode__ = 'capture';
          src.__avStream__ = stream;
          audio.__avSource__ = src;
          return src;
        }
      } catch (e) {
        console.warn(
          '[AudioVisual] captureStream failed, fallback to MediaElementSource',
          e
        );
      }
    }

    // ── 路径 B：createMediaElementSource 回退（保留旧行为） ──
    // 该 audio 如果已经被别的 ctx 绑定，这里会抛 InvalidStateError。
    // 但因为上面走了全局 ctx 单例 + audio.__avSource__ 缓存，正常路径下不会发生。
    if (!audio.crossOrigin) audio.crossOrigin = 'anonymous';
    let src;
    try {
      src = ctx.createMediaElementSource(audio);
    } catch (err) {
      console.warn(
        '[AudioVisual] createMediaElementSource failed (already bound). Skipping analyzer for this element.',
        err
      );
      throw err;
    }
    const trunk = ctx.createGain();
    trunk.gain.value = 1;
    src.connect(trunk);
    trunk.connect(ctx.destination);
    src.__avMode__ = 'element';
    src.__avTrunkGain__ = trunk;
    audio.__avSource__ = src;
    this._fadeTrunkIn(src, ctx);
    return src;
  }

  _fadeTrunkIn(source, ctx) {
    const gain = source && source.__avTrunkGain__;
    if (!gain || !gain.gain) return;
    const t0 = ctx.currentTime;
    try {
      gain.gain.cancelScheduledValues(t0);
      gain.gain.setValueAtTime(0.0001, t0);
      gain.gain.exponentialRampToValueAtTime(1, t0 + 0.03);
    } catch (_) {
      gain.gain.value = 1;
    }
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
