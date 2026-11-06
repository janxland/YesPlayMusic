/* BeatDetector 单元测试 */
import assert from 'node:assert/strict';
import { BeatDetector } from '../core/BeatDetector.ts';

function spec(n, fill) {
  const a = new Float32Array(n);
  a.fill(fill);
  return a;
}

export default function run() {
  const bd = new BeatDetector({ minIntervalMs: 100 });

  // 平稳低能量：不应触发 beat
  let t = 0;
  for (let i = 0; i < 30; i++) {
    const out = bd.update(spec(64, 0.1), t);
    t += 16;
    assert.equal(out.beat, false);
  }

  // 突发高能量 → 应触发 beat
  const hit = bd.update(spec(64, 0.95), t);
  t += 16;
  assert.equal(hit.beat, true);
  assert.ok(hit.kick > 0);
  assert.ok(hit.intensity > 0);

  // 紧接着同样高能量但通量已降 → 不会立刻再触发
  for (let i = 0; i < 3; i++) {
    const out = bd.update(spec(64, 0.95), t);
    t += 16;
    assert.equal(out.beat, false);
  }

  // kick 包络随时间衰减
  const startKick = bd.update(spec(64, 0.95), t).kick;
  for (let i = 0; i < 20; i++) {
    bd.update(spec(64, 0.95), t);
    t += 16;
  }
  const laterKick = bd.update(spec(64, 0.95), t).kick;
  assert.ok(
    laterKick < startKick,
    `kick should decay: ${startKick} -> ${laterKick}`
  );

  // reset 清空内部状态
  bd.reset();
  assert.equal(bd._history.length, 0);
  assert.equal(bd._kick, 0);

  // —— 新增防御逻辑回归 ——

  // 绝对门限 minFlux：全静音 + 1 LSB 抖动不应被当成鼓点
  // （旧行为：mean=std=0 → 阈值退化为 0，任何正通量都触发）
  const bd2 = new BeatDetector({ minIntervalMs: 100 });
  for (let i = 0; i < 40; i++) {
    // 量化噪声：低 1/4 bin 上每帧 ~0.004 的抖动
    const a = new Float32Array(64);
    for (let j = 1; j < 16; j++) a[j] = (i + j) % 2 ? 0.004 : 0.0;
    const out = bd2.update(a, i * 16);
    assert.equal(out.beat, false, `LSB jitter frame ${i} should not beat`);
  }

  // 相对跳变 jumpRatio：持续高波动信号（通量长期贴着均值）即使偶有
  // 1.3× 均值的尖峰也不应触发——真实鼓点是稀疏尖峰（≫1.6× 均值）
  const bd3 = new BeatDetector({ minIntervalMs: 100 });
  const sustained = new Float32Array(64);
  let spikeBeat = false;
  for (let i = 0; i < 40; i++) {
    // 每帧低 1/4 全部上抬 0.5 → flux ≈ 0.5，均值高、std 极小
    for (let j = 1; j < 16; j++) sustained[j] += 0.5;
    const out = bd3.update(sustained, i * 16);
    if (i === 39) {
      // 尖峰帧：0.65 > mean + 1.45·σ（会被 k·std 放行），但 < mean·1.6
      for (let j = 1; j < 16; j++) sustained[j] += 0.15;
      spikeBeat = bd3.update(sustained, 39 * 16 + 16).beat;
    } else {
      assert.equal(out.beat, false);
    }
  }
  assert.equal(spikeBeat, false, 'sustained high-flux spike should not beat');
}
