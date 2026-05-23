/* AudioAnalyzer 单元测试（mock Web Audio） */
import assert from 'node:assert/strict';
import { AudioAnalyzer } from '../core/AudioAnalyzer.js';

/** 最小可用的 AnalyserNode mock：每次返回固定/可注入数据。 */
function makeMockAnalyser() {
  return {
    fftSize: 0,
    smoothingTimeConstant: 0,
    get frequencyBinCount() {
      return this.fftSize / 2;
    },
    _fill: 0,
    getByteFrequencyData(arr) {
      for (let i = 0; i < arr.length; i++) {
        arr[i] = this._fill;
      }
    },
    connect() {},
    disconnect() {},
  };
}

function makeMockCtx(analyser) {
  return {
    createAnalyser: () => analyser,
    destination: {},
  };
}

function makeMockSource() {
  return { connect() {}, disconnect() {} };
}

export default function run() {
  const an = makeMockAnalyser();
  const ctx = makeMockCtx(an);
  const src = makeMockSource();
  const a = new AudioAnalyzer(ctx, src, { fftPow: 9 }); // 2^9=512

  assert.equal(an.fftSize, 512);
  assert.equal(a.binCount, 256);

  // 喂一帧 0 数据 → 包络应保持 0
  a.update();
  assert.equal(a.loudness, 0);
  assert.equal(
    a.spectrum.every(v => v === 0),
    true
  );

  // attack 包络应快速上升
  an._fill = 255; // 全频满量
  a.update();
  const after1Hi = a.spectrum[200]; // 高频 bin 用更快 attack
  assert.ok(after1Hi > 0.3 && after1Hi <= 1, `hi-attack too slow: ${after1Hi}`);
  for (let i = 0; i < 6; i++) a.update();
  // 频率自适应：低频 attack 慢、高频 attack 快 —— 验证两者都饱和
  const lo = a.spectrum[10];
  const hi = a.spectrum[200];
  assert.ok(hi > 0.95, `high band should saturate fast, got ${hi}`);
  assert.ok(lo > 0.8, `low band should also reach near saturation, got ${lo}`);
  // 高频补偿应让高频 bin 不低于低频 bin
  assert.ok(hi >= lo - 0.05, `tilt: hi(${hi}) should be ≥ lo(${lo})`);

  // 整体响度应接近 1
  assert.ok(a.loudness > 0.8, `loudness=${a.loudness}`);

  // release 慢：突然降到 0 后第一帧仍较高
  an._fill = 0;
  a.update();
  const releaseStep = a.spectrum[10];
  assert.ok(
    releaseStep > 0.5 && releaseStep < 1,
    `release too fast: ${releaseStep}`
  );

  // getBands 长度可控、对数划分不抛
  const bands = a.getBands(32);
  assert.equal(bands.length, 32);

  // setFftPow 改变 bin
  a.setFftPow(7); // 128
  assert.equal(a.binCount, 64);
  assert.equal(
    a.spectrum.every(v => v === 0),
    true
  ); // 重置

  // clamp out-of-range fftPow
  a.setFftPow(99);
  assert.ok(a.binCount === 1 << 14, 'should clamp to 15 → 2^15/2');

  a.setFftPow(0);
  assert.ok(a.binCount === 1 << 4, 'should clamp to 5 → 2^5/2');

  // destroy 不抛
  a.destroy();
  assert.equal(a.spectrum, null);
}
