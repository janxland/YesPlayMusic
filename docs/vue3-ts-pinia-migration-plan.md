# YesPlayMusic Vue2 → Vue3 + TS + Pinia 重构方案 v2

> 分支：`refactor/vue3-ts-pinia`（唯一允许承载重构的分支；master 保持线上 Vue2 版本随时可发）
> v2 修订要点：**快准稳解耦合** ——
> 1. 新增 **P0 解耦预备期**：能在 Vue2 上提前拆的雷全部提前拆（现有工具链验证，迭代最快、可逐项回滚），让平台切换 D1 的爆炸半径最小化；
> 2. **M1/M2 双里程碑**：Web 与桌面端解耦，Web 先行交付，electron 断链期明确化；
> 3. 新增**依赖方向铁律**：types→utils/player→api→stores→components→views 单向依赖，Player 核心与 api 层禁止反向 import store；
> 4. 验证闭环**脚本化**：`scripts/verify-domain.sh` 一键跑机械关卡。
>
> 铁律不变：**每改完一个领域必须走完 §6 五道关，全绿才进下一域、才提交；任一关红即回滚本域。**

---

## 1. 项目现状全景（2026-10 扫描）

### 1.1 技术栈与规模

| 项 | 现状 | 目标 |
|---|---|---|
| 框架 | Vue 2.6.11（Options API × 53 .vue，无 mixins） | Vue 3.5+ `<script setup>` |
| 构建 | vue-cli 4.5（webpack4 + svg-sprite-loader + node-loader） | Vite 7 + vue-tsc |
| 状态 | Vuex 3.4 单 store（574 行 + localStorage/IPC 两插件） | Pinia 多 store + TS |
| 路由 | vue-router 3.4.3（26 路由 / 23 视图） | vue-router 4 |
| i18n | vue-i18n 8（4 语言，22 文件用 `$t`） | vue-i18n 11 |
| 语言 | 全 JS | 全 TS（渐进） |
| 桌面端 | Electron 13 + vue-cli-plugin-electron-builder，**nodeIntegration: true** | electron-vite + 新 LTS + contextBridge |
| API 层 | 9 文件 1181 行，axios 封装（含去重/取消/缓存） | 同架构 + TS 泛型 |

### 1.2 雷区清单（R1–R14，含 v2 新探明项）

| # | 雷区 | 规模 | 处置 | 拆弹时机 |
|---|---|---|---|---|
| R1 | 模板管道 filter（7 个全局 filter，13 文件） | 语法直接报错 | 纯函数化 | **P0.3** |
| R2 | `$on/$off`（visualizer 3 组件） | 实例 API 移除 | mitt | **P0.4** |
| R3 | Vuex state 内嵌 Player 实例（Proxy 300ms 节流） | 与 Pinia 冲突 | 实例出仓为单例+事件 | **P0.2** |
| R4 | Vuex 插件：localStorage 持久化 + sendSettings IPC | 插件机制不同 | Pinia 插件 + watch | D3 |
| R5 | `Vue.filter/component/use/prototype`（3 处） | 全局 API 移除 | `app.*` | D1/D2 |
| R6 | svg-sprite-loader（webpack 专属） | 构建断 | vite-plugin-svg-icons（symbolId 不变） | D1 |
| R7 | `.node` 原生模块 rust-napi（node-loader） | 打包断 | electron-vite external | M2(D8) |
| R8 | `ipcRenderer` 全局直用 + `process.env.IS_ELECTRON`（11 文件） | 新版默认禁 nodeIntegration | **桥适配器先行收敛** | **P0.1** |
| R9 | `VUE_APP_*`/public/index.html/pages 配置 | vue-cli 专属 | `import.meta.env` + 根 index.html | D1 |
| R10 | Vue2-only 依赖：vue-gtag@1 / vue-clipboard2 / vue-slider-component@3 / vue-i18n@8 | 不兼容 Vue3 | 原生 API 或 @4 版（**v-model→modelValue**） | clipboard **P0.6**；i18n/gtag D1；slider D6 |
| R11 | node-vibrant worker 引入（3 处） | vite 加载方式不同 | 主线程 API 或 `?worker` | D2 |
| R12 | transition 类名 / `.native` / `$set` / `$children` / `$listeners` 等 | 编译错或静默变化 | 类名 **P0.5** 双写；其余 D2 codemod | 分散 |
| R13 | Electron 主进程 10 文件 + 内嵌 express API 服务 | Electron 断代 | 整域重做 | **M2(D8)** |
| R14 | **request.js import store+router（api 层反向依赖）**；electron/ipcRenderer.js 直连 Vuex+Vue 实例 | 循环依赖、迁移时互相卡死 | 回调注入解耦 | **P0.1/P0.9** |

