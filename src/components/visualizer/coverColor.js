/**
 * 封面取色（自动识别）
 * --------------------------------------------------------------
 * 将封面缩绘到小画布后，用「色相直方图」统计有彩色像素：
 *   - 跳过灰阶（低饱和）与极暗 / 极亮像素，避免黑白封面拉偏统计；
 *   - 按饱和度加权投票，贪心选出最多 4 个色相分离（≥40°）的主导色；
 *   - 主色 = 第一主导色（鲜亮），阴影色 = 第二主导色加深
 *     （单一色相封面退化为第一主导色加深）；不足 4 色用色相偏移补足。
 *
 * 线程模型：直方图统计（唯一的重活）放入一次性 Web Worker，像素数据以
 * transferable 零拷贝转移；worker 脚本由本文件的自包含函数 toString
 * 拼装生成，与主线程回退路径共用同一函数体，不会算法漂移。
 *
 * CORS 要求：封面源需返回 CORS 头（网易 p1/p2 图片 CDN 支持），
 * 否则 canvas 被 taint、getImageData 抛错 —— 此时返回 null，
 * 调用方应保留当前配色。
 */
import {
  rgbToHsl,
  rgbToHex,
  hexToRgb,
} from '../../visualizer/core/ColorPalette.js';

/** 采样画布边长（48×48 ≈ 2304 像素已足够统计主色调）。 */
const SAMPLE_SIZE = 48;
/** 主导色数量。 */
const MAX_COLORS = 4;
/** Worker 兜底超时（ms）：超时即回退主线程同步计算。 */
const WORKER_TIMEOUT_MS = 3000;

/**
 * 从封面图 URL 提取 { line, shadow, colors } HEX 色组。
 * 加载失败 / canvas tainted / 无有效彩色像素时返回 null。
 */
export async function extractCoverPalette(url) {
  if (!url) return null;
  try {
    const img = await loadImage(url);
    const canvas = document.createElement('canvas');
    canvas.width = SAMPLE_SIZE;
    canvas.height = SAMPLE_SIZE;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(img, 0, 0, SAMPLE_SIZE, SAMPLE_SIZE);
    const { data } = ctx.getImageData(0, 0, SAMPLE_SIZE, SAMPLE_SIZE);
    // 重活（直方图）交给 Worker，任何环节失败都回退主线程同步计算
    const hues = await computeInWorker(data).catch(() => collectHues(data));
    return hues ? paletteFromHues(hues) : null;
  } catch (_) {
    // 加载失败或 canvas tainted（第三方源无 CORS 头）
    return null;
  }
}

/**
 * 像素数据 → 调色板（主线程回退路径 + 单测入口）。
 * 返回 { line, shadow, colors }，无有效彩色像素时返回 null。
 */
export function paletteFromHistogram(data) {
  const hues = collectHues(data);
  return hues ? paletteFromHues(hues) : null;
}

/** 由任意 HEX 主色派生配套阴影色（面板点选取色色板时复用）。 */
export function shadowFromHex(hex) {
  const [h] = rgbToHsl(hexToRgb(hex));
  return rgbToHex(hslToRgbL([h, 0.5, 0.13]));
}

/* ---------------------------------------------------------------- */

/**
 * 主导色相 → 最终调色板（worker 与主线程两条路径的公共收口）。
 * hues 按权重降序：[{ hue(0~360), l(0~1) }]。
 */
function paletteFromHues(hues) {
  const colors = hues.map(h =>
    rgbToHex(hslToRgbL([h.hue, 0.8, clampL(h.l, 0.5, 0.68)]))
  );
  // 主导色不足 4 个时，用主导色的色相偏移补足（确定性、不引入假采样）：
  // +25°、-25°、+50° …
  let i = 1;
  while (colors.length < MAX_COLORS) {
    const off = (i % 2 === 1 ? 1 : -1) * 25 * Math.ceil(i / 2);
    colors.push(
      rgbToHex(
        hslToRgbL([hues[0].hue + off, 0.8, clampL(hues[0].l, 0.5, 0.68)])
      )
    );
    i += 1;
  }
  // 阴影色优先取第二主导色相；饱和压到 0.5、明度压到 0.13 得到深色
  const sh = hues.length > 1 ? hues[1] : hues[0];
  const shadow = rgbToHex(hslToRgbL([sh.hue, 0.5, 0.13]));
  return { line: colors[0], shadow, colors };
}

/* ----------------------------------------------------------------
 * 以下函数会被 toString 序列化进 Blob Worker 脚本执行，
 * 必须完全自包含（不得引用模块内其他闭包变量），且避免 ES2020+ 语法。
 * ---------------------------------------------------------------- */

/**
 * 直方图统计 + 主导色相挑选（Worker 与主线程共用的唯一实现）。
 * 返回按权重降序的 [{ hue, l }]，无彩色像素时返回 null。
 */
