/**
 * Visualizer 域共享类型
 * --------------------------------------------------------------
 * 被 AudioAnalyzer / WorkerAnalyzer / ProceduralFrame（三源帧对齐）、
 * 五个 Renderer 与 AudioVisual 外观层共同引用。仅类型，无运行时代码。
 */

/** 可视化显示模式：cover = 全屏铺满；window = 自由窗口（外部容器决定尺寸）。 */
export type VisualizerMode = 'cover' | 'window';

/** 自由窗口模式的归一化边界（0..1，相对父容器）。 */
export interface VisualizerBounds {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** 「自动识别」随切歌下发的封面取色结果。 */
export interface AutoPalettePayload {
  line?: string;
  shadow?: string;
  colors?: string[];
}

/** 归一化后的完整可视化设置（AudioVisual._normalize 的输出形状）。 */
export interface VisualizerSettings {
  centerX: number;
  centerY: number;
  lineWidth: number;
  lineSpacing: number;
  lineColor: string;
  lineColorO: number;
  shadowColor: string;
  shadowColorO: number;
  shadowBlur: number;
  isRound: boolean;
  circleEdge: number;
  circleSplit: number;
  circleRadius: number;
  circleRange: number;
  /** FFT 大小指数，实际窗口 = 2^fftSize，n∈[5,15]。 */
  fftSize: number;
  /** 渲染器类型（RENDERER_FACTORY 的键）。 */
  type: number;
  /** 可视化幅度全局倍率，[0.2, 3]。 */
  sensitivity: number;
  /** 人声主导加权，[0, 2]。 */
  vocalBoost: number;
  /** 渲染层级。 */
  zIndex: number;
  mode: VisualizerMode;
  bounds: VisualizerBounds;
  /** 「自动识别」原始配置，仅用于判定是否派生 palette。 */
  autoPalette?: AutoPalettePayload | null;
  /** _normalize 派生：仅当自动识别主色/阴影色与当前配色一致时为循环色板。 */
  palette?: string[] | null;
  /** 关闭 Worker 分析器（调试用），默认开启。 */
  useWorker?: boolean;
}

/** 一帧分析结果：真实分析 / Worker / 程序化兜底三源的公共形状。 */
export interface AVFrame {
  bands: Float32Array;
  /** 真实源为 Float32Array（AGC 归一化）；程序化兜底为 Uint8Array（0..255）。 */
  spectrum: Float32Array | Uint8Array;
  waveform: Float32Array | null;
  bass: number;
  mid: number;
  treble: number;
  vocal: number;
  loudness: number;
  centroid: number;
  beat: boolean;
  intensity: number;
  kick: number;
  time: number;
}

/** 节拍检测单帧输出。 */
export interface BeatResult {
  beat: boolean;
  intensity: number;
  kick: number;
}

/** 封面取色最终调色板（coverColor 公共返回形状）。 */
export interface CoverPalette {
  line: string;
  shadow: string;
  colors: string[];
}

/** 直方图主导色相条目（hue: 0~360；l: 0~1 封面真实明度）。 */
export interface HueInfo {
  hue: number;
  l: number;
}
