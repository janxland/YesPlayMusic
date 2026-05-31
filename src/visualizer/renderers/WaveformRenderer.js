/**
 * WaveformRenderer (type 2)
 * --------------------------------------------------------------
 * 时域波形：双层镜像 + 三次贝塞尔平滑，带 bloom glow。
 *  - 用 Catmull-Rom → 贝塞尔的平滑算法替代直连线段
 *  - 上下两条镜像波形，叠加色差形成立体感
 *  - 节拍时 bloom 强化
 */
import { BaseRenderer } from './BaseRenderer.js';
import {
  hexToRgb,
  rgba,
  shiftHue,
  adjustLightness,
} from '../core/ColorPalette.js';

export class WaveformRenderer extends BaseRenderer {
  draw(ctx, frame, opt) {
    const { width: W, height: H } = this;
    const cy = H * opt.centerY;
    const sens = Number.isFinite(+opt.sensitivity) ? +opt.sensitivity : 1;
    const vBoost = Number.isFinite(+opt.vocalBoost) ? +opt.vocalBoost : 1;
    // 以人声为主驱动振幅：sensitivity 全局倍率 + vocalBoost 人声项倍率。
    const drive = Math.pow(
      Math.min(
        1,
        frame.loudness * 0.55 +
          (frame.vocal || 0) * 0.85 * vBoost +
          frame.kick * 0.4
      ),
      0.7
    );
    const amp = Math.min(H * 0.6, 720) * (0.35 + drive * 1.25 * sens);

    this.motionFade(ctx, 0.22);

    const wave = frame.waveform;
    if (!wave || wave.length === 0) return;

    const hueShift = (frame.centroid - 0.5) * 40;
    const color = shiftHue(opt.lineColor, hueShift);
    const glow = adjustLightness(color, 0.2);
    const colorRgb = hexToRgb(color);
    const glowRgb = hexToRgb(glow);

    ctx.save();
    ctx.lineCap = opt.isRound ? 'round' : 'butt';
    ctx.lineJoin = 'round';
    ctx.shadowBlur = opt.shadowBlur + frame.kick * 18;
    ctx.shadowColor = rgba(hexToRgb(opt.shadowColor), opt.shadowColorO ?? 1);

    // 降采样：太多点反而锯齿
    const step = Math.max(1, Math.floor(wave.length / 220));
    const pts = [];
    for (let i = 0; i < wave.length; i += step) {
      const x = (i / (wave.length - 1)) * W;
      const y = cy + wave[i] * amp * 0.5;
      pts.push(x, y);
    }

    // 主波
    ctx.lineWidth = Math.max(1.5, opt.lineWidth * 0.6);
    ctx.strokeStyle = rgba(glowRgb, opt.lineColorO ?? 1);
    smoothStroke(ctx, pts);

    // 镜像波（向下、低透明度）
    ctx.lineWidth = Math.max(1, opt.lineWidth * 0.4);
    ctx.strokeStyle = rgba(colorRgb, (opt.lineColorO ?? 1) * 0.5);
    ctx.save();
    ctx.translate(0, cy);
    ctx.scale(1, -1);
    ctx.translate(0, -cy);
    smoothStroke(ctx, pts);
    ctx.restore();

    ctx.restore();
  }
}

/** Catmull-Rom 经过点的三次贝塞尔平滑。pts: [x0,y0, x1,y1, ...] */
function smoothStroke(ctx, pts) {
  const n = pts.length / 2;
  if (n < 2) return;
  ctx.beginPath();
  ctx.moveTo(pts[0], pts[1]);
  for (let i = 0; i < n - 1; i++) {
    const p0x = pts[Math.max(0, i - 1) * 2];
    const p0y = pts[Math.max(0, i - 1) * 2 + 1];
    const p1x = pts[i * 2];
    const p1y = pts[i * 2 + 1];
    const p2x = pts[(i + 1) * 2];
    const p2y = pts[(i + 1) * 2 + 1];
    const p3x = pts[Math.min(n - 1, i + 2) * 2];
    const p3y = pts[Math.min(n - 1, i + 2) * 2 + 1];
    // Catmull-Rom → 贝塞尔控制点（tension=0.5）
    const c1x = p1x + (p2x - p0x) / 6;
    const c1y = p1y + (p2y - p0y) / 6;
    const c2x = p2x - (p3x - p1x) / 6;
    const c2y = p2y - (p3y - p1y) / 6;
    ctx.bezierCurveTo(c1x, c1y, c2x, c2y, p2x, p2y);
  }
  ctx.stroke();
}