---

## 2. 总路线：三段式（解耦后的最短安全路径）

```
P0 解耦预备期（Vue2 上做，8 项独立小提交，现有工具链验证）
   ↓  —— 此时代码已 80% "Vue3-ready"，D1 只剩纯平台事
M1 Web 里程碑（D1 平台切换 → D2–D7 业务域逐个 TS/Pinia/script-setup 化）
   ↓  —— M1 完成 = Web 版可上线（Vercel/COS 切流）
M2 桌面里程碑（D8 electron-vite + 新 Electron + contextBridge）→ D9 收尾合 master
```

**关键决策与理由：**

- **D1 之后 electron 构建断链是明知且接受的**（vue-cli-plugin-electron-builder 无法配 Vite）：master 分支继续发桌面版兜底，重构分支 Web 先行。`IS_ELECTRON` 门控代码通过 P0.1 桥接层保证在 Web 构建中可编译、无副作用。**不允许为保 electron 而把 D8 提前合并进 D1**（会做成一锅粥，违背解耦）。
- Vuex→Pinia 仍走**并存渐进**（官方 cookbook 路线），但 R3 已在 P0.2 拆掉，D3 变成纯状态平移，无类实例负担。
- GoGoCode 只在**单域单批次**上跑，转完人审 + 过五关；绝不全仓一次性跑（防语义破坏，稳）。

---

## 3. P0 解耦预备期（Vue2 上执行，每项独立提交+独立验证+独立回滚）

> 全部改动均为 **Vue2 兼容**代码。迭代速度最快（现有 dev/build/lint 直接验），且理论上可回流 master。顺序即依赖顺序，但 P0.7 与任意项并行。

### P0.1 IPC 桥适配器 + 平台判定收敛（R8/R14 半）
- 新建 `src/platform/bridge.js`：
  ```js
  // 唯一允许触碰 window.require('electron') 的地方
  import { isDesktop } from './env';
  const ipc = isDesktop() ? window.require('electron').ipcRenderer : null;
  export const ipcBridge = {
    send: (ch, ...args) => ipc?.send(ch, ...args),
    on: (ch, fn) => { ipc?.on(ch, fn); return () => ipc?.removeListener?.(ch, fn); },
    invoke: (ch, ...args) => ipc ? ipc.invoke(ch, ...args) : Promise.resolve(null),
  };
  ```
- 新建 `src/platform/env.js`：`isDesktop()` / `isDev()` 唯一出处（内部暂读 `process.env.IS_ELECTRON`，D1 时只改这一处为 `import.meta.env`）。
- **改造 11 个 ipcRenderer 使用点** → `ipcBridge`（含 LinuxTitlebar/Win32Titlebar/settings/Player.js/desktopLyrics.js/sendSettings 插件等）。`src/electron/ipcRenderer.js` 重写为纯事件接线：不 import store、不拿 vueInstance，动作通过注入回调（`wireIpc({ onPlay, onNext, onRoute, … })`），由 main.js 注入。
- **DoD**：`grep -rn "window.require('electron')" src` 仅 `platform/bridge.js` 1 处命中；`grep -rn 'process\.env\.IS_ELECTRON' src` 仅 `platform/env.js` 1 处；electron:serve 实测托盘菜单/媒体键仍工作。
- **收益**：M2 换 contextBridge 时只改 bridge.js 实现 + 主进程，11 个调用点零改动。

### P0.2 Player 出仓（R3，最重的一刀）
- 新建 `src/player/singleton.js`：`export const player = new Player()`；Proxy 300ms 节流持久化逻辑随迁到该模块（语义不变）。
- `store/index.js` 删掉 `store.state.player = player`；state 增加可序列化 `playerSnapshot`（currentTrack/playing/progress/volume…），由 singleton 内 mitt 事件回写（store 订阅 player，**player 永不 import store**——依赖方向铁律）。
- 组件取 `store.state.player.xxx` → 过渡期提供 `mapPlayerState` 辅助（内部映射 snapshot），D6/D7 各组件域到达时换 Pinia。
- **DoD**：`grep -n 'new Player()' src` 仅 singleton.js；播放/进度/刷新恢复全部正常（D5 的手动矩阵提前在这里跑一遍）；`playerCurrentTrackTime` 5s 节流 + 暂停补写语义保留。
- **收益**：D3 Pinia 化变成纯数据平移；Vue3 reactive 包类实例的坑提前消灭。

