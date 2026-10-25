# Vercel CDN Requests 降量方案（Agent 时代防白嫖）

> 生成日期：2026-10-25
> 触发事件：Vercel 账号 10-25 因用量超限暂停（CDN Requests 3M / 1M，30 天），
> 所有境外线路请求返回 `402 DEPLOYMENT_DISABLED`。
> 结论先行：**3M 请求的主因是「爬虫护栏从未真正部署 + API 反代计费」，
> 修复后预计回落到每月几十万次以内，无需升级套餐。**

---

## 1. 链路还原（实测确认）

```text
                       DNSPod 分线路解析（roginx.ink）
   境内用户 ──→ music.roginx.ink  A  103.52.153.223（成都 nginx）
                ├─ /            → COS www/music/dist/index.html
                ├─ /assets/*    → 同上（资源在 COS，publicPath=cos CDN）
                └─ /api/        → 127.0.0.1:3000（ncm 容器）        【不计 Vercel】

   境外用户/AI爬虫 ──→ music.roginx.ink  CNAME（境外线路）
                └─→ music.vercel.roginx.ink → Vercel 边缘
                     ├─ /* 静态   → 部署产物（自包含，publicPath=/）
                     └─ /api/*    → rewrite → https://ncmapi.roginx.ink/api
                                   （ncmapi = 成都同一台机器）       【每次都计费！】
```

| 事实 | 来源 |
|---|---|
| `music.roginx.ink` 境外线路 CNAME → Vercel；**只有它有分线路**，www/hutb/edu/web3/ncmapi 全球直连成都 | dns.google（海外解析）实测 |
| 境外线路的受众 = 所有「海外视角解析」的客户端：海外用户 **和开代理/VPN 的国内用户**（DNSPod 按解析源 IP 分线路；你自己的 402 就是经 Clash 撞上的） | 用户请求样本 + DNS 实测 |
| Vercel 项目 `ypm-music-landing` 绑定 music.roginx.ink / music.vercel.roginx.ink | Vercel API /v9/projects/:id/domains |
| 账号共 7 个项目共享 1M/月配额（Hobby） | Vercel API /v9/projects + /v2/teams |
| **线上部署（10-10, sha 55b089d）里没有 middleware.ts** | /v13/deployments/:uid/files，115 个文件 0 命中 |
| GH Actions 只上传 `dist/`，middleware.ts 留在仓库根 | `.github/workflows/deploy-vercel.yml` |
| ncmapi.roginx.ink 从海外可达（200），无境外/境内分线 | 海外出口实测 |
| ncmapi CORS：回显 Origin + allow-credentials | 实测响应头 |
| www.roginx.ink 的 KV 公开端点国内外全通（200 + CORS 回显任意 Origin） | 实测（国内直连 + 海外出口） |
| 登录态不依赖跨域 Cookie（`document.cookie` 首方写入 + 绝对地址走 query 传 cookie） | `src/utils/auth.ts` / `src/utils/request.ts` |

## 2. 计数规则（2026-10 联网核实）

- **"CDN Requests" 就是原 Edge Requests 改名**（2025 定价改版）：凡是到达 Vercel
  边缘的请求都计数，**缓存命中同样计数**；middleware 处理过的请求也算。
  → 唯一有效的降法是「让请求不到 Vercel」和「每个访客/爬虫产生更少的请求」，
  加缓存头只能省 CPU 与回源，省不了请求数。
- Hobby 含 1M 请求/月；账号是**全项目共享**（netease-cloud-music-api、
  chat-gpt-next-web 等 7 个项目一起算）。
- robots.txt 只是君子协定：Bytespider 等确认无视，必须在边缘层拦（UA/403）。
- llms.txt 目前主流 AI 爬虫基本不抓，属低成本的面向未来信号，不解决用量。
- 训练型爬虫与 AI 搜索爬虫应区别对待；本项目策略 = **喂元数据（bot.html）、
  掐资源（403）**，搜索/AI 引用不受影响。

## 3. 根因（按贡献排序）

