# YesPlayMusic 缺陷与优化名单（共 56 项）

> 生成日期：2026-09-19
> 证据来源：dist 产物实测、eslint 全量、代码勘查、线上复测
> 约定：✅ = 第一批已修复并上线；🔶 = 代码已修但需 CDN/外部配合；⬜ = 待排期

## 第一批（已完成，已 deploy:cdn 上线）

以下 14 个缺陷点已修复，部署前后对比见文末。

### 一、白屏 / 首屏加载

| # | 位置 | 缺陷 | 证据 | 状态 |
|---|---|---|---|---|
| 1 | `public/index.html` | 首屏纯白等待：HTML 只有空 `<div id="app">`，JS 未到达前用户盯着白屏 | 旧版 FCP 672ms 前屏幕完全空白 | ✅ 新增内联 App Shell 骨架（导航栏 + 卡片网格 shimmer），挂载后淡出 |
| 2 | `public/index.html` | 深色模式闪白：主题由 JS 在 body 上设置，晚于首帧 | 旧版无 `data-theme`，body 背景默认白 | ✅ 内联脚本在 head 阶段预判主题，实测 `html` 背景立即为 `rgb(34,34,34)` |
| 3 | `public/index.html` | 资源加载失败后永久白屏，无任何提示（CDN 404 / 网络中断 / 运营商劫持） | 入口 JS 404 时页面完全空白无反馈 | ✅ 捕获 script/link error，1.2s 内给出「页面加载失败 + 重新加载」面板；另有 8s 兜底 |
| 4 | `public/index.html` / `src/utils/Player.js` | jsmediatags（49KB，第三方 cdn.bootcdn.net）无条件随首屏加载，仅「加载本地音乐」用到 | index.html 常驻 `<script defer>` | ✅ 改为调用时动态注入；顺带修掉 `fileInput` 从不 `remove()`、`URL.createObjectURL` 从不 `revokeObjectURL`（每选一首本地歌泄漏一份全曲 blob） |
| 5 | `src/views/album.vue:159`、`src/components/TrackListItem.vue:102` | lodash 桶导入把整个 lodash（~61KB）拖进共享 chunk（CJS 无法 tree-shake） | chunk-74d4c117 中 lodash 占约 61KB，被 9 个页面共享 | ✅ 改 `lodash/groupBy` 等子路径导入 |
| 6 | `src/App.vue:47` | 歌词页含 Vibrant 取色与歌词解析，被静态 import 打进首屏 index.js | index.js 264KB | ✅ 改异步组件 + `requestIdleCallback` 预热 + 首次打开后常驻（不丢滚动状态） |
| 7 | `vue.config.js:8` | `productionSourceMap: true` 每版生成 3.98MB map（占 dist 一半），deploy 本就不上传 | `find dist -name "*.map"` 合计 3,980KB，非 map 产物 3,896KB | ✅ 关闭 |
| 8 | `public/index.html` | 首屏无 `preconnect`/`dns-prefetch`，封面图（music.126.net）每张都要重新走 DNS+TCP+TLS | head 内无任何连接提示 | ✅ 补 `dns-prefetch` + `preconnect(crossorigin)`；百度统计 `defer` 改 `async` |

### 二、缓存 / 部署正确性

| # | 位置 | 缺陷 | 证据 | 状态 |
|---|---|---|---|---|
| 9 | `scripts/deploy-cdn.js` | `service-worker.js` / `precache-manifest.*.js` 文件名不含 hash，却被设 `max-age=31536000`；新版本发布后用户拿着旧路由表去请求已删除的 chunk → ChunkLoadError | 上传逻辑仅特判 index.html | 🔶 源站已改 `no-cache, no-store, must-revalidate`；CDN 层仍覆盖为 `max-age=2592000`，**需在腾讯云 CDN 控制台配规则** |
| 10 | `scripts/deploy-cdn.js` | 上传失败不重试，线上会长期处于「新 index.html 指向未上传的 hash chunk」混合态 | 历史部署出现过 1 个文件 socket hang up 后整站混合 | ✅ 退避重试 3 次（0.3s/0.6s） |

### 三、加载报错 / 健壮性

