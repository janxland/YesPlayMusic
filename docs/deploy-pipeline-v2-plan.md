# Web 部署流水线 v2 —— 一次构建、三目标分发、自验证

> 生成日期：2026-10-25（II 期）
> 前置：`vercel-cdn-request-reduction-plan.md` §9/§10（当日已完成：Vercel 换号部署、
> DNS 切换、Actions 省量一期、境内 meta 文件修复）
> 目标：把流水线推进到「最优」——一次 install、三份产物、三目标原子分发、
> 部署后自验证、最小权限密钥、冷备援 runbook。原则：高效、解耦、可观测、可回滚。

---

## 1. 决策先行：Vercel 多账号负载均衡 —— **不做**

站长提出「我有几个 Vercel 号，可以做负载均衡」。逐维度核实后的结论是负收益：

| 维度 | 事实（本仓库当日实测/核实） |
|---|---|
| 域名互斥 | 一个域名同一时刻只能挂在一个 Vercel 账号上——10-25 迁移时实证：必须先从旧账号解绑，新账号绑定还要过 `_vercel` TXT 所有权验证。**双账号同时服务同一域名在 Vercel 架构下不成立** |
| DNS 无法轮询 | CNAME 同名唯一，不能同时指向两个账号的入口；Vercel 边缘 IP 也不接受裸 A 记录（路由靠域名注册关系） |
| 前置 LB 是负收益 | 唯一可行变体是 CF Worker 按请求轮询两个账号的域名——全量请求过 CF Worker，免费额度 10 万次/天 < Vercel 1M/30d≈3.3 万次/天的等效日额。爬虫洪水（3M 事故模式）会先打爆 CF，等于把单点从 Vercel 换成更小的 CF |
| ToS 风险 | Vercel Fair Use 明确禁止多账号规避限额；本主体已被 fair-use 封禁过一次，再犯的封禁风险不对称 |
| 需求侧 | middleware 上线 + API 解耦后预估几十万次/月 vs 新账号 1M/月，余量 2~5 倍 |

**扩容正路** = 方案 B（境外线路改 A 记录直连成都，Vercel 依赖归零，原计划 §P2 保留）；
**容灾正路** = 冷备援 runbook（§6）：不在平时烧任何成本，事故时 ~10 分钟切换。

## 2. 现状（v1）与差距

```text
push master ──┬─ deploy-cdn.yml    : install + build(cos 变体) + 上传 COS + purge   ~1min
              ├─ deploy-vercel.yml : install + build(vercel 变体) + CLI 部署        ~1.5min
              └─ (服务器 local dist：无 CI 通道，10-25 靠手动 rsync，50% 境内用户会滞后)
```

差距：① 两次 install/build 重复（省量一期遗留的最大浪费）；② local dist 无同步通道
（正确性缺口，优先级最高）；③ 部署后无自动冒烟（问题靠人肉发现）；④ 三份产物的
变体差异只存在于两个 workflow 的注释里，无单一事实源。

## 3. v2 目标架构

```text
push master（paths-ignore: docs/**、**.md、images/**）
   └─ Deploy Web（单 job，~2.5min，计费分钟 -40%）
        install ×1（pnpm --frozen-lockfile）
        build ×3（同一份源码，env 注入差异，outDir 隔离互不污染）
          ├─ dist-vercel : publicPath=/        + API=ncmapi 绝对址   （境外自包含）
          ├─ dist-cos    : publicPath=cos CDN  + API=/api 同源       （境内 CDN 路由）
          └─ dist-local  : publicPath=/        + API=/api 同源       （境内本机路由）
        deploy ×3（步骤独立 if '!cancelled()'，单目标失败不吞其它目标）
          ├─ vercel : CLI 直传（vercel.json + middleware.ts + package.json 三件套）
          ├─ cos    : deploy-cdn.js（DIST_DIR 参数化）+ purge-cdn.js
          └─ server : 受限 rsync --delete（专用 key + rrsync 白名单目录）
        verify ×1（边缘冒烟：bot UA 得元数据页 / /api 403 / llms.txt 200，两域名）
```

