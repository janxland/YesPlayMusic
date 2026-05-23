/* 新增 3 个 renderer 的烟雾测试：mock Canvas2D，确保 draw 不抛、生命周期正常。 */
import assert from 'node:assert/strict';
import { WaveformRenderer } from '../renderers/WaveformRenderer.js';
import { ParticlesRenderer } from '../renderers/ParticlesRenderer.js';
import { AuroraRenderer } from '../renderers/AuroraRenderer.js';

function mockCtx() {
  const noop = () => {};
  const grad = { addColorStop: noop };
  return {
    save: noop,
    restore: noop,
    translate: noop,
    scale: noop,
    rotate: noop,
    beginPath: noop,
    closePath: noop,
    moveTo: noop,
    lineTo: noop,
    arc: noop,
    fill: noop,
    stroke: noop,
    fillRect: noop,
    bezierCurveTo: noop,
    createLinearGradient: () => grad,
    createRadialGradient: () => grad,
    set fillStyle(_) {},
    set strokeStyle(_) {},
    set shadowColor(_) {},
    set shadowBlur(_) {},
    set lineWidth(_) {},
    set lineCap(_) {},
    set lineJoin(_) {},
    set globalCompositeOperation(_) {},
  };
}

const baseOpt = {
  centerX: 0.5,
  centerY: 0.5,
  lineWidth: 4,
  lineSpacing: 4,
  lineColor: '#e93b81',
  lineColorO: 1,
  shadowColor: '#111',
  shadowColorO: 1,
  shadowBlur: 10,
  isRound: true,
  type: 2,
};

function makeFrame(extra = {}) {
  const bands = new Float32Array(64);
  for (let i = 0; i < bands.length; i++) bands[i] = Math.random();
  const wave = new Float32Array(512);
  for (let i = 0; i < wave.length; i++) wave[i] = Math.sin(i * 0.05) * 0.5;
  return {
    bands,
    spectrum: bands,
    waveform: wave,
    bass: 0.4,
    mid: 0.3,
    treble: 0.2,
    loudness: 0.35,
    centroid: 0.4,
    beat: false,
    intensity: 0,
    kick: 0,
    time: 0,
    ...extra,
  };
}

export default function run() {
  for (const Cls of [WaveformRenderer, ParticlesRenderer, AuroraRenderer]) {
    const r = new Cls();
    r.resize(800, 600, 1);
    const ctx = mockCtx();

    // 多帧 + 节拍 + 空波形
    for (let i = 0; i < 5; i++) {
      r.draw(
        ctx,
        makeFrame({ beat: i === 2, intensity: 0.8, kick: 0.5 }),
        baseOpt,
        16
      );
    }
    r.draw(ctx, makeFrame({ waveform: new Float32Array(0) }), baseOpt, 16);

    r.dispose();
  }

  // Particles 应能爆发并衰减
  const p = new ParticlesRenderer();
  p.resize(400, 300, 1);
  const ctx2 = mockCtx();
  p.draw(ctx2, makeFrame({ beat: true, intensity: 1 }), baseOpt, 16);
  assert.ok(p._alive.length > 0, 'particle burst should spawn particles');
  // 多帧后旧粒子应该消亡
  for (let i = 0; i < 200; i++) p.draw(ctx2, makeFrame(), baseOpt, 50);
  assert.ok(p._alive.length < 600, 'particles should expire over time');
}