### P0.3 filters → 纯函数（R1）
- `src/utils/filters.js` → `src/utils/formatters.ts`（**顺手 TS 化**，纯函数零依赖）：`formatTime/formatDate/formatAlbumType/resizeImage/formatPlayCount/toHttps`。
- 13 个 .vue 的 `x | filter(args)` → `formatX(x, args)`。可先 GoGoCode 试转单批，人审。
- **DoD**：`grep -rEn '\| (formatTime|formatDate|formatAlbumType|resizeImage|formatPlayCount|toHttps)' src --include='*.vue'` = 0；抽 3 页（TrackList 歌单页/artistMV/mv）目测时间与播放数格式一致。

### P0.4 事件总线 → mitt（R2）
- `src/utils/bus.ts` = `mitt()`；visualizer 3 组件的 `$on/$off/$emit` → `bus.on/off/emit`。
- **DoD**：`grep -rn '\$on(\|\$off(\|\$once(' src` = 0（App.vue 里若有 new Vue() 总线一并清）；visualizer 面板开关/联动实测。

### P0.5 transition 双类名（R12 预拆）
- CSS 中 `.v-enter` 旁补 `.v-enter-from`、`.v-leave` 旁补 `.v-leave-from`（Vue2 忽略未知类，Vue3 认新名）。
- **DoD**：`grep -rn 'v-enter\b' src/assets src --include='*.scss' --include='*.vue'` 的每处都有配对 `*-from`；任一动画页目测不变。

### P0.6 vue-clipboard2 → navigator.clipboard（R10 预拆）
- locale/index.js 移除 `Vue.use(VueClipboard)`；使用点（$copyText）改 `navigator.clipboard.writeText` + toast 兜底。
- **DoD**：`grep -rn 'vue-clipboard2\|\$copyText' src` = 0；settings/歌单分享处复制实测；卸载依赖。

### P0.7 types/ 实体类型先行（纯增量，随时可做）
- `src/types/entities.d.ts`：Track/Album/Artist/Playlist/User/MV/Privilege…（宽松起步，未知字段 `unknown`）。零运行时影响，为 D4/D6/D7 供类型地基。

### P0.8 视觉基线快照
- 用本地 Skill `browser-use:web-gui-tester` 对 23 条路由在**当前 Vue2 版**截屏存 `docs/baseline/<route>.png`，另存一份 console 错误清单。此后 D1 完成后、每域完成后的目测对照基准（准）。

### P0.9 request.js 解耦（R14 另一半）
- 去掉 `import store/router`：改为 `configureRequest({ onUnauthorized, readSettings })` 由 main.js 注入。
- **DoD**：`grep -n "import store\|import router" src/utils/request.js` = 0；未登录 401 场景登出跳转正常。
- **收益**：api 层从此无反向依赖，D4 TS 化时无循环类型引用。

### P0 收尾验收
全部完成后：`pnpm serve` / `pnpm build` / `test:visualizer` / electron:serve 四绿 + §3.1 扫描清单中 R1/R2/R3/R8/R14 项归零。**此刻 D1 只剩纯平台事。**

---

## 4. 依赖方向铁律（架构解耦规则，全程有效）

```
types  ←  utils / player核心(禁 import store)  ←  api  ←  stores(pinia)  ←  components  ←  views  ←  router
                                                              ↑
                                              platform/(env·bridge)：可被任何层 import，自身零依赖
```

- **player 核心禁 import store**：单向靠事件回写（P0.2 已建立）。
- **api 层禁 import store/router**：P0.9 已建立。
- **stores 可以 import api/player/types；反向一律禁止**。code review 时用一句话检查：箭头只能从右往左指。
- 双栈期规则（Vuex↔Pinia 并存，D3–D7）：**单个组件内禁止混用两套 store**——要么全 Vuex 要么全 Pinia，切换在组件所属域的提交内一次完成（准，防状态两读撕裂）。

---

## 5. 扫描清单（可重复执行；每域开工前跑）

