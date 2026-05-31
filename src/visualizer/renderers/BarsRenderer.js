/**
 * BarsRenderer (type 0)
 * --------------------------------------------------------------
 * 大厂级镜像频谱柱：
 *  - 从中心向左右对称扩散的圆角柱
 *  - 顶部明亮、底部深沉的纵向线性渐变（实时色相漂移）
 *  - 底部反射倒影 + alpha 衰减
 *  - bloom 模糊光晕、节拍时整体微弹动 (1.0 → 1.06)
 *  - 动态运动残影（无需 clearRect）
 */
import { BaseRenderer } from './BaseRenderer.js';
import {
  hexToRgb,
  rgba,
  shiftHue,
  adjustLightness,
} from '../core/ColorPalette.js';

export class BarsRenderer extends BaseRenderer {
  draw(ctx, frame, opt /*, dt */) {
    const { width: W, height: H } = this;
    const cx = W * opt.centerX;
    // 频谱基线：固定贴在画布底部 1/4 处（baseY = H·0.78）。
    // 即便用户的 setting.centerY 滑块更高，也只在不低于此基线时生效，
    // 防止默认或误调把柱子顶到画面中部。
    const minBaseY = H * 0.78;
    const cy = Math.max(H * opt.centerY, minBaseY);
    const lineWidth = Math.max(1, opt.lineWidth);
    const spacing = Math.max(0.1, opt.lineSpacing);
    const step = lineWidth + spacing;

    // 单边可容纳柱数
    const halfBars = Math.max(8, Math.floor((W * 0.5) / step) - 2);
    const bands =
      frame.bands.length === halfBars
        ? frame.bands
        : resampleLog(frame.bands, halfBars);

    this.motionFade(ctx, 0.22);

    // 节拍微弹
    const pulse = 1 + frame.kick * 0.06;
    ctx.save();
    ctx.translate(cx, cy);
    ctx.scale(pulse, pulse);

    // 色相根据谱质心微调
    const hueShift = (frame.centroid - 0.5) * 40;
    const baseColor = shiftHue(opt.lineColor, hueShift);
    const topColor = adjustLightness(baseColor, 0.18);
    const baseRgb = hexToRgb(baseColor);
    const topRgb = hexToRgb(topColor);

    ctx.lineCap = opt.isRound ? 'round' : 'butt';
    ctx.lineWidth = lineWidth;
    ctx.shadowBlur = opt.shadowBlur;
    ctx.shadowColor = rgba(hexToRgb(opt.shadowColor), opt.shadowColorO ?? 1);

    const sens = Number.isFinite(+opt.sensitivity) ? +opt.sensitivity : 1;
    const vBoost = Number.isFinite(+opt.vocalBoost) ? +opt.vocalBoost : 1;
    // 柱子从基线向上长，最大高度 = 基线到顶部留 6% 余量后的距离，
    // 再硬顶 640px。这样无论窗口多高都不会顶到画面顶部。
    const headRoom = cy - H * 0.06;
    const maxH = Math.min(headRoom, 640);
    // 人声增益：在人声主导频段，柱高额外抬升（应用于 v 域，再做 soft-knee 压缩）。
    const vocalGain = (frame.vocal || 0) * 0.55 * vBoost;

    for (let i = 0; i < halfBars; i++) {
      const v = bands[i];
      if (v <= 0.001) continue;
      // 人声区位置加权（高斯状包络中心≈0.32）
      const t = i / halfBars;
      const vocalShape = Math.exp(-Math.pow((t - 0.32) / 0.18, 2));
      const vEff = v * (1 + vocalGain * vocalShape);
      // Soft-knee 压缩 1 - exp(-k·v)：
      //   k = 1.4·sens；k 越大曲线越陡（小信号更易抬升），但 v→∞ 仍渐近 1。
      //   v=1 时输出 ≈ 1-e^-1.4 ≈ 0.753 → 满量程也只占 maxH 的 75%，
      //   永远不会"一条线压满顶部"。
      const softMag = 1 - Math.exp(-1.4 * sens * vEff);
      const h = softMag * maxH + 2;
      const x = (i + 1) * step;

      // 主柱（左右镜像）
      drawBar(ctx, +x, h, lineWidth, baseRgb, topRgb, opt.lineColorO);
      drawBar(ctx, -x, h, lineWidth, baseRgb, topRgb, opt.lineColorO);
    }

    ctx.restore();
  }
}

/** 绘制一个带渐变 + 倒影的圆角柱。 */
function drawBar(ctx, x, h, w, baseRgb, topRgb, alpha) {
  const halfW = w / 2;
  // 主体渐变 (向上)
  const grad = ctx.createLinearGradient(0, -h, 0, 0);
  grad.addColorStop(0, rgba(topRgb, alpha));
  grad.addColorStop(1, rgba(baseRgb, alpha));
  ctx.fillStyle = grad;
  roundedRect(ctx, x - halfW, -h, w, h, halfW);
  ctx.fill();

  // 倒影 (向下，淡出)
  const refH = h * 0.45;
  const refGrad = ctx.createLinearGradient(0, 0, 0, refH);
  refGrad.addColorStop(0, rgba(baseRgb, alpha * 0.35));
  refGrad.addColorStop(1, rgba(baseRgb, 0));
  ctx.fillStyle = refGrad;
  roundedRect(ctx, x - halfW, 0, w, refH, halfW);
  ctx.fill();
}

function roundedRect(ctx, x, y, w, h, r) {
  const rad = Math.min(r, w / 2, Math.abs(h) / 2);
  ctx.beginPath();
  ctx.moveTo(x + rad, y);
  ctx.arcTo(x + w, y, x + w, y + h, rad);
  ctx.arcTo(x + w, y + h, x, y + h, rad);
  ctx.arcTo(x, y + h, x, y, rad);
  ctx.arcTo(x, y, x + w, y, rad);
  ctx.closePath();
}

/** 在已聚合的 bands 上做线性重采样到目标长度。 */
function resampleLog(src, M) {
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
