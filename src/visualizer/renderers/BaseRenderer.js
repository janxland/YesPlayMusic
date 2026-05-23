/**
 * BaseRenderer
 * --------------------------------------------------------------
 * 渲染策略基类：约定生命周期 + 通用工具方法，子类只关注绘制。
 *
 *   resize(width, height, dpr)   — 尺寸/DPI 变化时调用
 *   draw(ctx, frame, opt, dtMs)  — 每帧调用
 *   dispose()                    — 释放资源（缓存等）
 */
export class BaseRenderer {
  constructor() {
    this.width = 0;
    this.height = 0;
    this.dpr = 1;
  }

  resize(width, height, dpr) {
    this.width = width;
    this.height = height;
    this.dpr = dpr;
  }

  /**
   * 子类必须覆写。
   * @param {CanvasRenderingContext2D} _ctx
   * @param {{
   *   bands: Float32Array,
   *   spectrum: Float32Array,
   *   bass: number, mid: number, treble: number, loudness: number,
   *   centroid: number, beat: boolean, intensity: number, kick: number,
   *   time: number,
   * }} _frame
   * @param {object} _opt
   * @param {number} _dtMs
   */
  draw(_ctx, _frame, _opt, _dtMs) {
    throw new Error('BaseRenderer.draw must be implemented by subclass');
  }

  dispose() {
    /* no-op */
  }

  /** 以半透明矩形产生"运动残影"——比 clearRect 更具流动感。 */
  motionFade(ctx, alpha = 0.18) {
    ctx.save();
    ctx.globalCompositeOperation = 'destination-out';
    ctx.fillStyle = `rgba(0,0,0,${alpha})`;
    ctx.fillRect(0, 0, this.width, this.height);
    ctx.restore();
  }
}