1. **爬虫护栏从未生效（P0，致命）**：10-10 部署的 middleware.ts 不在线上产物里。
   爬虫拿到的是完整 SPA（index.html + 44 个 JS chunk + CSS + 图标），GPTBot/
   Bytespider/Semrush 一轮全量抓取就是上百次请求，且两个入口（境内外）同时挨抓
   ——与 10-07 COS 200 万请求/30 天的事故同源。
2. **API 反代计费（P0）**：`/api/*` rewrite 到 ncmapi，音乐 App 播放/歌词/轮询
   的每个请求都计 1 次 CDN Request，还额外消耗 CDN CPU（面板 20m16s/1h）。
3. 多项目共享配额被旧项目稀释（P1，待确认）：`netease-cloud-music-api` 等
   vercel.app 域名仍在服务旧流量。

## 4. 方案对比

| | 方案 A（推荐）：Vercel 收口为「纯静态镜像」 | 方案 B（兜底）：境外 DNS 直连成都 |
|---|---|---|
| 做法 | middleware 真正上线 + API 解耦 + 爬虫防线收口 | DNSPod 境外线路改 `A 103.52.153.223` |
| Vercel 用量 | 只剩人类访客的 HTML/资产 + bot.html（预计 ≪1M） | 归零 |
| 海外体验 | 边缘加速，API 直连成都（CORS） | 全链路直连成都，首字节 +150~300ms |
| 爬虫防线 | middleware（已写好，只是没部署） | 需在 nginx 重写一套 |
| 改动面 | 纯本仓库 + 一次部署 | 动 DNSPod（服务器上有凭据），影响面大 |
| 风险 | 低，可回滚 | 中，origin 直接暴露海外扫描 |

**决策：先 A。** 方案 B 作为「下一个周期仍超限」的兜底；ncmapi 已证明海外直连
origin 可行，B 随时可切，不需要预先动 DNS。

## 5. 执行清单

### P0（本次执行）

| # | 动作 | 文件 |
|---|---|---|
| 1 | **middleware.ts 随 dist 一起上传**（`cp middleware.ts dist/`）——本次事故的根修 | deploy-vercel.yml |
| 1b | **middleware 入口显式声明**：vercel.json 加 `proxy.entrypoint: "middleware.ts"` + dist 补最小 package.json（文件约定要求 middleware.ts 与 package.json 同级；dist 是 CLI 直传无构建，显式配置不赌自动检测——静默失效正是本次事故的模式）。bot 页改为**内联返回**（BOT_HTML 常量），去掉 self-fetch——内部回源会把每个爬虫页的计费请求数翻倍 | vercel.json / middleware.ts / deploy-vercel.yml |
| 2 | **API 与 Vercel 解耦**：构建注入 `VITE_NETEASE_API_URL=https://ncmapi.roginx.ink/api`（request.ts 检测到绝对地址自动走 query 传 cookie，登录态不受影响）；vercel.json 删除 /api rewrite | deploy-vercel.yml / vercel.json |
| 2b | **同源调用跟随解耦**：`flexiSite()`（KV 配置，ncmapi 不路由 KV → 走 **www.roginx.ink**——它全球直连成都且 CORS 回显；**不能用 music.roginx.ink**，其境外线路 CNAME 回 Vercel 会被 middleware 403）；`loginAccount.syncCredential()`（改走 request service） | src/api/others.ts / src/views/loginAccount.vue / src/utils/request.ts（导出 apiBase） |
| 3 | **/api 大门焊死**：middleware 对 `/api/*` 一律 403（该域名上不再有合法 API 流量，剩的都是爬虫与旧缓存）；补齐通用正则漏掉的 AI Agent UA（ChatGPT-User、Claude-Web、Meta-ExternalAgent、Google-Extended） | middleware.ts |
| 4 | 立即用 API token 本地构建并部署一次（不等 CI；恢复服务后 CI 自动接管） | vercel CLI |
| 5 | robots.txt 修正与 middleware 矛盾的注释；新增 llms.txt（静态、零成本） | public/ |

### P1（本次不改，观察后定）

