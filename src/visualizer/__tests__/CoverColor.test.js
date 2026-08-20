/* coverColor 封面取色（色相直方图）单元测试 */
import assert from 'node:assert/strict';
import {
  paletteFromHistogram,
  shadowFromHex,
} from '../../components/visualizer/coverColor.js';
import { hexToRgb, rgbToHsl } from '../core/ColorPalette.js';

/** 构造 RGBA 平铺数据：按 [颜色, 像素数] 重复填充。 */
function pixels(entries) {
  const data = [];
  for (const [[r, g, b], count, a = 255] of entries) {
    for (let i = 0; i < count; i++) data.push(r, g, b, a);
  }
  return Uint8ClampedArray.from(data);
}

/** 取 HEX 色的色相（0~360）。 */
const hueOf = hex => rgbToHsl(hexToRgb(hex))[0];

export default function run() {
  // 纯红封面 → 主色应落在红色相区间（≈350~20°）
  const red = paletteFromHistogram(pixels([[[210, 40, 40], 100]]));
  assert.ok(red, 'red cover should yield a palette');
  const redHue = hueOf(red.line);
  assert.ok(redHue > 340 || redHue < 30, `red hue got ${redHue}`);
  // 阴影色比主色暗得多
  assert.ok(
    rgbToHsl(hexToRgb(red.shadow))[2] < rgbToHsl(hexToRgb(red.line))[2],
    'shadow should be darker than line'
  );

  // 蓝多红少的混合封面 → 主色应落在蓝色相区间（≈190~260°）
  const mixed = paletteFromHistogram(
    pixels([
      [[40, 70, 220], 80],
      [[210, 40, 40], 20],
    ])
  );
  const blueHue = hueOf(mixed.line);
  assert.ok(blueHue > 180 && blueHue < 270, `blue hue got ${blueHue}`);

  // 全灰阶封面（无彩色像素）→ null
  const gray = paletteFromHistogram(
    pixels([
      [[10, 10, 10], 40],
      [[128, 128, 128], 40],
      [[250, 250, 250], 40],
    ])
  );
  assert.equal(gray, null, 'grayscale cover should return null');

  // 全透明像素 → 不参与统计，返回 null
  const transparent = paletteFromHistogram(pixels([[[210, 40, 40], 50, 0]]));
  assert.equal(transparent, null);

  // 灰阶噪声 + 少量绿色主体 → 仍应识别出绿色（≈80~160°）
  const greenOverNoise = paletteFromHistogram(
    pixels([
      [[120, 120, 120], 120],
      [[30, 200, 90], 30],
    ])
  );
  const greenHue = hueOf(greenOverNoise.line);
  assert.ok(greenHue > 70 && greenHue < 170, `green hue got ${greenHue}`);

  // 返回值必须是合法 Hex
  assert.match(greenOverNoise.line, /^#[0-9a-f]{6}$/);
  assert.match(greenOverNoise.shadow, /^#[0-9a-f]{6}$/);

  // 4 色输出：任何结果都必须给出 4 个合法 hex 色，且主色 = colors[0]
  for (const pal of [red, mixed, greenOverNoise]) {
    assert.equal(pal.colors.length, 4, 'should always yield 4 colors');
    assert.equal(pal.line, pal.colors[0], 'line should be colors[0]');
    for (const c of pal.colors) assert.match(c, /^#[0-9a-f]{6}$/);
  }

  // 蓝多红少封面 → 阴影色应取第二主导色（红）的深色版，而非主色蓝
  const shadowHue = hueOf(mixed.shadow);
  assert.ok(
    shadowHue > 340 || shadowHue < 40,
    `shadow should follow 2nd hue (red), got ${shadowHue}`
  );

  // 4 个主导色之间色相应有明显间隔（至少两对间隔 ≥ 30°）
  const hues = mixed.colors.map(hueOf);
  let separated = 0;
  for (let i = 0; i < hues.length; i++) {
    for (let j = i + 1; j < hues.length; j++) {
      let d = Math.abs(hues[i] - hues[j]);
      d = Math.min(d, 360 - d);
      if (d >= 30) separated++;
    }
  }
  assert.ok(separated >= 2, `expected hue separation, got hues ${hues}`);

  // shadowFromHex：同色相、低明度
  const sh = shadowFromHex('#3fa0ff');
  const shHsl = rgbToHsl(hexToRgb(sh));
  const srcHsl = rgbToHsl(hexToRgb('#3fa0ff'));
  assert.ok(Math.abs(shHsl[0] - srcHsl[0]) < 3, 'shadow keeps hue');
  assert.ok(shHsl[2] < 0.2, 'shadow is dark');
}
