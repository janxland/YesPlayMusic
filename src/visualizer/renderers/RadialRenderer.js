/**
 * RadialRenderer (type 1)
 * --------------------------------------------------------------
 * 极坐标频谱 + 中心脉冲 + 节拍涟漪：
 *  - 360° 等角分布的光刺，长度由对数频段驱动
 *  - 中心 radial gradient 光球，半径随 bass + kick 动态膨胀
 *  - 节拍触发时生成扩散圆环（最多 6 条同时存在）
 *  - 整体缓慢自转 + 节拍瞬时反向冲击
 *  - 谱质心驱动色相漂移
 */
import { BaseRenderer } from './BaseRenderer.js';
import {
  hexToRgb,
  rgba,
  shiftHue,
  adjustLightness,
} from '../core/ColorPalette.js';

const MAX_RIPPLES = 6;

export class RadialRenderer extends BaseRenderer {
  constructor() {
    super();
    this._rotation = 0; // 累积旋转
    this._ripples = []; // {r, alpha, vr}
    this._lastBeat = false;
  }

  draw(ctx, frame, opt, dt) {
    const { width: W, height: H } = this;
    const cx = W * opt.centerX;
    const cy = H * opt.centerY;
    const dtSec = Math.min(0.05, (dt || 16) / 1000);

    this.motionFade(ctx, 0.18);

    // 自转：基础 8°/s，节拍瞬时加速 + 反向反冲
    this._rotation += (8 + frame.loudness * 24) * dtSec;
    if (frame.beat) this._rotation -= 6 * frame.intensity;
    const rot = (this._rotation * Math.PI) / 180;

    const hueShift = (frame.centroid - 0.5) * 50;
    const baseColor = shiftHue(opt.lineColor, hueShift);
    const glowColor = adjustLightness(baseColor, 0.22);
    const baseRgb = hexToRgb(baseColor);
    const glowRgb = hexToRgb(glowColor);

    // ----- 中心脉冲光球 -----
    const baseRadius = Math.max(20, Number(opt.circleRadius) || 150);
    const edge = Number(opt.circleEdge) || 0.618;
    const pulseR =
      baseRadius * (1 + frame.bass * edge * 0.8 + frame.kick * 0.25);
    drawCoreGlow(ctx, cx, cy, pulseR, glowRgb, baseRgb);

    // ----- 光刺 -----
    const split = Math.max(1, Number(opt.circleSplit) || 2);
    const range = Math.max(60, Number(opt.circleRange) || 360);
    const stripCount = Math.floor(range / split);
    const bands =
      frame.bands.length === stripCount
        ? frame.bands
        : resample(frame.bands, stripCount);

    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(rot);
    ctx.lineCap = opt.isRound ? 'round' : 'butt';
    ctx.lineWidth = Math.max(1, opt.lineWidth);
    ctx.shadowBlur = opt.shadowBlur;
    ctx.shadowColor = rgba(hexToRgb(opt.shadowColor), opt.shadowColorO ?? 1);

    const innerR = pulseR + 4;
    const maxOuter = Math.min(W, H) * 0.48;
    const reach = maxOuter - innerR;

    for (let i = 0; i < stripCount; i++) {
      const v = bands[i];
      if (v <= 0.002) continue;
      const norm = Math.pow(v, 0.82);
      const len = norm * reach * edge + 6;
      const a = (i / stripCount) * Math.PI * 2;
      const cos = Math.cos(a);
      const sin = Math.sin(a);
      const x1 = cos * innerR;
      const y1 = sin * innerR;
      const x2 = cos * (innerR + len);
      const y2 = sin * (innerR + len);

      const g = ctx.createLinearGradient(x1, y1, x2, y2);
      g.addColorStop(0, rgba(glowRgb, (opt.lineColorO ?? 1) * 0.95));
      g.addColorStop(1, rgba(baseRgb, 0));
      ctx.strokeStyle = g;
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.stroke();
    }
    ctx.restore();

    // ----- 节拍涟漪 -----
    if (frame.beat && !this._lastBeat) {
      this._ripples.push({
        r: pulseR,
        alpha: 0.45 + frame.intensity * 0.35,
        vr: 220 + frame.intensity * 380, // px/s
      });
      if (this._ripples.length > MAX_RIPPLES) this._ripples.shift();
    }
    this._lastBeat = frame.beat;

    this._drawRipples(ctx, cx, cy, baseRgb, dtSec);
  }

  _drawRipples(ctx, cx, cy, rgb, dtSec) {
    const next = [];
    ctx.save();
    ctx.lineWidth = 2;
    for (const ring of this._ripples) {
      ring.r += ring.vr * dtSec;
      ring.alpha *= 0.94;
      if (ring.alpha < 0.02) continue;
      ctx.strokeStyle = rgba(rgb, ring.alpha);
      ctx.beginPath();
      ctx.arc(cx, cy, ring.r, 0, Math.PI * 2);
      ctx.stroke();
      next.push(ring);
    }
    this._ripples = next;
    ctx.restore();
  }

  dispose() {
    this._ripples.length = 0;
  }
}

function drawCoreGlow(ctx, cx, cy, r, glowRgb, baseRgb) {
  const grd = ctx.createRadialGradient(cx, cy, r * 0.15, cx, cy, r);
  grd.addColorStop(0, rgba(glowRgb, 0.9));
  grd.addColorStop(0.55, rgba(baseRgb, 0.35));
  grd.addColorStop(1, rgba(baseRgb, 0));
  ctx.fillStyle = grd;
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fill();
}

function resample(src, M) {
  const N = src.length;
  if (N === M) return src;
  const out = new Float32Array(M);
  for (let i = 0; i < M; i++) {
    const t = (i / (M - 1 || 1)) * (N - 1);
    const lo = Math.floor(t);
    const hi = Math.min(N - 1, lo + 1);
    const f = t - lo;
    out[i] = src[lo] * (1 - f) + src[hi] * f;
  }
  return out;
}