解耦点：**构建变体显式化**（三份产物的差异从 workflow 注释变成同一 job 里的三个
命名构建步骤）；**目标步骤互不阻塞**；**密钥按目标隔离**（COS/CDN/密钥对/Vercel
token/服务器 key 各自独立 secret，泄露任一不影响其余）；**服务器通道最小权限**
（rrsync `-wo` 只写单目录、禁转发/TTY，authorized_keys 现为空已审计）。

## 4. 执行清单（P0）

| # | 动作 | 位置 |
|---|---|---|
| 1 | 服务器通道：专用 ed25519 deploy key；authorized_keys 加 `command="/usr/bin/rrsync -wo /www/wwwroot/music.roginx.ink/dist",no-port-forwarding,no-X11-forwarding,no-agent-forwarding,no-pty`；sshd `PubkeyAuthentication no→yes`（authorized_keys 为空已审计，无陈旧钥匙被激活风险；备份 sshd_config）；实测「任意命令被拒、rsync 目标目录外被拒」 | 服务器 + GH secret `YPM_SERVER_SSH_KEY` |
| 2 | `deploy-cdn.js` 支持 `DIST_DIR` 环境变量（默认 `dist` 不变，本地用法零影响） | scripts/deploy-cdn.js |
| 3 | 新建 `deploy-web.yml` 统一流水线（§3 结构），删除 `deploy-cdn.yml`、`deploy-vercel.yml` | .github/workflows/ |
| 4 | CI 内置 verify 冒烟步骤（部署后即测，红=自动发现回归） | 同上 |
| 5 | 推送验证：单 workflow 绿、三目标产物时间戳刷新、境外冒烟通过 | GitHub Actions + 实测 |

## 5. 密钥与安全边界

| 密钥 | 权限范围 | 存放 |
|---|---|---|
| VERCEL_API_TOKEN（新账号） | 单项目部署 | GH secret |
| COS_SECRET_ID/KEY | COS mybox 桶指定前缀读写 | GH secret（沿用） |
| TENCENT_CDN_SECRET_ID/KEY | CDN PurgePathCache | GH secret（沿用） |
| YPM_SERVER_SSH_KEY（新增） | **仅** rsync 写 `/www/wwwroot/music.roginx.ink/dist`，无 shell、无转发、无其它目录 | GH secret；私钥不落 git/文档；服务器侧公钥带 rrsync 强制命令 |

## 6. P1（记录在案，触发时执行）

- **冷备援 runbook**（需要时提供第三个账号 token，全程 ~10 分钟，10-25 已实测走通全链路）：
  ① 新账号建项目 `ypm-music-landing` → ② 本地 `vercel deploy`（或临时改 secrets 让 CI 部署）
  → ③ 旧/现账号解绑两域名（项目级+团队级）→ ④ 新账号绑定 + `_vercel` TXT 验证
  → ⑤ DNSPod `music.vercel` CNAME 改 `cname.vercel-dns.com`（如目标账号分配专属目标则用分配值）
  → ⑥ 冒烟四类请求。**平时零成本：不部署、不占 secrets、不烧 CI 分钟。**
- **用量巡检**（手动，一条命令）：
  `curl -H "Authorization: Bearer <token>" https://api.vercel.com/v1/teams/<teamId>/usage`
  连续两个月 >70% 再考虑方案 B。
- **境内 50/50 分流的去留**（用户决策项）：若某天决定全量走 COS/CDN，local 路由与整条
  server 同步通道可整体拆除，架构再简化一档；代价是 CDN 流量包消耗上升、服务器带宽下降。

## 7. 回滚

