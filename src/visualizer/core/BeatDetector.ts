/**
 * BeatDetector
 * --------------------------------------------------------------
 * 自适应频谱通量法（spectral flux）onset 检测（借鉴 ijoji42 v0.5.5 的
 * audioAnalyser.js 打磨成果，三条防御缺一不可）：
 *
 *   1. flux = Σ max(0, cur[i] - prev[i])，只累加低频段的**正向**差分
 *   2. 三重阈值取最大：
 *        - minFlux           绝对门限。全静音时 mean=std=0，阈值退化成 0，
 *                            任何 1 个 LSB 的抖动都会被当成鼓点，必须挡住。
 *        - mean + k·std      统计意义：比「最近窗口的常态波动」高出一截。
 *        - mean·jumpRatio    相对跳变：白噪/嘶声这类**持续**高波动信号
 *                            的 std 很大，单靠 k·std 会误触发；真实鼓点
 *                            的通量是稀疏尖峰（120BPM 时 mean ≈ 峰值 1/15），
 *                            这一项对鼓点几乎无影响。
 *   3. 时间基滑动窗口 + refractory + exp 包络：
 *        - 历史按「最近 windowMs 毫秒」修剪而非按帧数——掉帧/切后台时
 *          mean/std 的语义不漂移。
 *        - kick 衰减用 exp(-dt/kickReleaseMs) 按真实时间衰减，掉帧后
 *          视觉释放时长不变。
 *
 * 重要：喂进来的 spectrum 必须是**原始频谱**（平滑/AGC 链路之前）。
 * 包络平滑和 AGC 都是低通，会把鼓点上升沿摊成几十毫秒的缓坡；
 * 在缓坡上做阈值比较，检出来的拍没有位置感，观感是"呼吸"不是"跳"。
 *
 * 返回值 { beat: boolean, intensity: number(0~1), kick: number }
 *  - kick 是一条 0~1 的平滑包络，可直接驱动半径/缩放动画
 */
import type { BeatResult } from '../types.ts';

export interface BeatDetectorOptions {
  /** 滑动窗口时长（ms）。~0.7s 覆盖一个节拍周期。 */
  windowMs?: number;
  /** k 倍标准差阈值。 */
  threshold?: number;
  /** 最小触发间隔（ms），避免双触发。 */
  minIntervalMs?: number;
  /** 通量绝对门限（per-bin 均值，输入为 [0,1] 原始频谱）。 */
  minFlux?: number;
  /** 相对跳变阈值：flux 至少要达到窗口均值的多少倍。 */
  jumpRatio?: number;
  /** kick 包络释放时间常数（ms），exp(-dt/τ)。 */
  kickReleaseMs?: number;
  /** 判定前历史里至少要攒够的样本数（窗口未满时统计无意义）。 */
  minHistory?: number;
}

const DEFAULTS: Required<BeatDetectorOptions> = {
  windowMs: 700, // ≈ 43 帧 @60fps，与旧版窗口语义一致
  threshold: 1.45,
  minIntervalMs: 220,
  // ≈ ijoji42 的 ONSET_MIN_FLUX=40（byte 刻度）/255 ≈ 0.157，取略低值
  minFlux: 0.12,
  jumpRatio: 1.6,
  // 旧版每帧 kick *= 0.88（60fps）≈ τ=130ms 的指数衰减，观感保持不变
  kickReleaseMs: 130,
  minHistory: 8,
};

interface FluxSample {
  t: number;
  flux: number;
}

export class BeatDetector {
  opt: Required<BeatDetectorOptions>;
  _prev: Float32Array | null = null;
  _history: FluxSample[] = [];
  _lastBeatAt = 0;
  _lastFrameAt = -1;
  _kick = 0;

  constructor(options: BeatDetectorOptions = {}) {
    this.opt = { ...DEFAULTS, ...options };
  }

  /**
   * @param spectrum 原始归一化频谱 [0,1]（平滑/AGC 之前）
   * @param nowMs 当前时间戳（ms）
   */
  update(spectrum: Float32Array, nowMs: number): BeatResult {
    const opt = this.opt;
    const N = spectrum.length;
    // 按真实时间推帧间隔：掉帧/切后台回来时包络与 refractory 不失真。
    // 上限 200ms：长时间挂起后一帧不应把 kick 直接清零（视觉上会"断一下"）。
    const dt =
      this._lastFrameAt >= 0 ? Math.min(200, nowMs - this._lastFrameAt) : 16;
    this._lastFrameAt = nowMs;

    // 先衰减再判定：onset 那一帧的 kick 必须是干净的，不能被本帧衰减啃掉
    this._kick *= Math.exp(-dt / opt.kickReleaseMs);
    if (this._kick < 1e-3) this._kick = 0;

    // 仅取低频段 (~低 1/4) 计算 kick 通量
    const top = Math.max(4, (N * 0.25) | 0);
    let flux = 0;
    if (this._prev && this._prev.length === N) {
      for (let i = 1; i < top; i++) {
        const d = spectrum[i] - this._prev[i];
        if (d > 0) flux += d;
      }
      flux /= top;
    }
    if (!this._prev || this._prev.length !== N) this._prev = new Float32Array(N);
    this._prev.set(spectrum);

    // 时间基滑动窗口：「最近 windowMs」只能按时间修剪，不能按帧数
    const hist = this._history;
    hist.push({ t: nowMs, flux });
    const floor = nowMs - opt.windowMs;
    while (hist.length > 0 && hist[0].t <= floor) hist.shift();

    // 窗口均值与标准差（含当前帧——当前帧的通量本身要参与"常态"统计，
    // 极强拍靠 jumpRatio 与 refractory 兜底，与 ijoji42 一致）
    let mean = 0;
    for (let i = 0; i < hist.length; i++) mean += hist[i].flux;
    mean /= hist.length || 1;
    let varSum = 0;
    for (let i = 0; i < hist.length; i++) {
      const d = hist[i].flux - mean;
      varSum += d * d;
    }
    const std = Math.sqrt(varSum / (hist.length || 1));

    // 三重阈值取最大：绝对门限 / 统计阈值 / 相对跳变
    const dyn = Math.max(
      opt.minFlux,
      mean + opt.threshold * std,
      mean * opt.jumpRatio
    );

    let beat = false;
    let intensity = 0;
    if (
      flux > dyn &&
      nowMs - this._lastBeatAt > opt.minIntervalMs &&
      hist.length >= opt.minHistory
    ) {
      beat = true;
      this._lastBeatAt = nowMs;
      // 强度 = 超过阈值的倍数，截断到 [0,1]
      const over = (flux - dyn) / (Math.max(1e-4, std) || 1);
      intensity = Math.min(1, over / 3);
      this._kick = Math.min(1, this._kick + 0.4 + intensity * 0.6);
    }

    return { beat, intensity, kick: this._kick };
  }

  reset() {
    this._prev = null;
    this._history.length = 0;
    this._lastBeatAt = 0;
    this._lastFrameAt = -1;
    this._kick = 0;
  }
}
