/**
 * WorkerAnalyzer
 * --------------------------------------------------------------
 * 与 AudioAnalyzer 接口大致兼容的"worker 版"分析器。
 *
 * 主线程职责（最小化）：
 *   - 持有 Web Audio AnalyserNode，每帧拉取 FFT 字节 -> transfer 给 worker
 * Worker 职责（src/../public/visualizer-worker.js）：
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

export class WorkerAnalyzer {
  /**
   * @param {AudioContext} ctx
   * @param {AudioNode}    source
   * @param {object}       [options]
   * @param {number}       [options.fftPow=11]
   * @param {number}       [options.smoothing=0.82]
   * @param {string}       [options.workerUrl] 显式指定 worker 路径
   */
  constructor(ctx, source, options = {}) {
    this.ctx = ctx;
    this.source = source;
    this.analyser = ctx.createAnalyser();
    this.analyser.smoothingTimeConstant = options.smoothing ?? 0.82;

    this._freqBuf = null;
    this._timeBuf = null;
    this._size = 0;
    this.setFftPow(options.fftPow ?? 11);

    // 旁路 tap：source→analyser，不接 destination。
    // 主音频通路由 AudioVisual 维护的永久干线负责，
    // 这样 destroy() 里只断这条边就不会造成音频中断。
    source.connect(this.analyser);

    this.latestFrame = null;
    this._wantWaveform = false;
    this._reqId = 0;
    this._pending = 0;
    this._maxPending = 2; // 防止 worker 拥堵
    this._destroyed = false;

    const url =
      options.workerUrl ||
      (typeof process !== 'undefined' && process.env && process.env.BASE_URL
        ? process.env.BASE_URL + 'visualizer-worker.js'
        : '/visualizer-worker.js');
    this.worker = new Worker(url);
    this.worker.onmessage = e => this._onMessage(e);
    this.worker.onerror = err => {
      // 让外层可以感知失败并回退
      this._error = err;
    };
    // 默认 attack/release 同步到 worker（与 AudioAnalyzer 默认一致）
    this.worker.postMessage({ type: 'config', attack: 0.55, release: 0.08 });
  }

  setFftPow(pow) {
    const n = Number(pow);
    const p = clamp(Math.round(Number.isFinite(n) ? n : 11), 5, 15);
    const size = 1 << p;
    if (this.analyser.fftSize === size && this._freqBuf) return;
    this.analyser.fftSize = size;
    this._size = size;
    // 这两个 buffer 每帧会被 transfer 走，所以这里只是"模板尺寸"
  }

  /**
   * 每帧调用：读取一次 AnalyserNode 字节，发给 worker。
   * 真正的 features 会在下一两帧通过 latestFrame 暴露。
   * @param {number} nowMs
   * @param {number} bandCount
   * @param {boolean} includeWaveform
   */
  update(nowMs, bandCount, includeWaveform) {
    if (this._destroyed) return;
    // 反压：worker 还没消化完上一帧就跳过本帧，避免堆积
    if (this._pending >= this._maxPending) return;

    const bins = this.analyser.frequencyBinCount;
    const freq = new Uint8Array(bins);
    this.analyser.getByteFrequencyData(freq);

    const transfer = [freq.buffer];
    let timeBuf = null;
    if (includeWaveform && this.analyser.getByteTimeDomainData) {
      timeBuf = new Uint8Array(this.analyser.fftSize);
      this.analyser.getByteTimeDomainData(timeBuf);
      transfer.push(timeBuf.buffer);
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

  _onMessage(e) {
    const msg = e.data;
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

const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