```bash
# 0) 分支护栏（§7，每次会话第一条）
git branch --show-current          # 必须 = refactor/vue3-ts-pinia

# 1) Vue2 残留模式（目标：随 P0/D2/D6/D7 逐项归零）
grep -rn '\$on(\|\$off(\|\$once(' src --include='*.vue' --include='*.js'
grep -rEn '\| (formatTime|formatDate|formatAlbumType|resizeImage|formatPlayCount|toHttps)' src --include='*.vue'
grep -rn 'Vue\.(filter|component|use|prototype|observable|set|delete)' src
grep -rn '\$set(\|\$delete(\|\$children|\$listeners|\$scopedSlots|\.native\b' src --include='*.vue'
grep -rn 'v-enter\b|v-leave\b' src --include='*.vue' --include='*.scss'
grep -rn 'new Vue(' src                                  # P0 后应仅剩 main 入口（D1 消灭）
grep -rn 'mapState|mapGetters|mapMutations|mapActions' src --include='*.vue'   # D6/D7 逐批归零
grep -rn '\$store\.(state|commit|dispatch)' src --include='*.vue'
grep -rn "window.require('electron')" src                 # 仅 platform/bridge.js
grep -rn 'process\.env\.IS_ELECTRON' src                  # 仅 platform/env.js
grep -rn 'VUE_APP_' src                                   # D1 归零
grep -rn 'require(' src --include='*.js' src/utils src/api # CJS 残留（vite ESM）
```

### 生成流水线（半自动，快+准）
1. **机械层**：GoGoCode（`gogogo` CLI，vue2-to-vue3 transform）——只跑单域单批次，git diff 人审。覆盖：管道 filter 残漏、`.native`、`$set`、transition、`$listeners`→`$attrs`。
2. **语义层**：AI/人工按域重写（script setup / Pinia / TS），每组件一次到位不返工。
3. **产物层**：本地 Skill `vue-sfc-refactor-verify` 做产物↔产物多重集比对，证明"零行为变化"类改动等价。

---

## 6. 每域统一验证闭环（五道关 + 一键脚本）

### 一键机械关（快）
```bash
./scripts/verify-domain.sh <域名>   # 依次跑：vue-tsc --noEmit → grep 断言组 → vite build → test:visualizer
```
脚本按 §5 清单实现，域名映射到该域的断言组；输出 PASS/FAIL 摘要。

### 五道关明细
1. **编译关**：`pnpm vue-tsc --noEmit`（渐进期只圈已迁移文件）+ `pnpm build` 零 error/warning。
2. **静态断言关**：该域对应 §5 grep 命中归零（或计划内豁免，豁免写进提交信息）。
3. **运行时 GUI 关**：dev server + Skill `browser-use:web-gui-tester`——23 路由逐条开、console 零 error（compat deprecation 警告只记数须逐域下降）；域交互 ≥2 条真实点击流。**涉 electron 的域必须 electron:serve 实测（M2 期间尤其），不允许只验浏览器版。**
4. **产物等价关**（"零行为变化"域必做；引用 Skill `vue-sfc-refactor-verify`）：dist-baseline 构建比对——chunk 数不变、CSS 规则多重集除 scope 后缀外全等、`data-v` CSS 集合 ⊆ JS 集合。
5. **提交关**：`./scripts/assert-refactor-branch.sh` → 提交信息 `refactor(<域>): …` + 正文记录五关结果。

**任一关红 → `git checkout -- <本域文件>` 回滚，修好重来；禁止带红进下一域。**

---

## 7. 分支护栏（不变，三层）

1. **会话首查**：每次开工第一条命令 `git branch --show-current`，非 `refactor/vue3-ts-pinia` 禁止任何写操作。
2. **pre-commit 机械拦截**：`scripts/assert-refactor-branch.sh`（比较 `git branch --show-current`，不等即 exit 1）挂 husky 链首。
3. **发布闸门兜底（已有）**：deploy-cdn.js 仅放行 master；workflow 只监听 master push——**本分支可放心频繁推送远程备份，绝不触线上**。

---

## 8. M1：Web 里程碑（D1–D7）

