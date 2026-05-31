/**
 * AudioAnalyzer
 * --------------------------------------------------------------
 * 对 Web Audio AnalyserNode 的高层封装：
 *  - 自适应 FFT 尺寸
 *  - 双时间常数包络平滑（fast attack / slow release）
 *  - 感知对数频段聚合（近似 Mel）
 *  - 低/中/高频能量与整体响度提取
 *
 * 设计原则：单一职责，只做"数据提取"，不做绘制。
 */

const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);

export class AudioAnalyzer {
  /**
   * @param {AudioContext} ctx
   * @param {AudioNode}    source     已构造的 MediaElementAudioSourceNode
   * @param {object}       [options]
   * @param {number}       [options.fftPow=11]   2^n 大小，n∈[5,15]
   * @param {number}       [options.smoothing=0.82] AnalyserNode 内置时间常数
   * @param {number}       [options.attack=0.55] 包络上升系数 (0~1, 越大越快)
   * @param {number}       [options.release=0.08] 包络回落系数
   */
  constructor(ctx, source, options = {}) {
    this.ctx = ctx;
    this.source = source;
    this.analyser = ctx.createAnalyser();
    this.analyser.smoothingTimeConstant = options.smoothing ?? 0.82;
    this._envelope = null;
    this._buffer = null;
    this.attack = options.attack ?? 0.55;
    this.release = options.release ?? 0.08;

    this.setFftPow(options.fftPow ?? 11);

    // 「旁路 tap」接法：source→analyser（不连 destination）。
    // AnalyserNode 不连 destination 也能采集数据，而主音频通路由
    // AudioVisual._cachedSourceFor() 中的永久 source→trunk→destination
    // 来保证，这样启/停可视化都不会造成音频静音。
    source.connect(this.analyser);
  }

  /** 设置 FFT 大小（以 2 的幂表示），自动重建内部缓冲。 */
  setFftPow(pow) {
    const n = Number(pow);
    const p = clamp(Math.round(Number.isFinite(n) ? n : 11), 5, 15);
    const size = 1 << p;
    this.analyser.fftSize = size;
    const bins = this.analyser.frequencyBinCount;
    this._buffer = new Uint8Array(bins);
    this._envelope = new Float32Array(bins);
    this._timeBuffer = new Uint8Array(size);
  }

  /** 刷新一帧 FFT 数据并写入包络。 */
  update() {
    this.analyser.getByteFrequencyData(this._buffer);
    const env = this._envelope;
    const buf = this._buffer;
    const N = buf.length;
    const aBase = this.attack;
    const rBase = this.release;
    // 算法优化：
    //  1. 频率自适应时间常数 —— 低频天然衰减慢，给它更慢的 attack / release，
    //     高频给更快的 attack 以保留瞬态；范围在基准值 ±35% 内插值。
    //  2. 轻量频谱倾斜补偿 —— 自然音乐高频能量较弱，按 +log2 给高频微弱增益，
    //     让可视化在高频段也有可见的活动（系数温和，避免噪声放大）。
    for (let i = 0; i < N; i++) {
      const t = i / (N - 1 || 1); // 0..1，0=最低频
      const aRate = aBase * (0.65 + 0.7 * t); // 低频慢，高频快
      const rRate = rBase * (0.55 + 0.9 * t);
      const tilt = 1 + 0.25 * Math.log2(1 + i / 32); // 温和高频提升
      const v = Math.min(1, (buf[i] / 255) * tilt);
      const prev = env[i];
      env[i] = v > prev ? prev + (v - prev) * aRate : prev + (v - prev) * rRate;
    }
  }

  /** 返回原始（已归一化）频谱包络的只读视图。 */
  get spectrum() {
    return this._envelope;
  }

  /**
   * 取当前时域波形（用于波形渲染），返回归一化到 [-1,1] 的 Float32Array。
   * 按需采样：仅在调用时才拉取 AnalyserNode 数据，避免 update() 多余开销。
   */
  getWaveform() {
    if (!this.analyser.getByteTimeDomainData) return new Float32Array(0);
    this.analyser.getByteTimeDomainData(this._timeBuffer);
    const buf = this._timeBuffer;
    const out = new Float32Array(buf.length);
    for (let i = 0; i < buf.length; i++) out[i] = (buf[i] - 128) / 128;
    return out;
  }

  get binCount() {
    return this._envelope.length;
  }

  /**
   * 将 N 个 FFT bin 聚合为 M 个感知频段（对数刻度，近似 Mel）。
   * 返回新的 Float32Array，避免外部修改内部状态。
   */
  getBands(bandCount = 64) {
    const M = Math.max(1, bandCount | 0);
    const env = this._envelope;
    const N = env.length;
    const out = new Float32Array(M);
    // 跳过最低 bin (常含直流偏移噪音)
    const minLog = Math.log(2);
    const maxLog = Math.log(N);
    const step = (maxLog - minLog) / M;
    for (let i = 0; i < M; i++) {
      const lo = Math.floor(Math.exp(minLog + step * i));
      const hi = Math.max(
        lo + 1,
        Math.floor(Math.exp(minLog + step * (i + 1)))
      );
      let sum = 0;
      let peak = 0;
      const end = Math.min(hi, N);
      for (let k = lo; k < end; k++) {
        const v = env[k];
        sum += v;
        if (v > peak) peak = v;
      }
      const count = end - lo || 1;
      // 60% 峰值 + 40% 平均：兼顾冲击感和稳定感
      out[i] = peak * 0.6 + (sum / count) * 0.4;
    }
    return out;
  }

  /** 区间 RMS 能量，索引按 bin 计。 */
  energyInRange(loBin, hiBin) {
    const env = this._envelope;
    const lo = clamp(loBin | 0, 0, env.length - 1);
    const hi = clamp(hiBin | 0, lo + 1, env.length);
    let sum = 0;
    for (let i = lo; i < hi; i++) sum += env[i] * env[i];
    return Math.sqrt(sum / (hi - lo));
  }

  /** 低频能量（≈ 0~250Hz，bin 0~3% 区间）。 */
  get bass() {
    return this.energyInRange(1, Math.max(2, (this.binCount * 0.04) | 0));
  }
  /** 中频能量（≈ 250Hz~2kHz） */
  get mid() {
    const n = this.binCount;
    return this.energyInRange((n * 0.04) | 0, (n * 0.2) | 0);
  }
  /** 高频能量 */
  get treble() {
    const n = this.binCount;
    return this.energyInRange((n * 0.2) | 0, n);
  }
  /** 整体响度 [0,1] */
  get loudness() {
    return this.energyInRange(1, this.binCount);
  }

  /** 计算谱质心 (spectral centroid) 用于色相调制 [0,1]。 */
  get centroid() {
    const env = this._envelope;
    let num = 0;
    let den = 0;
    for (let i = 0; i < env.length; i++) {
      num += i * env[i];
      den += env[i];
    }
    return den > 0 ? num / den / env.length : 0;
  }

  destroy() {
    // 只断开 source→analyser 这条旁路边，保留主音频通路。
    // 避免调用 source.disconnect()——那会一并断掉 source→trunk，
    // 导致音乐完全静音。
    try {
      this.source.disconnect(this.analyser);
    } catch (_) {
      // 部分浏览器不支持指定目标的 disconnect，退路为不做任何事
    }
    try {
      this.analyser.disconnect();
    } catch (_) {
      /* ignored */
    }
    this._buffer = null;
    this._envelope = null;
  }
}
