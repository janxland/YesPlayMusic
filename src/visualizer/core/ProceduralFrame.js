/**
 * ProceduralFrame
 * --------------------------------------------------------------
 * 「可视化兜底」程序化帧生成器。
 *
 * 设计目标：完全独立于 Web Audio / AnalyserNode，不读取任何音频
 * 样本数据，因此对 CORS 受污染的第三方 CDN（kuwo/QQ/migu/joox/
 * bilibili 等 unblock 回源）——以及任何无法通过 captureStream
 * 取到非静音轨的环境——都能稳定输出「看起来像音乐」的频谱/波形。
 *
 * 输出帧字段与 AudioAnalyzer / WorkerAnalyzer 完全对齐，调用方
 * 无需改动渲染器即可直接喂给现有 Renderer.draw()。
 *
 * 解耦点：
 *   - 不依赖 audio 元素（仅可选传入 currentTime/playing 用于增加自然感）
 *   - 不依赖 AudioContext
 *   - 没有副作用，可被 Worker / 主线程任意调用
 */

const TWO_PI = Math.PI * 2;

/**
 * 多正弦混合 + 简单 1/f 噪声，模拟音乐能量分布。
 * 低频强、高频衰减；周期性 beat（约 120 BPM）。
 */
export class ProceduralFrame {
  constructor() {
    // 三个低频振荡器混合，频率取互不通约的小值，让画面"呼吸"
    this._oscFreqs = [0.27, 0.41, 0.83]; // Hz
    // 每个频段叠加一点点伪随机相位，避免完全镜像对称
    this._seed = (Math.random() * 1000) | 0;
    this._lastBeatT = 0;
    this._beatIntervalMs = 500; // 约 120 BPM
    this._loudnessEMA = 0;
    this._kickEMA = 0;
  }

  /**
   * 生成一帧。
   * @param {number} now performance.now()
   * @param {object} opt { fftSize, bandCount, needWave, audioTime }
   * @returns 与 AudioAnalyzer 兼容的帧对象
   */
  generate(now, opt) {
    const fftSize = 1 << (opt.fftSize || 11); // 与 AudioAnalyzer 对齐
    const specLen = fftSize / 2;
    const bandCount = Math.max(8, opt.bandCount | 0 || 64);
    const needWave = !!opt.needWave;
    const t = now / 1000; // 秒
    const audioT = Number.isFinite(opt.audioTime) ? opt.audioTime : t;

    // ----- 整体能量包络（0..1） -----
    let env = 0;
    for (const f of this._oscFreqs) env += 0.5 + 0.5 * Math.sin(TWO_PI * f * t);
    env /= this._oscFreqs.length;
    // 暂停时缓慢衰减
    if (opt.playing === false) env *= 0.15;

    // ----- 频谱（Uint8Array, 0..255） -----
    // 1/f^0.7 + 振荡器调制 + 轻量伪随机扰动
    const spectrum = new Uint8Array(specLen);
    const seed = this._seed;
    for (let i = 0; i < specLen; i++) {
      const norm = i / specLen; // 0..1
      // 频率衰减曲线（低频高，高频低）
      const decay = Math.pow(1 - norm, 1.6);
      // 不同频段不同相位/速度的振荡，制造起伏
      const phase = (i * 0.13 + seed * 0.001) % TWO_PI;
      const wob =
        0.55 +
        0.35 *
          Math.sin(TWO_PI * (0.6 + norm * 1.4) * t + phase) *
          Math.sin(0.3 * t + i * 0.07);
      // 伪随机微抖（廉价 hash）
      const h = ((i * 374761393 + seed) ^ ((i << 5) >>> 0)) & 0xff;
      const noise = (h / 255) * 0.15;
      let v = env * decay * wob + noise * decay;
      if (v < 0) v = 0;
      if (v > 1) v = 1;
      spectrum[i] = (v * 255) | 0;
    }

    // ----- 频段聚合（与 AudioAnalyzer.getBands 一致：log 区间均值） -----
    const bands = new Float32Array(bandCount);
    const minF = 1;
    const maxF = specLen - 1;
    const logMin = Math.log(minF);
    const logRange = Math.log(maxF) - logMin;
    for (let b = 0; b < bandCount; b++) {
      const i0 = Math.floor(Math.exp(logMin + (logRange * b) / bandCount));
      const i1 = Math.max(
        i0 + 1,
        Math.floor(Math.exp(logMin + (logRange * (b + 1)) / bandCount))
      );
      let sum = 0;
      for (let i = i0; i < i1; i++) sum += spectrum[i];
      bands[b] = sum / (i1 - i0) / 255; // 0..1
    }

    // ----- 三段能量 + 人声带（与 AudioAnalyzer 对齐的相对比例） -----
    const bassHi = Math.max(2, Math.floor(specLen * 0.045));
    const vocalHi = Math.max(bassHi + 1, Math.floor(specLen * 0.18));
    const bass = avgRange(spectrum, 0, bassHi);
    const mid = avgRange(
      spectrum,
      Math.floor(specLen * 0.04),
      Math.floor(specLen * 0.2)
    );
    const treble = avgRange(spectrum, Math.floor(specLen * 0.2), specLen);
    // 人声主带：程序化模式下我们让它略高于其它段，模拟"以人声为主"的画面
    const vocal = Math.min(
      1,
      avgRange(spectrum, bassHi, vocalHi) * 1.15 + 0.05 * env
    );

    // ----- loudness / centroid -----
    let sumE = 0;
    let sumWE = 0;
    for (let i = 0; i < specLen; i++) {
      const e = spectrum[i] / 255;
      sumE += e;
      sumWE += e * i;
    }
    const loudness = sumE / specLen;
    const centroid = sumE > 0 ? sumWE / sumE / specLen : 0;
    this._loudnessEMA = this._loudnessEMA * 0.85 + loudness * 0.15;

    // ----- beat / kick（节拍合成，伪检测） -----
    let beat = false;
    let intensity = this._loudnessEMA;
    if (now - this._lastBeatT > this._beatIntervalMs) {
      beat = true;
      this._lastBeatT = now;
      this._kickEMA = 1;
    } else {
      this._kickEMA *= 0.86;
    }
    const kick = this._kickEMA;

    // ----- waveform（仅在需要时生成） -----
    // 与 AudioAnalyzer.getWaveform / WorkerAnalyzer 回传保持一致：
    // Float32Array, 已归一化到 [-1, 1]，长度等于 fftSize。
    let waveform = null;
    if (needWave) {
      waveform = new Float32Array(fftSize);
      for (let i = 0; i < fftSize; i++) {
        const x = i / fftSize;
        const v =
          Math.sin(TWO_PI * (1 + 4 * env) * x + audioT * 2) * 0.5 +
          Math.sin(TWO_PI * 3 * x + audioT * 1.3) * 0.25;
        let s = v * env * 0.85;
        if (s > 1) s = 1;
        if (s < -1) s = -1;
        waveform[i] = s;
      }
    }

    return {
      bands,
      spectrum,
      waveform,
      bass,
      mid,
      treble,
      vocal,
      loudness,
      centroid,
      beat,
      intensity,
      kick,
      time: now,
    };
  }
}

function avgRange(spec, i0, i1) {
  if (i1 <= i0) return 0;
  let s = 0;
  for (let i = i0; i < i1; i++) s += spec[i];
  return s / (i1 - i0) / 255;
}