### D1 平台切换（1–2 天，P0 之后爆炸半径已最小化）
- [ ] vue3.5 + @vue/compat（MODE:2）+ vue-router@4（createRouter/createWebHistory）+ vite + @vitejs/plugin-vue + vue-tsc + typescript + **vuex@4**（原 store 几乎零改动过渡）
- [ ] `vue.config.js` → `vite.config.ts`：`@` 别名、`/api` proxy、PWA→vite-plugin-pwa（保留 skipWaiting/clientsClaim 语义）
- [ ] svg-sprite-loader → vite-plugin-svg-icons（**symbolId `icon-[name]` 不变**，SvgIcon 零改动）
- [ ] `public/index.html`→根 index.html；`VUE_APP_*`→`VITE_*`；**只改 platform/env.js 一处**对接 `import.meta.env`
- [ ] main.js→main.ts：createApp + app.use；vue-i18n 8→11（**legacy:true 平移**，22 处 `$t` 零改动）；vue-gtag 1→2
- [ ] `package.json` scripts 全换 vite 命令；electron:* 脚本标记 `## M2 恢复` 注释保留
- **验证（全量五关）**：23 路由全开零 error；与 P0.8 截图基线目测比对；`vite preview` 产物可用；登录+播放冒烟。**此关结束即 M1 中点。**

### D2 内核清理（1 天）
- [ ] `Vue.filter/component/use` 残留 → `app.*`（icons/index.js、locale、main）
- [ ] node-vibrant worker → 主线程 API 或 `?worker`（3 处，实测取色）
- [ ] §5 剩余项 codemod：`.native`/`$set`/`$listeners` 等
- **DoD**：§5 第 1 组断言全零；FM/歌词页取色不串台。

### D3 状态层 Pinia（1 天，P0.2 后已是纯数据平移）
- [ ] 5 个 store：settings（持久化+IPC watch）/ playerSnapshot / liked / ui(modals·toast·contextMenu·showLyrics) / data
- [ ] localStorage **key 与结构 100% 冻结不变**（用户升级零感知）
- [ ] Vuex 与 Pinia 并存挂载，组件按域切换（双栈期规则 §4）
- **验证**：localStorage 前后 diff 一致；resetApp() 可用；electron 下 settings 变更达主进程；刷新续播。

### D4 API+类型层 TS 化（1–2 天）
- [ ] request.ts 泛型化；`src/api/*.js`→`.ts` ×9；utils 纯函数逐个 TS（formatters/coverPalette 已在 P0.3 TS 化）
- **验证**：vue-tsc 圈定范围零错；5 个 API 页面数据渲染正常。

### D5 播放器域（1 天，最高风险）
- [ ] `Player.js`→`src/player/player.ts`（补类型）；audioSource/playlistSource/constants→TS；与 P0.2 singleton 对接
- **验证**：test:visualizer 绿 + 手动矩阵（播放/切歌/取色/音量/进度/循环/随机/FM/续播）。

### D6 组件域（2–3 天，四批：基础UI→列表类→播放器UI→模态杂项）
- [ ] 每批 Options→`<script setup lang="ts">` + Vuex helper→Pinia（组件内一次换完，禁混用）
- [ ] B3 播放器 UI 批：vue-slider-component@3→@4（**v-model→modelValue**）
- **验证**：每批五关；B3 实测进度条拖动与全屏。

### D7 视图域（2 天，三批：高频页→详情页→低频特殊页）
- lyrics.vue 重点：时钟直写 DOM、取色竞态守卫等既有性能优化**语义原样保留**（产物关+实测双保险）
- **验证**：路由级冒烟 + 每页 1–2 条核心交互；settings 全开关走一遍。

**M1 验收 = D1–D7 全绿 + 全量五关 + 截图基线终比对 → 可切 Vercel/COS 灰度。**

---

## 9. M2：桌面里程碑（D8）+ 收尾（D9）

### D8 Electron（2 天）
- [ ] electron-vite 三段式（main/preload/renderer）；rust-napi external + electron-builder 迁移
- [ ] Electron 13→新 LTS 分小步（13→2x→3x），remote/tray/MPRIS/touchBar/dockMenu/desktopLyrics 逐个过
- [ ] nodeIntegration 关闭：preload + contextBridge expose；**platform/bridge.js 改为实现对接（11 调用点零改动——P0.1 兑现）**
- [ ] 内嵌 NeteseCloudMusicApi express 服务平移主进程侧
- **验证**：electron:serve 全功能点检（托盘/媒体键/快捷键/桌面歌词/更新检查）+ 打包 dmg 安装冒烟。

