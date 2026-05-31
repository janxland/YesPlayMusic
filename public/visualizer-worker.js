/* eslint-disable */
/**
 * visualizer-worker.js  (v2 — professional-grade)
 * --------------------------------------------------------------
 * 专业级可视化数据管线（在 Worker 线程内）：
 *
 *   1) 频率自适应平滑包络（fast attack / slow release）
 *   2) Per-bin AGC：每 bin 维护一条慢衰减 runPeak，输出
 *      env[i] / max(runPeak[i], FLOOR) ∈ [0,1]。
 *      —— 任何母带响度的歌都能撑满画面，不再被压扁。
 *   3) A-weighting (IEC 61672-1 标准曲线) 用于「响度」计算，
 *      让 loudness 反映人耳感知（中频/人声段权重最高）。
 *   4) 响度长期峰值归一化（PLR/ReplayGain 思路），
 *      loudness 始终落在 [0,1] 且对响度差异自动均衡。
 *   5) 频段聚合走真实 Hz（已知 sampleRate），1/3 倍频程对数刻度，
 *      取 (peak+RMS) 加权 —— 行业频谱仪惯例。
 *   6) 节拍检测沿用 spectral flux + 自适应阈值。
 *
 * 协议：
 *   主→worker: { type:'config', attack?, release?, sampleRate?, fftSize? }
 *              { type:'reset' }
 *              { type:'analyze', id, freq, time?, bandCount, nowMs,
 *                                 includeWaveform }
 *   worker→主: { type:'result', id, bands, spectrum, waveform|null,
 *                 bass, mid, treble, vocal, loudness, centroid,
 *                 beat, intensity, kick }
 */