function collectHues(data) {
  var BUCKETS = 36; // 36 桶 × 10°
  var MAXC = 4;
  var SEP = 4; // 主导色间最小间隔（桶），≈40°
  var buckets = [];
  var sums = [];
  for (var k = 0; k < BUCKETS; k++) {
    buckets.push(0);
    sums.push([0, 0, 0]);
  }
  var weight = 0;

  for (var i = 0; i < data.length; i += 4) {
    var r = data[i];
    var g = data[i + 1];
    var b = data[i + 2];
    var a = data[i + 3];
    if (a < 128) continue;

    var max = r > g ? (r > b ? r : b) : g > b ? g : b;
    var min = r < g ? (r < b ? r : b) : g < b ? g : b;
    var l = (max + min) / 510;
    var d = max - min;
    var s = max === 0 ? 0 : d / max;
    // 灰阶 / 极暗 / 极亮像素不参与投票
    if (s < 0.15 || l < 0.08 || l > 0.95) continue;

    var h;
    if (max === r) h = (g - b) / d + (g < b ? 6 : 0);
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h *= 60;

    var idx = Math.min(BUCKETS - 1, ((h / 360) * BUCKETS) | 0);
    var w = s; // 饱和度越高投票权重越大
    buckets[idx] += w;
    sums[idx][0] += r * w;
    sums[idx][1] += g * w;
    sums[idx][2] += b * w;
    weight += w;
  }

  // 无明显彩色（黑白 / 低饱和封面）
  if (weight === 0) return null;

  // 贪心挑选主导桶：权重最高者优先，且与已选桶保持环形间隔 ≥ SEP
  var weights = buckets.slice(); // 保留原始权重用于后续求桶内均色
  var picked = [];
  while (picked.length < MAXC) {
    var best = -1;
    for (var j = 0; j < BUCKETS; j++) {
      if (buckets[j] <= 0) continue;
      var farEnough = true;
      for (var p = 0; p < picked.length; p++) {
        var dist = Math.abs(j - picked[p]);
        dist = Math.min(dist, BUCKETS - dist); // 环形色相距离
        if (dist < SEP) {
          farEnough = false;
          break;
        }
      }
      if (!farEnough) continue;
      if (best === -1 || buckets[j] > buckets[best]) best = j;
    }
    if (best === -1) break;
    picked.push(best);
    buckets[best] = 0; // 该桶不再参与后续挑选
  }

  var hues = [];
  for (var q = 0; q < picked.length; q++) {
    var idx2 = picked[q];
    var bw = weights[idx2];
    if (bw <= 0) continue;
    // 桶内加权均色 → 只取明度，保留封面真实亮度层次
    var avg0 = sums[idx2][0] / bw;
    var avg1 = sums[idx2][1] / bw;
    var avg2 = sums[idx2][2] / bw;
    var mmax =
      avg0 > avg1 ? (avg0 > avg2 ? avg0 : avg2) : avg1 > avg2 ? avg1 : avg2;
    var mmin =
      avg0 < avg1 ? (avg0 < avg2 ? avg0 : avg2) : avg1 < avg2 ? avg1 : avg2;
    hues.push({ hue: (idx2 + 0.5) * (360 / BUCKETS), l: (mmax + mmin) / 510 });
  }
  return hues.length > 0 ? hues : null;
}

/** 自包含 clamp（worker 内可用）。 */
function clampL(v, lo, hi) {
  return v < lo ? lo : v > hi ? hi : v;
}

/** 自包含 HSL → RGB（worker 内可用，与 ColorPalette.hslToRgb 等价）。 */
function hslToRgbL(hsl) {
  var h = (((hsl[0] % 360) + 360) % 360) / 360;
  var s = clampL(hsl[1], 0, 1);
  var l = clampL(hsl[2], 0, 1);
  if (s === 0) {
    var v = Math.round(l * 255);
    return [v, v, v];
  }
  var q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  var p = 2 * l - q;
  function hue2rgb(pp, qq, t) {
    if (t < 0) t += 1;
    if (t > 1) t -= 1;
    if (t < 1 / 6) return pp + (qq - pp) * 6 * t;
    if (t < 1 / 2) return qq;
    if (t < 2 / 3) return pp + (qq - pp) * (2 / 3 - t) * 6;
    return pp;
  }
  return [
    Math.round(hue2rgb(p, q, h + 1 / 3) * 255),
    Math.round(hue2rgb(p, q, h) * 255),
    Math.round(hue2rgb(p, q, h - 1 / 3) * 255),
  ];
}

/* ---------------------------------------------------------------- */

/**
 * 像素数据转移给一次性 Worker 计算直方图。transferable 零拷贝，
 * 统计过程完全不占用主线程；超时 / 出错由调用方回退主线程。
 * 返回 [{ hue, l }] 或 null。
 */
function computeInWorker(imageData) {
  return new Promise((resolve, reject) => {
    if (typeof Worker === 'undefined') {
      reject(new Error('worker unavailable'));
      return;
    }
    let worker;
    try {
      worker = new Worker(workerUrl());
    } catch (_) {
      reject(new Error('worker unavailable'));
      return;
    }
    const timer = setTimeout(() => {
      worker.terminate();
      reject(new Error('worker timeout'));
    }, WORKER_TIMEOUT_MS);
    worker.onmessage = e => {
      clearTimeout(timer);
      worker.terminate();
      resolve(e.data);
    };
    worker.onerror = () => {
      clearTimeout(timer);
      worker.terminate();
      reject(new Error('worker error'));
    };
    // 拷贝一份再转移：原 ImageData 缓冲不受影响，回退路径仍可用
    const buf = imageData.buffer.slice(0);
    worker.postMessage({ buf }, [buf]);
  });
}

let _workerUrl = null;
/** 用本文件的自包含函数 toString 拼装 worker 脚本（单源、不漂移）。 */
function workerUrl() {
  if (_workerUrl) return _workerUrl;
  const src =
    [collectHues].map(f => f.toString()).join('\n') +
    '\nself.onmessage = function (e) {' +
    '\n  postMessage(collectHues(new Uint8ClampedArray(e.data.buf)));' +
    '\n};';
  _workerUrl = URL.createObjectURL(
    new Blob([src], { type: 'text/javascript' })
  );
  return _workerUrl;
}

function loadImage(url) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    // 必须带 CORS，否则 getImageData 会因 canvas tainted 抛错
    img.crossOrigin = 'anonymous';
    img.referrerPolicy = 'no-referrer';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('image load failed'));
    img.src = url;
  });
}
