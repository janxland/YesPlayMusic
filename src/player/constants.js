/** 播放 / 暂停时的音量淡入淡出时长（毫秒） */
export const PLAY_PAUSE_FADE_DURATION = 200;

/** 命中「播放下一首」队列时的哨兵下标，此时应从队列弹出而非推进 current */
export const INDEX_IN_PLAY_NEXT = -1;

/** @readonly @enum {string} */
export const UNPLAYABLE_CONDITION = {
  PLAY_NEXT_TRACK: 'playNextTrack',
  PLAY_PREV_TRACK: 'playPrevTrack',
};
