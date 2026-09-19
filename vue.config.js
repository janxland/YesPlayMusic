const webpack = require('webpack');
const path = require('path');
function resolve(dir) {
  return path.join(__dirname, dir);
}

module.exports = {
  // 每版产物 ~3.9MB 里有一半是 sourcemap（实测 map 3.98MB vs 其它 3.90MB）。
  // deploy 脚本本就不上传 .map，线上排障拿不到它，本地排障有 dev server，
  // 徒增一倍构建时间与磁盘占用。
  productionSourceMap: false,
  lintOnSave: false,
  publicPath:
    process.env.NODE_ENV === 'production'
      ? process.env.VUE_APP_PUBLIC_PATH || '/'
      : '/',
  devServer: {
    disableHostCheck: true,
    port: process.env.DEV_SERVER_PORT || 8080,
    proxy: {
      '/api': {
        target:
          process.env.DEV_SERVER_API_PROXY_TARGET || 'http://127.0.0.1:3000',
        changeOrigin: true,
        pathRewrite: {
          '/api': process.env.DEV_SERVER_API_PATH_REWRITE || '/',
        },
      },
    },
  },
  pwa: {
    name: 'YesPlayMusic',
    iconPaths: {
      favicon32: 'img/icons/favicon-32x32.png',
    },
    themeColor: '#ffffff00',
    manifestOptions: {
      background_color: '#335eea',
    },
    // 预缓存清单默认会把**所有** js 都打进去（含异步路由块），一旦 Service Worker
    // 生效，按需加载的跟弹页块会在首屏被强拉下来。显式排除，保证「点了才加载」。
    workboxOptions: {
      exclude: [/\.map$/, /^manifest.*\.js$/, /keyboard-live/],
    },
    // workboxOptions: {
    //   swSrc: "dev/sw.js",
    // },
  },
  pages: {
    index: {
      entry: 'src/main.js',
      template: 'public/index.html',
      filename: 'index.html',
      title: 'YesPlayMusic',
      chunks: ['main', 'chunk-vendors', 'chunk-common', 'index'],
    },
  },
  chainWebpack(config) {
    config.module.rules.delete('svg');
    config.module.rule('svg').exclude.add(resolve('src/assets/icons')).end();
    config.module
      .rule('icons')
      .test(/\.svg$/)
      .include.add(resolve('src/assets/icons'))
      .end()
      .use('svg-sprite-loader')
      .loader('svg-sprite-loader')
      .options({
        symbolId: 'icon-[name]',
      })
      .end();
    config.module
      .rule('napi')
      .test(/\.node$/)
      .use('node-loader')
      .loader('node-loader')
      .end();

    config.module
      .rule('webpack4_es_fallback')
      .test(/\.js$/)
      .include.add(/node_modules/)
      .end()
      .use('esbuild-loader')
      .loader('esbuild-loader')
      .options({ target: 'es2015', format: 'cjs' })
      .end();

    // LimitChunkCountPlugin 可以通过合并块来对块进行后期处理。用以解决 chunk 包太多的问题
    //
    // 注意：合并是「跨路由」的 —— maxChunks 过小会把按需加载的路由块一起并进
    // 首屏/无关块。曾把 /keyboard-live（含整个 Web Bluetooth SDK）并进
    // visualizer-panel，导致首页 prefetch 就把它下完了，按需加载名存实亡。
    // 这里只做「碎块合并」（minChunkSize），不再限制总块数。
    config.plugin('chunkPlugin').use(webpack.optimize.LimitChunkCountPlugin, [
      {
        maxChunks: 20,
        minChunkSize: 10_000,
      },
    ]);

    // 关掉 vue-cli 默认的 prefetch。
    // 默认行为是给**所有**异步块注入 <link rel=prefetch>，浏览器在首页空闲时就把
    // 全部路由块（含跟弹页的整套 Web Bluetooth SDK）下完 —— 既违背「点了才加载」，
    // 又让每个访客白掏数百 KB 的 CDN 下行流量。路由块改为「进入路由才请求」。
    //
    // 插件名随 vue-cli 分支变化：本项目管理着 pages，会走多页分支，名字是
    // `prefetch-<pageName>`；单页分支才叫 `prefetch`。两个都删。
    // 漏删由 scripts/check-lazy-chunks.mjs 在构建后兜底拦截。
    ['prefetch', 'prefetch-index'].forEach(name => {
      config.plugins.delete(name);
    });
  },
  // 添加插件的配置
  pluginOptions: {
    // electron-builder的配置文件
    electronBuilder: {
      nodeIntegration: true,
      externals: ['@unblockneteasemusic/rust-napi'],
      builderOptions: {
        productName: 'YesPlayMusic',
        copyright: 'Copyright © YesPlayMusic',
        protocols: [
          {
            name: 'YesPlayMusic',
            schemes: ['yesplaymusic'],
          },
        ],
        // compression: "maximum", // 机器好的可以打开，配置压缩，开启后会让 .AppImage 格式的客户端启动缓慢
        asar: true,
        publish: [
          {
            provider: 'github',
            owner: 'qier222',
            repo: 'YesPlayMusic',
            vPrefixedTagName: true,
            releaseType: 'draft',
          },
        ],
        directories: {
          output: 'dist_electron',
        },
        mac: {
          target: [
            {
              target: 'dmg',
              arch: ['x64', 'arm64', 'universal'],
            },
          ],
          artifactName: '${productName}-${os}-${version}-${arch}.${ext}',
          category: 'public.app-category.music',
          darkModeSupport: true,
        },
        win: {
          target: [
            {
              target: 'portable',
              arch: ['x64'],
            },
            {
              target: 'nsis',
              arch: ['x64'],
            },
          ],
          publisherName: 'YesPlayMusic',
          icon: 'build/icons/icon.ico',
          publish: ['github'],
        },
        linux: {
          target: [
            {
              target: 'AppImage',
              arch: ['x64'],
            },
            {
              target: 'tar.gz',
              arch: ['x64', 'arm64'],
            },
            {
              target: 'deb',
              arch: ['x64', 'armv7l', 'arm64'],
            },
            {
              target: 'rpm',
              arch: ['x64'],
            },
            {
              target: 'snap',
              arch: ['x64'],
            },
            {
              target: 'pacman',
              arch: ['x64'],
            },
          ],
          category: 'Music',
          icon: './build/icon.icns',
        },
        dmg: {
          icon: 'build/icons/icon.icns',
        },
        nsis: {
          oneClick: true,
          perMachine: true,
          deleteAppDataOnUninstall: true,
        },
      },
      // 主线程的配置文件
      chainWebpackMainProcess: config => {
        config.plugin('define').tap(args => {
          args[0]['IS_ELECTRON'] = true;
          return args;
        });
        config.resolve.alias.set(
          'jsbi',
          path.join(__dirname, 'node_modules/jsbi/dist/jsbi-cjs.js')
        );

        config.module
          .rule('webpack4_es_fallback')
          .test(/\.js$/)
          .include.add(/node_modules/)
          .end()
          .use('esbuild-loader')
          .loader('esbuild-loader')
          .options({ target: 'es2015', format: 'cjs' })
          .end();
      },
      // 渲染线程的配置文件
      chainWebpackRendererProcess: config => {
        // 渲染线程的一些其他配置
        // Chain webpack config for electron renderer process only
        // The following example will set IS_ELECTRON to true in your app
        config.plugin('define').tap(args => {
          args[0]['IS_ELECTRON'] = true;
          return args;
        });
      },
      // 主入口文件
      // mainProcessFile: 'src/main.js',
      // mainProcessArgs: []
    },
  },
};
