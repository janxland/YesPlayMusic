/* AudioVisual facade 测试：构造、设置归一化、renderer 切换、destroy 清理 */
import assert from 'node:assert/strict';

// 在导入前注入浏览器 API 占位
globalThis.window = globalThis.window || {
  addEventListener() {},
  removeEventListener() {},
  innerWidth: 800,
  innerHeight: 600,
  devicePixelRatio: 1,
  AudioContext: function () {},
};
globalThis.performance = globalThis.performance || { now: () => Date.now() };
globalThis.requestAnimationFrame =
  globalThis.requestAnimationFrame ||
  (cb => setTimeout(() => cb(performance.now()), 16));
globalThis.cancelAnimationFrame =
  globalThis.cancelAnimationFrame || clearTimeout;

const { AudioVisual } = await import('../AudioVisual.js');

function makeCanvas() {
  return {
    width: 0,
    height: 0,
    clientWidth: 800,
    clientHeight: 600,
    getContext: () => ({
      save() {},
      restore() {},
      fillRect() {},
      beginPath() {},
      closePath() {},
      moveTo() {},
      lineTo() {},
      arc() {},
      arcTo() {},
      fill() {},
      stroke() {},
      translate() {},
      scale() {},
      rotate() {},
      createLinearGradient() {
        return { addColorStop() {} };
      },
      createRadialGradient() {
        return { addColorStop() {} };
      },
      set fillStyle(_) {},
      set strokeStyle(_) {},
      set shadowColor(_) {},
      set shadowBlur(_) {},
      set lineWidth(_) {},
      set lineCap(_) {},
      set globalCompositeOperation(_) {},
    }),
  };
}

export default function run() {
  const c = makeCanvas();
  const av = new AudioVisual(c, null, {
    type: 0,
    fftSize: 8,
    centerX: 99,
    lineColor: '#abcdef',
  });

  // _normalize: centerX 越界应被夹到 [0,1]
  assert.equal(av.opt.centerX, 1);
  assert.equal(av.opt.fftSize, 8);
  assert.equal(av.opt.type, 0);
  assert.equal(av.opt.lineColor, '#abcdef');

  // 默认值合并
  assert.equal(av.opt.lineColorO, 1);
  assert.equal(av.opt.circleEdge, 0.618);

  // renderer 类型与 opt.type 一致
  assert.equal(av.renderer.constructor.name, 'BarsRenderer');

  // 切换 renderer
  av.setSetting({ type: 1 });
  assert.equal(av.renderer.constructor.name, 'RadialRenderer');

  // 新增类型 2/3/4 应能切换且不抛
  for (const [t, name] of [
    [2, 'WaveformRenderer'],
    [3, 'ParticlesRenderer'],
    [4, 'AuroraRenderer'],
  ]) {
    av.setSetting({ type: t });
    assert.equal(av.renderer.constructor.name, name);
  }

  // 非法 type 退回到 1
  av.setSetting({ type: 999 });
  assert.equal(av.opt.type, 1);

  // 脏数据归一化
  av.setSetting({ lineWidth: 'foo', shadowBlur: -5, circleSplit: 1e6 });
  assert.equal(av.opt.lineWidth, 10); // NaN → default
  assert.equal(av.opt.shadowBlur, 0);
  assert.equal(av.opt.circleSplit, 60);

  // 新字段：层级 / 模式 / 边界
  assert.equal(av.opt.zIndex, 0);
  assert.equal(av.opt.mode, 'cover');
  assert.deepEqual(av.opt.bounds, { x: 0.1, y: 0.1, w: 0.5, h: 0.5 });
  av.setSetting({
    zIndex: 9999,
    mode: 'wat',
    bounds: { x: -1, y: 2, w: 0, h: 'x' },
  });
  assert.equal(av.opt.zIndex, 999, 'zIndex clamped to 999');
  assert.equal(av.opt.mode, 'cover', 'invalid mode falls back to cover');
  assert.equal(av.opt.bounds.x, 0);
  assert.equal(av.opt.bounds.y, 1);
  assert.equal(av.opt.bounds.w, 0.05);
  assert.equal(av.opt.bounds.h, 0.5); // 字符串 → NaN → default 0.5
  av.setSetting({ zIndex: -500, mode: 'window' });
  assert.equal(av.opt.zIndex, -99);
  assert.equal(av.opt.mode, 'window');

  // refresh() 应可重复调用且不抛
  av.refresh();
  av.refresh();

  // canvas 尺寸应用了 DPR
  assert.equal(c.width, 800);
  assert.equal(c.height, 600);

  // destroy 清理
  av.destroy();
  assert.equal(av.analyzer, null);
  assert.equal(av._running, false);
}
