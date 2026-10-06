/* eslint-disable */
import { markRaw } from 'vue';
import { trackScrobble, trackUpdateNowPlaying } from '@/api/lastfm';
import { fmTrash, personalFM } from '@/api/others';
import { intelligencePlaylist } from '@/api/playlist';
import { getLyric, getTrackDetail, scrobble } from '@/api/track';
import {
  INDEX_IN_PLAY_NEXT,
  PLAY_PAUSE_FADE_DURATION,
  UNPLAYABLE_CONDITION,
} from '@/player/constants';
import { resolveAudioSource } from '@/player/audioSource';
import { loadPlaylistSource } from '@/player/playlistSource';
import {
  useSettingsStore,
  useLikedStore,
  useDataStore,
  useUiStore,
} from '@/stores';
import { isCreateMpris, isCreateTray } from '@/utils/platform';
import { readLocalStorageJSON } from '@/utils/storage';
import { ipcBridge } from '@/platform/bridge';
import { isDesktop } from '@/platform/env';
import shuffle from 'lodash/shuffle';

// howler 主包 36KB 且只有真正出声才需要；Player.ts 被主入口静态引入，
// 静态 import 会把它拖进首屏主 chunk。改为首次播放前动态加载，
// 之后复用同一个模块 promise（每次切歌 await 一次已 resolve 的 promise，
// 只多一个微任务，无感）。
let howlerModule: Promise<typeof import('howler')> | null = null;
const loadHowler = () => (howlerModule ??= import('howler'));

const delay = ms =>
  new Promise(resolve => {
    setTimeout(() => {
      resolve('');
    }, ms);
  });

/**
 * 把与「听到声音」无关的工作推到空闲时段 —— 那几百毫秒里任何额外请求都会
 * 挤占同一个 HTTP/1.1 连接池，直接推迟出声。
 *
 * @param {() => void} fn
 */
const runWhenIdle = fn =>
  typeof window.requestIdleCallback === 'function'
    ? window.requestIdleCallback(fn, { timeout: 2000 })
    : setTimeout(fn, 800);
// 播放进度每秒都在变，且已单独持久化到 localStorage.playerCurrentTrackTime
// （流式 UI 也直接读 _progress）。把它留在 saveSelfToLocalStorage 里，等于
// 每秒对含整份播放列表的 player 做一次 JSON.stringify + 同步写盘 —— 主线程
// 周期性卡顿的来源之一。
const excludeSaveKeys = [
  '_playing',
  '_personalFMLoading',
  '_personalFMNextLoading',
  '_progress',
  '_fadeSeq',
];

// 红心状态查询的记忆化。isCurrentTrackLiked 挂在镜像 getter 上，会被
// Player.vue 的重渲染每秒拉起（progress 每秒变化），而 liked.songs 可达
// 上万条，includes 是逐元素走响应式代理 get 陷阱的 O(n)。红心变更只会整体
// 替换 songs 数组（updateLikedXXX），引用不变则查询结果不变，按
// 「数组引用 + 曲目 id」记忆化即可安全复用，重复调用降为 O(1)。
let likedCheckMemo: {
  songs: unknown;
  trackID: unknown;
  liked: boolean;
} = { songs: null, trackID: null, liked: false };

function isTrackLiked(songs: any, trackID: any) {
  if (likedCheckMemo.songs !== songs || likedCheckMemo.trackID !== trackID) {
    likedCheckMemo = { songs, trackID, liked: songs.includes(trackID) };
  }
  return likedCheckMemo.liked;
}

function setTitle(track) {
  document.title = track
    ? `${track.name} · ${track.ar[0].name} - YesPlayMusic`
    : 'YesPlayMusic';
  if (isCreateTray) {
    ipcBridge.send('updateTrayTooltip', document.title);
  }
  useUiStore().updateTitle(document.title);
}

function setTrayLikeState(isLiked) {
  if (isCreateTray) {
    ipcBridge.send('updateTrayLikeState', isLiked);
  }
}

export default class {
  // Vue2 时代未声明的实例字段（declare 不产生 define 语义，运行时零变化）
  declare _current: any;
  declare _currentTrack: any;
  declare _enabled: any;
  declare _fadeSeq: any;
  declare _howler: any;
  declare _isPersonalFM: any;
  declare _lastTimePersist: any;
  declare _list: any;
  declare _loadErrorRetryMap: any;
  declare _loadToken: any;
  declare _loading: any;
  declare _localObjectUrl: any;
  declare _mprisListenerAttached: any;
  declare _pendingMprisMetadata: any;
  declare _personalFMLoading: any;
  declare _personalFMNextLoading: any;
  declare _personalFMNextTrack: any;
  declare _personalFMTrack: any;
  declare _playNextList: any;
  declare _playing: any;
  declare _playlistSource: any;
  declare _progress: any;
  declare _progressTimer: any;
  declare _repeatMode: any;
  declare _resourceLoadKey: any;
  declare _reversed: any;
  declare _shuffle: any;
  declare _shuffledCurrent: any;
  declare _shuffledList: any;
  declare _volume: any;
  declare _volumeBeforeMuted: any;
  /** Howler 当前加载的 mp3 地址（_loadMusicSuccess 时回填，缓存去重用） */
  declare nowMp3Url: any;