- 面板 Observability 按 project 拆用量，确认 `netease-cloud-music-api` 等 6 个
  项目是否还在烧配额；**确认后删除或清空不再使用的项目（需你点头，删除不可逆）**。
- HTML 边缘缓存（s-maxage）只省 CPU 不省请求数，当前 CPU 20m/1h 用量健康，
  暂不动；若将来 CPU 逼近上限再加。

### P2（决策项，写给未来）

- 方案 B 切换步骤：DNSPod 境外线路 `music.roginx.ink` CNAME → `A 103.52.153.223`；
  同步在成都 nginx 补爬虫护栏（UA→bot.html、资源 403）。触发条件：方案 A 落地后
  一个完整计费周期仍超 1M。
- 账号恢复（⚠️ 2026-10-25 复查修正：**「等周期重置自动解除」不可靠**——社区多份
  报告显示暂停经常不随计费周期重置自动解除，需人工介入）。三条路，按成本排：
  1. **Vercel support 工单**（免费）：说明超量根因（护栏未部署的构建事故）已修复，
     请求解除暂停。社区案例多数走这条恢复；
  2. 升级 Pro（$20/月）立即恢复——方案 A 落地后下个周期可降回 Hobby；
  3. 等周期重置碰运气（面板看重置日，若未自动恢复回到 1）。
  若 Vercel 短期无法恢复且海外入口等不起，可直接执行方案 B（不依赖 Vercel）。

## 6. 验证

- 部署后 `GET /`（爬虫 UA）→ 200 bot.html 内容；`GET /assets/*.js`（爬虫 UA）→ 403；
  `GET /api/*` → 403；人类 UA → SPA 正常。
- 恢复后一个周期内观察面板：CDN Requests 应从 3M 量级跌到 10 万量级。
- 境内入口（music.roginx.ink 走成都）全程不受影响（构建产物不同，未动 deploy-cdn.yml）。

## 7. 回滚

- Vercel：上一次 READY 部署 `ypm-music-landing-44mqps3ha`（10-07）可即时回滚
  （dashboard Rollback 或 CLI）。注意回滚目标不含 middleware，仅应急。
- API 解耦回滚 = deploy-vercel.yml 删掉 `VITE_NETEASE_API_URL` 一行重新构建。
- middleware 回滚 = dist 里去掉 middleware.ts 与 vercel.json 的 proxy 段重新部署。

## 8. 复查记录（2026-10-25，对初版 Plan 的批判性核查）

初版执行完后做了一轮复查，对照 Vercel 官方文档（Routing Middleware conceptual +
JS reference）与 DNS/端点实测，发现并修正 4 个问题：

| # | 问题 | 严重度 | 修正 |
|---|---|---|---|
| 1 | **middleware 部署机制存疑**：`middleware.ts` 文件约定要求与 package.json 同级，而 `vercel deploy dist` 直传的 dist 里没有 package.json——只靠 cp 可能仍不被识别，静默失效（正是本次事故的失效模式） | 高 | vercel.json 显式 `proxy.entrypoint` + dist 补 `{"private":true,"type":"module"}`；middleware config 显式 `runtime:'nodejs'`。已核实：文件约定/显式入口二选一均合法，matcher 支持负向前瞻 regex，返回 `undefined`（文档示例即此语义）= 继续原链路，无需 `@vercel/functions` 依赖 |
| 2 | **Hobby 暂停恢复说法错误**：初版写「周期重置自动解除」；社区证据显示经常不会自动解除 | 高（影响决策） | §P2 已改写：support 工单优先 / 升 Pro / 等重置碰运气；方案 B 作为不依赖 Vercel 的兜底提前到可执行状态 |
| 3 | **flexiSite 的 KV 地址选错域名**：初版指向 music.roginx.ink——其境外线路 CNAME 回 Vercel，海外/代理用户会被 middleware 403（旧版对他们是 404，等于没修好） | 中 | 改为 www.roginx.ink（全球直连成都，国内外 200 + CORS 回显实测）。顺带确认：KV 在 Vercel 入口从来就是坏的（旧 /api rewrite → ncmapi → 404），本次是彻底修复 |
| 4 | **bot 页 self-fetch 双计费**：每个爬虫 HTML 页 = 外层 1 + 内部回源 1 = 2 次计费请求；爬虫是 3M 的主因，等于放大一倍 | 中 | bot.html 内容内联进 middleware（BOT_HTML 常量），零子请求；测试台加「内联副本与 public/bot.html 严格一致」断言防漂移 |