- 流水线：`git revert` 两个提交（v2 workflow 与脚手架改动），恢复 deploy-cdn/deploy-vercel。
- 服务器通道：删 authorized_keys 的 deploy key 行 + sshd `PubkeyAuthentication` 改回 `no`（备份 `sshd_config.bak-*`）。
- 三目标部署本身：COS 有版本化对象、Vercel 有 deployment 回滚、server dist 由 rsync --delete 可重推任意 commit 的构建。

## 8. 验证矩阵

| 检查 | 期望 |
|---|---|
| push 后 Actions | 仅 Deploy Web 一个 workflow 运行（Release 不触发、无重复 install） |
| Vercel | 新 deployment READY，`music.roginx.ink`（境外解析）bot UA→元数据页、/api→403 |
| COS | 对象 Last-Modified 刷新，purge 日志成功，robots/sitemap/llms content-type 正确 |
| 服务器 | `/www/wwwroot/music.roginx.ink/dist/index.html` mtime = 部署时刻；境内裸 URL 冒烟同上 |
| 通道安全 | deploy key 执行 `ssh root@ip ls` 被拒；rsync 目标越界被拒 |

## 9. 执行记录（2026-10-25 当日完成）

| 项 | 结果 |
|---|---|
| 1. 服务器通道 | ✅ 专用 ed25519 key + `rrsync -wo` 白名单目录 + sshd `PubkeyAuthentication yes`（备份 `sshd_config.bak-20261025-ypmdeploy`；authorized_keys 原为空，无陈旧钥匙被激活）。安全实测：任意命令被 rrsync 拒绝；越界目标（`/etc/`）被 rrsync **重映射进白名单目录**（不可能逃逸）；GNU rsync 3.2.7（=CI 同款客户端）真实写入成功。注：Mac 自带 openrsync 与新版 Python rrsync 不兼容（协议 29 vs 只认 stock rsync 3.x 语法），本地手动同步需 `brew rsync` 或走 CI |
| 2. deploy-cdn.js DIST_DIR | ✅ 默认 `dist` 不变，本地 `pnpm deploy:cdn` 零影响 |
| 3. deploy-web.yml | ✅ 首跑踩坑一处：pnpm 9 会把 `--` 原样透传给脚本，`vite build -- --outDir X` 的 outDir 被当位置参数忽略、三份构建全落默认 dist/——改 `pnpm exec vite build --outDir X` 直调后全绿（run 40160799476，~2 分钟） |
| 4. 三目标落地 | ✅ Vercel 新 deployment READY；COS 上传+purge；服务器 dist mtime=部署时刻且 `--delete` 清掉历史 `._*` 垃圾与旧 hash 资产（本地路由用户自此与 COS 同步） |
| 5. CI 冒烟 | ✅ 内置于流水线：bot UA 元数据页 / /api 403 / llms.txt 200 × 两域名，回归在 CI 内自动发现（runner 在境外，境内线路回归仍需手动） |
| 附带 | 工作区带来的 router base 修复（COS 变体 BASE_URL 为 CDN 绝对址会污染路由 path）随 a737938 上车验证 |

用量对照：v1 每次 push = 2 个 job 各自 install+build（~2×1.5min 计费）；v2 = 单 job 一次 install
+ 三次 build + 三部署 + 冒烟（~2min，rsync 仅 +5s）。桌面端打包仍仅 v* 标签触发。

## 10. 状态快照（本次定稿后的世界）

- 流水线：`deploy-web.yml`（统一）+ `build.yaml`（Release，仅 v* tag/手动）。仓库再无 cron。
- GitHub secrets：VERCEL_API_TOKEN/ORC_ID/PROJECT_ID（新账号）、COS_*、TENCENT_CDN_*、YPM_SERVER_SSH_KEY（受限 rsync）。
- 服务器新增物：`/root/.ssh/authorized_keys` 一行 rrsync 受限条目；`sshd_config` 备份同目录。
- 凭据卫生：腾讯云主账号 SecretKey 曾出现在对话中——建议轮换；旧 Vercel 账号 6 个遗留项目弃置待清理（需站长确认）。