### D9 收尾（1 天）
- [ ] 摘 @vue/compat（控制台零 deprecation 后移除依赖）
- [ ] tsconfig strict:true；eslint→9 flat + @typescript-eslint；`pnpm check` 全绿
- [ ] 删 vuex/babel/jsconfig.json/vue.config.js 死配置；README/vercel/Dockerfile 构建命令更新
- [ ] 全量五关 + master 合并前用同套冒烟清单在 master 回归 → squash 或保留分域提交序列

---

## 10. 风险预案（v2 更新）

| 风险 | 预案 |
|---|---|
| D1 后 electron 断链期（D1→D8） | **明知接受**：master 持续发桌面版；README 顶部横幅声明；断链期内 electron:* 脚本禁用注释 |
| D1 大面积白屏 | compat MODE:2 + 全局错误处理器逐条修；24h 救不回 reset 回 P0 终点（P0 全部有效不浪费） |
| GoGoCode 破坏语义 | 只跑单域单批 + diff 人审 + 五关；绝不全仓跑 |
| node-vibrant vite 下失效 | 主线程 API（256/512px 封面可接受）或 `?worker` |
| localStorage 不兼容 | D3 关键验证：key/结构冻结，旧数据读出一致 |
| 长列表 reactive 性能回归 | 歌单/评论 `shallowRef`/`Object.freeze`；D6/D7 实测帧率 |
| Electron 升级断代超预期 | 分小步 13→2x→3x；M2 可整体延后不影响 M1 交付 |
| 双栈期状态撕裂 | §4 组件内禁混用两套 store；域提交内一次切换 |

---

## 11. 工具与技能

| 环节 | 工具 |
|---|---|
| 批量语法转换 | GoGoCode（单域单批）；vue-codemod 补刀 |
| 类型 | vue-tsc + Volar；tsconfig allowJs→strict 渐进（§D9 收紧） |
| GUI 验证 | Skill `browser-use:web-gui-tester`（23 路由冒烟 + 截图对照 P0.8 基线） |
| 产物验证 | Skill `vue-sfc-refactor-verify`（多重集比对/scope-id/chunk 数） |
| 测试 | `test:visualizer`（现有）；vitest 增量（可选） |
| 桌面 | electron-vite + electron-builder |

## 12. 参考资料

- v3-migration.vuejs.org（@vue/compat 章节）｜ pinia.vuejs.org/cookbook/migration-vuex.html
- Vue CLI→Vite 官方 Tooling 迁移步骤｜ electron-vite.org｜ gogocode.io
- TypeScript tsconfig（allowJs/checkJs 渐进）
- vite-plugin-svg-icons / vite-plugin-pwa 文档

## 13. 进度记录

### 2026-10-05 visualizer 域 TS 化（D6/D7 附带域，完成）
- `src/visualizer/**`（AudioVisual + core×5 + renderers×6）与
  `src/components/visualizer/coverColor` 全量 JS→TS；新增 `types.ts`
  （AVFrame/VisualizerSettings 等三源帧对齐类型）与 `av-env.d.ts`
  （`__avSource__`/`__AV_SHARED_CTX__`/`captureStream` 等原生对象扩展声明）。
- 域内相对导入统一带显式 `.ts` 扩展名（测试由 Node strip-types 裸跑，
  ESM 无扩展名不可解析）；tsconfig 加 `allowImportingTsExtensions`。
- `test:visualizer` 改 `node --experimental-strip-types`（本机 Node 22 /
  CI Node 24 均可用）；测试文件保持 `.test.js`，导入指向 `.ts` 模块。
- 顺带清理：WorkerAnalyzer 死字段（`_freqBuf`/`_timeBuf`/`_wantWaveform`）、
  `process.env.BASE_URL` → `import.meta.env.BASE_URL`（R9 残留）、
  `AudioVisual` 注释与 MAX_POLL 文案对齐（代码 30 次未动）。
- 五关结果：vue-tsc 0 错；vite build 通过（2.6s）；test:visualizer 6/6；
  prettier/lint 绿（lint:visualizer 收口为 `src/visualizer/__tests__`——
  eslint6+babel-eslint 无法解析 .vue `<script setup>` 宏与 .ts 语法，
  .vue/.ts 的正确性由 vue-tsc 关把守，待 D9 eslint 9 升级接管）；
  静态断言：域内无 `.js` 模块残留引用、无 `process.env`。
