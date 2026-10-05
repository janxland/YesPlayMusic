<template>
  <div class="navView">
    <nav
      :class="{
        'has-custom-titlebar': hasCustomTitlebar,
        'search-active': inputFocus,
      }"
    >
      <Win32Titlebar v-if="enableWin32Titlebar" />
      <LinuxTitlebar v-if="enableLinuxTitlebar" />
      <div class="navigation-buttons">
        <button-icon @click="go('back')"
          ><svg-icon icon-class="arrow-left"
        /></button-icon>
        <button-icon @click="go('forward')"
          ><svg-icon icon-class="arrow-right"
        /></button-icon>
      </div>
      <div class="navigation-links">
        <router-link to="/" :class="{ active: $route.name === 'home' }">{{
          $t('nav.home')
        }}</router-link>
        <router-link
          to="/explore"
          :class="{ active: $route.name === 'explore' }"
          >{{ $t('nav.explore') }}</router-link
        >
        <router-link
          to="/library"
          :class="{ active: $route.name === 'library' }"
          >{{ $t('nav.library') }}</router-link
        >
      </div>
      <div class="right-part">
        <div class="search-box">
          <div
            class="container"
            :class="{ active: inputFocus }"
            @click="focusSearch"
          >
            <a><svg-icon icon-class="search" /></a>
            <div class="input">
              <input
                ref="searchInputRef"
                v-model="keywords"
                type="search"
                :placeholder="inputFocus ? '' : $t('nav.search')"
                @keydown.enter="doSearch"
                @focus="inputFocus = true"
                @blur="inputFocus = false"
              />
            </div>
            <a @click="showSearchList">
              <svg-icon icon-class="arrow-down" />
            </a>
          </div>
        </div>
        <LazyImage
          class="avatar"
          :src="avatarUrl"
          referrerpolicy="no-referrer"
          @click="showUserProfileMenu"
        />
      </div>
    </nav>
    <ContextMenu ref="showSearchListRef">
      <div class="item" @click="toCoSearch('tencent')">
        <svg-icon icon-class="settings" />
        其他搜索
      </div>
    </ContextMenu>
    <ContextMenu ref="userProfileMenuRef">
      <div class="item" @click="toSettings">
        <svg-icon icon-class="settings" />
        {{ $t('library.userProfileMenu.settings') }}
      </div>
      <div v-if="!isLooseLoggedIn" class="item" @click="toLogin">
        <svg-icon icon-class="login" />
        {{ $t('login.login') }}
      </div>
      <div v-if="isLooseLoggedIn" class="item" @click="logout">
        <svg-icon icon-class="logout" />
        {{ $t('library.userProfileMenu.logout') }}
      </div>
      <div class="item" @click="toTheme">
        <svg-icon
          :icon-class="settings.appearance == 'dark' ? 'moon' : 'sun'"
        />
        {{ $t('nav.theme') }}
      </div>
      <hr />
      <div class="item" @click="toGitHub">
        <svg-icon icon-class="github" />
        {{ $t('nav.github') }}
      </div>
      <div class="item" @click="toIndex">
        <svg-icon icon-class="index" />
        {{ $t('nav.index') }}
      </div>
      <div class="item" @click="toAbout">
        <svg-icon icon-class="list" />
        {{ $t('nav.changelog') }}
      </div>
    </ContextMenu>
  </div>
</template>

<script setup lang="ts">
const router = useRouter();
const route = useRoute();

import { isDesktop } from '@/platform/env';
import { isLooseLoggedIn as isLooseLoggedInUtil, doLogout } from '@/utils/auth';
import { COVER_FALLBACK } from '@/utils/imageFallback';

