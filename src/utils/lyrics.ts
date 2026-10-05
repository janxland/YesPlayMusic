import { copyToClipboard } from './clipboard';

export function lyricParser(lrc) {
  return {
    lyric: parseLyric(lrc?.lrc?.lyric || ''),
    tlyric: parseLyric(lrc?.tlyric?.lyric || ''),
    romalyric: parseLyric(lrc?.romalrc?.lyric || ''),
    lyricuser: lrc.lyricUser,
    transuser: lrc.transUser,
  };
}

// regexr.com/6e52n
const extractLrcRegex =
  /^(?<lyricTimestamps>(?:\[.+?\])+)(?!\[)(?<content>.+)$/gm;
const extractTimestampRegex =
  /\[(?<min>\d+):(?<sec>\d+)(?:\.|:)*(?<ms>\d+)*\]/g;

/**
 * @typedef {{time: number, rawTime: string, content: string}} ParsedLyric
 */

// 解析 LRC 歌词字符串 → 按时间升序的行数组（ParsedLyric[]）
// @example parseLyric("[00:00.00] Hello, World!\n[00:00.10] Test\n");
export function parseLyric(lrc) {
  // 按 timestamp 排序的解析结果，插入位置用二分查找定位
  const parsedLyrics = [];

  // 找到该行应插入的下标（首个 time >= lyric.time 的位置）
  const binarySearch = lyric => {
    let time = lyric.time;

    let low = 0;
    let high = parsedLyrics.length - 1;

    while (low <= high) {
      const mid = Math.floor((low + high) / 2);
      const midTime = parsedLyrics[mid].time;
      if (midTime === time) {
        return mid;
      } else if (midTime < time) {
        low = mid + 1;
      } else {
        high = mid - 1;
      }
    }

    return low;
  };

  for (const line of lrc.trim().matchAll(extractLrcRegex)) {
    const { lyricTimestamps, content } = line.groups;

    for (const timestamp of lyricTimestamps.matchAll(extractTimestampRegex)) {
      const { min, sec, ms } = timestamp.groups;
      const validMs = ms?.slice(0, 2) ?? '00';
      const rawTime = `[${min}:${sec}.${validMs}]`;
      const time = Number(min) * 60 + Number(sec) + Number(validMs) * 0.01;

      const parsedLyric = { rawTime, time, content: trimContent(content) };
      parsedLyrics.splice(binarySearch(parsedLyric), 0, parsedLyric);
    }
  }

  return parsedLyrics;
}

/**
 * 在升序歌词时间轴里二分定位播放进度对应的行（最后一个 <= progress 的
 * 下标，重复时刻取最后一条；早于第一行返回 -1）。定时器每帧都问一次
 * 「现在是第几行」，O(log n) 让开销与歌词行数几乎无关。
 */
export function findActiveLyricIndex(times, progress) {
  let low = 0;
  let high = times.length - 1;
  let hit = -1;
  while (low <= high) {
    const mid = (low + high) >> 1;
    if (times[mid] <= progress) {
      hit = mid;
      low = mid + 1;
    } else {
      high = mid - 1;
    }
  }
  return hit;
}

function trimContent(content) {
  let t = content.trim();
  return t.length < 1 ? content : t;
}

// 复用 utils/clipboard 的 copyToClipboard（native API → execCommand 降级），
// 失败时保留原「手动复制」弹窗提示
export async function copyLyric(lyric) {
  try {
    await copyToClipboard(lyric);
  } catch {
    alert('复制失败，请手动复制！');
  }
}