另一个流量模型修正：境外线路的受众不只是海外用户——**所有 DNS 从海外解析的客户端**
（含开 Clash/VPN 的国内用户，站长本人的 402 即此路径）都落在 Vercel 上。方案 A 落地后
这些用户仍然走 Vercel（只是请求量大幅下降）；若想彻底归零，只有方案 B。

middleware 行为回归：`scripts/middleware-test.mjs` 28/28 断言通过
（13 行为 + 内联一致性 + runtime + 13 matcher 语义）。

## 9. 执行记录（2026-10-25）

P0 清单执行结果：

| 项 | 结果 |
|---|---|
| 1/1b/2/2b/3/5 代码与配置 | ✅ 全部落地（见 §5 文件清单）；`scripts/middleware-test.mjs` 28/28 通过 |
| 本地构建 | ✅ 与 CI 同 env（含 `VITE_NETEASE_API_URL=https://ncmapi.roginx.ink/api`），产物已注入 ncmapi 绝对地址，dist 三件套（vercel.json / middleware.ts / package.json）就位 |
| 4. 立即部署 | ❌ **被账号级封锁拒绝**：`vercel deploy --prod` 返回 "Your Team exceeded our fair use limits and has been blocked" —— 暂停不仅拒服务（402），**也阻止新部署**。dist 保留在本地随时可发 |
| 部署路径 | 改为 push master → CI。境内 COS（deploy-cdn.yml）本次 push 即生效；Vercel（deploy-vercel.yml）本次会失败，**账号解封后在 Actions 里 re-run 该 workflow 即可上线**（或等下一次 push 自动触发） |
| 6. 验证 | Vercel 侧四类请求验证顺延到部署成功后；境内入口验证通过（flexiSite/syncCredential 在相对基址下保持同源行为，与旧版一致） |

阻塞项 = §P2 的账号恢复决策（support 工单 / 升 Pro / 等重置），属用户决策，不在本次执行范围内。

---

**参考资料**
- Vercel 计数与改名：[findmilan.ca CDN 定价指南](https://www.findmilan.ca/blog/vercel-flat-rate-cdn-guide)、[temps.sh 2026 定价指南](https://temps.sh/blog/vercel-pricing-complete-guide-2026)、[Vercel Academy 用量页](https://vercel.com/academy/optimize-your-vercel-account/read-the-usage-page)
- 缓存头与 immutable：[Vercel Cache-Control 官方文档](https://vercel.com/docs/caching/cache-control-headers)、[Vercel CDN Cache](https://vercel.com/docs/caching/cdn-cache)
- Routing Middleware（复查核实项 1 的依据）：[概念页](https://vercel.com/docs/routing-middleware)（文件约定/显式入口/matcher regex/限流）、[JS Reference](https://vercel.com/docs/routing-middleware/js-reference)（签名、`undefined` 继续语义、runtime、ESM 要求）
- Hobby 暂停恢复行为（复查核实项 2 的依据）：[Vercel 社区 Deployment issue](https://community.vercel.com/t/deployment-issue/46497)、[Hobby Plan Paused 帖](https://community.vercel.com/t/hobby-plan-paused/926)、[GitHub discussion #7427](https://github.com/vercel/community/discussions/7427)
- AI 爬虫治理（Bytespider 无视 robots.txt、ai.robots.txt 列表、llms.txt 现状）：[2026 决策矩阵](https://www.digitalapplied.com/blog/ai-crawler-access-control-2026-robots-llms-txt-decision-matrix)、[ai.robots.txt](https://github.com/ai-robots-txt/ai.robots.txt)、[llms.txt 现状](https://limy.ai/blog/llms-txt-in-2026-the-full-guide)、[Bytespider](https://www.pepper.inc/blog/bytespider-explained)
