// 更新日志唯一数据源：发版时在数组头部追加条目即可，
// 「关于」页与 Changelog 组件自动渲染，无需改页面代码。
// 条目按 master / feat/keyboard-live / gh-pages 各分支提交历史整理。
// type 取值：feat 新功能 | fix 修复 | perf 性能 | refactor 重构 | chore 清理 | ci 构建 | docs 文档
export const changelogEntries = [
  {
    version: '2026.09.24',
    date: '2026-09-24',
    branch: 'master',
    summary: '工程瘦身：清除死代码与零引用依赖',
    items: [
      {
        type: 'chore',
        text: '删除 4 个无引用死函数（shuffleAList、updateHttps 等）',
      },
      {
        type: 'chore',
        text: '移除 9 个零引用依赖（plyr、vue-audio-visual、electron-context-menu 等）',
      },
      {
        type: 'chore',
        text: '清理无引用的 Barlow 字体、plyr.css 与注释掉的 @font-face 死代码',
      },
    ],
  },
  {
    version: '2026.09.22',
    date: '2026-09-22',
    branch: 'master',
    summary: '打通 Vercel 自动化发布流水线',
    items: [
      {
        type: 'ci',
        text: '合并 PR 到 master 自动构建并上传 Vercel 生产（vercel.json 反代 + SPA 回退）',
      },
      {
        type: 'perf',
        text: 'CI 提效：push 只跑轻量校验，打包矩阵限 tag / 手动触发，增加 electron 缓存',
      },
      {
        type: 'docs',
        text: 'README 重写为二开版落地页，入口指向 music.vercel.roginx.ink',
      },
    ],
  },
  {
    version: '2026.09.22',
    date: '2026-09-22',
    branch: 'feat/keyboard-live',
    summary: '跟弹功能内测分支（仅内部使用，不入主干）',
    items: [{ type: 'feat', text: '恢复键盘跟弹联动功能，分支内独立演进' }],
  },
  {
    version: '2026.09.21',
    date: '2026-09-21',
    branch: 'master',
    summary: '主干净化 + 移动端自适应 + 播放稳定性',
    items: [
      { type: 'refactor', text: '内部硬件联动功能整体迁出主干，修复 CI 构建' },
      { type: 'feat', text: '顶栏、播放条与曲目列表的移动端自适应' },
      {
        type: 'fix',
        text: '修复播放进度回写、媒体键抢占、换账号串台与歌词页高亮',
      },
      { type: 'feat', text: '统一页面加载进度条与 Service Worker 更新提示' },
      {
        type: 'ci',
        text: '修复三端 Electron 打包（electron 二进制补齐、产物按平台门控、pnpm lockfile 原生解析）',
      },
    ],
  },
  {
    version: '2026.09.20',
    date: '2026-09-20',
    branch: 'master',
    summary: '登录闭环补全',
    items: [
      {
        type: 'feat',
        text: '新增 Cookie 导入登录，打通被风控封死场景下的登录闭环',
      },
    ],
  },
  {
    version: '2026.09.19',
    date: '2026-09-19',
    branch: 'master',
    summary: '性能与基础设施专项',
    items: [
      { type: 'feat', text: '图片懒加载基础设施、桌面端引导、播放装载态反馈' },
      { type: 'refactor', text: '拆分播放内核，消除冗余的一跳串行请求' },
      { type: 'perf', text: '网络层修复被吞的错误、冗余请求与路由复用不刷新' },
      { type: 'perf', text: '削减首屏体积并补齐全屏骨架屏' },
    ],
  },
  {
    version: '2026.09.01',
    date: '2026-09-01',
    branch: 'master',
    summary: '桌面歌词与色板驱动可视化',
    items: [
      {
        type: 'feat',
        text: '桌面歌词功能（Web PiP 与 Electron 透明窗口双通道）',
      },
      {
        type: 'feat',
        text: '自动识别 4 色色板驱动可视化（频谱柱 / 光刺 / 波形 / 粒子 / 极光按色板循环取色）',
      },
    ],
  },
  {
    version: '2026.08.20',
    date: '2026-08-20',
    branch: 'master',
    summary: '封面取色、歌词个性化与 CDN 缓存修复',
    items: [
      {
        type: 'feat',
        text: '封面主色调自动识别（色相直方图取色算法 + 面板 UI + 单元测试）',
      },
      { type: 'feat', text: '歌词大小可调并随字号重排居中、持久化' },
      {
        type: 'fix',
        text: '修复 index.html 被 CDN 缓存 60 天的根因，新增缓存刷新脚本',
      },
    ],
  },
  {
    version: '2026.08.19',
    date: '2026-08-19',
    branch: 'master',
    summary: '歌词 3D 调节',
    items: [{ type: 'feat', text: '歌词区支持透视 / 旋转调节并持久化' }],
  },
  {
    version: '2026.08.09',
    date: '2026-08-09',
    branch: 'master',
    summary: '部署与构建修复',
    items: [
      {
        type: 'fix',
        text: '修复 music.roginx.ink 静态资源 404（publicPath 指向 COS）',
      },
      {
        type: 'ci',
        text: '修复三端构建（macOS arm64 + Windows/Ubuntu），强制转译 numeric separator 兼容 webpack4',
      },
    ],
  },
  {
    version: '2026.05 - 2026.07',
    date: '2026-05-23',
    branch: 'master / gh-pages',
    summary: '可视化重构与上游能力整合',
    items: [
      {
        type: 'refactor',
        text: '重构音频可视化并与 Web Worker 集成，支持 sourcemap 报错分析',
      },
      { type: 'feat', text: '云盘歌曲显示内嵌歌词（同步上游 #2419）' },
      { type: 'feat', text: '主题色选择（同步上游 #2461）' },
      { type: 'feat', text: '基础埋点统计与资源加载优化（gh-pages 分支）' },
      { type: 'chore', text: '构建切换 pnpm、隐私处理与项目配置优化' },
    ],
  },
  {
    version: '上游基线 4.9.10',
    date: '2025-10-09',
    branch: 'master',
    summary: 'fork 基线：对齐上游 YesPlayMusic v4.9.10',
    items: [
      { type: 'feat', text: '后端切换为 @neteaseapireborn/api（上游 #2403）' },
      {
        type: 'feat',
        text: '媒体键支持（上游 #2375）、托盘图标颜色自定义（上游 #2414）',
      },
    ],
  },
];

export default changelogEntries;