| # | 位置 | 缺陷 | 证据 | 状态 |
|---|---|---|---|---|
| 11 | `src/utils/request.js:160-200` | 响应错误拦截器不返回 `Promise.reject`，把 404/500/网络失败统一「翻译」成 `undefined`：调用方或在下一行读属性抛错，或被静默吞掉，页面停在 loading 态 | 第 185-198 行仅处理 301，其余路径无 return | ✅ 补 `return Promise.reject(error)` |
| 12 | `src/api/track.js:142` | `getCloudLyric` 先裸执行一次 `fetchLatest()`（返回值丢弃），再走缓存分支 → 每首云盘歌必定打 2 次网络请求 | 第 142 行独立语句 | ✅ 删除 |
| 13 | `src/utils/Player.js:243-251` | 私人 FM 未兜底：`result.data[0]` 在未登录/接口降级时抛 TypeError（首页控制台红错，FM 卡片永久空） | 用户曾反馈首页报 `personalFM e.data[0]` | ✅ 改为解构 + 空值守卫 + catch |
| 14 | `src/views/playlist.vue` | ① 歌单页缺 `beforeRouteUpdate`，/playlist/A → /playlist/B 组件复用不刷新；② `loadMore` 无 catch 无并发锁，失败后按钮永久转圈；③ 1s 的 NProgress 定时器无句柄 | 全文无 watch/beforeRouteUpdate；`.then` 无 `.catch` | ✅ 全部修复（含错误 toast + finally 复位 + 并发锁） |

### 四、运行时阻塞 / 泄漏

| # | 位置 | 缺陷 | 证据 | 状态 |
|---|---|---|---|---|
| 15 | `src/utils/Player.js:264` + `:44` | 播放进度每秒写 `_progress` → 触发 store 的 Proxy `set` → `saveSelfToLocalStorage()` 对含整份播放列表的 player 做 `JSON.stringify` + 同步写盘；且 `_setIntervals()` 重复调用会叠加定时器 | `excludeSaveKeys` 不含 `_progress`；`clearInterval` 全文件零命中 | ✅ `_progress` 移出持久化清单，定时器加句柄并在重建前清理 |

---

## 待办批次（42 项）

> 标注 ★ = 已由代码勘查给出精确行号并附带真实代码片段；未标 ★ = 扫描发现，动手前需二次复核。

### A. 包体积（对低端安卓最直接）— 8 项

| # | 位置 | 缺陷 | 建议 | 等级 |
|---|---|---|---|---|
| 16 | `src/components/FMCard.vue:50`、`src/views/lyrics.vue:319` | node-vibrant worker 于首屏 vendors 占约 54KB | 动态 import；或换 25KB 的 `vibrant.min.js` / 自研缩略图取色 | HIGH ★ |
| 17 | `src/utils/db.js:2` → `utils/Player.js:16` | Dexie 约 78KB 进首屏 | 动态 import（仅 Electron/缓存开启时需要） | HIGH ★ |
| 18 | `src/components/Navbar.vue:107`、`Win32Titlebar.vue:27`、`LinuxTitlebar.vue:30` | codicon 字体 71KB 无条件加载，两个平台标题栏被静态 import | 按 `process.platform` 动态引入；字体改 woff2 + `font-display: swap` | MEDIUM ★ |
| 19 | `src/registerServiceWorker.js:9` + `.env.production` | 跨源 CDN 导致 SW 永不注册，但仍在构建上传 | 不用 PWA 就移除插件与 import | MEDIUM ★ |
| 20 | `vue.config.js:92-97` | `LimitChunkCountPlugin maxChunks:20` 仍可能把按需块并进无关块 | 去掉 maxChunks，仅留 minChunkSize | LOW ★ |
| 21 | `src/assets/icons/index.js:5-7` | 44 个 svg 全量 eager 引入 | 按需 import 或 sprite 外链 | HIGH ★ |
| 22 | `src/App.vue` | Navbar/Player/Toast/Modal 全部静态引入 | 评估拆分 | LOW |
| 23 | 全局 | plyr、vue-audio-visual、music-metadata、browser-id3-writer 零引用却留在 dependencies | 清理依赖 | LOW ★ |

### B. 部署 / CDN — 4 项

| # | 位置 | 缺陷 | 建议 | 等级 |
|---|---|---|---|---|
| 24 | 腾讯云 CDN 控制台 | index.html 被 CDN 层覆盖为 30 天缓存 | 配置 `/*.html` 规则为 no-cache | HIGH |
| 25 | 腾讯云 CDN 控制台 | 仅支持 gzip，未开 Brotli | 开启后首屏传输可再降 15~20% | MEDIUM |
| 26 | `scripts/deploy-cdn.js` | 发布后无 CDN 刷新能力 | 调用 `PurgePathCache`（需 STS 授权） | MEDIUM |
| 27 | `scripts/deploy-cdn.js` | COS 上旧 hash 文件从不清理，长期堆积 | 保留最近 N 版后删除 | LOW |

