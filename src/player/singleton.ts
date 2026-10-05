// Player 单例 + Proxy 契约：
// - 全仓唯一 new Player() 在本文件；player 永不 import store。
// - 落盘/IPC 拖尾合并：setter 触发 300ms 节流，pagehide 补写最后一次变更；
//   _progress 只广播镜像不排拖尾（见 set 陷阱注释）。
// - 接收者铁则：Player 运行期入口（_init 起）必须经 Proxy 调用——只有从代理
//   进入的调用链，其内部 this.x = v 才会触发 set 陷阱 → 镜像同步/落盘/IPC 不丢。
import Player from '@/utils/Player';

const rawPlayer = new Player();

let _playerSyncTimer: ReturnType<typeof setTimeout> | null = null;
const flushPlayerSync = (target: Player) => {
  if (_playerSyncTimer === null) return;
  _playerSyncTimer = null;
  target.saveSelfToLocalStorage();
  target.sendSelfToIpcMain();
};

type PlayerChangeListener = (prop: string | symbol, val: any) => void;
const changeListeners = new Set<PlayerChangeListener>();

// 原型访问器描述符缓存：类结构静态，热路径（set 陷阱）不必反复 getOwnPropertyDescriptor
const protoDescCache = new Map();
const protoDesc = prop => {
  if (!protoDescCache.has(prop)) {
    protoDescCache.set(
      prop,
      Object.getOwnPropertyDescriptor(Player.prototype, prop)
    );
  }
  return protoDescCache.get(prop);
};

const player = new Proxy(rawPlayer, {
  set(target, prop, val) {
    // 访问器写入（volume/progress…）要以 Proxy 为接收者调 setter：setter
    // 内部的 _x 赋值会再进本陷阱（数据分支）完成镜像同步。此处不广播——
    // 访问器字段在镜像上是 getter，实时反映 `_x`，广播反而会成环。
    const desc = protoDesc(prop);
    if (desc && desc.set) {
      desc.set.call(player, val);
      return true;
    }
    target[prop] = val;
    if (prop === '_howler') return true;
    // _progress 每秒由进度定时器回写（seek 时更频繁），是纯显示状态：
    // 已单独持久化到 playerCurrentTrackTime 且不在落盘载荷里，若照常排拖尾
    // 会变成每秒一次「整份 player stringify + IPC」的主线程抖动源。
    // 故只广播镜像，不排落盘。
    if (prop !== '_progress') {
      clearTimeout(_playerSyncTimer);
      _playerSyncTimer = setTimeout(() => flushPlayerSync(target), 300);
    }
    changeListeners.forEach(cb => {
      try {
        cb(prop, val);
      } catch (e) {
        console.error('[player/singleton] listener error:', e);
      }
    });
    return true;
  },
});

// 全链路启动（恢复 localStorage/私人 FM/定时器/MediaSession），接收者 = Proxy。
// _init 依赖 pinia 就绪（内部会 store.updateTitle），由 main.ts 显式调用。
export function initPlayer() {
  player._init();

  // 控制台调试句柄同样指向代理，行为与出仓前一致（改的就是活实例）
  window.yesplaymusic.player = player;

  // 关窗前落盘最后一次变更
  window.addEventListener('pagehide', () => {
    clearTimeout(_playerSyncTimer);
    flushPlayerSync(player);
  });
}

// 订阅 player 属性变更（store 用于回写响应式镜像），返回取消订阅函数
export function onPlayerChange(cb: PlayerChangeListener) {
  changeListeners.add(cb);
  return () => changeListeners.delete(cb);
}

// 生成 state.player 的响应式镜像：数据字段 = 实例自有可枚举属性（排除 _howler
// 与函数）；方法 = 原型方法委托并以 Proxy 为 this（内部赋值仍走 set 陷阱）；
// 访问器 get 以 mirror 为 this 调原 getter（模板能正确收集依赖），有 setter 的
// 委托真身、只读的保持只读。
// ⚠️ 原型成员必须用 getOwnPropertyDescriptor 区分，绝不能 `typeof proto[n]`
//   探测——那会真的执行 getter（this=prototype，`_currentTrack.dt` 直接 TypeError，
//   模块图炸断，全站白屏）。
export function createPlayerMirror(): any {
  const mirror = {};
  Object.keys(rawPlayer)
    .filter(k => k !== '_howler' && typeof rawPlayer[k] !== 'function')
    .forEach(k => {
      mirror[k] = rawPlayer[k];
    });
  Object.getOwnPropertyNames(Player.prototype)
    .filter(n => n !== 'constructor')
    .forEach(n => {
      const desc = protoDesc(n);
      if (typeof desc?.value === 'function') {
        // 注意：必须以 player(Proxy) 为接收者调用，内部 this.x = v 才会触发同步链路
        mirror[n] = (...args) => player[n](...args);
      } else if (desc && (desc.get || desc.set)) {
        const accessor: PropertyDescriptor = {
          // 必须经 this（= 响应式代理接收者）读 `_x`，Vue3 的依赖收集才能
          // 追踪到镜像数据字段；闭包直读裸 mirror 会绕过 proxy，
          // 组件将永远收不到 playing/progress 的更新。
          get: function () {
            return desc.get.call(this);
          },
          enumerable: true,
          configurable: true,
        };
        if (desc.set) {
          accessor.set = val => {
            player[n] = val;
          };
        }
        Object.defineProperty(mirror, n, accessor);
      }
    });
  return mirror;
}

export { player, rawPlayer };
export default player;