// 标题栏（含 codicon 字体 71KB）只在桌面端出现：defineAsyncComponent 按需拉取，web 构建不再无条件打包 codicon.css（见 Win32/LinuxTitlebar 内 import）
const Win32Titlebar = defineAsyncComponent(
  () => import('@/components/Win32Titlebar.vue')
);
const LinuxTitlebar = defineAsyncComponent(
  () => import('@/components/LinuxTitlebar.vue')
);
import ContextMenu from '@/components/ContextMenu.vue';
import ButtonIcon from '@/components/ButtonIcon.vue';
import { changeAppearance } from '@/utils/common';
import {
  ref,
  computed,
  nextTick,
  defineAsyncComponent,
  useTemplateRef,
} from 'vue';
import { useDataStore } from '@/stores/data';
import { useSettingsStore } from '@/stores/settings';
import { storeToRefs } from 'pinia';

import { useRoute, useRouter } from 'vue-router';
// 模板 ref 用 useTemplateRef：类型更准（searchInput 仍经 defineExpose 暴露，App.vue 里 navbarRef.searchInput.focus() 的自动解包行为不变）
const showSearchListRef =
  useTemplateRef<InstanceType<typeof ContextMenu>>('showSearchListRef');
const userProfileMenuRef =
  useTemplateRef<InstanceType<typeof ContextMenu>>('userProfileMenuRef');
const searchInputRef = useTemplateRef<HTMLInputElement>('searchInputRef');

const settingsStore = useSettingsStore();
const { settings } = storeToRefs(settingsStore);
const { data } = storeToRefs(useDataStore());

const inputFocus = ref<any>(false);

const keywords = ref<any>('');

const enableWin32Titlebar = ref<any>(false);

const enableLinuxTitlebar = ref<any>(false);

const isLooseLoggedIn = computed(() => isLooseLoggedInUtil());

const avatarUrl = computed(function avatarUrl() {
  return data.value?.user?.avatarUrl && isLooseLoggedIn.value
    ? `${data.value?.user?.avatarUrl}?param=512y512`
    : COVER_FALLBACK;
});

const hasCustomTitlebar = computed(function hasCustomTitlebar() {
  return enableWin32Titlebar.value || enableLinuxTitlebar.value;
});

function go(where) {
  if (where === 'back') router.go(-1);
  else router.go(1);
}

function focusSearch() {
  inputFocus.value = true;
  nextTick(() => searchInputRef.value.focus());
}

function doSearch() {
  if (!keywords.value) return;
  searchInputRef.value.blur();
  if (route.name === 'search' && route.params.keywords === keywords.value) {
    return;
  }
  router.push({
    name: 'search',
    params: { keywords: keywords.value },
  });
}

function showUserProfileMenu(e) {
  userProfileMenuRef.value.openMenu(e);
}

function showSearchList(e) {
  showSearchListRef.value.openMenu(e);
}

function toCoSearch(item) {
  router.push({
    name: 'coSearch',
    query: { server: item, keywords: keywords.value },
  });
}

function logout() {
  if (!confirm('确定要退出登录吗？')) return;
  doLogout();
  router.push({ name: 'home' });
}

function toSettings() {
  router.push({ name: 'settings' });
}

function toAbout() {
  router.push({ name: 'about' });
}

function toTheme() {
  // 直写 state 会绕过 updateSettings 内的桌面端 IPC 推送（托盘/OSD 收不到主题变更）
  const next = settings.value.appearance != 'dark' ? 'dark' : 'light';
  settingsStore.updateSettings({ key: 'appearance', value: next });
  changeAppearance(next);
}

function toGitHub() {
  window.open('https://github.com/janxland/YesPlayMusic');
}

function toIndex() {
  window.open('https://www.roginx.ink');
}

function toLogin() {
  if (isDesktop()) {
    router.push({ name: 'loginAccount' });
  } else {
    router.push({ name: 'login' });
  }
}

if (process.platform === 'win32') {
  enableWin32Titlebar.value = true;
} else if (
  process.platform === 'linux' &&
  settings.value.linuxEnableCustomTitlebar
) {
  enableLinuxTitlebar.value = true;
}

defineExpose({ go, inputFocus, searchInput: searchInputRef });
</script>