(function () {
  'use strict';

  var state = {
    // —— FFT 包络 & 归一化 ——
    envelope: null, // Float32Array：频率自适应平滑后的原始能量
    normalized: null, // Float32Array：per-bin AGC 后 [0,1]
    runPeak: null, // Float32Array：每 bin 的慢衰减峰值
    runPeakDecay: 0.997, // ≈ 4s 半衰期 (60fps)
    runPeakFloor: 0.06, // 噪声地板
    aWeight: null, // Float32Array：A-weighting 因子
    sampleRate: 48000,
    fftSize: 2048,

    // —— 平滑参数 ——
    attack: 0.6,
    release: 0.12,

    // —— 响度长期归一化 ——
    runLoudPeak: 0.12,
    runLoudDecay: 0.9985, // ≈ 11s 半衰期
    runLoudFloor: 0.12,

    // —— 节拍检测 ——
    prev: null,
    history: [],
    windowSize: 43,
    threshold: 1.45,
    minIntervalMs: 220,
    kickDecay: 0.12,
    lastBeatAt: 0,
    kick: 0,
  };

  // ============================================================
  // A-weighting
  //   RA(f) = 12200²·f⁴ / ((f²+20.6²)·√((f²+107.7²)(f²+737.9²))·(f²+12200²))
  //   A(f)  = 2.0 + 20·log10(RA(f))
  // ============================================================
  function computeAWeights(N, sampleRate) {
    var w = new Float32Array(N);
    var nyq = sampleRate / 2;
    for (var i = 0; i < N; i++) {
      var f = (i + 0.5) * (nyq / N);
      var f2 = f * f;
      var num = 12200 * 12200 * f2 * f2;
      var den =
        (f2 + 20.6 * 20.6) *
        Math.sqrt((f2 + 107.7 * 107.7) * (f2 + 737.9 * 737.9)) *
        (f2 + 12200 * 12200);
      var ra = den > 0 ? num / den : 0;
      var a = ra > 0 ? 2.0 + (20 * Math.log(ra)) / Math.LN10 : -120;
      w[i] = ra > 0 ? Math.pow(10, a / 20) : 0;
    }
    return w;
  }

  // ============================================================
  // 包络：byte FFT (0..255) → [0,1] → 频率自适应平滑
  // ============================================================
  function processSpectrum(buf) {
    var N = buf.length;
    if (!state.envelope || state.envelope.length !== N) {
      state.envelope = new Float32Array(N);
      state.normalized = new Float32Array(N);
      state.runPeak = new Float32Array(N);
      for (var k = 0; k < N; k++) state.runPeak[k] = state.runPeakFloor;
    }
    if (!state.aWeight || state.aWeight.length !== N) {
      state.aWeight = computeAWeights(N, state.sampleRate);
    }
    var env = state.envelope;
    var aBase = state.attack;
    var rBase = state.release;
    var denom = N - 1 || 1;
    for (var i = 0; i < N; i++) {
      var t = i / denom;
      var aRate = aBase * (0.65 + 0.7 * t); // 低频慢、高频快
      var rRate = rBase * (0.55 + 0.9 * t);
      var v = buf[i] / 255;
      if (v > 1) v = 1;
      var prev = env[i];
      env[i] = v > prev ? prev + (v - prev) * aRate : prev + (v - prev) * rRate;
    }
  }

  // ============================================================
  // Per-bin AGC：runPeak 慢衰减，归一化到 [0,1]
  // ============================================================
  function applyAGC() {
    var env = state.envelope;
    var nrm = state.normalized;
    var rp = state.runPeak;
    var decay = state.runPeakDecay;
    var floor = state.runPeakFloor;
    var N = env.length;
    for (var i = 0; i < N; i++) {
      var p = rp[i] * decay;
      var v = env[i];
      if (v > p) p = v;
      if (p < floor) p = floor;
      rp[i] = p;
      var n = v / p;
      if (n > 1) n = 1;
      else if (n < 0) n = 0;
      nrm[i] = n;
    }
  }

  // ============================================================
  // 对数频段：真实 Hz 网格
  // ============================================================
  function getBands(bandCount) {
    var M = Math.max(1, bandCount | 0);
    var src = state.normalized;
    var N = src.length;
    var nyq = state.sampleRate / 2;
    var binHz = nyq / N;
    var fLo = 30;
    var fHi = Math.min(16000, nyq * 0.95);
    var logLo = Math.log(fLo);
    var logHi = Math.log(fHi);
    var step = (logHi - logLo) / M;
    var out = new Float32Array(M);
    for (var i = 0; i < M; i++) {
      var f0 = Math.exp(logLo + step * i);
      var f1 = Math.exp(logLo + step * (i + 1));
      var lo = Math.max(1, Math.floor(f0 / binHz));
      var hi = Math.max(lo + 1, Math.floor(f1 / binHz));
      if (hi > N) hi = N;
      var sum = 0;
      var peak = 0;
      var sq = 0;
      for (var k = lo; k < hi; k++) {
        var v = src[k];
        sum += v;
        sq += v * v;
        if (v > peak) peak = v;
      }
      var count = hi - lo || 1;
      var rms = Math.sqrt(sq / count);
      out[i] = peak * 0.5 + rms * 0.5;
    }
    return out;
  }

  // ============================================================
  // 能量带（基于真实 Hz 范围）
  // ============================================================
  function rangeRMS(src, lo, hi) {
    var N = src.length;
    if (lo < 0) lo = 0;
    if (hi > N) hi = N;
    if (hi <= lo) return 0;
    var s = 0;
    for (var i = lo; i < hi; i++) s += src[i] * src[i];
    return Math.sqrt(s / (hi - lo));
  }

  function bandEnergies() {
    var nrm = state.normalized;
    var N = nrm.length;
    var binHz = state.sampleRate / 2 / N;
    var idx = function (hz) {
      var b = Math.floor(hz / binHz);
      if (b < 1) b = 1;
      if (b > N) b = N;
      return b;
    };
    return {
      bass: rangeRMS(nrm, idx(20), idx(160)),
      mid: rangeRMS(nrm, idx(500), idx(2000)),
      treble: rangeRMS(nrm, idx(4000), N),
      vocal: rangeRMS(nrm, idx(200), idx(4000)),
    };
  }

  // ============================================================
  // A-weighted 响度 + 长期峰值归一化（PLR）
  // ============================================================
  function loudnessAweighted() {
    var env = state.envelope;
    var w = state.aWeight;
    var N = env.length;
    var s = 0;
    for (var i = 0; i < N; i++) {
      var v = env[i] * w[i];
      s += v * v;
    }
    var rms = Math.sqrt(s / N);
    var p = state.runLoudPeak * state.runLoudDecay;
    if (rms > p) p = rms;
    if (p < state.runLoudFloor) p = state.runLoudFloor;
    state.runLoudPeak = p;
    var l = rms / p;
    if (l > 1) l = 1;
    else if (l < 0) l = 0;
    return l;
  }

  // ============================================================
  // 谱质心（用归一化包络）
  // ============================================================
  function spectralCentroid() {
    var nrm = state.normalized;
    var N = nrm.length;
    var num = 0;
    var den = 0;
    for (var i = 0; i < N; i++) {
      num += i * nrm[i];
      den += nrm[i];
    }
    return den > 0 ? num / den / N : 0;
  }

  // ============================================================
  // 节拍检测：spectral flux + 自适应阈值（用归一化频谱）
  // ============================================================
  function detectBeat(nowMs) {
    var src = state.normalized;
    var N = src.length;
    var top = Math.max(4, (N * 0.25) | 0);
    var flux = 0;
    if (state.prev && state.prev.length === N) {
      for (var i = 1; i < top; i++) {
        var d = src[i] - state.prev[i];
        if (d > 0) flux += d;
      }
      flux /= top;
    }
    if (!state.prev || state.prev.length !== N) {
      state.prev = new Float32Array(N);
    }
    state.prev.set(src);

    var hist = state.history;
    hist.push(flux);
    if (hist.length > state.windowSize) hist.shift();

    var mean = 0;
    for (var j = 0; j < hist.length; j++) mean += hist[j];
    mean /= hist.length || 1;
    var varSum = 0;
    for (var jj = 0; jj < hist.length; jj++) {
      var dv = hist[jj] - mean;
      varSum += dv * dv;
    }
    var std = Math.sqrt(varSum / (hist.length || 1));
    var dyn = mean + state.threshold * std;
    var beat = false;
    var intensity = 0;
    if (
      flux > dyn &&
      nowMs - state.lastBeatAt > state.minIntervalMs &&
      hist.length >= 8
    ) {
      beat = true;
      state.lastBeatAt = nowMs;
      var over = (flux - dyn) / (Math.max(1e-4, std) || 1);
      intensity = over / 3;
      if (intensity > 1) intensity = 1;
      state.kick += 0.4 + intensity * 0.6;
      if (state.kick > 1) state.kick = 1;
    } else {
      state.kick *= 1 - state.kickDecay;
      if (state.kick < 1e-3) state.kick = 0;
    }
    return { beat: beat, intensity: intensity, kick: state.kick };
  }

  // ============================================================
  // 消息派发
  // ============================================================
  self.onmessage = function (e) {
    var msg = e.data;
    if (!msg) return;
    if (msg.type === 'config') {
      if (typeof msg.attack === 'number') state.attack = msg.attack;
      if (typeof msg.release === 'number') state.release = msg.release;
      if (typeof msg.sampleRate === 'number' && msg.sampleRate > 0) {
        if (msg.sampleRate !== state.sampleRate) {
          state.sampleRate = msg.sampleRate;
          state.aWeight = null;
        }
      }
      if (typeof msg.fftSize === 'number') state.fftSize = msg.fftSize | 0;
      return;
    }
    if (msg.type === 'reset') {
      state.envelope = null;
      state.normalized = null;
      state.runPeak = null;
      state.aWeight = null;
      state.prev = null;
      state.history.length = 0;
      state.lastBeatAt = 0;
      state.kick = 0;
      state.runLoudPeak = state.runLoudFloor;
      return;
    }
    if (msg.type === 'analyze') {
      var freq = msg.freq;
      processSpectrum(freq);
      applyAGC();
      var bands = getBands(msg.bandCount || 64);
      var be = bandEnergies();
      var loudness = loudnessAweighted();
      var centroid = spectralCentroid();
      var b = detectBeat(msg.nowMs || 0);

      var spectrum = new Float32Array(state.normalized);
      var waveform = null;
      if (msg.includeWaveform && msg.time) {
        var t = msg.time;
        waveform = new Float32Array(t.length);
        for (var w = 0; w < t.length; w++) waveform[w] = (t[w] - 128) / 128;
      }
      var transfer = [spectrum.buffer, bands.buffer];
      if (waveform) transfer.push(waveform.buffer);
      self.postMessage(
        {
          type: 'result',
          id: msg.id,
          bands: bands,
          spectrum: spectrum,
          waveform: waveform,
          bass: be.bass,
          mid: be.mid,
          treble: be.treble,
          vocal: be.vocal,
          loudness: loudness,
          centroid: centroid,
          beat: b.beat,
          intensity: b.intensity,
          kick: b.kick,
        },
        transfer
      );
    }
  };
})();