  constructor() {
    // 播放器状态
    this._playing = false; // 是否正在播放中
    this._progress = 0; // 当前播放歌曲的进度
    this._lastTimePersist = 0; // 上次写 playerCurrentTrackTime 的时刻
    this._enabled = false; // 是否启用Player
    this._repeatMode = 'off'; // off | on | one
    this._shuffle = false; // true | false
    this._reversed = false;
    this._volume = 1; // 0 to 1
    this._volumeBeforeMuted = 1; // 用于保存静音前的音量
    this._personalFMLoading = false; // 是否正在私人FM中加载新的track
    this._personalFMNextLoading = false; // 是否正在缓存私人FM的下一首歌曲

    // 播放信息
    this._list = []; // 播放列表
    this._current = 0; // 当前播放歌曲在播放列表里的index
    this._shuffledList = []; // 被随机打乱的播放列表，随机播放模式下会使用此播放列表
    this._shuffledCurrent = 0; // 当前播放歌曲在随机列表里面的index
    this._playlistSource = { type: 'album', id: 123 }; // 当前播放列表的信息
    this._currentTrack = { id: 86827685 }; // 当前播放歌曲的详细信息
    this._playNextList = []; // 当这个list不为空时，会优先播放这个list的歌
    this._isPersonalFM = false; // 是否是私人FM模式
    this._personalFMTrack = { id: 0 }; // 私人FM当前歌曲
    this._personalFMNextTrack = {
      id: 0,
    }; // 私人FM下一首歌曲信息（为了快速加载下一首）

    // 换曲状态机。两个字段都要在构造函数里声明，Vue2 才会把它们纳入响应式
    this._loading = false; // 是否在为当前曲目装载音源
    this._loadToken = 0; // 每次换曲自增，用于丢弃过期异步结果
    this._fadeSeq = 0; // 淡出代次：pause 挂起的 fade 回调据此判定是否已过期
    this._resourceLoadKey = null; // 正在装载的资源，避免重复点击叠加

    // howler (https://github.com/goldfire/howler.js)
    this._howler = null;
    Object.defineProperty(this, '_howler', {
      enumerable: false,
    });

    // _init 不在构造器里跑：singleton 会先包一层 Proxy 再经代理调用它，
    // 让恢复/换曲/定时器全链路都以 Proxy 为接收者，内部赋值才进得了
    // 镜像同步链路（构造器里 this 是裸实例，一跑就永久绕过陷阱）。
    window.yesplaymusic = {};
    window.yesplaymusic.player = this;
  }

  get repeatMode() {
    return this._repeatMode;
  }
  set repeatMode(mode) {
    if (this._isPersonalFM) return;
    if (!['off', 'on', 'one'].includes(mode)) {
      console.warn("repeatMode: invalid args, must be 'on' | 'off' | 'one'");
      return;
    }
    this._repeatMode = mode;
  }
  get shuffle() {
    return this._shuffle;
  }
  set shuffle(shuffle) {
    if (this._isPersonalFM) return;
    if (shuffle !== true && shuffle !== false) {
      console.warn('shuffle: invalid args, must be Boolean');
      return;
    }
    this._shuffle = shuffle;
    if (shuffle) {
      this._shuffleTheList();
    }
    // 同步当前歌曲在列表中的下标
    this.current = this.list.indexOf(this.currentTrackID);
  }
  get reversed() {
    return this._reversed;
  }
  set reversed(reversed) {
    if (this._isPersonalFM) return;
    if (reversed !== true && reversed !== false) {
      console.warn('reversed: invalid args, must be Boolean');
      return;
    }
    this._reversed = reversed;
  }
  get volume() {
    return this._volume;
  }
  set volume(volume) {
    this._volume = volume;
    this._howler?.volume(volume);
  }
  get list() {
    return this.shuffle ? this._shuffledList : this._list;
  }
  set list(list) {
    this._list = list;
  }
  get current() {
    return this.shuffle ? this._shuffledCurrent : this._current;
  }
  set current(current) {
    if (this.shuffle) {
      this._shuffledCurrent = current;
    } else {
      this._current = current;
    }
  }
  get enabled() {
    return this._enabled;
  }
  get playing() {
    return this._playing;
  }
  get currentTrack() {
    return this._currentTrack;
  }
  get currentTrackID() {
    return this._currentTrack?.id ?? 0;
  }
  get playlistSource() {
    return this._playlistSource;
  }
  get playNextList() {
    return this._playNextList;
  }
  get isPersonalFM() {
    return this._isPersonalFM;
  }
  get personalFMTrack() {
    return this._personalFMTrack;
  }
  get currentTrackDuration() {
    const trackDuration = this._currentTrack.dt || 1000;
    let duration = ~~(trackDuration / 1000);
    return duration > 1 ? duration - 1 : duration;
  }
  get progress() {
    return this._progress;
  }
  set progress(value) {
    if (this._howler) {
      this._howler.seek(value);
      // 与 seek() 同理：立刻回写，否则进度条按 getter 旧值回弹，最长 1s 后才追上
      this._progress = value;
      if (isCreateMpris) {
        ipcBridge.send('seeked', value);
      }
    }
  }
  get loading() {
    return this._loading;
  }
  get isCurrentTrackLiked() {
    return isTrackLiked(useLikedStore().liked.songs, this.currentTrack.id);
  }