### C. 加载报错 / 健壮性 — 12 项

| # | 位置 | 缺陷 | 建议 | 等级 |
|---|---|---|---|---|
| 30 | `src/views/home.vue:144/:149` | `data.list.artists.filter(...)`、`data.list.filter(...)` 未兜底，接口返回异常即抛错 | `?.` + `?? []` | HIGH ★ |
| 31 | `src/views/search.vue:214-218` | `getTracksDetail()` 无 keywords 竞态守卫（主搜索有，这里没有），`result.songs` 无兜底 | 同 keywords 快照守卫 | HIGH ★ |
| 32 | `src/views/coSearch.vue:11/:25` | 用对象字面量 `:key="{val, i}"`，每次渲染都是新对象 → 列表全量销毁重建 | 改 `:key="key"` | HIGH ★ |
| 33 | `src/views/coSearch.vue:157-175` | `fetchData` 无并发锁、无 catch，`curpage` 自增写在参数对象里 | 加锁 + catch + 拆出副作用 | HIGH ★ |
| 34 | `src/components/ModalNewPlaylist.vue:73` | 隐私开关失效：`this.private` 拼错（data 里是 `privatePlaylist`） | 改名 | HIGH ★ |
| 35 | `src/views/library.vue:367` | `getLyric(整个 song 对象)`，接口签名是 id → 请求变成 `/lyric?id=[object Object]` | 传 `.id` | HIGH ★ |
| 36 | `src/components/ModalAddTrackToPlaylist.vue:67` | `p.creator.userId` 无可选链 | `p.creator?.userId` | MEDIUM ★ |
| 37 | `src/views/next.vue:72-82` | 三个 watch 同时触发 `loadTracks()`，一次切歌可能重拉百余首详情 | 合并 + debounce + in-flight 锁 | MEDIUM ★ |
| 38 | `src/views/home.vue:102-105` | `activated()` 每次进首页重拉 5 个接口 | 加时间窗缓存 | MEDIUM ★ |
| 39 | `src/views/settings.vue:1471-1479` | lastfm 轮询 1s 无上限、无销毁清理 | 改 `storage` 事件监听 | MEDIUM ★ |
| 40 | `src/utils/request.js:54-64` | 30 处接口带 `params.timestamp` 使并发去重 key 每次不同 → 去重失效 | buildKey 剔除 timestamp | MEDIUM ★ |
| 41 | `src/utils/request.js:170` | 取消分支返回永不 settle 的 Promise | 返回带 canceled 标记的拒绝 | LOW ★ |

### D. 运行时阻塞 / 泄漏 — 8 项

| # | 位置 | 缺陷 | 建议 | 等级 |
|---|---|---|---|---|
| 42 | `src/views/lyrics.vue:488/:493` | created 里匿名注册 `keydown`/`fullscreenchange`，beforeDestroy 从不移除 | 具名化并移除 | HIGH ★ |
| 43 | `src/views/lyrics.vue:666` | 歌词高亮 50ms 轮询 + 每次 `findIndex` 全表扫描 | 改 100~200ms + 增量索引 | MEDIUM ★ |
| 44 | `src/views/lyrics.vue:684-690` | 换行时读 `offsetTop`/`clientHeight` 强制 layout | 缓存容器尺寸 | LOW ★ |
| 45 | `src/components/Scrollbar.vue:97-113` | 拖拽只绑鼠标事件，无触屏；无 beforeDestroy | 补 touch + 卸载 | HIGH ★ |
| 46 | `src/views/desktopLyrics.vue:152-157` | rAF 与 250ms interval 双循环调同一函数 | visibilitychange 时仅保留一个 | LOW ★ |
| 47 | `src/App.vue:104` | `keydown` 无 `beforeDestroy` 清理 | 补清理 | LOW ★ |
| 48 | `src/views/loginAccount.vue:294-323` | 二维码轮询 1s 无最大次数、无超时、无 catch | 加上限与退避 | MEDIUM ★ |
| 49 | `src/store/index.js:57-66` | Proxy set 对任意写都触发全量序列化 + IPC | 节流 + 白名单字段 | HIGH ★ |

### E. 安全（XSS）— 4 项

