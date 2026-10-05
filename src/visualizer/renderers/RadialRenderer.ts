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
import { BaseRenderer } from './BaseRenderer.ts';
import {
  hexToRgb,
  rgba,
  shiftHue,
  adjustLightness,
} from '../core/ColorPalette.ts';
import type { RGB } from '../core/ColorPalette.ts';
import type { AVFrame, VisualizerSettings } from '../types.ts';

const MAX_RIPPLES = 6;

interface Ripple {
  r: number;
  alpha: number;
  vr: number;
}

export class RadialRenderer extends BaseRenderer {
  _rotation = 0; // 累积旋转
  _ripples: Ripple[] = []; // {r, alpha, vr}
  _lastBeat = false;

  draw(
    ctx: CanvasRenderingContext2D,
    frame: AVFrame,
    opt: VisualizerSettings,
    dt: number
  ) {
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
    // 自动识别 4 色色板：光刺按序循环取色，中心光球仍用主色保持视觉锚点
    const pal =
      Array.isArray(opt.palette) && opt.palette.length ? opt.palette : null;
    const palPairs = pal
      ? pal.map(hex => {
          const c = shiftHue(hex, hueShift);
          return [hexToRgb(adjustLightness(c, 0.22)), hexToRgb(c)];
        })
      : null;

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
    // 重采样输出缓冲由 BaseRenderer 复用（热路径零分配）
    const bands = this.resampleTo(frame.bands, stripCount);

    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(rot);
    ctx.lineCap = opt.isRound ? 'round' : 'butt';
    ctx.lineWidth = Math.max(1, opt.lineWidth);
    ctx.shadowBlur = opt.shadowBlur;
    ctx.shadowColor = rgba(hexToRgb(opt.shadowColor), opt.shadowColorO ?? 1);

    const innerR = pulseR + 4;
    const sens = Number.isFinite(+opt.sensitivity) ? +opt.sensitivity : 1;
    const vBoost = Number.isFinite(+opt.vocalBoost) ? +opt.vocalBoost : 1;
    const maxOuter = Math.min(W, H) * 0.48;
    const reach = (maxOuter - innerR) * sens;
    // 人声驱动的额外伸展（光刺的"呼吸感"主要随人声起伏）
    const vocalReach = 1 + (frame.vocal || 0) * 0.7 * vBoost;

    for (let i = 0; i < stripCount; i++) {
      const v = bands[i];
      if (v <= 0.002) continue;
      const norm = Math.pow(v, 0.7);
      const len = norm * reach * edge * vocalReach + 6;
      const a = (i / stripCount) * Math.PI * 2;
      const cos = Math.cos(a);
      const sin = Math.sin(a);
      const x1 = cos * innerR;
      const y1 = sin * innerR;
      const x2 = cos * (innerR + len);
      const y2 = sin * (innerR + len);

      // 多色板：按光刺序号循环取 [亮色, 基色] 对；否则全体同色
      const pair = palPairs ? palPairs[i % palPairs.length] : null;
      const gGlow = pair ? pair[0] : glowRgb;
      const gBase = pair ? pair[1] : baseRgb;

      const g = ctx.createLinearGradient(x1, y1, x2, y2);
      g.addColorStop(0, rgba(gGlow, (opt.lineColorO ?? 1) * 0.95));
      g.addColorStop(1, rgba(gBase, 0));
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

  _drawRipples(
    ctx: CanvasRenderingContext2D,
    cx: number,
    cy: number,
    rgb: RGB,
    dtSec: number
  ) {
    const next: Ripple[] = [];
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

function drawCoreGlow(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  r: number,
  glowRgb: RGB,
  baseRgb: RGB
) {
  const grd = ctx.createRadialGradient(cx, cy, r * 0.15, cx, cy, r);
  grd.addColorStop(0, rgba(glowRgb, 0.9));
  grd.addColorStop(0.55, rgba(baseRgb, 0.35));
  grd.addColorStop(1, rgba(baseRgb, 0));
  ctx.fillStyle = grd;
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fill();
}
