<template>
  <div class="about-page">
    <div class="container">
      <div class="app-card">
        <img
          class="logo"
          src="@/assets/img/logos/yesplaymusic.png"
          alt="logo"
        />
        <div class="meta">
          <div class="name">YesPlayMusic <span class="fork">二开版</span></div>
          <div class="ver">v{{ version }}</div>
          <div class="desc">
            高颜值的第三方网易云播放器 · 本站为 janxland 二次开发版本
          </div>
          <div class="links">
            <a
              href="https://github.com/janxland/YesPlayMusic"
              target="_blank"
              rel="noopener"
            >
              <svg-icon icon-class="github" /> GitHub 仓库
            </a>
            <a href="https://www.roginx.ink" target="_blank" rel="noopener">
              <svg-icon icon-class="index" /> 站长博客
            </a>
            <router-link :to="{ name: 'download' }">
              <svg-icon icon-class="download" /> 桌面客户端
            </router-link>
          </div>
        </div>
      </div>
      <Changelog />
    </div>
  </div>
</template>

<script>
import pkg from '../../package.json';
import Changelog from '@/components/Changelog.vue';

export default {
  name: 'About',
  components: { Changelog },
  data() {
    return {
      version: pkg.version,
    };
  },
};
</script>

<style lang="scss" scoped>
.about-page {
  .container {
    max-width: 820px;
    margin: 0 auto;
    padding: 104px 24px 128px;
  }
}

.app-card {
  display: flex;
  align-items: center;
  gap: 20px;
  background: var(--color-secondary-bg-for-transparent);
  border-radius: 12px;
  padding: 22px 24px;
  margin-bottom: 28px;

  .logo {
    width: 88px;
    height: 88px;
    border-radius: 20px;
    flex: none;
  }
  .name {
    font-size: 22px;
    font-weight: 700;
    color: var(--color-text);
    .fork {
      font-size: 12px;
      font-weight: 600;
      color: var(--color-primary);
      background: var(--color-primary-bg-for-transparent);
      border-radius: 5px;
      padding: 2px 8px;
      vertical-align: 3px;
    }
  }
  .ver {
    font-size: 12px;
    opacity: 0.55;
    color: var(--color-text);
    margin-top: 2px;
  }
  .desc {
    font-size: 13px;
    color: var(--color-text);
    opacity: 0.75;
    margin-top: 6px;
  }
  .links {
    display: flex;
    gap: 18px;
    margin-top: 10px;
    a {
      font-size: 13px;
      color: var(--color-text);
      text-decoration: none;
      .svg-icon {
        width: 14px;
        height: 14px;
        margin-right: 3px;
      }
      &:hover {
        color: var(--color-primary);
      }
    }
  }
}

@media (max-width: 576px) {
  .about-page .container {
    padding: 88px 14px 96px;
  }
  .app-card {
    flex-direction: column;
    text-align: center;
    .links {
      justify-content: center;
    }
  }
}
</style>