  _init() {
    // 桌面歌词窗口只展示歌词，不恢复音频，避免重复拉取音源/创建 howler
    if (window.location.hash === '#/desktop-lyrics') {
      this._loadSelfFromLocalStorage();
      this._enabled = false;
      return;
    }
    this._loadSelfFromLocalStorage();
    this._howler?.volume(this.volume);

    if (this._enabled) {
      // 恢复当前播放歌曲
      this._replaceCurrentTrack(this.currentTrackID, false).then(() => {
        this._howler?.seek(localStorage.getItem('playerCurrentTrackTime') ?? 0);
      });
      this._initMediaSession();
    }

    this._setIntervals();

    // 初始化私人FM
    if (
      this._personalFMTrack.id === 0 ||
      this._personalFMNextTrack.id === 0 ||
      this._personalFMTrack.id === this._personalFMNextTrack.id
    ) {
      // 未登录 / 接口降级时 data 会缺项甚至整个为空，直接取下标会在首页抛
      // TypeError（控制台红、私人 FM 卡片永远空着）
      personalFM()
        .then(result => {
          const [current, next] = result?.data ?? [];
          if (!current) return;
          this._personalFMTrack = current;
          if (next) this._personalFMNextTrack = next;
        })
        .catch(() => {});
    }
  }
  _setPlaying(isPlaying) {
    this._playing = isPlaying;
    // 定时器的写盘有 5s 节流，暂停瞬间补一次，保证恢复位置精确到秒
    if (!isPlaying && this._howler !== null) {
      localStorage.setItem('playerCurrentTrackTime', this._progress);
    }
    if (isCreateTray) {
      ipcBridge.send('updateTrayPlayState', this._playing);
    }
  }
  _setIntervals() {
    // 清空旧句柄再起：本函数在每次初始化配置时都会被调用，原先裸调
    // setInterval 会让定时器逐个叠加，播放时间越久每秒的写盘次数越多
    clearInterval(this._progressTimer);
    // 同步播放进度。seek()/progress setter 都会即时回写 _progress，
    // 本定时器只负责播放期间推进产生的增量。
    this._progressTimer = setInterval(() => {
      if (this._howler === null || !this._playing) return;
      this._progress = this._howler.seek();
      // localStorage 同步写盘只用于崩溃/刷新后恢复，5s 一次足够；
      // 原先每秒一次 setItem 在渲染线程上白白阻塞
      const now = Date.now();
      if (now - this._lastTimePersist >= 5000) {
        this._lastTimePersist = now;
        localStorage.setItem('playerCurrentTrackTime', this._progress);
      }
      if (isCreateMpris) {
        ipcBridge.send('playerCurrentTrackTime', this._progress);
      }
    }, 1000);
  }
  /**
   * 取当前模式下的相邻曲目（next/prev 共用实现）：倒序时方向对调，循环模式
   * 开启时在两端环绕。返回 [trackID, index]。
   */
  _getSiblingTrack(isNext: boolean) {
    // 正序的下一首与倒序的上一首都朝列表尾部走，反之朝头部
    const offset = isNext !== this._reversed ? 1 : -1;
    const next = this.current + offset;

    // 「播放下一首」队列非空时优先消费它（仅 next 语义）
    if (isNext && this._playNextList.length > 0) {
      let trackID = this._playNextList[0];
      return [trackID, INDEX_IN_PLAY_NEXT];
    }
    // 循环模式开启，则重新播放当前模式下相对的相邻一首
    if (this.repeatMode === 'on') {
      if (this._reversed && this.current === 0) {
        // 倒序模式，当前歌曲是第一首：
        // next 环绕到列表最后一首，prev 则停在列表第一首
        return isNext
          ? [this.list[this.list.length - 1], this.list.length - 1]
          : [this.list[0], 0];
      } else if (this.list.length === this.current + 1) {
        // 已是列表最后一首：next 环绕回第一首，prev 则回到列表最后一首
        return isNext
          ? [this.list[0], 0]
          : [this.list[this.list.length - 1], this.list.length - 1];
      }
    }
    // 返回 [trackID, index]
    return [this.list[next], next];
  }
  _getNextTrack() {
    return this._getSiblingTrack(true);
  }
  _getPrevTrack() {
    return this._getSiblingTrack(false);
  }
  async _shuffleTheList(firstTrackID = this.currentTrackID) {
    let list = this._list.filter(tid => tid !== firstTrackID);
    if (firstTrackID === 'first') list = this._list;
    const shuffled = shuffle(list);
    // 数组必须整体重赋值：就地 unshift 不经过 Proxy set 陷阱（见 player/singleton.ts），
    // 镜像不更新、300ms 落盘调度也不触发
    this._shuffledList =
      firstTrackID === 'first' ? shuffled : [firstTrackID, ...shuffled];
  }
  /**
   * scrobble 推迟到空闲时段 —— 它发生在切歌瞬间，恰好是新曲音源也要出发的
   * 时候。sourceID 必须此刻快照，否则真正执行时已指向新的播放列表。
   */
  _scheduleScrobble(track, time, completed = false) {
    const sourceID = this.playlistSource.id;
    runWhenIdle(() => this._scrobble(track, time, completed, sourceID));
  }
  async _scrobble(track, time, completed = false, sourceID?) {
    // 换曲/播完都会触发且调用方不 await：外层 try 兜同步裸读，api 调用各自
    // .catch（try/catch 兜不住未 await 的 promise），失败只能降级不能悬空
    try {
      console.debug(
        `[debug][Player.js] scrobble track 👉 ${track.name} by ${track.ar[0].name} 👉 time:${time} completed: ${completed}`
      );
      const trackDuration = ~~(track.dt / 1000);
      time = completed ? trackDuration : ~~time;
      scrobble({
        id: track.id,
        sourceid: sourceID ?? this.playlistSource.id,
        time,
      }).catch(err =>
        console.debug('[debug][Player.js] scrobble failed:', err)
      );
      if (
        useDataStore().lastfm.key !== undefined &&
        (time >= trackDuration / 2 || time >= 240)
      ) {
        const timestamp = ~~(new Date().getTime() / 1000) - time;
        trackScrobble({
          artist: track.ar[0].name,
          track: track.name,
          timestamp,
          album: track.al.name,
          trackNumber: track.no,
          duration: trackDuration,
        }).catch(err =>
          console.debug('[debug][Player.js] lastfm scrobble failed:', err)
        );
      }
    } catch (err) {
      console.debug('[debug][Player.js] scrobble failed:', err);
    }
  }
  async _playAudioSource(source, autoplay = true) {
    // howler 懒加载（见文件顶部说明）；唯一 new Howl / Howler 全局操作都在本方法
    const { Howl, Howler } = await loadHowler();
    // 音源已拿到，UI 的「装载中」到此结束；后续只剩 <audio> 自身的缓冲
    this._loading = false;
    Howler.unload();
    // 双轨策略 ——「播放永远成功，可视化尽力而为」：
    //
    //  - 网易云自有域 (*.music.126.net / *.126.net / *.163yun.com) 与
    //    blob/data 源：实际返回 Access-Control-Allow-Origin: *，
    //    可以安全地把 <audio crossOrigin="anonymous"> 打开，
    //    这样 captureStream 拿到的音轨不会被 CORS 标脏，
    //    Web Audio 可视化才能拿到真实频谱。
    //
    //  - 其他第三方 CDN (kuwo / qq / migu / joox / bilibili 等 unblock 回源)
    //    不返回 CORS 头，一旦带 Origin 请求会被浏览器以 CORS 直接拦截
    //    (ERR_FAILED)。这种源必须裸加载（不设 crossOrigin），
    //    可视化由 ProceduralFrame 程序化兜底，绝不阻塞播放。
    //
    // Howler 的 html5 audio pool 会复用同一批 <audio> 元素，所以每次
    // 切歌都需要根据新源主动写正/清掉 crossOrigin，避免历史污染。
    const corsSafe = (() => {
      if (typeof source !== 'string') return false;
      if (source.startsWith('blob:') || source.startsWith('data:')) return true;
      try {
        const host = new URL(source, window.location.href).hostname;
        return /(^|\.)(music\.163\.com|126\.net|163yun\.com)$/i.test(host);
      } catch (_) {
        return false;
      }
    })();
    // 两处（audio pool + 当前 <audio> 节点）共用的 crossOrigin 写正/清理逻辑
    const applyCrossOrigin = (node: HTMLMediaElement) => {
      if (corsSafe) {
        if (node.crossOrigin !== 'anonymous') node.crossOrigin = 'anonymous';
      } else if (node.crossOrigin) {
        node.crossOrigin = null;
      }
    };
    try {
      if (Howler && Array.isArray(Howler._html5AudioPool)) {
        for (const el of Howler._html5AudioPool) {
          if (!el) continue;
          applyCrossOrigin(el);
        }
      }
    } catch (_) {}
    // markRaw：Howl 是含音频节点的重对象，只允许以裸引用存在（singleton 的
    // set 陷阱对 _howler 也不广播、镜像创建时也排除该键），这里再加一道
    // markRaw 兜底，防止未来有人把它挂进响应式状态后被 Proxy 深度包裹。
    this._howler = markRaw(
      new Howl({
        src: [source],
        html5: true,
        // Howler 在 _create 内会把这个值写到 <audio>.crossOrigin。
        // 'use-credentials' 会带 Cookie，对网易云不需要；'anonymous'
        // 仅声明这是匿名 CORS 请求，与上面 audio pool 同步。
        xhr: undefined,
        ...(corsSafe ? { html5PoolSize: undefined } : {}),
        preload: true,
        format: ['mp3', 'flac'],
        onend: () => {
          this._nextTrackCallback();
        },
        onload: () => {
          // 加载成功，清除该曲目的重试计数
          if (this._loadErrorRetryMap) {
            delete this._loadErrorRetryMap[this.currentTrackID];
          }
        },
      })
    );
    // 兜底：Howler 创建完 sound 后，对当前实际使用的 <audio> 节点
    // 再同步一次 crossOrigin，避免极少数情况下 pool 里没有可复用元素。
    try {
      const node = this._howler?._sounds?.[0]?._node;
      if (node) applyCrossOrigin(node);
    } catch (_) {}

    this._howler.on('loaderror', (_, errCode) => {
      // https://developer.mozilla.org/en-US/docs/Web/API/MediaError/code
      // code 3: MEDIA_ERR_DECODE
      if (errCode === 3) {
        this._playNextTrack(this._isPersonalFM);
        return;
      }

      // 防止 unblock / 网络源持续失败时无限循环重新拉取
      // 对同一首歌只允许一次重试，第二次失败直接跳到下一首
      const trackId = this.currentTrackID;
      this._loadErrorRetryMap = this._loadErrorRetryMap || {};
      const retried = this._loadErrorRetryMap[trackId] || 0;
      if (retried >= 1) {
        console.warn(
          `[Player.js] loaderror retry limit reached for track ${trackId} (code=${errCode}), skip to next`
        );
        delete this._loadErrorRetryMap[trackId];
        useUiStore().showToast(`无法播放 ${this.currentTrack?.name}`);
        this._playNextTrack(this._isPersonalFM);
        return;
      }
      this._loadErrorRetryMap[trackId] = retried + 1;

      const t = this.progress;
      this._replaceCurrentTrackAudio(this.currentTrack, false, false).then(
        replaced => {
          // 如果 replaced 为 false，代表当前的 track 已经不是这里想要替换的track
          // 此时则不修改当前的歌曲进度
          if (replaced) {
            this._howler?.seek(t);
            this.play();
          }
        }
      );
    });

    // Safari/iOS 自动播放策略：play() 返回的 promise 被拒绝时不应崩溃为未捕获异常
    // 此事件由 Howler 在底层 <audio>.play() 拒绝时触发，避免反复上报埋点
    this._howler.on('playerror', (_, err) => {
      console.warn('[Player] playerror:', err);
      this._setPlaying(false);
      // 让 UI 进入暂停状态等待用户手势再次点击播放
    });
    if (autoplay) {
      this.play();
      if (this._currentTrack.name) {
        setTitle(this._currentTrack);
      }
      setTrayLikeState(
        isTrackLiked(useLikedStore().liked.songs, this.currentTrack.id)
      );
    }
    this.setOutputDevice();
  }
  /**
   * @param {number|object} id 曲目 id 或曲目对象
   * @param {boolean=} autoplay
   * @param {string=} ifUnplayableThen
   * @param {object=} knownTrack 已拿到的曲目详情，传入可整条省掉 /song/detail
   * @returns {Promise<boolean>}
   */
  _replaceCurrentTrack(
    id,
    autoplay = true,
    ifUnplayableThen = UNPLAYABLE_CONDITION.PLAY_NEXT_TRACK,
    knownTrack = null
  ) {
    if (autoplay && this._currentTrack.name) {
      this._scheduleScrobble(this.currentTrack, this._howler?.seek());
    }

    // 每次换曲自增：详情与音源都是异步环节，回来时据此判断自己是否已被
    // 更晚的操作取代，避免「点了 A 又切到 B」时旧结果盖掉 B
    const token = ++this._loadToken;
    this._loading = true;

    return this._resolveTrack(id, knownTrack).then(track =>
      this._applyTrack(track, { autoplay, ifUnplayableThen, token })
    );
  }

