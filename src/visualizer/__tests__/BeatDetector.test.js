/* BeatDetector 单元测试 */
import assert from 'node:assert/strict';
import { BeatDetector } from '../core/BeatDetector.js';

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
}
