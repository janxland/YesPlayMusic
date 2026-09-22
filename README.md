<br />
<p align="center">
  <a href="https://music.vercel.roginx.ink" target="blank">
    <img src="images/logo.png" alt="Logo" width="156" height="156">
  </a>
  <h2 align="center" style="font-weight: 600">YesPlayMusic</h2>

  <p align="center">
    高颜值的第三方网易云播放器 —— Web 在线版 + 桌面客户端
    <br />
    <a href="https://music.vercel.roginx.ink" target="blank"><strong>🌎 在线体验</strong></a>&nbsp;&nbsp;|&nbsp;&nbsp;
    <a href="https://music.vercel.roginx.ink/download" target="blank"><strong>📦️ 下载客户端</strong></a>&nbsp;&nbsp;|&nbsp;&nbsp;
    <a href="https://t.me/yesplaymusic" target="blank"><strong>💬 加入交流群</strong></a>
    <br />
    <br />
    <a href="https://music.vercel.roginx.ink"><img src="https://img.shields.io/badge/Web%20在线版-无需安装-1db954?style=flat-square" alt="Web 在线版"></a>
    <a href="https://music.vercel.roginx.ink/download"><img src="https://img.shields.io/badge/客户端-macOS%20·%20Windows-0078d4?style=flat-square" alt="客户端下载"></a>
    <a href="https://github.com/janxland/YesPlayMusic/actions/workflows/deploy-vercel.yml"><img src="https://img.shields.io/github/actions/workflow/status/janxland/YesPlayMusic/deploy-vercel.yml?branch=master&label=deploy%20to%20Vercel&style=flat-square" alt="Deploy to Vercel"></a>
    <img src="https://img.shields.io/badge/license-MIT-yellow?style=flat-square" alt="MIT License">
  </p>
</p>