  /**
   * 取曲目详情：优先用已知的，其次允许直接传对象，最后才走接口。
   *
   * @returns {Promise<object|null>}
   */
  _resolveTrack(id, knownTrack) {
    if (knownTrack) return Promise.resolve(knownTrack);
    if (id !== null && typeof id === 'object') return Promise.resolve(id);
    return getTrackDetail(id)
      .then(data => data?.songs?.[0])
      .catch(err => {
        console.warn('[Player] getTrackDetail failed:', err?.message || err);
        return null;
      });
  }

  /** 落定曲目并起播；token 失配代表期间已经切过别的曲目，直接丢弃 */
  _applyTrack(track, { autoplay, ifUnplayableThen, token }) {
    if (token !== this._loadToken) return false;
    if (!track) {
      this._loading = false;
      useUiStore().showToast('获取歌曲信息失败');
      return false;
    }
    // 第三方音源/旧格式曲目是 artists/album 结构，直接传对象起播时
    // （_resolveTrack 的对象分支）后续 setTitle/mediaSession/now-playing
    // 链统一按 ar/al 读，在这里归一一次
    track = {
      ...track,
      ar: track.ar ?? track.artists ?? [],
      al: track.al ?? track.album ?? {},
    };
    this._currentTrack = track;
    this._updateMediaSessionMetaData(track);
    return this._replaceCurrentTrackAudio(
      track,
      autoplay,
      true,
      ifUnplayableThen,
      token
    );
  }

