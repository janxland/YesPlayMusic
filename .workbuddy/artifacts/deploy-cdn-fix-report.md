# YesPlayMusic 部署上线不更新的诊断与修复报告

> 时间：2026-08-20
> 结论：**`pnpm deploy:cdn` 上传位置是正确的，线上不更新与上传无关，根因是 CDN 边缘缓存 + 节点同步滞后。**

## 一、用户怀疑点核查：「上传位置不对？」→ 不成立

| 环节 | 内容 | 结论 |
|---|---|---|
| 本地 `dist/` 本次构建 | `js/index.bb7de86b.js` | 新构建 |
| `scripts/deploy-cdn.js` 上传前缀 `COS_PREFIX` | `www/music/dist` | — |
| nginx `location=/index.html` 反代目标 | `cos.roginx.ink/www/music/dist/index.html` | — |
| **COS 源站**（你 deploy 传上去的） | `mybox-...myqcloud.com/www/music/dist/index.html` = `bb7de86b` + `Cache-Control: no-cache` | ✅ 上传位置正确、内容最新 |

三处路径前缀完全一致（`www/music/dist`），且 COS 源站已是本次新构建。**所以「上传位置不对」这个假设被证据否定——文件确实传到了正确位置。**

## 二、真正的根因：CDN 边缘缓存 + nginx 侧节点滞后

- `music.roginx.ink` 是 nginx 反代，其 `location=/index.html` 反代到 CDN 域名 `cos.roginx.ink`（该域名 CNAME 到腾讯云 CDN）。
- 原本 `cos.roginx.ink` 的 CDN 缓存规则给 `index.html` 套了 **60 天缓存**（`max-age=5184000`），且 `FollowOrigin=off` 不遵循源站 `no-cache` → 旧 index.html 被长期缓存。
- 浏览器「强制刷新」只清本地缓存，清不掉 CDN 边缘缓存，所以怎么刷都旧。
- 关键矛盾点：服务器本地直连 `cos.roginx.ink/www/music/dist/index.html` 已返回新构建 `bb7de86b`，但 nginx 反代同一 URL 却拿到旧 `0010f2de`，且两者都标 `Cache Miss`。这是 **nginx 服务器侧的 CDN 边缘节点尚未同步、仍持有旧缓存**（CDN 节点一致性问题，提交多次 `PurgeUrlsCache` 对该节点无效）。

## 三、已执行的修复

### 1. 治本（腾讯云 CDN 规则，仍生效）
通过腾讯云 API 把 `cos.roginx.ink` 的缓存规则改为高级 `RuleCache`：
- `file "html" → NoCache: on`（HTML 不缓存）
- `all "*" → FollowOrigin: on`

作用域覆盖所有走 `cos.roginx.ink` 的 HTML，不只 `music.roginx.ink`。

### 2. 即时生效（修 nginx，已 reload）
由于 CDN 节点同步滞后无法靠刷新强制，将 `music.roginx.ink` 的 `index.html` 反代目标由 **CDN 域名** 改为 **COS 裸源站**：
```nginx
location = /index.html {
    proxy_pass https://mybox-1257251314.cos.ap-chengdu.myqcloud.com/www/music/dist/index.html;
    proxy_set_header Host mybox-1257251314.cos.ap-chengdu.myqcloud.com;
    ...
    sub_filter 'https://mybox-1257251314.cos.ap-chengdu.myqcloud.com/www/music/' 'https://cos.roginx.ink/www/music/';
}
```
- 裸源站本身 `Cache-Control: no-cache` → nginx 每次拿最新，彻底绕过 CDN 节点滞后。
- 资源 JS/CSS 仍通过 `sub_filter` 改写为 `cos.roginx.ink` CDN（带内容哈希，新 URL 自动回源）。
- 配置文件已备份：`html_music.roginx.ink.conf.bak.*`

## 四、修复后验证

| 检查项 | 结果 |
|---|---|
| `music.roginx.ink` 主 JS 哈希 | `js/index.bb7de86b.js` ✅（之前旧版 `0010f2de`） |
| `music.roginx.ink` 响应 `cache-control` | `no-cache` ✅ |
| 资源 URL | `https://cos.roginx.ink/www/music/dist/js/index.bb7de86b.js` ✅（走 CDN） |
| COS 裸源站 `cache-control` | `no-cache` ✅ |

**线上已更新到本次新构建。**

## 五、后续建议

1. **以后部署**：`pnpm deploy:cdn` 上传到 COS 即可，`music.roginx.ink` 的 index.html 因走 `no-cache` 裸源站会即时生效；资源走 CDN 带哈希，也即时。
2. **可选优化**：等 `cos.roginx.ink` 的 CDN 节点完全同步后，可考虑把 `index.html` 反代切回 CDN 域名（届时 `html NoCache` 规则已全网生效，走 CDN 也即时，且省服务器出网带宽）。当前裸源站方案 index.html 很小，成本可忽略，可长期保持。
3. **清理**：服务器上 `html_music.roginx.ink.conf.bak.*` 为本次操作的备份，确认无误后可择期删除。
4. **根因预防**：`scripts/deploy-cdn.js` 当前上传后不主动刷 CDN 缓存；若将来 index.html 改回走 CDN，建议在脚本末尾增加 `PurgeUrlsCache` 调用，避免再踩缓存坑。