<style lang="scss" scoped>
.navView {
  position: absolute;
  z-index: 100;
  width: 100%;
}
nav {
  top: 0;
  right: 0;
  left: 0;
  display: flex;
  justify-content: space-between;
  align-items: center;
  height: 64px;
  padding: {
    right: 10vw;
    left: 10vw;
  }
  backdrop-filter: saturate(180%) blur(20px);

  background-color: var(--color-navbar-bg);
  -webkit-app-region: drag;
}

@media (max-width: 1336px) {
  nav {
    padding: 0 max(5vw, 90px);
  }
}

@supports (-moz-appearance: none) {
  nav {
    background-color: var(--color-body-bg);
  }
}

nav.has-custom-titlebar {
  padding-top: 20px;
  -webkit-app-region: no-drag;
}

.navigation-buttons {
  flex: 1;
  display: flex;
  align-items: center;
  .svg-icon {
    height: 24px;
    width: 24px;
  }
  button {
    -webkit-app-region: no-drag;
  }
}
@media (max-width: 1000px) {
  .navigation-buttons {
    flex: unset;
  }
}

.navigation-links {
  flex: 1;
  display: flex;
  justify-content: center;
  text-transform: uppercase;
  user-select: none;
  a {
    -webkit-app-region: no-drag;
    font-size: 18px;
    font-weight: 700;
    text-decoration: none;
    border-radius: 6px;
    padding: 6px 10px;
    color: var(--color-text);
    transition: 0.2s;
    -webkit-user-drag: none;
    margin: {
      right: 12px;
      left: 12px;
    }
    &:hover {
      background: var(--color-secondary-bg-for-transparent);
    }
    &:active {
      transform: scale(0.92);
      transition: 0.2s;
    }
  }
  a.active {
    color: var(--color-primary);
  }
}

.search {
  .svg-icon {
    height: 18px;
    width: 18px;
  }
}

.search-box {
  display: flex;
  justify-content: flex-end;
  -webkit-app-region: no-drag;

  .container {
    display: flex;
    align-items: center;
    height: 32px;
    background: var(--color-secondary-bg-for-transparent);
    border-radius: 8px;
    width: 200px;
  }

  .svg-icon {
    height: 15px;
    width: 15px;
    color: var(--color-text);
    opacity: 0.28;
    margin: {
      left: 8px;
      right: 4px;
    }
  }

  input {
    font-size: 16px;
    border: none;
    background: transparent;
    width: 96%;
    font-weight: 600;
    margin-top: -1px;
    color: var(--color-text);
  }

  .active {
    background: var(--color-primary-bg-for-transparent);
    input,
    .svg-icon {
      opacity: 1;
      color: var(--color-primary);
    }
  }
}

[data-theme='dark'] {
  .search-box {
    .active {
      input,
      .svg-icon {
        color: var(--color-text);
      }
    }
  }
}

.right-part {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: flex-end;
  .avatar {
    user-select: none;
    height: 30px;
    margin-left: 12px;
    vertical-align: -7px;
    border-radius: 50%;
    cursor: pointer;
    -webkit-app-region: no-drag;
    -webkit-user-drag: none;
    &:hover {
      filter: brightness(80%);
    }
  }
  .search-button {
    display: none;
    -webkit-app-region: no-drag;
  }
}

@media (max-width: 576px) {
  nav {
    padding: 0 12px;
  }
  .navigation-buttons {
    display: none;
  }
  .navigation-links {
    justify-content: flex-start;
    min-width: 0;
    a {
      flex: none;
      font-size: 15px;
      padding: 6px 7px;
      margin: 0 3px;
      white-space: nowrap;
    }
  }
  .right-part {
    flex: none;
    .avatar {
      margin-left: 6px;
    }
  }
  .search-box .container {
    width: 34px;
    justify-content: center;
    transition: width 0.25s ease;
    .input,
    > a:last-of-type {
      display: none;
    }
    &.active {
      width: 100%;
      justify-content: flex-start;
      .input {
        display: flex;
        flex: 1;
      }
    }
  }
  nav.search-active {
    .navigation-links,
    .right-part .avatar {
      display: none;
    }
    .right-part,
    .search-box {
      flex: 1;
    }
  }
}
</style>
