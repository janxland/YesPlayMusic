import { isDesktop } from '@/platform/env';
import {
  createRouter,
  createWebHashHistory,
  createWebHistory,
  type RouteRecordRaw,
} from 'vue-router';
import { isLooseLoggedIn, isAccountLoggedIn } from '@/utils/auth';

const routes: RouteRecordRaw[] = [
  {
    path: '/',
    name: 'home',
    component: () => import('@/views/home.vue'),
    children: [],
    meta: {
      keepAlive: true,
      savePosition: true,
    },
  },
  {
    path: '/login',
    name: 'login',
    component: () => import('@/views/login.vue'),
  },
  {
    path: '/login/username',
    name: 'loginUsername',
    component: () => import('@/views/loginUsername.vue'),
  },
  {
    path: '/login/account',
    name: 'loginAccount',
    component: () => import('@/views/loginAccount.vue'),
  },
  {
    path: '/playlist/:id',
    name: 'playlist',
    component: () => import('@/views/playlist.vue'),
  },
  {
    path: '/album/:id',
    name: 'album',
    component: () => import('@/views/album.vue'),
  },
  {
    path: '/artist/:id',
    name: 'artist',
    component: () => import('@/views/artist.vue'),
    meta: {
      keepAlive: true,
      savePosition: true,
    },
  },
  {
    path: '/artist/:id/mv',
    name: 'artistMV',
    component: () => import('@/views/artistMV.vue'),
    meta: {
      keepAlive: true,
    },
  },
  {
    path: '/mv/:id',
    name: 'mv',
    component: () => import('@/views/mv.vue'),
  },
  {
    path: '/next',
    name: 'next',
    component: () => import('@/views/next.vue'),
    meta: {
      keepAlive: true,
      savePosition: true,
    },
  },
  {
    path: '/search/:keywords?',
    name: 'search',
    component: () => import('@/views/search.vue'),
    meta: {
      keepAlive: true,
    },
  },
  {
    path: '/search/:keywords/:type',
    name: 'searchType',
    component: () => import('@/views/searchType.vue'),
  },
  {
    path: '/coSearch',
    name: 'coSearch',
    component: () => import('@/views/coSearch.vue'),
  },
  {
    path: '/new-album',
    name: 'newAlbum',
    component: () => import('@/views/newAlbum.vue'),
  },
  {
    path: '/explore',
    name: 'explore',
    component: () => import('@/views/explore.vue'),
    meta: {
      keepAlive: true,
      savePosition: true,
    },
  },
  {
    path: '/library',
    name: 'library',
    component: () => import('@/views/library.vue'),
    meta: {
      requireLogin: true,
      keepAlive: true,
      savePosition: true,
    },
  },
  {
    path: '/library/liked-songs',
    name: 'likedSongs',
    component: () => import('@/views/playlist.vue'),
    meta: {
      requireLogin: true,
    },
  },
  {
    path: '/settings',
    name: 'settings',
    component: () => import('@/views/settings.vue'),
  },
  {
    path: '/about',
    name: 'about',
    component: () => import('@/views/about.vue'),
  },
  {
    path: '/daily/songs',
    name: 'dailySongs',
    component: () => import('@/views/dailyTracks.vue'),
    meta: {
      requireAccountLogin: true,
    },
  },
  {
    path: '/lastfm/callback',
    name: 'lastfmCallback',
    component: () => import('@/views/lastfmCallback.vue'),
  },
  {
    path: '/desktop-lyrics',
    name: 'desktopLyrics',
    component: () => import('@/views/desktopLyrics.vue'),
  },
  {
    path: '/download',
    name: 'download',
    component: () => import('@/views/download.vue'),
  },
];

const router = createRouter({
  history: isDesktop()
    ? createWebHashHistory()
    : createWebHistory(import.meta.env.BASE_URL),
  routes,
});

// vue-router 4 下一个守卫内多次调用 next() 会直接报错中断导航，
// 原写法 requireAccountLogin 分支放行后会再走一次 next()；改用返回值风格天然单次
router.beforeEach(to => {
  if (to.meta.requireAccountLogin && !isAccountLoggedIn()) {
    return { path: '/login/account' };
  }
  if (to.meta.requireLogin && !isLooseLoggedIn()) {
    return { path: isDesktop() ? '/login/account' : '/login' };
  }
});

// 路由级 SEO 元信息：Googlebot 渲染 SPA 后读的是运行时 DOM 头，导航时必须
// 同步 title/description。只映射「无需登录、可索引」的页面；歌单/歌手等动态
// 页由数据驱动内容，标题交给播放器（Player.ts 写 document.title）即可。
const ROUTE_SEO: Record<string, { title: string; description?: string }> = {
  home: {
    title: 'YesPlayMusic — 高颜值的第三方网易云播放器',
    description: 'Web 在线版 + 桌面客户端 + PWA，无需安装即可使用',
  },
  download: {
    title: '下载客户端 — YesPlayMusic',
    description: 'macOS / Windows 客户端下载，自动识别系统推荐安装包',
  },
  newAlbum: {
    title: '新专辑速递 — YesPlayMusic',
    description: '网易云新专辑上架速递',
  },
};

router.afterEach(to => {
  const seo = to.name ? ROUTE_SEO[to.name as string] : undefined;
  document.title = seo?.title ?? 'YesPlayMusic';
  if (seo?.description) {
    document
      .querySelector('meta[name="description"]')
      ?.setAttribute('content', seo.description);
  }
});

export default router;
