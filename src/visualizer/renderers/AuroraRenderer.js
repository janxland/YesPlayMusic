/**
 * AuroraRenderer (type 4)
 * --------------------------------------------------------------
 * 极光/液态氛围可视化（沉浸感主打）：
 *  - 3 层正弦波叠加生成"流体"基底，频率/相位/振幅由 bass/mid/treble 调制
 *  - 每层用横向多停留色 gradient（基色 → 旋转色 → 高亮色）
 *  - lighter 混合 + 高斯模糊（shadowBlur）形成柔光氛围
 *  - 节拍时所有层瞬时收缩/扩张呼吸
 */
import { BaseRenderer } from './BaseRenderer.js';
import {
  hexToRgb,
  rgba,
  shiftHue,
  adjustLightness,
} from '../core/ColorPalette.js';

const LAYERS = 3;
const SEG = 80; // 横向分段数

export class AuroraRenderer extends BaseRenderer {
  constructor() {
    super();
    this._t = 0;
  }

  draw(ctx, frame, opt, dt) {
    this._t += Math.min(0.05, (dt || 16) / 1000);
    const { width: W, height: H } = this;

    this.motionFade(ctx, 0.15);

    const baseY = H * opt.centerY;
    const breath = 1 + frame.kick * 0.18;

    const hueShift = (frame.centroid - 0.5) * 40;
    const baseColor = shiftHue(opt.lineColor, hueShift);
    const c1 = baseColor;
    const c2 = shiftHue(baseColor, 35);
    const c3 = adjustLightness(baseColor, 0.22);

    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.shadowBlur = opt.shadowBlur * 1.5;
    ctx.shadowColor = rgba(hexToRgb(opt.shadowColor), opt.shadowColorO ?? 1);

    for (let l = 0; l < LAYERS; l++) {
      const layerT = this._t * (0.6 + l * 0.25);
      // 层独立：振幅、频率、Y 偏移
      const sens = Number.isFinite(+opt.sensitivity) ? +opt.sensitivity : 1;
      const vBoost = Number.isFinite(+opt.vocalBoost) ? +opt.vocalBoost : 1;
      const amp =
        (60 +
          l * 30 +
          frame.loudness * 90 * sens +
          (frame.vocal || 0) * 140 * sens * vBoost) *
        breath;
      const freq = 0.0035 + l * 0.0015 + frame.mid * 0.003;
      const phase = layerT + l * 1.7;
      const yOff = baseY + (l - 1) * 40 * breath;
      const alpha = (0.16 + frame.bass * 0.2) * (1 - l * 0.18);

      const grad = ctx.createLinearGradient(0, yOff - amp, W, yOff + amp);
      grad.addColorStop(0, rgba(hexToRgb(c1), alpha));
      grad.addColorStop(0.5, rgba(hexToRgb(c2), alpha * 1.15));
      grad.addColorStop(1, rgba(hexToRgb(c3), alpha));
      ctx.fillStyle = grad;

      ctx.beginPath();
      ctx.moveTo(0, H);
      // 上沿：FM 调制噪声 —— 一个低频振荡调制另一个的相位，比纯 sin 叠加更"有机"。
      // 等价于一阶 phase-modulation 合成，可避免规则的驻波感。
      const modAmp = 1.7 + frame.treble * 1.4;
      for (let i = 0; i <= SEG; i++) {
        const x = (i / SEG) * W;
        const carrier = x * freq + phase;
        const modulator = Math.sin(x * freq * 0.45 - phase * 0.8) * modAmp;
        const detail = Math.sin(x * freq * 2.3 + phase * 1.6) * 0.28;
        const y = yOff + (Math.sin(carrier + modulator) + detail) * amp;
        ctx.lineTo(x, y);
      }
      ctx.lineTo(W, H);
      ctx.closePath();
      ctx.fill();
    }

    ctx.restore();
  }
}
