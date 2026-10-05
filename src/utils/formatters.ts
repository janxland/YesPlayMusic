// P0.3 / R1：全局 filter → 纯函数。
// 与旧 src/utils/filters.js 逐字节等价的实现，仅把旧的全局 filter 注册换成具名
// 导出；dayjs 插件注册是幂等操作，从每次调用提升到模块加载时执行一次。
// 模板用法 `x | f(a)` 一律改 `f(x, a)`（13 个 .vue 已随本 Zone 转换）。
// ⚠️ 文件暂时是 .js：当前 vue-cli 工具链没有 TypeScript 支持（无
// tsconfig / ts-loader），带运行时代码的 .ts 无法编译；D1 引入 TS 后
// 本文件原样改名 formatters.ts 即可。
import dayjs from 'dayjs';
import duration from 'dayjs/plugin/duration';
import relativeTime from 'dayjs/plugin/relativeTime';
import { getLocale } from '@/locale';

dayjs.extend(duration);
dayjs.extend(relativeTime);

export function formatTime(Milliseconds, format = 'HH:MM:SS') {
  if (!Milliseconds) return '';

  let time = dayjs.duration(Milliseconds);
  let hours = time.hours().toString();
  let mins = time.minutes().toString();
  let seconds = time.seconds().toString().padStart(2, '0');

  if (format === 'HH:MM:SS') {
    return hours !== '0'
      ? `${hours}:${mins.padStart(2, '0')}:${seconds}`
      : `${mins}:${seconds}`;
  } else if (format === 'Human') {
    let hoursUnit, minitesUnit;
    switch (getLocale()) {
      case 'zh-CN':
        hoursUnit = '小时';
        minitesUnit = '分钟';
        break;
      case 'zh-TW':
        hoursUnit = '小時';
        minitesUnit = '分鐘';
        break;
      default:
        hoursUnit = 'hr';
        minitesUnit = 'min';
        break;
    }
    return hours !== '0'
      ? `${hours} ${hoursUnit} ${mins} ${minitesUnit}`
      : `${mins} ${minitesUnit}`;
  }
}

export function formatDate(timestamp, format = 'MMM D, YYYY') {
  if (!timestamp) return '';
  if (getLocale() === 'zh-CN') format = 'YYYY年MM月DD日';
  else if (getLocale() === 'zh-TW') format = 'YYYY年MM月DD日';
  return dayjs(timestamp).format(format);
}

export function formatAlbumType(type, album) {
  if (!type) return '';
  if (type === 'EP/Single') {
    return album.size === 1 ? 'Single' : 'EP';
  } else if (type === 'Single') {
    return 'Single';
  } else if (type === '专辑') {
    return 'Album';
  } else {
    return type;
  }
}

export function resizeImage(imgUrl, size = 512) {
  if (!imgUrl) return '';
  let httpsImgUrl = imgUrl;
  if (imgUrl.slice(0, 5) !== 'https') {
    httpsImgUrl = 'https' + imgUrl.slice(4);
  }
  return `${httpsImgUrl}?param=${size}y${size}`;
}

export function formatPlayCount(count) {
  if (!count) return '';
  if (getLocale() === 'zh-CN') {
    if (count > 100000000) {
      return `${Math.floor((count / 100000000) * 100) / 100}亿`; // 2.32 亿
    }
    if (count > 100000) {
      return `${Math.floor((count / 10000) * 10) / 10}万`; // 232.1 万
    }
    if (count > 10000) {
      return `${Math.floor((count / 10000) * 100) / 100}万`; // 2.3 万
    }
    return count;
  } else if (getLocale() === 'zh-TW') {
    if (count > 100000000) {
      return `${Math.floor((count / 100000000) * 100) / 100}億`; // 2.32 億
    }
    if (count > 100000) {
      return `${Math.floor((count / 10000) * 10) / 10}萬`; // 232.1 萬
    }
    if (count > 10000) {
      return `${Math.floor((count / 10000) * 100) / 100}萬`; // 2.3 萬
    }
    return count;
  } else {
    if (count > 10000000) {
      return `${Math.floor((count / 1000000) * 10) / 10}M`; // 233.2M
    }
    if (count > 1000000) {
      return `${Math.floor((count / 1000000) * 100) / 100}M`; // 2.3M
    }
    if (count > 1000) {
      return `${Math.floor((count / 1000) * 100) / 100}K`; // 233.23K
    }
    return count;
  }
}
