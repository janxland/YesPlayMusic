# YesPlayMusic `pnpm deploy:cdn` 后线上不更新 —— 诊断报告

> 诊断时间：2026-08-20 15:31 (Asia/Shanghai)
> 结论：**部署本身成功了，问题出在 CDN 边缘缓存没有失效。**

## 1. 三份 index.html 对照（铁证）

| 来源 | 大小 | 主 JS 哈希 | 说明 |
|---|---:|---|---|
| 本地 `dist/index.html` | 4416 | `index.bb7de86b.js` | 本次构建产物 |
| COS 源站 `mybox-1257251314.cos.ap-chengdu.myqcloud.com/www/music/dist/index.html` | 4416 | `index.bb7de86b.js` | **新版本已正确上传**（Last-Modified 今天 07:01:59，`Cache-Control: no-cache`） |
| 线上 `music.roginx.ink/`（用户实际访问） | 3906 | `index.0010f2de.js` | **旧版本，被缓存** |

- COS 源站对 `index.html` 返回 `Cache-Control: no-cache`，对 JS 资源返回 `max-age=31536000` —— `deploy-cdn.js` 设置的元数据**完全正确**。
- 但用户访问的 `music.roginx.ink` 返回 `Cache-Control: max-age=5184000`（**60 天**），并带着旧哈希 `index.0010f2de.js`。

## 2. 根因

`music.roginx.ink` 是一层**腾讯云 COS CDN 边缘节点**（响应头含 `x-cos-*`、`server: nginx`）。

- `deploy-cdn.js` 上传后**从不刷新 CDN 缓存**。
- 该 CDN 域名对 `index.html` 套了一条**固定 60 天缓存规则**，它**不遵循源站的 `no-cache`**，覆盖了对象元数据里的设置。
- 浏览器「强制刷新」只跳过**浏览器本地缓存**，跳不过 **CDN 边缘缓存** —— 所以你怎么刷都拿到旧 `index.html`，旧 HTML 又指向旧的哈希 JS，整站看起来没更新。

> 注：`deploy-cdn.js` 代码注释里写过的「曾导致 index.html 被缓存 60 天」那次，只修了**对象存储元数据层**（把 CacheControl 从 Headers 挪到 SDK 顶层），但 **CDN 边缘层**那条 60 天规则一直还在，这次就是它在生效。

## 3. 立即生效（让更新现在上线）

在**腾讯云 CDN 控制台 → 缓存刷新 → URL 刷新**，提交以下两条 URL：

```
https://music.roginx.ink/
https://music.roginx.ink/index.html
```

（只需刷 `index.html`，JS/CSS 是带内容哈希的文件名，新版本是新 URL，CDN 自动回源拉取，无需刷。）
刷新后再强制刷新浏览器即可看到新版本。

也可走 API：`cdn.PurgeUrlsCache`（需 CDN 权限的 SecretId/SecretKey）。

## 4. 根治（避免以后每次部署都复发）

修改 `music.roginx.ink` 这个 CDN 域名的**缓存规则**：

- `index.html`（或所有 `*.html`）→ 设为「不缓存 / 缓存时长 0 / 遵循源站 Cache-Control」。
- 带哈希的静态资源（`*.js`、`*.css`）→ 保持 1 年（源站已设 `max-age=31536000`）。

把 HTML 改成「遵循源站」后，`deploy-cdn.js` 写入的 `no-cache` 才会被 CDN 尊重，以后每次部署新 `index.html` 即时生效。

## 5. 建议（可选，让部署一步到位）

在 `scripts/deploy-cdn.js` 上传完成后，自动调用腾讯云 `PurgeUrlsCache` 刷新 `index.html`，
使 `pnpm deploy:cdn` 从「传文件」升级为「传文件 + 失效 CDN」的端到端流程。
需要 CDN 权限的 SecretId/SecretKey（或复用 OAuth/STS 体系），可在脚本里加一段。