  /**
   * @returns 是否成功加载音频，并使用加载完成的音频替换了howler实例
   */
  _replaceCurrentTrackAudio(
    track,
    autoplay,
    cacheNextTrack,
    ifUnplayableThen = UNPLAYABLE_CONDITION.PLAY_NEXT_TRACK,
    token = this._loadToken
  ) {
    return resolveAudioSource(track).then(async source => {
      // 音源是链路最后一跳，期间用户完全可能已经切到别的曲目
      if (token !== this._loadToken) return false;
      if (!source) {
        this._loading = false;
        useUiStore().showToast(`无法播放 ${track.name}`);
        this._skipUnplayable(ifUnplayableThen);
        return false;
      }
      // _playAudioSource 是 async（howler 懒加载），await 保证返回 true 时
      // _howler 已就位 —— loaderror 重试路径在返回后立即 seek/play
      await this._playAudioSource(source, autoplay);
      if (cacheNextTrack) this._cacheNextTrackWhenIdle();
      return true;
    });
  }

  _skipUnplayable(condition) {
    if (condition === UNPLAYABLE_CONDITION.PLAY_PREV_TRACK) {
      this.playPrevTrack();
    } else if (condition === UNPLAYABLE_CONDITION.PLAY_NEXT_TRACK) {
      this._playNextTrack(this.isPersonalFM);
    } else {
      useUiStore().showToast(`undefined Unplayable condition: ${condition}`);
    }
  }

