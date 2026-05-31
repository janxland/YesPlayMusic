/**
 * AudioAnalyzer  (v2 — professional-grade fallback)
 * --------------------------------------------------------------
 * 当 Worker 不可用时启用的主线程版分析器；与 visualizer-worker.js 中
 * 的算法保持 1:1 对齐：
 *
 *   1) 频率自适应平滑包络
 *   2) Per-bin AGC（每 bin 慢衰减峰值归一化），输出 [0,1]
 *   3) A-weighting → 响度
 *   4) 响度长期峰值归一化（PLR/ReplayGain 思路）
 *   5) 真实 Hz 网格的 1/3 倍频程频段聚合
 *
 * 设计原则：单一职责，只做"数据提取"，不做绘制。
 */

const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);

function computeAWeights(N, sampleRate) {
  const w = new Float32Array(N);
  const nyq = sampleRate / 2;
  for (let i = 0; i < N; i++) {
    const f = (i + 0.5) * (nyq / N);
    const f2 = f * f;
    const num = 12200 * 12200 * f2 * f2;
    const den =
      (f2 + 20.6 * 20.6) *
      Math.sqrt((f2 + 107.7 * 107.7) * (f2 + 737.9 * 737.9)) *
      (f2 + 12200 * 12200);
    const ra = den > 0 ? num / den : 0;
    const a = ra > 0 ? 2.0 + (20 * Math.log(ra)) / Math.LN10 : -120;
    w[i] = ra > 0 ? Math.pow(10, a / 20) : 0;
  }
  return w;
}

export class AudioAnalyzer {
  /**
   * @param {AudioContext} ctx
   * @param {AudioNode}    source     已构造的 MediaElementAudioSourceNode
   * @param {object}       [options]
   * @param {number}       [options.fftPow=11]   2^n 大小，n∈[5,15]
   * @param {number}       [options.smoothing=0.7]
   * @param {number}       [options.minDb=-85]   AnalyserNode 下限
   * @param {number}       [options.maxDb=-15]   AnalyserNode 上限
   * @param {number}       [options.attack=0.6]
   * @param {number}       [options.release=0.12]
   */
  constructor(ctx, source, options = {}) {
    this.ctx = ctx;
    this.source = source;
    this.sampleRate = ctx.sampleRate || 48000;
    this.analyser = ctx.createAnalyser();
    // 收紧 dB 范围以充分利用动态范围。Web Audio 默认 [-100,-30] 过宽。
    this.analyser.smoothingTimeConstant = options.smoothing ?? 0.7;
    this.analyser.minDecibels = options.minDb ?? -85;
    this.analyser.maxDecibels = options.maxDb ?? -15;

    this._buffer = null;
    this._envelope = null;
    this._normalized = null;
    this._runPeak = null;
    this._aWeight = null;

    this.attack = options.attack ?? 0.6;
    this.release = options.release ?? 0.12;
    this.runPeakDecay = options.runPeakDecay ?? 0.997;
    this.runPeakFloor = options.runPeakFloor ?? 0.06;

    this._runLoudPeak = 0.12;
    this.runLoudDecay = options.runLoudDecay ?? 0.9985;
    this.runLoudFloor = options.runLoudFloor ?? 0.12;
    this._loudness = 0;

    this.setFftPow(options.fftPow ?? 11);

    // 旁路 tap：source→analyser，不接 destination。
    source.connect(this.analyser);
  }

  setFftPow(pow) {
    const n = Number(pow);
    const p = clamp(Math.round(Number.isFinite(n) ? n : 11), 5, 15);
    const size = 1 << p;
    this.analyser.fftSize = size;
    const bins = this.analyser.frequencyBinCount;
    this._buffer = new Uint8Array(bins);
    this._envelope = new Float32Array(bins);
    this._normalized = new Float32Array(bins);
    this._runPeak = new Float32Array(bins);
    this._runPeak.fill(this.runPeakFloor);
    this._aWeight = computeAWeights(bins, this.sampleRate);
    this._timeBuffer = new Uint8Array(size);
  }

  /** 拉一帧 byte FFT → 平滑 → AGC → 算响度。 */
  update() {
    this.analyser.getByteFrequencyData(this._buffer);
    const buf = this._buffer;
    const env = this._envelope;
    const nrm = this._normalized;
    const rp = this._runPeak;
    const aBase = this.attack;
    const rBase = this.release;
    const decay = this.runPeakDecay;
    const floor = this.runPeakFloor;
    const N = buf.length;
    const denom = N - 1 || 1;
    for (let i = 0; i < N; i++) {
      const t = i / denom;
      const aRate = aBase * (0.65 + 0.7 * t);
      const rRate = rBase * (0.55 + 0.9 * t);
      const v = buf[i] / 255;
      const prev = env[i];
      const e =
        v > prev ? prev + (v - prev) * aRate : prev + (v - prev) * rRate;
      env[i] = e;
      // per-bin AGC
      let p = rp[i] * decay;
      if (e > p) p = e;
      if (p < floor) p = floor;
      rp[i] = p;
      let no = e / p;
      if (no > 1) no = 1;
      else if (no < 0) no = 0;
      nrm[i] = no;
    }
    // A-weighted RMS 响度 + 长期峰值归一化
    const aw = this._aWeight;
    let s = 0;
    for (let i = 0; i < N; i++) {
      const v = env[i] * aw[i];
      s += v * v;
    }
    const rms = Math.sqrt(s / N);
    let lp = this._runLoudPeak * this.runLoudDecay;
    if (rms > lp) lp = rms;
    if (lp < this.runLoudFloor) lp = this.runLoudFloor;
    this._runLoudPeak = lp;
    this._loudness = clamp(rms / lp, 0, 1);
  }

