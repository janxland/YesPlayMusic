/* ColorPalette 单元测试 */
import assert from 'node:assert/strict';
import {
  hexToRgb,
  rgbToHex,
  rgba,
  rgbToHsl,
  hslToRgb,
  shiftHue,
  adjustLightness,
} from '../core/ColorPalette.js';

export default function run() {
  // hexToRgb
  assert.deepEqual(hexToRgb('#ff0000'), [255, 0, 0]);
  assert.deepEqual(hexToRgb('#0f0'), [0, 255, 0]);
  assert.deepEqual(hexToRgb('garbage'), [0, 0, 0]);
  assert.deepEqual(hexToRgb(null), [0, 0, 0]);
  assert.deepEqual(hexToRgb('#zzzzzz'), [0, 0, 0]);

  // rgbToHex (round-trip)
  assert.equal(rgbToHex([255, 0, 0]), '#ff0000');
  assert.equal(rgbToHex([-5, 300, 128]), '#00ff80');

  // rgba string
  assert.equal(rgba([255, 0, 0], 0.5), 'rgba(255,0,0,0.5)');
  assert.equal(rgba([0, 0, 0], 2), 'rgba(0,0,0,1)'); // clamps alpha

  // HSL round-trip on pure colors (allow ±1 due to rounding)
  const close = (a, b) => Math.abs(a - b) <= 1;
  for (const c of [
    [255, 0, 0],
    [0, 255, 0],
    [0, 0, 255],
    [123, 87, 200],
  ]) {
    const back = hslToRgb(rgbToHsl(c));
    assert.ok(
      close(back[0], c[0]) && close(back[1], c[1]) && close(back[2], c[2]),
      `HSL roundtrip failed for ${c}: got ${back}`
    );
  }

  // shiftHue: 360° rotation == identity (within rounding tolerance)
  const orig = '#e93b81';
  const rot = shiftHue(orig, 360);
  const [r1, g1, b1] = hexToRgb(orig);
  const [r2, g2, b2] = hexToRgb(rot);
  assert.ok(close(r1, r2) && close(g1, g2) && close(b1, b2));

  // adjustLightness pushes toward white / black
  assert.equal(adjustLightness('#000000', 1), '#ffffff');
  assert.equal(adjustLightness('#ffffff', -1), '#000000');
}