  /**
   * 预缓存下一首，排到当前曲目缓冲完成后。
   *
   * 以前它在音源落地的同一 tick 里同步触发，等于在用户等待出声的那几百毫秒
   * 内先为下一首发出 /song/detail + /song/url，与首曲音频流争连接和带宽。
   */
  _cacheNextTrackWhenIdle() {
    const prefetch = () => runWhenIdle(() => this._cacheNextTrack());
    // 挂 'load' 而非 'play'：它标志当前曲已缓冲到可持续播放，此时抢占带宽
    // 是安全的；而 'play' 在自动播放被拦截时不会到来，会让预缓存整个丢失
    if (this._howler) this._howler.once('load', prefetch);
    else prefetch();
  }
  _cacheNextTrack() {
    let nextTrackID = this._isPersonalFM
      ? this._personalFMNextTrack?.id ?? 0
      : this._getNextTrack()[0];
    if (!nextTrackID) return;
    if (this._personalFMTrack.id == nextTrackID) return;
    getTrackDetail(nextTrackID)
      .then(data => {
        const track = data?.songs?.[0];
        if (!track) return;
        // 预缓存只走网易云源，不触发 unblock。
        // unblock 仅在用户实际播放该曲目且网易云无源时才尝试，失败再切下一首。
        resolveAudioSource(track, { allowUnblock: false });
      })
      .catch(() => {});
  }
  _loadSelfFromLocalStorage() {
    // 解析失败返回 null 走默认值，损坏的 key 已被 storage 收口函数摘除自愈
    const player = readLocalStorageJSON<Record<string, unknown> | null>(
      'player',
      null
    );
    if (!player) return;
    for (const [key, value] of Object.entries(player)) {
      this[key] = value;
    }
  }
  _initMediaSession() {
    if ('mediaSession' in navigator) {
      navigator.mediaSession.setActionHandler('play', () => {
        this.play();
      });
      navigator.mediaSession.setActionHandler('pause', () => {
        this.pause();
      });
      navigator.mediaSession.setActionHandler('previoustrack', () => {
        this.playPrevTrack();
      });
      navigator.mediaSession.setActionHandler('nexttrack', () => {
        this._playNextTrack(this.isPersonalFM);
      });
      navigator.mediaSession.setActionHandler('stop', () => {
        this.pause();
      });
      navigator.mediaSession.setActionHandler('seekto', event => {
        this.seek(event.seekTime);
        this._updateMediaSessionPositionState();
      });
      navigator.mediaSession.setActionHandler('seekbackward', event => {
        this.seek(this.seek() - (event.seekOffset || 10));
        this._updateMediaSessionPositionState();
      });
      navigator.mediaSession.setActionHandler('seekforward', event => {
        this.seek(this.seek() + (event.seekOffset || 10));
        this._updateMediaSessionPositionState();
      });
    }
  }
  _updateMediaSessionMetaData(track) {
    if ('mediaSession' in navigator === false) {
      return;
    }
    let artists = track.ar.map(a => a.name);
    const metadata = {
      title: track.name,
      artist: artists.join(','),
      album: track.al.name,
      artwork: [
        {
          src: track.al.picUrl + '?param=224y224',
          type: 'image/jpg',
          sizes: '224x224',
        },
        {
          src: track.al.picUrl + '?param=512y512',
          type: 'image/jpg',
          sizes: '512x512',
        },
      ],
      length: this.currentTrackDuration,
      trackId: this.current,
      url: '/trackid/' + track.id,
    };

    navigator.mediaSession.metadata = new window.MediaMetadata(metadata);
    if (isCreateMpris) {
      this._updateMprisState(track, metadata);
    }
  }
  // OSDLyrics 会检测 Mpris 状态并寻找对应歌词文件，所以要在更新 Mpris 状态之前保证歌词下载完成
  async _updateMprisState(track, metadata) {
    if (!useSettingsStore().settings.enableOsdlyricsSupport) {
      return ipcBridge.send('metadata', metadata);
    }

    let lyricContent: any;
    try {
      lyricContent = await getLyric(track.id);
    } catch (err) {
      // 歌词拉取失败不能让 metadata 发送链悬空成 unhandled rejection
      console.warn('[Player] getLyric for mpris failed:', err);
      return ipcBridge.send('metadata', metadata);
    }

    if (!lyricContent.lrc || !lyricContent.lrc.lyric) {
      return ipcBridge.send('metadata', metadata);
    }

    // 监听器只注册一次 + metadata 走「最新待发送」槽位：旧实现每次换曲都
    // ipcBridge.on(...)，监听器线性累积，会把历史曲目元数据全重发一遍
    this._pendingMprisMetadata = metadata;
    if (!this._mprisListenerAttached) {
      this._mprisListenerAttached = true;
      ipcBridge.on('saveLyricFinished', () => {
        if (this._pendingMprisMetadata) {
          ipcBridge.send('metadata', this._pendingMprisMetadata);
        }
      });
    }
    ipcBridge.send('sendLyrics', {
      track,
      lyrics: lyricContent.lrc.lyric,
    });
  }
  _updateMediaSessionPositionState() {
    if ('mediaSession' in navigator === false) {
      return;
    }
    if ('setPositionState' in navigator.mediaSession) {
      navigator.mediaSession.setPositionState({
        duration: ~~(this.currentTrack.dt / 1000),
        playbackRate: 1.0,
        position: this.seek(),
      });
    }
  }
  _nextTrackCallback() {
    this._scrobble(this._currentTrack, 0, true);
    if (!this.isPersonalFM && this.repeatMode === 'one') {
      this._replaceCurrentTrack(this.currentTrackID);
    } else {
      this._playNextTrack(this.isPersonalFM);
    }
  }
  _loadPersonalFMNextTrack() {
    if (this._personalFMNextLoading) {
      return [false, undefined];
    }
    this._personalFMNextLoading = true;
    return personalFM()
      .then(result => {
        if (!result || !result.data) {
          this._personalFMNextTrack = undefined;
        } else {
          this._personalFMNextTrack = result.data[0];
          this._cacheNextTrack();
        }
        this._personalFMNextLoading = false;
        return [true, this._personalFMNextTrack];
      })
      .catch(() => {
        this._personalFMNextTrack = undefined;
        this._personalFMNextLoading = false;
        return [false, this._personalFMNextTrack];
      });
  }
  /** Discord Rich Presence 的统一开关：桌面端且用户未显式关闭 */
  _discordPresenceEnabled() {
    return (
      isDesktop() &&
      useSettingsStore().settings.enableDiscordRichPresence !== false
    );
  }
  _playDiscordPresence(track, seekTime = 0) {
    if (!this._discordPresenceEnabled()) {
      return null;
    }
    let copyTrack = { ...track };
    copyTrack.dt -= seekTime * 1000;
    ipcBridge.send('playDiscordPresence', copyTrack);
  }
  _pauseDiscordPresence(track) {
    if (!this._discordPresenceEnabled()) {
      return null;
    }
    ipcBridge.send('pauseDiscordPresence', track);
  }
  _playNextTrack(isPersonal) {
    if (isPersonal) {
      this.playNextFMTrack();
    } else {
      this.playNextTrack();
    }
  }

  appendTrack(trackID) {
    // Array 无 append（Vue2 原始笔误，一调即 TypeError）；整体重赋值以走 Proxy 同步链路
    this._list = [...this._list, trackID];
    if (this.shuffle) this._shuffledList = [...this._shuffledList, trackID];
  }
  playNextTrack() {
    // TODO: 切换歌曲时增加加载中的状态
    const [trackID, index] = this._getNextTrack();
    if (trackID === undefined) {
      this._howler?.stop();
      this._setPlaying(false);
      return false;
    }
    let next = index;
    if (index === INDEX_IN_PLAY_NEXT) {
      // 重赋值而非 shift()：就地出队不经过 Proxy set 陷阱，镜像/落盘不感知
      this._playNextList = this._playNextList.slice(1);
      next = this.current;
    }
    this.current = next;
    this._replaceCurrentTrack(trackID);
    return true;
  }
  async playNextFMTrack() {
    if (this._personalFMLoading) {
      return false;
    }

    this._isPersonalFM = true;
    if (!this._personalFMNextTrack) {
      this._personalFMLoading = true;
      let result = null;
      let retryCount = 5;
      for (; retryCount >= 0; retryCount--) {
        result = await personalFM().catch(() => null);
        if (!result) {
          this._personalFMLoading = false;
          useUiStore().showToast('personal fm timeout');
          return false;
        }
        if (result.data?.length > 0) {
          break;
        } else if (retryCount > 0) {
          await delay(1000);
        }
      }
      this._personalFMLoading = false;

      if (retryCount < 0) {
        let content = '获取私人FM数据时重试次数过多，请手动切换下一首';
        useUiStore().showToast(content);
        return false;
      }
      // 这里只能拿到一条数据
      this._personalFMTrack = result.data[0];
    } else {
      if (this._personalFMNextTrack.id === this._personalFMTrack.id) {
        return false;
      }
      this._personalFMTrack = this._personalFMNextTrack;
    }
    if (this._isPersonalFM) {
      this._replaceCurrentTrack(this._personalFMTrack.id);
    }
    this._loadPersonalFMNextTrack();
    return true;
  }
  playPrevTrack() {
    const [trackID, index] = this._getPrevTrack();
    if (trackID === undefined) return false;
    this.current = index;
    this._replaceCurrentTrack(
      trackID,
      true,
      UNPLAYABLE_CONDITION.PLAY_PREV_TRACK
    );
    return true;
  }
  saveSelfToLocalStorage() {
    let player = {};
    for (let [key, value] of Object.entries(this)) {
      if (excludeSaveKeys.includes(key)) continue;
      player[key] = value;
    }
    localStorage.setItem('player', JSON.stringify(player));
  }