  /** 归一化频谱（per-bin AGC 之后） — 渲染端使用。 */
  get spectrum() {
    return this._normalized;
  }

  getWaveform() {
    if (!this.analyser.getByteTimeDomainData) return new Float32Array(0);
    this.analyser.getByteTimeDomainData(this._timeBuffer);
    const buf = this._timeBuffer;
    const out = new Float32Array(buf.length);
    for (let i = 0; i < buf.length; i++) out[i] = (buf[i] - 128) / 128;
    return out;
  }

  get binCount() {
    return this._normalized.length;
  }

  /** 真实 Hz 的 1/3 倍频程对数频段聚合。 */
  getBands(bandCount = 64) {
    const M = Math.max(1, bandCount | 0);
    const src = this._normalized;
    const N = src.length;
    const nyq = this.sampleRate / 2;
    const binHz = nyq / N;
    const fLo = 30;
    const fHi = Math.min(16000, nyq * 0.95);
    const logLo = Math.log(fLo);
    const logHi = Math.log(fHi);
    const step = (logHi - logLo) / M;
    const out = new Float32Array(M);
    for (let i = 0; i < M; i++) {
      const f0 = Math.exp(logLo + step * i);
      const f1 = Math.exp(logLo + step * (i + 1));
      const lo = Math.max(1, Math.floor(f0 / binHz));
      let hi = Math.max(lo + 1, Math.floor(f1 / binHz));
      if (hi > N) hi = N;
      let peak = 0;
      let sq = 0;
      for (let k = lo; k < hi; k++) {
        const v = src[k];
        sq += v * v;
        if (v > peak) peak = v;
      }
      const count = hi - lo || 1;
      const rms = Math.sqrt(sq / count);
      out[i] = peak * 0.5 + rms * 0.5;
    }
    return out;
  }

  _hzIdx(hz) {
    const N = this._normalized.length;
    const binHz = this.sampleRate / 2 / N;
    let b = Math.floor(hz / binHz);
    if (b < 1) b = 1;
    if (b > N) b = N;
    return b;
  }

  _rms(lo, hi) {
    const src = this._normalized;
    const N = src.length;
    if (lo < 0) lo = 0;
    if (hi > N) hi = N;
    if (hi <= lo) return 0;
    let s = 0;
    for (let i = lo; i < hi; i++) s += src[i] * src[i];
    return Math.sqrt(s / (hi - lo));
  }

  /** 低频能量 (20–160 Hz) */
  get bass() {
    return this._rms(this._hzIdx(20), this._hzIdx(160));
  }
  /** 中频能量 (500 Hz – 2 kHz) */
  get mid() {
    return this._rms(this._hzIdx(500), this._hzIdx(2000));
  }
  /** 高频能量 (4 kHz – nyquist) */
  get treble() {
    return this._rms(this._hzIdx(4000), this._normalized.length);
  }
  /** 人声带 (200 Hz – 4 kHz)：基频 + F1/F2 共振峰 */
  get vocal() {
    return this._rms(this._hzIdx(200), this._hzIdx(4000));
  }
  /** A-weighted 响度，已做长期峰值归一化，落在 [0,1] */
  get loudness() {
    return this._loudness;
  }

  /** 谱质心 [0,1]（基于归一化包络） */
  get centroid() {
    const env = this._normalized;
    let num = 0;
    let den = 0;
    for (let i = 0; i < env.length; i++) {
      num += i * env[i];
      den += env[i];
    }
    return den > 0 ? num / den / env.length : 0;
  }

  /** 兼容旧 API：直接区间 RMS 能量（按 bin 索引） */
  energyInRange(loBin, hiBin) {
    return this._rms(loBin | 0, hiBin | 0);
  }

  destroy() {
    try {
      this.source.disconnect(this.analyser);
    } catch (_) {
      /* ignored */
    }
    try {
      this.analyser.disconnect();
    } catch (_) {
      /* ignored */
    }
    this._buffer = null;
    this._envelope = null;
    this._normalized = null;
    this._runPeak = null;
    this._aWeight = null;
  }
}
