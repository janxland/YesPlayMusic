/**
 * Visualizer 组件共享配置 / 工具
 * --------------------------------------------------------------
 * - 集中存放默认设置、INS 调色板、图标渲染函数与 localStorage 读写。
 * - 纯 JS 模块，无 Vue 运行时依赖（除了 render 函数用到的 h，会通过 Vue
 *   组件渲染时的 h 由调用方传入），便于按需 tree-shake。
 */

export const LS_KEY = 'visualizer.settings.v2';
export const LS_UI_KEY = 'visualizer.ui.v1';

/** INS 风默认调色板，首项即默认主题色。 */
export const PALETTES = Object.freeze([
  { name: 'INS 玫红', line: '#e1306c', shadow: '#262626' },
  { name: 'INS 日落', line: '#f77737', shadow: '#3a160a' },
  { name: 'INS 星空', line: '#833ab4', shadow: '#1a0a2e' },
  { name: 'INS 香槟', line: '#fcaf45', shadow: '#2a1c08' },
  { name: '深海', line: '#36d6ff', shadow: '#0a2230' },
  { name: '极光绿', line: '#5cffb1', shadow: '#0e2a22' },
]);

/** 默认窗口几何（左下角悬浮 40% × 38%）。 */
export const DEFAULT_BOUNDS = Object.freeze({
  x: 0.08,
  y: 0.55,
  w: 0.4,
  h: 0.38,
});

export const DEFAULT_SETTING = Object.freeze({
  centerX: 0.5,
  centerY: 0.55,
  lineWidth: 4,
  lineSpacing: 4,
  lineColor: '#e1306c',
  lineColorO: 0.95,
  shadowColor: '#262626',
  shadowColorO: 1,
  shadowBlur: 14,
  circleRadius: 180,
  circleEdge: 0.7,
  circleSplit: 2,
  circleRange: 360,
  isRound: true,
  type: 1,
  fftSize: 11,
  zIndex: 0,
  mode: 'cover',
  bounds: { ...DEFAULT_BOUNDS },
});

export function loadSetting() {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (raw) return { ...DEFAULT_SETTING, ...JSON.parse(raw) };
  } catch (_) {
    /* ignore parse errors */
  }
  return { ...DEFAULT_SETTING };
}

export function saveSetting(setting) {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(setting));
  } catch (_) {
    /* ignore quota errors */
  }
}

export function loadUiState() {
  try {
    const raw = localStorage.getItem(LS_UI_KEY);
    if (raw) return { enabled: false, panelOpen: false, ...JSON.parse(raw) };
  } catch (_) {
    /* ignore parse errors */
  }
  return { enabled: false, panelOpen: false };
}

export function saveUiState({ enabled, panelOpen }) {
  try {
    localStorage.setItem(LS_UI_KEY, JSON.stringify({ enabled, panelOpen }));
  } catch (_) {
    /* ignore quota errors */
  }
}

/* ---------- 图标组件工厂 ---------- */
const makeIcon = (name, paths) => ({
  name: `VisIcon${name}`,
  functional: true,
  render(h) {
    return h(
      'svg',
      { attrs: { viewBox: '0 0 24 24', width: 22, height: 22 } },
      paths.map(d =>
        h('path', {
          attrs: {
            d,
            fill: 'none',
            stroke: 'currentColor',
            'stroke-width': 1.8,
            'stroke-linecap': 'round',
            'stroke-linejoin': 'round',
          },
        })
      )
    );
  },
});

export const ICONS = Object.freeze({
  bars: makeIcon('Bars', ['M4 16V10', 'M9 18V6', 'M14 16V8', 'M19 14V11']),
  radial: makeIcon('Radial', [
    'M12 12 12 3',
    'M12 12 19.5 7.5',
    'M12 12 21 12',
    'M12 12 19.5 16.5',
    'M12 12 12 21',
    'M12 12 4.5 16.5',
    'M12 12 3 12',
    'M12 12 4.5 7.5',
  ]),
  wave: makeIcon('Wave', ['M3 12c2-6 4-6 6 0s4 6 6 0 4-6 6 0']),
  particles: makeIcon('Particles', [
    'M12 4v.01',
    'M5 8v.01',
    'M19 9v.01',
    'M7 17v.01',
    'M17 16v.01',
    'M12 12v.01',
    'M14 7v.01',
    'M9 14v.01',
  ]),
  aurora: makeIcon('Aurora', [
    'M3 16c3-3 6-3 9 0s6 3 9 0',
    'M3 12c3-3 6-3 9 0s6 3 9 0',
    'M3 20c3-3 6-3 9 0s6 3 9 0',
  ]),
});

export function iconFor(name) {
  return ICONS[name] || ICONS.bars;
}