  pause() {
    const howler = this._howler;
    if (!howler) return;
    const seq = ++this._fadeSeq;
    howler.fade(this.volume, 0, PLAY_PAUSE_FADE_DURATION);
    howler.once('fade', () => {
      // 代次守卫：淡出被 play/再次 pause 打断时旧回调直接丢弃
      //（howler 对被中断的 fade 会经 _stopFade 即时发 'fade'，无守卫会把
      // 旧回调提前触发；且 howler 实例已换新时旧回调绝不能碰新实例）
      if (seq !== this._fadeSeq || this._howler !== howler) return;
      this._howler?.pause();
      this._setPlaying(false);
      setTitle(null);
      this._pauseDiscordPresence(this._currentTrack);
    });
  }
  play() {
    const howler = this._howler;
    if (!howler) return;
    // 作废挂起的淡出暂停：淡出进行中点播放/媒体键，否则播放意图被
    // once('fade') 回调吞掉。此刻 playing() 仍为 true，下方 once('play')
    // 永不触发，必须在此直接从当前实际音量拉回目标值（常态下 from===to
    // 是无感 no-op，不能省略——fade 刚启动的 25ms 内 volume() 仍等于
    // 目标值，靠比较会漏掉恢复）
    this._fadeSeq++;
    if (howler.playing()) {
      howler.fade(howler.volume(), this.volume, PLAY_PAUSE_FADE_DURATION);
      return;
    }
    howler.play();
    howler.once('play', () => {
      this._howler?.fade(0, this.volume, PLAY_PAUSE_FADE_DURATION);
      this.nowMp3Url = this._howler._src;
      // 播放时确保开启player.
      // 避免因"忘记设置"导致在播放时播放器不显示的Bug
      this._enabled = true;
      this._setPlaying(true);
      if (this._currentTrack.name) {
        setTitle(this._currentTrack);
      }
      this._playDiscordPresence(this._currentTrack, this.seek());
      if (useDataStore().lastfm.key !== undefined) {
        // 与 _scrobble 同口径：lastfm 会话过期/断网时不能悬成每次起播一条 unhandled rejection
        trackUpdateNowPlaying({
          artist: this.currentTrack.ar[0].name,
          track: this.currentTrack.name,
          album: this.currentTrack.al.name,
          trackNumber: this.currentTrack.no,
          duration: ~~(this.currentTrack.dt / 1000),
        }).catch(err =>
          console.debug('[debug][Player.js] lastfm now playing failed:', err)
        );
      }
    });
  }
  playOrPause() {
    if (this._howler?.playing()) {
      this.pause();
    } else {
      this.play();
    }
  }
  seek(time = null, sendMpris = true) {
    if (isCreateMpris && sendMpris && time) {
      ipcBridge.send('seeked', time);
    }
    if (time !== null) {
      if (this._howler) {
        this._howler.seek(time);
        // _progress 平时只由 1s 定时器回写：不立刻同步的话，跳转后进度条与时间
        // 仍停在旧位置（最多滞后 1s），看起来就像「没跳到指定位置」
        this._progress = time;
      }
      if (this._playing)
        this._playDiscordPresence(this._currentTrack, this.seek(null, false));
    }
    return this._howler === null ? 0 : this._howler.seek();
  }
  mute() {
    if (this.volume === 0) {
      this.volume = this._volumeBeforeMuted;
    } else {
      this._volumeBeforeMuted = this.volume;
      this.volume = 0;
    }
  }
  setOutputDevice() {
    if (this._howler?._sounds.length <= 0 || !this._howler?._sounds[0]._node) {
      return;
    }
    const node = this._howler._sounds[0]._node;
    // Safari / iOS WebKit 不支持 setSinkId，做能力检测避免每次播放都抛错
    if (typeof node.setSinkId !== 'function') {
      return;
    }
    const device = useSettingsStore().settings.outputDevice;
    if (!device) return;
    try {
      const ret = node.setSinkId(device);
      if (ret && typeof ret.catch === 'function') {
        ret.catch(err => {
          console.warn('[Player] setSinkId failed:', err?.message || err);
        });
      }
    } catch (err) {
      console.warn('[Player] setSinkId threw:', err?.message || err);
    }
  }
  /**
   * @param {number[]} trackIDs
   * @param {number|string} playlistSourceID
   * @param {string} playlistSourceType
   * @param {number|string=} autoPlayTrackID 曲目 id，'first' 表示播第一首
   * @param {Map<number, object>=} trackIndex 详情接口附带的完整曲目对象，
   *   首曲命中时可跳过 /song/detail
   */
  replacePlaylist(
    trackIDs,
    playlistSourceID,
    playlistSourceType,
    autoPlayTrackID = 'first',
    trackIndex?
  ) {
    this._isPersonalFM = false;
    this.list = trackIDs;
    this.current = 0;
    this._playlistSource = {
      type: playlistSourceType,
      id: playlistSourceID,
    };
    if (this.shuffle) this._shuffleTheList(autoPlayTrackID);

    const targetID =
      autoPlayTrackID === 'first' ? this.list[0] : autoPlayTrackID;
    const index = this.list.indexOf(targetID);
    if (index >= 0) this.current = index;

    this._replaceCurrentTrack(
      targetID,
      true,
      UNPLAYABLE_CONDITION.PLAY_NEXT_TRACK,
      trackIndex?.get(targetID)
    );
  }
  playAlbumByID(id, trackID = 'first') {
    this._playResource('album', id, trackID);
  }
  playPlaylistByID(id, trackID = 'first', noCache = false) {
    this._playResource('playlist', id, trackID, { noCache });
  }
  playArtistByID(id, trackID = 'first') {
    this._playResource('artist', id, trackID);
  }
  /**
   * 资源播放的唯一入口：装载列表 → 落队 → 起播首曲。
   * 去重主要由 playlistSource 按 `type:id` 负责，这里挡住完全重复的触发。
   */
  _playResource(type, id, trackID = 'first', { noCache = false } = {}) {
    const key = `${type}:${id}|${trackID}`;
    if (this._resourceLoadKey === key) return;
    this._resourceLoadKey = key;

    loadPlaylistSource(type, id, { noCache })
      .then(({ trackIDs, trackIndex }) => {
        this.replacePlaylist(trackIDs, id, type, trackID, trackIndex);
      })
      .catch(err => {
        console.warn(
          `[Player] ${type} ${id} load failed:`,
          err?.message || err
        );
        useUiStore().showToast('播放列表加载失败');
      })
      .finally(() => {
        if (this._resourceLoadKey === key) this._resourceLoadKey = null;
      });
  }
  /**
   * 播放指定曲目，不改变播放队列的来源。
   *
   * @param {number|object} trackOrID 曲目 id 或已拿到的曲目对象
   * @returns {Promise<boolean>}
   */
  playTrack(trackOrID) {
    return this._replaceCurrentTrack(trackOrID);
  }
  playTrackOnListByID(id, listName = 'default') {
    // 双击「插队播放」曲目：曲目不在 _list，findIndex 会把 _current 置 -1 带偏后续顺序；正确语义是出队后起播
    if (this._playNextList.includes(id)) {
      this._playNextList = this._playNextList.filter(t => t !== id);
    } else if (listName === 'default') {
      this._current = this._list.findIndex(t => t === id);
    }
    this._replaceCurrentTrack(id);
  }
  playIntelligenceListById(id, trackID = 'first', noCache = false) {
    loadPlaylistSource('playlist', id, { noCache }).then(({ trackIDs }) => {
      if (trackIDs.length === 0) return;
      // 心动模式从当前歌单随机挑一首作为「心动起点」
      const seedID = trackIDs[Math.floor(Math.random() * trackIDs.length)];
      intelligencePlaylist({ id: seedID, pid: id })
        .then(result => {
          const ids = result.data.map(t => t.id);
          this.replacePlaylist(ids, id, 'playlist', trackID);
        })
        .catch(err => {
          console.warn(
            '[Player] intelligence playlist failed:',
            err?.message || err
          );
        });
    })
      // 外层 loadPlaylistSource 失败同样不能悬空（与 _playResource 口径一致）
      .catch(err => {
        console.warn(
          '[Player] intelligence list load failed:',
          err?.message || err
        );
        useUiStore().showToast('播放列表加载失败');
      });
  }
  addTrackToPlayNext(trackID, playNow = false) {
    // push() 是就地变更，绕过 Proxy set 陷阱 → next 页 UI 不更新、不落盘，
    // 必须整体重赋值（同 _shuffleTheList）
    this._playNextList = [...this._playNextList, trackID];
    if (playNow) {
      this.playNextTrack();
    }
  }
  playPersonalFM() {
    this._isPersonalFM = true;
    if (this.currentTrackID !== this._personalFMTrack.id) {
      this._replaceCurrentTrack(this._personalFMTrack.id, true);
    } else {
      this.playOrPause();
    }
  }
  async moveToFMTrash() {
    this._isPersonalFM = true;
    let id = this._personalFMTrack.id;
    if (await this.playNextFMTrack()) {
      fmTrash(id);
    }
  }