[![Library][library-screenshot]](https://music.vercel.roginx.ink)

## 关于本仓库

本仓库基于 [qier222/YesPlayMusic](https://github.com/qier222/YesPlayMusic) 二次开发，在其基础上维护一套开箱即用的线上版本与桌面客户端：

- **Web 在线版**：<https://music.vercel.roginx.ink>，PR 合并到 `master` 后由 GitHub Actions 自动构建并发布到 Vercel 生产环境，无需任何安装。
- **桌面客户端**（Electron，macOS / Windows）：访问[下载页](https://music.vercel.roginx.ink/download)，自动识别系统并推荐对应安装包。
- **PWA**：Chrome / Edge 中点击地址栏右侧的安装按钮，可将网页版安装到电脑或手机端。

## ✨ 特性

- ✅ 使用 Vue.js 全家桶开发
- 🔴 网易云账号登录（扫码/手机/邮箱登录）
- 📺 支持 MV 播放
- 📃 支持歌词显示
- 📻 支持私人 FM / 每日推荐歌曲
- 🚫🤝 无任何社交功能
- 🌎️ 海外用户可直接播放（需要登录网易云账号）
- 🔐 支持 [UnblockNeteaseMusic](https://github.com/UnblockNeteaseMusic/server#音源清单)，自动使用[各类音源](https://github.com/UnblockNeteaseMusic/server#音源清单)替换变灰歌曲链接（网页版不支持）
- 🌚 Light/Dark Mode 自动切换
- 👆 支持 Touch Bar
- 🖥️ 支持 PWA，可在 Chrome/Edge 里点击地址栏右边的 ➕ 安装到电脑
- 🟥 支持 Last.fm Scrobble
- ☁️ 支持音乐云盘
- ⌨️ 自定义快捷键和全局快捷键
- 🎧 支持 Mpris

## 📦️ 下载客户端

macOS / Windows 安装包请访问 [下载页](https://music.vercel.roginx.ink/download)（页面会根据你的操作系统高亮推荐对应的安装包）。

如果下载页没有适合你设备的安装包，可以参考下文[打包客户端](#️-打包客户端)自行构建。

## 🚀 部署与持续集成

本仓库的自动化流水线：

| 触发条件 | 工作流 | 行为 |
| --- | --- | --- |
| PR 合并到 `master` | [deploy-vercel.yml](.github/workflows/deploy-vercel.yml) | `pnpm run build` → 上传 `dist/` 到 Vercel 生产环境（<https://music.vercel.roginx.ink>） |
| 打 `v*` 标签 / 手动触发 | [build.yaml](.github/workflows/build.yaml) | macOS / Windows / Linux 三平台 Electron 打包 |

要点：

- 根目录的 [vercel.json](vercel.json) 提供 `/api/*` 反向代理与 history 路由回退，部署时无需额外的 nginx 配置。
- Vercel 站点构建时用 `VUE_APP_PUBLIC_PATH=/` 让静态资源走同源；自建服务器也可以把资源指向对象存储 / CDN（见 `.env.production`）。
- 需要自备一个网易云 API（如 [Binaryify/NeteaseCloudMusicApi](https://github.com/Binaryify/NeteaseCloudMusicApi) 的维护分支），并把 `vercel.json` 中 `/api` 的 `destination` 改成你的 API 地址。

## ⚙️ 部署到自己的服务器 / Vercel

1. 克隆仓库并安装依赖（本项目使用 pnpm）：

```sh
git clone https://github.com/janxland/YesPlayMusic.git
cd YesPlayMusic
pnpm install
```

2. 编译打包：

```sh
# 静态资源走同源（部署到 Vercel 或任意 nginx 均可直接使用）
VUE_APP_PUBLIC_PATH=/ pnpm run build
```

3. 将 `/dist` 目录下的产物上传到你的 Web 服务器 / Vercel / 对象存储，并按需配置：
   - `/api/*` 反向代理到网易云 API；
   - history 路由回退到 `index.html`。

## 🐳 Docker 部署

```sh
docker build -t yesplaymusic .
docker run -d --name YesPlayMusic -p 80:80 yesplaymusic
```

## 👷‍♂️ 打包客户端

1. 打包 Electron 需要 Node.js（推荐 18/20）与 pnpm：`npm install -g pnpm`。
2. 克隆仓库、`pnpm install`、复制 `/.env.example` 为 `/.env`。
3. 执行打包命令，产物在 `dist_electron/` 目录：

| 命令 | 说明 |
| --- | --- |
| `pnpm run electron:build-win` | Windows NSIS 安装包 |
| `pnpm run electron:build-mac` | macOS dmg |
| `pnpm run electron:build-linux` | Linux AppImage / deb / rpm |

了解更多信息可访问 [electron-builder 文档](https://www.electron.build/cli)。

## :computer: 配置开发环境

```shell
# 安装依赖
pnpm install

# 运行网页端（默认 8080 端口）
pnpm run serve

# 运行 electron
pnpm run electron:serve
```

本仓库的 `.env.development` 已把开发代理指向线上 API，`pnpm run serve` 后即可直接使用，无需本地起 API；如需完全本地运行，也可本地启动 NeteaseCloudMusicApi 后改回 `VUE_APP_NETEASE_API_URL`。

## ☑️ Todo

欢迎提 Issue 和 Pull request。

## 📜 开源许可

本项目仅供个人学习研究使用，禁止用于商业及非法用途。

基于 [MIT license](https://opensource.org/licenses/MIT) 许可进行开源。

## 🙏 致谢

- 上游项目：[qier222/YesPlayMusic](https://github.com/qier222/YesPlayMusic)
- API 源代码来自 [Binaryify/NeteaseCloudMusicApi](https://github.com/Binaryify/NeteaseCloudMusicApi)
- 托管与持续部署由 [Vercel](https://vercel.com) 提供支持

设计灵感来源：

- [Apple Music](https://music.apple.com)
- [YouTube Music](https://music.youtube.com)
- [Spotify](https://www.spotify.com)
- [网易云音乐](https://music.163.com)

## 🖼️ 截图

![lyrics][lyrics-screenshot]
![library-dark][library-dark-screenshot]
![album][album-screenshot]
![home-2][home-2-screenshot]
![artist][artist-screenshot]
![search][search-screenshot]
![home][home-screenshot]
![explore][explore-screenshot]

<!-- MARKDOWN LINKS & IMAGES -->
<!-- https://www.markdownguide.org/basic-syntax/#reference-style-links -->

[album-screenshot]: images/album.png
[artist-screenshot]: images/artist.png
[explore-screenshot]: images/explore.png
[home-screenshot]: images/home.png
[home-2-screenshot]: images/home-2.png
[lyrics-screenshot]: images/lyrics.png
[library-screenshot]: images/library.png
[library-dark-screenshot]: images/library-dark.png
[search-screenshot]: images/search.png
