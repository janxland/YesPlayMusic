/**
 * BaseRenderer
 * --------------------------------------------------------------
 * 渲染策略基类：约定生命周期 + 通用工具方法，子类只关注绘制。
 *
 *   resize(width, height, dpr)   — 尺寸/DPI 变化时调用
 *   draw(ctx, frame, opt, dtMs)  — 每帧调用
 *   dispose()                    — 释放资源（缓存等）
 */
import type { AVFrame, VisualizerSettings } from '../types.ts';

export class BaseRenderer {
  width = 0;
  height = 0;
  dpr = 1;
  /** resampleTo 的输出缓冲：draw 每帧调用，按目标长度复用避免稳态分配。
   *  返回值只在当帧 draw 内消费，下一帧覆写安全。 */
  protected _resampleBuf: Float32Array | null = null;

  resize(width: number, height: number, dpr: number) {
    this.width = width;
    this.height = height;
    this.dpr = dpr;
  }

  /**
   * 线性重采样到目标长度（长度相等时原样返回零拷贝）。
   * 输出缓冲跨帧复用，仅供当帧消费。
   */
  protected resampleTo(src: Float32Array, M: number): Float32Array {
    const N = src.length;
    if (N === M) return src;
    let out = this._resampleBuf;
    if (!out || out.length !== M) out = this._resampleBuf = new Float32Array(M);
    for (let i = 0; i < M; i++) {
      const t = (i / (M - 1 || 1)) * (N - 1);
      const lo = Math.floor(t);
      const hi = Math.min(N - 1, lo + 1);
      const f = t - lo;
      out[i] = src[lo] * (1 - f) + src[hi] * f;
    }
    return out;
  }

  /** 子类必须覆写。 */
  draw(
    _ctx: CanvasRenderingContext2D,
    _frame: AVFrame,
    _opt: VisualizerSettings,
    _dtMs?: number
  ): void {
    throw new Error('BaseRenderer.draw must be implemented by subclass');
  }

  dispose() {
    /* no-op */
  }

  /** 以半透明矩形产生"运动残影"——比 clearRect 更具流动感。 */
  motionFade(ctx: CanvasRenderingContext2D, alpha = 0.18) {
    ctx.save();
    ctx.globalCompositeOperation = 'destination-out';
    ctx.fillStyle = `rgba(0,0,0,${alpha})`;
    ctx.fillRect(0, 0, this.width, this.height);
    ctx.restore();
  }
}
