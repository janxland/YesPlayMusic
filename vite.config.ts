import { fileURLToPath, URL } from 'node:url';
import { defineConfig, loadEnv } from 'vite';
import vue from '@vitejs/plugin-vue';
import { createSvgIconsPlugin } from 'vite-plugin-svg-icons';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig(({ mode }) => {
  // 前缀给 ''：vite.config 自身还要读 DEV_SERVER_* / COS_*（构建脚本用），
  // 浏览器侧仍只有 VITE_* 会被注入 import.meta.env。
  const env = loadEnv(mode, process.cwd(), '');

  return {
    base: env.VITE_PUBLIC_PATH || '/',

    plugins: [
      vue(),
      // symbolId 必须保持 `icon-[name]`：SvgIcon 组件用 `#icon-${iconClass}` 取图
      createSvgIconsPlugin({
        iconDirs: [
          fileURLToPath(new URL('./src/assets/icons', import.meta.url)),
        ],
        symbolId: 'icon-[name]',
      }),
      // 桌面端（--mode electron）产物由主进程本地 Express 直出，无 SW 必要
      //（registerServiceWorker 运行时本就有 isDesktop 守卫）
      ...(mode === 'electron'
        ? []
        : [
            VitePWA({
              registerType: 'prompt',
              // 注册由 src/registerServiceWorker.ts 自己完成（要走 uiStore 的更新
              // 提示流程），插件再注入 registerSW.js 会造成同一段 sw.js 双重注册
              injectRegister: false,
              // robots.txt 走 includeAssets 收进预缓存；favicon/manifest 已在
              // globPatterns 里，两边都写会出现重复预缓存条目
              includeAssets: ['robots.txt'],
              manifest: {
                name: 'YesPlayMusic',
                short_name: 'YesPlayMusic',
                description: 'A third party music player for Netease Music',
                theme_color: '#ffffff00',
                background_color: '#335eea',
                display: 'standalone',
                start_url: '.',
                icons: [
                  {
                    src: 'img/icons/android-chrome-192x192.png',
                    sizes: '192x192',
                    type: 'image/png',
                  },
                  {
                    src: 'img/icons/android-chrome-512x512.png',
                    sizes: '512x512',
                    type: 'image/png',
                  },
                  {
                    src: 'img/icons/android-chrome-512x512.png',
                    sizes: '512x512',
                    type: 'image/png',
                    purpose: 'maskable',
                  },
                ],
              },
              workbox: {
                // skipWaiting/clientsClaim：新版 SW 装上即刻接管，配合 registerServiceWorker
                // 的 updated() 提示，用户点「刷新应用」才真正换页 —— 没有这两个开关，
                // 提示后刷新一次仍跑旧 SW（要刷两次才生效）。
                skipWaiting: true,
                clientsClaim: true,
                // 预缓存只装「离线壳」（入口 HTML + 图标），从 93 条瘦身到 3 条：
                // 全量预缓存意味着每次发版每个 PWA 用户都要重下全部产物，一次
                // 版本发布就是 用户数 × 93 个 CDN 请求。hash 产物本身不可变，
                // 交给下面 runtimeCaching 的 CacheFirst —— 命中率相同、安装
                // 请求趋近于零。index.html 必须留在预缓存里（navigateFallback
                // 依赖它，见 vite-pwa 文档与 workbox #402 的教训）。
                globPatterns: ['index.html', 'manifest.webmanifest', 'favicon.ico'],
                runtimeCaching: [
                  {
                    // hash 产物不可变：CacheFirst + 容量上限。第二条分支覆盖
                    // 国内构建（publicPath 指向 cos.roginx.ink）的跨域资源 ——
                    // SW 会拦截受控页面发出的跨域请求，运行时缓存同样生效。
                    urlPattern: ({ url }: { url: URL }) =>
                      url.pathname.startsWith('/assets/') ||
                      (url.hostname.endsWith('roginx.ink') &&
                        url.pathname.includes('/assets/')),
                    handler: 'CacheFirst',
                    options: {
                      cacheName: 'immutable-assets',
                      expiration: {
                        maxEntries: 160,
                        maxAgeSeconds: 60 * 60 * 24 * 90,
                      },
                      cacheableResponse: { statuses: [200] },
                    },
                  },
                ],
              },
            }),
          ]),
    ],
    resolve: {
      alias: {
        '@': fileURLToPath(new URL('./src', import.meta.url)),
      },
    },

    define: {
      // 平台判定唯一出处 platform/env.ts；Web 构建恒 false，桌面构建（--mode
      // electron）为 true —— 同一份源码产出两个渲染层产物
      'process.env.IS_ELECTRON':
        mode === 'electron' ? 'true' : 'false',
      // env.js 的 osName() 在浏览器里没有 process，静态替换成 'browser'
      'process.platform': JSON.stringify('browser'),
    },

    server: {
      port: Number(env.DEV_SERVER_PORT) || 8080,
      proxy: {
        '/api': {
          target: env.DEV_SERVER_API_PROXY_TARGET || 'http://127.0.0.1:3000',
          changeOrigin: true,
          // 默认剥掉 /api 前缀（'/api/foo' → '/foo'）。旧默认值 '/' 会拼出
          // '//foo'，上游 express 对双斜杠直接 404
          rewrite: path =>
            path.replace(/^\/api/, env.DEV_SERVER_API_PATH_REWRITE ?? ''),
        },
      },
    },

    // 与 server.proxy 保持一致：vite preview（构建产物自验）也要能打到本地 API，
    // 否则 preview 下所有数据请求 404/落回 index.html，页面表现为空
    preview: {
      port: 4173,
      proxy: {
        '/api': {
          target: env.DEV_SERVER_API_PROXY_TARGET || 'http://127.0.0.1:3000',
          changeOrigin: true,
          rewrite: path =>
            path.replace(/^\/api/, env.DEV_SERVER_API_PATH_REWRITE ?? ''),
        },
      },
    },

    build: {
      // 桌面端产物进 dist_electron（与 esbuild 出的 background.js/preload.js 同目录，
      // 主进程 Express 直接以 __dirname 为静态根）；Web 端维持 dist
      outDir: mode === 'electron' ? 'dist_electron' : 'dist',
      // Vite 7 新默认 target，显式写出以锚定意图：只支持原生 ESM/动态导入/
      // import.meta/?? 的主流浏览器（Chrome107+ / Safari16 / FF104），构建
      // 产物不做 legacy 转译 —— 依赖方（PWA、Workbox、顶层 await）都按此假设
      target: 'baseline-widely-available',
      // deploy 脚本本就不上传 .map，线上排障有 dev server，徒增体积与时间
      sourcemap: false,
      // 默认 500KB 会对 vue-core（vue+router+pinia 运行时）与 vendor 误报；
      // 这里只上调阈值消除已知大 chunk 的噪音，不代表可以往单 chunk 塞东西
      chunkSizeWarningLimit: 900,
      rollupOptions: {
        output: {
          // 低于 16KB 的微 chunk 由 Rollup 自动并进邻近 chunk（实验参数）。
          // 现状 55 个 js 里有大量 <3KB 的碎片（useKeepAliveLoad 432B 等），
          // 每个碎片都是一次独立请求：SW 安装、爬虫渲染、首访瀑布都在为它们
          // 买单。只做 mop-up，不触碰路由级懒加载边界与 manualChunks 分组。
          experimentalMinChunkSize: 16 * 1024,
          // 只把「主入口静态依赖」归组，改善长缓存（业务迭代不再打穿框架/vendor
          // 的哈希）。其余包一律不归组：howler/dexie 是动态 import 自成懒 chunk，
          // node-vibrant/qrcode 挂在懒加载视图下 —— 若把它们卷进 vendor 反而
          // 会被静态可达的 vendor 拖回首屏。
          manualChunks(id: string) {
            if (!id.includes('node_modules')) return undefined;
            // pnpm 虚拟 store 的 id 形如
            // node_modules/.pnpm/vue@x.y.z/node_modules/vue/dist/...，
            // 必须取「最后一个 node_modules/ 之后」的第一段才是真实包名
            const after = id.split(/[\\/]node_modules[\\/]/).pop() ?? '';
            const parts = after.split(/[\\/]/).filter(Boolean);
            const pkg = parts[0]?.startsWith('@')
              ? `${parts[0]}/${parts[1]}`
              : parts[0];
            if (!pkg) return undefined;
            if (
              ['vue', 'vue-router', 'pinia'].includes(pkg) ||
              pkg.startsWith('@vue/')
            ) {
              return 'vue-core';
            }
            if (pkg === 'vue-i18n' || pkg.startsWith('@intlify/')) {
              return 'i18n';
            }
            if (
              [
                'axios',
                'dayjs',
                'js-cookie',
                'crypto-js',
                'nprogress',
                'lodash',
                // main.ts / Player.vue 静态引入的 UI 附属库：业务无关且几乎
                // 不变，归入 vendor 让 app chunk 迭代不打穿它们的缓存。
                // 注意：vue-slider-component 是 CJS-only 的 UMD 包（main 指向
                // .umd.min.js），跨 chunk 的 require('vue') 互操作会碰到
                // vue 完整 CJS 构建的 __esModule 包装而崩溃
                // （Object.defineProperty called on non-object），只能留在
                // 默认分块；vue-gtag 是 ESM（module 字段）无此问题。
                'vue-gtag',
                'register-service-worker',
              ].includes(pkg)
            ) {
              return 'vendor';
            }
            // 其余包不归组（理由见 manualChunks 头部注释）
            return undefined;
          },
        },
      },
    },

    optimizeDeps: {
      // 这些 CJS 依赖不做预构建声明时，dev 冷启动会在首次请求时二次预构建并
      // 整页 reload；显式列出让扫描一次到位
      include: [
        'lodash/cloneDeep',
        'lodash/shuffle',
        'dayjs',
        'dayjs/plugin/duration',
        'dayjs/plugin/relativeTime',
        'js-cookie',
        'crypto-js',
        'crypto-js/md5',
        'nprogress',
        'howler',
        'dexie',
        'qrcode',
      ],
    },
  };
});
