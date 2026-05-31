/* eslint-disable */
/**
 * visualizer-worker.js
 * --------------------------------------------------------------
 * Web Worker：承担所有可视化「计算」工作，主线程仅负责：
 *   - 持有 Web Audio AnalyserNode（Web Audio API 只能在主线程使用）
 *   - 每帧调用 getByteFrequencyData/getByteTimeDomainData 把原始字节
 *     transfer 给本 worker
 *   - 拿到本 worker 回传的 { bands, spectrum, bass, mid, treble, ... }
 *     后交给 renderer 在 main 上绘制 Canvas 2D
 *
 * 这样主线程每帧的 JS 工作降到极低（一次 AnalyserNode 调用 + 一次
 * postMessage），envelope / band / beat / centroid 的循环统统挪到
 * 后台线程，避免在歌词页或大画布下卡顿。
 *
 * 协议：
 *   主→worker: { type: 'config', attack?, release? }
 *              { type: 'reset' }
 *              { type: 'analyze', id, freq:Uint8Array, time?:Uint8Array,
 *                                 bandCount:number, nowMs:number,
 *                                 includeWaveform:boolean }
 *   worker→主: { type: 'result', id, bands, spectrum, waveform|null,
 *                bass, mid, treble, loudness, centroid,
 *                beat, intensity, kick }
 *
 * 与 src/visualizer/core/AudioAnalyzer.js + BeatDetector.js 中的算法
 * 保持一一对应，方便回退/比对。
 */
(function () {
  'use strict';

  var state = {
    envelope: null,
    attack: 0.55,
    release: 0.08,
    // beat detector
    prev: null,
    history: [],
    windowSize: 43,
    threshold: 1.45,
    minIntervalMs: 220,
    kickDecay: 0.12,
    lastBeatAt: 0,
    kick: 0,
  };

  function processSpectrum(buf) {
    var N = buf.length;
    if (!state.envelope || state.envelope.length !== N) {
      state.envelope = new Float32Array(N);
    }
    var env = state.envelope;
    var aBase = state.attack;
    var rBase = state.release;
    var denom = N - 1 || 1;
    for (var i = 0; i < N; i++) {
      var t = i / denom;
      var aRate = aBase * (0.65 + 0.7 * t);
      var rRate = rBase * (0.55 + 0.9 * t);
      var tilt = 1 + 0.25 * Math.log2(1 + i / 32);
      var v = (buf[i] / 255) * tilt;
      if (v > 1) v = 1;
      var prev = env[i];
      env[i] =
        v > prev ? prev + (v - prev) * aRate : prev + (v - prev) * rRate;
    }
  }

  function getBands(bandCount) {
    var M = Math.max(1, bandCount | 0);
    var env = state.envelope;
    var N = env.length;
    var out = new Float32Array(M);
    var minLog = Math.log(2);
    var maxLog = Math.log(N);
    var step = (maxLog - minLog) / M;
    for (var i = 0; i < M; i++) {
      var lo = Math.floor(Math.exp(minLog + step * i));
      var hi = Math.max(
        lo + 1,
        Math.floor(Math.exp(minLog + step * (i + 1)))
      );
      var sum = 0;
      var peak = 0;
      var end = hi < N ? hi : N;
      for (var k = lo; k < end; k++) {
        var v = env[k];
        sum += v;
        if (v > peak) peak = v;
      }
      var count = end - lo || 1;
      out[i] = peak * 0.6 + (sum / count) * 0.4;
    }
    return out;
  }

  function energyInRange(lo, hi) {
    var env = state.envelope;
    var N = env.length;
    lo = lo | 0;
    if (lo < 0) lo = 0;
    if (lo > N - 1) lo = N - 1;
    hi = hi | 0;
    if (hi < lo + 1) hi = lo + 1;
    if (hi > N) hi = N;
    var sum = 0;
    for (var i = lo; i < hi; i++) sum += env[i] * env[i];
    return Math.sqrt(sum / (hi - lo));
  }

  function detectBeat(nowMs) {
    var env = state.envelope;
    var N = env.length;
    var top = Math.max(4, (N * 0.25) | 0);
    var flux = 0;
    if (state.prev && state.prev.length === N) {
      for (var i = 1; i < top; i++) {
        var d = env[i] - state.prev[i];
        if (d > 0) flux += d;
      }
      flux /= top;
    }
    if (!state.prev || state.prev.length !== N) {
      state.prev = new Float32Array(N);
    }
    state.prev.set(env);

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

  self.onmessage = function (e) {
    var msg = e.data;
    if (!msg) return;
    if (msg.type === 'config') {
      if (typeof msg.attack === 'number') state.attack = msg.attack;
      if (typeof msg.release === 'number') state.release = msg.release;
      return;
    }
    if (msg.type === 'reset') {
      state.envelope = null;
      state.prev = null;
      state.history.length = 0;
      state.lastBeatAt = 0;
      state.kick = 0;
      return;
    }
    if (msg.type === 'analyze') {
      var freq = msg.freq;
      processSpectrum(freq);
      var N = state.envelope.length;
      var bands = getBands(msg.bandCount || 64);
      var bass = energyInRange(1, Math.max(2, (N * 0.04) | 0));
      var mid = energyInRange((N * 0.04) | 0, (N * 0.2) | 0);
      var treble = energyInRange((N * 0.2) | 0, N);
      var loudness = energyInRange(1, N);
      var cNum = 0;
      var cDen = 0;
      for (var i = 0; i < N; i++) {
        var v = state.envelope[i];
        cNum += i * v;
        cDen += v;
      }
      var centroid = cDen > 0 ? cNum / cDen / N : 0;
      var b = detectBeat(msg.nowMs || 0);

      // 拷贝包络（worker 持有的副本不能直接 transfer，否则下一帧就没了）
      var spectrum = new Float32Array(state.envelope);
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
          bass: bass,
          mid: mid,
          treble: treble,
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
