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
import { ProceduralFrame } from './core/ProceduralFrame.js';
import { BarsRenderer } from './renderers/BarsRenderer.js';
import { RadialRenderer } from './renderers/RadialRenderer.js';
import { WaveformRenderer } from './renderers/WaveformRenderer.js';
import { ParticlesRenderer } from './renderers/ParticlesRenderer.js';
import { AuroraRenderer } from './renderers/AuroraRenderer.js';

/**
 * 设置 window.__AV_DEBUG__ = true 可在控制台看到切歌 / source 重建 /
 * captureStream / analyzer 升级等完整生命周期，便于定位"切歌后假数据"问题。
 */
function avlog(...args) {
  try {
    if (typeof window !== 'undefined' && window.__AV_DEBUG__) {
      // eslint-disable-next-line no-console
      console.log('[AV]', ...args);
    }
  } catch (_) {
    /* noop */
  }
}

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
  // 可视化幅度 / 波动全局倍率。 默认1 = 当前表现，
  // 调高 -> 幅度更大、走势更剧烈；调低 -> 更内敛。范围 [0.2, 3]。
  sensitivity: 1,
  // 人声占主导的额外加权（0 = 关，1 = 默认，越大人声越占主角）。
  vocalBoost: 1,
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

    // 程序化兜底：当 captureStream 被 CORS 污染导致
    // 样本恒为 0，或根本不支持 captureStream 时，自动接管。
    // 与真实 analyzer 完全解耦。
    this._proc = new ProceduralFrame();
    this._procActive = false;
    this._silentMs = 0; // 连续静音累计
    this._activeMs = 0; // 连续有声累计
    this._SILENT_THRESHOLD_MS = 1200; // 播放中持续 1.2s 静音 -> 切程序化
    this._RECOVER_THRESHOLD_MS = 600; // 恢复有声 0.6s -> 切回真实源

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

  /**
   * 兼容旧 API。无论是否首次绑定，统一走 changeMediaElementSource：
   * 始终使用全局单例 AudioContext（HTMLMediaElement 一旦绑定到某 ctx
   * 就再也不能换），传入的 audioContext 参数仅作语义保留。
   */
  loadMusic(_audioContext, audio) {
    this.changeMediaElementSource(audio);
  }

  /**
   * 切歌或首次绑定都调这个。
   *
   * 不再向上抛 AV_NOT_READY / AV_NOT_SUPPORTED：
   *   - NOT_SUPPORTED（环境无 captureStream）→ 直接以「程序化兜底」模式启动；
   *   - NOT_READY（音轨暂未就绪）→ 同样先用程序化数据驱动渲染，
   *     待 audio 触发 'playing' 后由 Vue 层重新调用本方法升级到真实分析。
   * 由此完全解耦：可视化永远会跑，CORS / 自动播放策略 / Worker 失败
   * 都不会中断画面。
   */
  changeMediaElementSource(audio) {
    const sameAudio = audio && audio === this.audio;
    if (audio) this.audio = audio;
    avlog('changeMediaElementSource', {
      sameAudio,
      paused: audio && audio.paused,
      readyState: audio && audio.readyState,
      src: audio && audio.currentSrc,
      hasCachedSource: !!(audio && audio.__avSource__),
    });
    // 切到新 audio 时清掉旧的「等待真实源就绪」监听，避免回调里再去操作旧元素
    this._clearUpgradeWatcher();
    if (this.analyzer) {
      this.analyzer.destroy();
      this.analyzer = null;
    }
    // 关键：Howler html5 audio pool 切歌时复用同一 <audio>，仅换 src。
    // captureStream() 派生的 MediaStream 会随 src 变化自动接上新音频，
    // 所以 sameAudio 时 **完全不要** 重建 source —— 重建只会让浏览器内部的
    // capture session 抖动一次，新 worker AGC 又得冷启动 4s，肉眼看就是
    // "切歌后画面压平 / 没数据"。直接复用 cached source 即可。
    //
    // 仅在这两种情况下才 disconnect 旧 source：
    //   1) 换了不同的 <audio> 元素（极少见）
    //   2) cached source 已死（track ended）
    // 而且永远不调 track.stop()——Chromium 上 stop 一次就让该 audio 元素的
    // capture session 永久死亡，之后所有 captureStream() 都返回 0 live track。
    if (!sameAudio && this.audio && this.audio.__avSource__) {
      try {
        this.audio.__avSource__.disconnect();
      } catch (_) {
        /* noop */
      }
      this.audio.__avSource__ = null;
      avlog('disconnected old source on different audio');
    }
    try {
      const ctx = getSharedAudioContext();
      if (ctx.state === 'suspended' && typeof ctx.resume === 'function') {
        ctx.resume().catch(() => {});
      }
      const source = this._cachedSourceFor(ctx, this.audio);
      this.analyzer = this._createAnalyzer(ctx, source);
      this._silentMs = 0;
      this._activeMs = 0;
      // 拿到真实分析后，关闭程序化兜底——避免新歌前几帧仍被假数据驱动。
      this._procActive = false;
      avlog('analyzer created (real source)');
    } catch (err) {
      // captureStream 暂未就绪 / 不支持 / AudioContext 创建失败：
      // 先以程序化兜底渲染，并在新 audio 真正出声后自动升级到真实分析。
      this._procActive = true;
      const code = err && err.code;
      avlog('source not ready, fall back to procedural:', code || err);
      if (code !== 'AV_NOT_SUPPORTED') {
        this._scheduleUpgradeToRealSource();
      }
    }
    this.start();
  }

  /**
   * 自愈：监听当前 audio 的就绪事件，一旦真正出声就重新尝试拿
   * 真实 captureStream，把 procedural 兜底升级为真实 analyzer。
   */
  _scheduleUpgradeToRealSource() {
    const audio = this.audio;
    if (!audio || !audio.addEventListener) return;
    this._clearUpgradeWatcher();
    avlog('scheduleUpgrade: waiting for audio to become ready');
    const tryUpgrade = label => {
      // 已经升级到真实分析则结束
      if (this.analyzer) {
        this._clearUpgradeWatcher();
        return;
      }
      avlog('upgrade attempt:', label, {
        readyState: audio.readyState,
        paused: audio.paused,
      });
      try {
        const ctx = getSharedAudioContext();
        const source = this._cachedSourceFor(ctx, audio);
        // 升级成功：换上真实 analyzer，关闭兜底
        this.analyzer = this._createAnalyzer(ctx, source);
        this._procActive = false;
        this._silentMs = 0;
        this._activeMs = 0;
        avlog('upgrade succeeded → real analyzer online');
        this._clearUpgradeWatcher();
      } catch (err) {
        // 监听是被动的（事件触发才执行），不会自旋；保留监听等下一次事件再试。
        avlog('upgrade failed, will retry on next event:', err && err.code);
      }
    };
    const events = ['playing', 'loadeddata', 'canplay', 'canplaythrough'];
    const handler = ev => tryUpgrade(ev && ev.type);
    events.forEach(ev => audio.addEventListener(ev, handler));
    this._upgradeOff = () => {
      events.forEach(ev => {
        try {
          audio.removeEventListener(ev, handler);
        } catch (_) {
          /* noop */
        }
      });
    };
    // 若 audio 已在播放，立刻尝试一次（事件可能已经错过）
    if (!audio.paused && audio.readyState >= 2) {
      Promise.resolve().then(() => tryUpgrade('immediate'));
    }
  }

  _clearUpgradeWatcher() {
    if (this._upgradeOff) {
      try {
        this._upgradeOff();
      } catch (_) {
        /* noop */
      }
      this._upgradeOff = null;
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
    this._clearUpgradeWatcher();
    if (this._ro) this._ro.disconnect();
    else window.removeEventListener('resize', this._onResize);
    if (this.analyzer) this.analyzer.destroy();
    this.renderer.dispose();
    this.analyzer = null;
  }

  // ---------- 内部 ----------

  _renderFrame(now, dt) {
    const bandCount = pickBandCount(this.opt);
    const needWave = this.opt.type === 2;

    // 取得真实分析帧（若 analyzer 不存在或为 worker 首帧未到，则为 null）
    let frame = null;
    if (this.analyzer) {
      if (this._workerMode) {
        this.analyzer.update(now, bandCount, needWave);
        frame = this.analyzer.latestFrame;
      } else {
        this.analyzer.update();
        const spectrum = this.analyzer.spectrum;
        const bands = this.analyzer.getBands(bandCount);
        const { beat, intensity, kick } = this.beat.update(spectrum, now);
        const waveform = needWave ? this.analyzer.getWaveform() : null;
        frame = {
          bands,
          spectrum,
          waveform,
          bass: this.analyzer.bass,
          mid: this.analyzer.mid,
          treble: this.analyzer.treble,
          vocal: this.analyzer.vocal,
          loudness: this.analyzer.loudness,
          centroid: this.analyzer.centroid,
          beat,
          intensity,
          kick,
          time: now,
        };
      }
    }

    // 静音侦测：仅在「音频正在播放」时才决策是否切换到程序化兜底。
    // 暂停 / 未就绪 → 真实帧本就为 0，画面应当静止；
    // 程序化模式也立即关闭，避免没在播却还有"心电图"波动。
    const audio = this.audio;
    const isPlaying =
      !!audio && !audio.paused && audio.readyState >= 2 && !audio.ended;
    const realLoud = frame ? frame.loudness || 0 : 0;
    const SILENT_EPS = 0.0008;

    if (!isPlaying) {
      // 立刻退出程序化模式，且清零计数；下次开始播放再重新评估
      this._procActive = false;
      this._silentMs = 0;
      this._activeMs = 0;
    } else if (!frame) {
      this._procActive = true;
    } else if (realLoud < SILENT_EPS) {
      this._silentMs += dt;
      this._activeMs = 0;
      if (this._silentMs >= this._SILENT_THRESHOLD_MS) this._procActive = true;
    } else {
      this._activeMs += dt;
      this._silentMs = 0;
      if (this._activeMs >= this._RECOVER_THRESHOLD_MS)
        this._procActive = false;
    }

    // 程序化兜底：仅在播放中且需要兜底时启用
    if (this._procActive && isPlaying) {
      frame = this._proc.generate(now, {
        fftSize: this.opt.fftSize,
        bandCount,
        needWave,
        playing: true,
        audioTime: audio ? audio.currentTime : undefined,
      });
    }

    if (!frame) return; // worker 首帧未到 + 程序化未启用：跳过

    // 调试：每秒一次打印当前数据来源 / 响度 / 频带峰值，
    // 让用户能在控制台直接确认"切歌后是不是真的拿到真实数据"。
    if (typeof window !== 'undefined' && window.__AV_DEBUG__ && isPlaying) {
      this._dbgAcc = (this._dbgAcc || 0) + dt;
      if (this._dbgAcc >= 1000) {
        this._dbgAcc = 0;
        const bands = frame.bands;
        let maxBand = 0;
        if (bands && bands.length) {
          for (let i = 0; i < bands.length; i++) {
            if (bands[i] > maxBand) maxBand = bands[i];
          }
        }
        avlog('frame', {
          src: this._procActive ? 'procedural' : 'real',
          loudness: +realLoud.toFixed(4),
          maxBand: +maxBand.toFixed(3),
          beat: !!frame.beat,
        });
      }
    }

    this.renderer.draw(this.ctx2d, frame, this.opt, dt);
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
    n.sensitivity = clamp(num(n.sensitivity, 1), 0.2, 3);
    n.vocalBoost = clamp(num(n.vocalBoost, 1), 0, 2);
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
   * 「无侵入旁路 tap」：HTMLMediaElement.captureStream() →
   * MediaStreamAudioSourceNode → AnalyserNode（不接 destination）。
   *
   *   - 不会重定向 <audio> 元素的原生扬声器输出，主音频完全不被触碰
   *     → 开/关可视化、暂停、切换歌词页都绝不会静音；
   *   - 跨域 CDN 即便没 CORS 头，最坏情况是分析数据为 0（仍然渲染），
   *     绝不会像 createMediaElementSource 那样把声音整段清零；
   *   - 不依赖用户手势 / AudioContext.resume，永远兼容自动播放策略。
   *
   * 错误码：
   *   AV_NOT_READY     —— captureStream 暂时还没拿到音轨，调用方
   *                       应监听 audio 的 'playing'/'loadeddata' 后重试。
   *   AV_NOT_SUPPORTED —— 当前环境根本不支持 captureStream，永久放弃。
   */
  _cachedSourceFor(ctx, audio) {
    if (!audio) throw new Error('AudioVisual: audio element is required');

    // 复用同一 ctx 上的旧 source。关键：Chromium 上一旦 track.stop() 过，
    // 该 audio 元素的 capture session 永久死亡，之后所有 captureStream()
    // 都返回 0 live track。所以即使检测到旧 stream 的 track 已 ended，
    // 也只 disconnect、不 stop，由浏览器自己回收。
    //
    // 切歌（src 变更）后 cached track 虽然 readyState='live'，但 muted=true
    // —— Chromium 不会自动把新 src 的解码输出接到旧 track，导致 worker 收到
    // 全 0 频谱，loudness 永远 0。检测 muted 字段，muted 视为死链强制重建。
    const cached = audio.__avSource__;
    if (cached && cached.context === ctx) {
      const stream = cached.__avStream__;
      const tracks =
        stream && stream.getAudioTracks ? stream.getAudioTracks() : [];
      const allLiveAndUnmuted =
        tracks.length > 0 &&
        tracks.every(t => t.readyState === 'live' && !t.muted);
      if (allLiveAndUnmuted) {
        avlog('reuse cached source (alive & unmuted)');
        return cached;
      }
      try {
        cached.disconnect();
      } catch (_) {
        /* noop */
      }
      audio.__avSource__ = null;
      avlog('cached source dead/muted, will re-capture', {
        tracks: tracks.map(t => ({ rs: t.readyState, muted: t.muted })),
      });
    }

    if (typeof audio.captureStream !== 'function') {
      const e = new Error('AV_NOT_SUPPORTED');
      e.code = 'AV_NOT_SUPPORTED';
      throw e;
    }

    let stream;
    try {
      stream = audio.captureStream();
    } catch (err) {
      const e = new Error('AV_NOT_SUPPORTED');
      e.code = 'AV_NOT_SUPPORTED';
      e.cause = err;
      throw e;
    }

    const tracks =
      stream && stream.getAudioTracks ? stream.getAudioTracks() : [];
    const goodTracks = tracks.filter(t => t.readyState === 'live' && !t.muted);
    avlog('captureStream', {
      streamId: stream && stream.id,
      totalTracks: tracks.length,
      liveUnmuted: goodTracks.length,
      detail: tracks.map(t => ({ rs: t.readyState, muted: t.muted })),
    });

    if (!goodTracks.length) {
      // track 数为 0 / ended / muted：抛 NOT_READY 让上层挂事件等真正出声再重试。
      // 同时挂一次 unmute 监听：muted track 未来变 unmuted 时自动触发重新捕获。
      if (tracks.length > 0) {
        const t = tracks[0];
        try {
          t.addEventListener(
            'unmute',
            () => {
              avlog('track unmuted → schedule upgrade');
              if (this.audio) this.audio.__avSource__ = null; // 强制重建
              this._scheduleUpgradeToRealSource();
            },
            { once: true }
          );
        } catch (_) {
          /* noop */
        }
      }
      const e = new Error('AV_NOT_READY');
      e.code = 'AV_NOT_READY';
      throw e;
    }

    const src = ctx.createMediaStreamSource(stream);
    src.__avStream__ = stream;
    audio.__avSource__ = src;
    avlog('created MediaStreamSource on shared ctx');
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