| # | 位置 | 缺陷 | 建议 | 等级 |
|---|---|---|---|---|
| 50 | `src/components/CoverRow.vue:35/:74-82` | v-html 直接渲染接口返回的 copywriter/description/updateFrequency | 改插值；artist 分支改 router-link | CRITICAL ★ |
| 51 | `src/views/playlist.vue:50` | v-html 渲染用户可编辑的歌单简介 | 改插值 + `white-space: pre-wrap` | CRITICAL ★ |
| 52 | `src/components/MvRow.vue:23/:65-76` | 自拼 `<a href>` 后 v-html，接口字段未转义（顺带导致整页刷新） | 改 router-link | HIGH ★ |
| 53 | `src/views/loginAccount.vue:112` | v-html | 改插值 | HIGH ★ |

### F. 可访问性 / 国际化 — 余下已登记 3 项 + 子项

| # | 位置 | 缺陷 | 建议 | 等级 |
|---|---|---|---|---|
| 54 | `src/assets/css/global.scss:99-103` | 全局 `focus { outline: none }` 且无 `:focus-visible` 替代 → 键盘用户完全看不到焦点 | 补 `:focus-visible` 焦点环 | CRITICAL ★ |
| 55 | `src/components/LazyImage.vue:6` + Cover/CoverRow/MvRow/library/loginUsername | 所有图片无 alt；封面用 div 当按钮，键盘不可达 | 透传 alt；改 `<button>` 或 role+tabindex | HIGH ★ |
| 56 | 全局 i18n | `$t` 覆盖率约 66%，硬编码中文约 120 处（settings.vue 23 处、VisualizerPanel.vue 32 处最多） | 补 locale key | MEDIUM ★ |

> 另外登记但未单列编号的可访问性问题（属第 55 项子项）：ButtonIcon 无 aria-label 机制、ContextMenu 无 role/键盘导航、Modal 无 Esc/焦点陷阱/aria-modal、settings.vue 中 20+ 个空 `<label>` 与 8 个无标签 `<select>`、Toast 无 `aria-live`、Navbar 中无 href 的 `<a>`。

---

## 第一批：部署前后对比（music.roginx.ink，2026-09-19）

### 确定性指标（同 CDN、同压缩算法）

| 指标 | 部署前 | 部署后 | 变化 |
|---|---|---|---|
| 首屏 JS 原始体积（vendors + index） | 846,376 B | 697,931 B | **-148,445 B（-17.5%）** |
| 首屏 JS 传输体积（gzip） | 260,082 B | 218,877 B | **-41,205 B（-15.8%）** |
| 首屏第三方脚本请求 | jsmediatags 49KB（cdn.bootcdn.net） | 0 | **-1 个请求 / -1 条 DNS+TLS** |
| 首屏骨架 | 无（纯白等待） | 静态 HTML 立即可见 | 白屏窗口被覆盖 |
| 资源加载失败时的表现 | 白屏无任何反馈 | 1.2s 出「重新加载」提示 | 不再无限等待 |
| sourcemap 产出 | 3.98MB | 0 | 构建产物减半 |

### 浏览器时序（办公网络，噪声较大，仅供参考）

| 场景 | TTFB | FP | FCP | LCP |
|---|---|---|---|---|
| 部署前（3 次） | 433 / 2428 / 277 | 536 / 2516 / 356 | 672 / 2516 / 356 | 1460 / 2604 / 476 |
| 部署后（4 次） | 515 / 1317 / 295 / 297 | 832 / 1400 / 364 / 348 | 984 / 1400 / 364 / 348 | 1772 / 1512 / 520 / 508 |

该网络下 JS 已不是瓶颈，且存在明显网络抖动（同一次测量 TTFB 波动 277~2428ms），
**时序数据不足以支撑性能结论**；可靠收益以「传输量 / 请求数 / 白屏观感」三项为准。

### 正确性复验

- 控制台：0 error / 0 warning / 0 未处理拒绝 / 0 失败请求
- 骨架自动消失（`shellGone: true`）、深色模式背景立即为 `#222`
- visualizer 6/6 通过
- eslint 无新增 error/warning（存量：mpris.js 2 空块、services.js 未用变量、request.js:72 空块、v-html 警告）

### 本次踩到并修掉的两个自检坑

1. **Vue2 的 `$mount('#app')` 是替换 `#app` 元素本身，不是往里插子节点** —— 观察 `#app` 的 childList 永远收不到通知，骨架会永久卡在屏幕上（z-index 9999）。改为观察 `document.body`。
2. **闭包里缓存的 `#app` 引用在挂载后指向被丢弃的旧节点** —— `isMounted()` 必须每次实时 `getElementById`。

这两个坑都是在无头浏览器里抓出来的：本地测量时代价为零，上线后就是全站白屏。
