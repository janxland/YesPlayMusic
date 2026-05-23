/**
 * ParticlesRenderer (type 3)
 * --------------------------------------------------------------
 * 节拍驱动的粒子星云：
 *  - 节拍触发时按强度爆发 N 颗粒子，从中心以随机角度+速度飞散
 *  - 粒子寿命内尺寸/透明度衰减，颜色根据谱质心渐变
 *  - 持续低频 bass 时中心生成轻量"漂浮粒子"营造氛围
 *  - 用对象池避免 GC 抖动
 */
import { BaseRenderer } from './BaseRenderer.js';
import {
  hexToRgb,
  rgba,
  shiftHue,
  adjustLightness,
} from '../core/ColorPalette.js';

const MAX_PARTICLES = 600;
const BURST_PER_BEAT = 36;
const AMBIENT_RATE = 0.15; // 每帧均匀概率

export class ParticlesRenderer extends BaseRenderer {
  constructor() {
    super();
    this._pool = [];
    this._alive = [];
    for (let i = 0; i < MAX_PARTICLES; i++) this._pool.push(emptyParticle());
  }

  draw(ctx, frame, opt, dt) {
    const dtSec = Math.min(0.05, (dt || 16) / 1000);
    const cx = this.width * opt.centerX;
    const cy = this.height * opt.centerY;

    this.motionFade(ctx, 0.12);

    const hueShift = (frame.centroid - 0.5) * 60;
    const baseColor = shiftHue(opt.lineColor, hueShift);
    const glowColor = adjustLightness(baseColor, 0.25);
    const baseRgb = hexToRgb(baseColor);
    const glowRgb = hexToRgb(glowColor);

    // 节拍爆发
    if (frame.beat) {
      const count = Math.floor(BURST_PER_BEAT * (0.6 + frame.intensity));
      for (let i = 0; i < count; i++) this._spawn(cx, cy, frame, 'burst');
    }
    // 环境漂浮
    if (Math.random() < AMBIENT_RATE + frame.bass * 0.5) {
      this._spawn(cx, cy, frame, 'ambient');
    }

    // 更新 + 绘制
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    const alive = this._alive;
    const next = [];
    for (let i = 0; i < alive.length; i++) {
      const p = alive[i];
      p.age += dtSec;
      if (p.age >= p.life) {
        this._release(p);
        continue;
      }
      // 物理：轻微向心阻尼，模拟空气感
      p.vx *= 0.985;
      p.vy *= 0.985;
      p.x += p.vx * dtSec;
      p.y += p.vy * dtSec;

      const t = p.age / p.life;
      const a = (1 - t) * p.alpha0;
      const r = p.size * (1 - t * 0.5);
      const rgb = p.kind === 'burst' ? glowRgb : baseRgb;

      const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, r);
      g.addColorStop(0, rgba(rgb, a));
      g.addColorStop(1, rgba(rgb, 0));
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
      ctx.fill();

      next.push(p);
    }
    this._alive = next;
    ctx.restore();
  }

  _spawn(cx, cy, frame, kind) {
    const p = this._pool.pop();
    if (!p) return;
    const angle = Math.random() * Math.PI * 2;
    const isBurst = kind === 'burst';
    const speed = isBurst
      ? 220 + Math.random() * 380 * (0.5 + frame.intensity)
      : 30 + Math.random() * 60;
    p.x = cx + (Math.random() - 0.5) * 12;
    p.y = cy + (Math.random() - 0.5) * 12;
    p.vx = Math.cos(angle) * speed;
    p.vy = Math.sin(angle) * speed;
    p.age = 0;
    p.life = isBurst ? 0.9 + Math.random() * 0.6 : 1.4 + Math.random() * 1.2;
    p.size = isBurst ? 4 + Math.random() * 7 : 1.5 + Math.random() * 3.5;
    p.alpha0 = isBurst ? 0.85 : 0.45;
    p.kind = kind;
    this._alive.push(p);
  }

  _release(p) {
    this._pool.push(p);
  }

  dispose() {
    this._alive.length = 0;
  }
}

function emptyParticle() {
  return {
    x: 0,
    y: 0,
    vx: 0,
    vy: 0,
    age: 0,
    life: 1,
    size: 1,
    alpha0: 1,
    kind: 'ambient',
  };
}
