/**
 * ColorPalette
 * --------------------------------------------------------------
 * 纯函数色彩工具：HEX/RGB/HSL 互转，alpha 包装，色相旋转。
 * 不持有任何状态，便于测试。
 */

/** "#rrggbb" 或 "#rgb" → [r,g,b] (0~255)。无效输入返回 [0,0,0]。 */
export function hexToRgb(hex) {
  if (typeof hex !== 'string') return [0, 0, 0];
  let h = hex.trim().replace(/^#/, '');
  if (h.length === 3)
    h = h
      .split('')
      .map(c => c + c)
      .join('');
  if (h.length !== 6 || /[^0-9a-f]/i.test(h)) return [0, 0, 0];
  return [
    parseInt(h.slice(0, 2), 16),
    parseInt(h.slice(2, 4), 16),
    parseInt(h.slice(4, 6), 16),
  ];
}

/** [r,g,b] → "#rrggbb" */
export function rgbToHex([r, g, b]) {
  const to = v => clamp255(v).toString(16).padStart(2, '0');
  return `#${to(r)}${to(g)}${to(b)}`;
}

/** rgba(...) 字符串构造 */
export function rgba([r, g, b], a = 1) {
  return `rgba(${clamp255(r)},${clamp255(g)},${clamp255(b)},${clampUnit(a)})`;
}

/** [r,g,b](0~255) → [h,s,l] (h:0~360, s,l:0~1) */
export function rgbToHsl([r, g, b]) {
  r /= 255;
  g /= 255;
  b /= 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h;
  switch (max) {
    case r:
      h = (g - b) / d + (g < b ? 6 : 0);
      break;
    case g:
      h = (b - r) / d + 2;
      break;
    default:
      h = (r - g) / d + 4;
  }
  return [h * 60, s, l];
}

/** [h,s,l] → [r,g,b](0~255) */
export function hslToRgb([h, s, l]) {
  h = (((h % 360) + 360) % 360) / 360;
  s = clampUnit(s);
  l = clampUnit(l);
  if (s === 0) {
    const v = Math.round(l * 255);
    return [v, v, v];
  }
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  return [
    Math.round(hueToRgb(p, q, h + 1 / 3) * 255),
    Math.round(hueToRgb(p, q, h) * 255),
    Math.round(hueToRgb(p, q, h - 1 / 3) * 255),
  ];
}

function hueToRgb(p, q, t) {
  if (t < 0) t += 1;
  if (t > 1) t -= 1;
  if (t < 1 / 6) return p + (q - p) * 6 * t;
  if (t < 1 / 2) return q;
  if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
  return p;
}

/** 旋转 HEX 颜色的色相。 */
export function shiftHue(hex, deg) {
  const hsl = rgbToHsl(hexToRgb(hex));
  hsl[0] = (hsl[0] + deg) % 360;
  return rgbToHex(hslToRgb(hsl));
}

/** 调整亮度，delta∈[-1,1] */
export function adjustLightness(hex, delta) {
  const hsl = rgbToHsl(hexToRgb(hex));
  hsl[2] = clampUnit(hsl[2] + delta);
  return rgbToHex(hslToRgb(hsl));
}

const clamp255 = v => (v < 0 ? 0 : v > 255 ? 255 : Math.round(v));
const clampUnit = v => (v < 0 ? 0 : v > 1 ? 1 : v);
