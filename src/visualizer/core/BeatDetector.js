/**
 * BeatDetector
 * --------------------------------------------------------------
 * 自适应频谱通量法（spectral flux）节拍检测：
 *   1. 累加每一帧低频段的"正向能量增量"作为瞬时通量 F(t)
 *   2. 维护通量的滑动均值 μ 与标准差 σ
 *   3. 当 F(t) > μ + k·σ 且距上次触发足够远时判定为 beat
 *
 * 返回值 { beat: boolean, intensity: number(0~1), kick: number }
 *  - kick 是一条 0~1 的平滑包络，可直接驱动半径/缩放动画
 */

const DEFAULTS = {
  windowSize: 43, // 约 0.7s @60fps，足够覆盖一个节拍周期
  threshold: 1.45, // k 倍标准差
  minIntervalMs: 220, // 最小间隔，避免双触发
  kickDecay: 0.12, // kick 包络回落速率
};

export class BeatDetector {
  constructor(options = {}) {
    this.opt = { ...DEFAULTS, ...options };
    this._prev = null;
    this._history = [];
    this._lastBeatAt = 0;
    this._kick = 0;
  }

  /**
   * @param {Float32Array} spectrum 归一化频谱（来自 AudioAnalyzer.spectrum）
   * @param {number} nowMs 当前时间戳（ms）
   * @returns {{beat: boolean, intensity: number, kick: number}}
   */
  update(spectrum, nowMs) {
    const N = spectrum.length;
    // 仅取低频段 (~低 1/4) 计算 kick 通量
    const top = Math.max(4, (N * 0.25) | 0);
    let flux = 0;
    if (this._prev) {
      for (let i = 1; i < top; i++) {
        const d = spectrum[i] - this._prev[i];
        if (d > 0) flux += d;
      }
      flux /= top;
    }
    if (!this._prev || this._prev.length !== N)
      this._prev = new Float32Array(N);
    this._prev.set(spectrum);

    const hist = this._history;
    hist.push(flux);
    if (hist.length > this.opt.windowSize) hist.shift();

    // 计算均值与标准差
    let mean = 0;
    for (let i = 0; i < hist.length; i++) mean += hist[i];
    mean /= hist.length || 1;
    let varSum = 0;
    for (let i = 0; i < hist.length; i++) {
      const d = hist[i] - mean;
      varSum += d * d;
    }
    const std = Math.sqrt(varSum / (hist.length || 1));
    const dyn = mean + this.opt.threshold * std;

    let beat = false;
    let intensity = 0;
    if (
      flux > dyn &&
      nowMs - this._lastBeatAt > this.opt.minIntervalMs &&
      hist.length >= 8
    ) {
      beat = true;
      this._lastBeatAt = nowMs;
      // 强度 = 超过阈值的倍数，截断到 [0,1]
      const over = (flux - dyn) / (Math.max(1e-4, std) || 1);
      intensity = Math.min(1, over / 3);
      this._kick = Math.min(1, this._kick + 0.4 + intensity * 0.6);
    } else {
      this._kick *= 1 - this.opt.kickDecay;
      if (this._kick < 1e-3) this._kick = 0;
    }

    return { beat, intensity, kick: this._kick };
  }

  reset() {
    this._prev = null;
    this._history.length = 0;
    this._lastBeatAt = 0;
    this._kick = 0;
  }
}