  sendSelfToIpcMain() {
    if (!isDesktop()) return false;
    let liked = isTrackLiked(useLikedStore().liked.songs, this.currentTrack.id);
    ipcBridge.send('player', {
      playing: this.playing,
      likedCurrentTrack: liked,
    });
    setTrayLikeState(liked);
  }

  switchRepeatMode() {
    if (this._repeatMode === 'on') {
      this.repeatMode = 'one';
    } else if (this._repeatMode === 'one') {
      this.repeatMode = 'off';
    } else {
      this.repeatMode = 'on';
    }
    if (isCreateMpris) {
      ipcBridge.send('switchRepeatMode', this.repeatMode);
    }
  }
  switchShuffle() {
    this.shuffle = !this.shuffle;
    if (isCreateMpris) {
      ipcBridge.send('switchShuffle', this.shuffle);
    }
  }
  switchReversed() {
    this.reversed = !this.reversed;
  }

  clearPlayNextList() {
    this._playNextList = [];
  }
  removeTrackFromQueue(index) {
    // splice() 就地变更绕过 Proxy set 陷阱，重赋值保证镜像/落盘同步
    this._playNextList = this._playNextList.filter((_, i) => i !== index);
  }
  loadLocalMusic() {
    const fileInput = document.createElement('input');
    fileInput.type = 'file';
    fileInput.style.display = 'none';
    fileInput.addEventListener(
      'change',
      event => {
        // 选完就销毁：原先 fileInput 从不 remove，每选一次文件 DOM 里就多一个孤儿节点
        fileInput.remove();
        const target = event.target as HTMLInputElement;
        const file = target.files && target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = ev => {
          const url = URL.createObjectURL(new Blob([ev.target.result]));
          // 上一首本地歌的 blob URL 在切源后已无人引用，此时释放才不会断流
          // （原先从不 revoke，每加载一个本地文件都永久泄漏一份全曲大小的 blob）
          if (this._localObjectUrl) URL.revokeObjectURL(this._localObjectUrl);
          this._localObjectUrl = url;
          this._playAudioSource(url, true).catch(() => {});
        };
        reader.readAsArrayBuffer(file);
      },
      false
    );
    fileInput.click();
  }
}
