/**
 * WorkerAnalyzer
 * --------------------------------------------------------------
 * 与 AudioAnalyzer 接口大致兼容的"worker 版"分析器。
 *
 * 主线程职责（最小化）：
 *   - 持有 Web Audio AnalyserNode，每帧拉取 FFT 字节 -> transfer 给 worker
 * Worker 职责（public/visualizer-worker.js）：
 *   - envelope 平滑、感知频段聚合、能量带、谱质心、节拍检测
 *
 * 渲染端通过 `latestFrame` 拿到最近一次 worker 计算结果（一帧延迟，
 * 视觉无感）；首帧未到达前为 null，调用方应跳过该帧。
 *
 * 与 AudioAnalyzer 的差异：
 *   - update() 是异步的，不立即返回数据
 *   - 不暴露 spectrum/bass/.../getBands；统一从 latestFrame 读取
 *   - getWaveform() 通过下次 update() 的 includeWaveform 选项请求，
 *     结果挂在 latestFrame.waveform 上
 *
 * 失败回退：如果浏览器不支持 Worker 或 worker 脚本加载失败，外部应
 * 自行回退到 AudioAnalyzer + 主线程 BeatDetector 组合。
 */
import type { AVFrame } from '../types.ts';

/** worker 回传的一帧结果（AVFrame + 消息信封字段）。 */
export type WorkerResultFrame = AVFrame & { type: 'result'; id: number };

export interface WorkerAnalyzerOptions {
  fftPow?: number;
  smoothing?: number;
  minDb?: number;
  maxDb?: number;
  /** 显式指定 worker 路径（默认基于站点 base URL）。 */
  workerUrl?: string;
}

export class WorkerAnalyzer {
  ctx: AudioContext;
  source: AudioNode;
  analyser: AnalyserNode;
  worker: Worker | null;
  /** 最近一次 worker 计算结果；首帧未到达前为 null。 */
  latestFrame: WorkerResultFrame | null;

  _size = 0;
  _reqId = 0;
  _pending = 0;
  _maxPending = 2; // 防止 worker 拥堵
  _destroyed = false;
  _error: ErrorEvent | null = null;

  constructor(
    ctx: AudioContext,
    source: AudioNode,
    options: WorkerAnalyzerOptions = {}
  ) {
    this.ctx = ctx;
    this.source = source;
    this.analyser = ctx.createAnalyser();
    // 专业级默认：收紧 dB 范围 + 适中平滑，充分利用动态范围。
    // Web Audio 默认 [-100, -30] dB 过于宽泛，流行乐中大量 bin 被压到死区。
    this.analyser.smoothingTimeConstant = options.smoothing ?? 0.7;
    this.analyser.minDecibels = options.minDb ?? -85;
    this.analyser.maxDecibels = options.maxDb ?? -15;

    this.setFftPow(options.fftPow ?? 11);

    // 旁路 tap：source→analyser，不接 destination。
    // 主音频通路由 AudioVisual 维护的永久干线负责，
    // 这样 destroy() 里只断这条边就不会造成音频中断。
    source.connect(this.analyser);

    this.latestFrame = null;

    const base = import.meta.env.BASE_URL || '/';
    const url = options.workerUrl || `${base}visualizer-worker.js`;
    this.worker = new Worker(url);
    this.worker.onmessage = e => this._onMessage(e);
    this.worker.onerror = err => {
      // 让外层可以感知失败并回退
      this._error = err;
    };
    // 默认 attack/release 同步到 worker（与 v2 默认一致）
    // 同时下发 sampleRate 以便 worker 预算 A-weighting 与 Hz 刷物。
    this.worker.postMessage({
      type: 'config',
      attack: 0.6,
      release: 0.12,
      sampleRate: ctx.sampleRate || 48000,
      fftSize: this._size,
    });
  }

  setFftPow(pow: number) {
    const n = Number(pow);
    const p = clamp(Math.round(Number.isFinite(n) ? n : 11), 5, 15);
    const size = 1 << p;
    if (this.analyser.fftSize === size) return;
    this.analyser.fftSize = size;
    this._size = size;
  }

  /**
   * 每帧调用：读取一次 AnalyserNode 字节，发给 worker。
   * 真正的 features 会在下一两帧通过 latestFrame 暴露。
   */
  update(nowMs: number, bandCount: number, includeWaveform: boolean) {
    if (this._destroyed || !this.worker) return;
    // 反压：worker 还没消化完上一帧就跳过本帧，避免堆积
    if (this._pending >= this._maxPending) return;

    const bins = this.analyser.frequencyBinCount;
    const freq: Uint8Array<ArrayBuffer> = new Uint8Array(bins);
    this.analyser.getByteFrequencyData(freq);

    const transfer: ArrayBuffer[] = [freq.buffer as ArrayBuffer];
    let timeBuf: Uint8Array<ArrayBuffer> | null = null;
    if (includeWaveform && this.analyser.getByteTimeDomainData) {
      timeBuf = new Uint8Array(
        this.analyser.fftSize
      ) as Uint8Array<ArrayBuffer>;
      this.analyser.getByteTimeDomainData(timeBuf);
      transfer.push(timeBuf.buffer as ArrayBuffer);
    }
    this._reqId = (this._reqId + 1) | 0;
    this._pending++;
    this.worker.postMessage(
      {
        type: 'analyze',
        id: this._reqId,
        freq,
        time: timeBuf,
        bandCount: bandCount | 0 || 64,
        nowMs: nowMs || 0,
        includeWaveform: !!includeWaveform,
      },
      transfer
    );
  }

  _onMessage(e: MessageEvent) {
    const msg = e.data as WorkerResultFrame | null | undefined;
    if (!msg || msg.type !== 'result') return;
    this._pending = Math.max(0, this._pending - 1);
    this.latestFrame = msg;
  }

  reset() {
    this.latestFrame = null;
    if (this.worker) this.worker.postMessage({ type: 'reset' });
  }

  destroy() {
    this._destroyed = true;
    // 只断开 tap，保留主音频通路
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
    if (this.worker) {
      this.worker.onmessage = null;
      this.worker.terminate();
      this.worker = null;
    }
    this.latestFrame = null;
  }
}

const clamp = (v: number, lo: number, hi: number) =>
  v < lo ? lo : v > hi ? hi : v;
