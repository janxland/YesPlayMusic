<template>
  <div class="settings-page" @click="clickOutside">
    <div class="container">
      <div v-if="showUserInfo" class="user">
        <div class="left">
          <LazyImage
            class="avatar"
            :src="data.user.avatarUrl"
            referrerpolicy="no-referrer"
          />
          <div class="info">
            <div class="nickname">{{ data.user.nickname }}</div>
            <div class="extra-info">
              <span v-if="data.user.vipType !== 0" class="vip"
                ><img
                  class="cvip"
                  src="data:image/png;base64,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"
                  loading="lazy"
                />
                <span class="text">黑胶VIP</span>
              </span>
              <span v-else class="text">{{ data.user.signature }}</span>
            </div>
          </div>
        </div>
        <div class="right">
          <button @click="logout">
            <svg-icon icon-class="logout" />
            {{ $t('settings.logout') }}
          </button>
        </div>
      </div>

      <div class="item">
        <div class="left">
          <div class="title"> {{ $t('settings.language') }} </div>
        </div>
        <div class="right">
          <select v-model="lang">
            <option value="en">🇬🇧 English</option>
            <option value="tr">🇹🇷 Türkçe</option>
            <option value="zh-CN">🇨🇳 简体中文</option>
            <option value="zh-TW">繁體中文</option>
          </select>
        </div>
      </div>
      <div class="item">
        <div class="left">
          <div class="title"> {{ $t('settings.appearance.text') }} </div>
        </div>
        <div class="right">
          <select v-model="appearance">
            <option value="auto">{{ $t('settings.appearance.auto') }}</option>
            <option value="light"
              >🌞 {{ $t('settings.appearance.light') }}</option
            >
            <option value="dark"
              >🌚 {{ $t('settings.appearance.dark') }}</option
            >
          </select>
        </div>
      </div>
      <div class="item">
        <div class="left">
          <div class="title"> {{ $t('settings.themeColor.text') }} </div>
        </div>
        <div class="right">
          <select v-model="themeColor">
            <option value="default">
              {{ $t('settings.themeColor.default') }}
            </option>
            <option value="sunset">
              {{ $t('settings.themeColor.sunset') }}
            </option>
            <option value="ocean">
              {{ $t('settings.themeColor.ocean') }}
            </option>
            <option value="forest">
              {{ $t('settings.themeColor.forest') }}
            </option>
          </select>
        </div>
      </div>
      <div class="item">
        <div class="left">
          <div class="title"> 图片加载效果 </div>
        </div>
        <div class="right">
          <select v-model="imageLoadEffect">
            <option value="blur">模糊渐显</option>
            <option value="glass">毛玻璃</option>
            <option value="fade">淡入</option>
            <option value="none">关闭</option>
          </select>
        </div>
      </div>
      <div v-if="isElectron" class="item">
        <div class="left">
          <div class="title"> {{ $t('settings.trayIcon.text') }} </div>
        </div>
        <div class="right">
          <select v-model="trayIconTheme">
            <option value="auto">{{ $t('settings.trayIcon.auto') }}</option>
            <option value="light">{{ $t('settings.trayIcon.light') }}</option>
            <option value="dark">{{ $t('settings.trayIcon.dark') }}</option>
          </select>
        </div>
      </div>
      <div class="item">
        <div class="left">
          <div class="title">
            {{ $t('settings.MusicGenrePreference.text') }}
          </div>
        </div>
        <div class="right">
          <select v-model="musicLanguage">
            <option value="all">{{
              $t('settings.MusicGenrePreference.none')
            }}</option>
            <option value="zh">{{
              $t('settings.MusicGenrePreference.mandarin')
            }}</option>
            <option value="ea">{{
              $t('settings.MusicGenrePreference.western')
            }}</option>
            <option value="jp">{{
              $t('settings.MusicGenrePreference.japanese')
            }}</option>
            <option value="kr">{{
              $t('settings.MusicGenrePreference.korean')
            }}</option>
          </select>
        </div>
      </div>
      <h3>字体</h3>
      <div class="item">
        <div class="left">
          <div class="title"> {{ $t('settings.webFont.text') }} </div>
        </div>
        <div class="right">
          <select v-model="fontFamilyName">
            <option
              v-for="font in fonts"
              :key="font.name"
              :label="font.name"
              :value="font.name"
            >
              <span :style="{ fontFamily: font.import }">{{ font.name }}</span>
            </option>
          </select>
        </div>
      </div>
      <div class="item">
        <div class="left">
          <div class="title"> {{ $t('settings.musicQuality.text') }} </div>
        </div>
        <div class="right">
          <select v-model="musicQuality">
            <option value="128000">
              {{ $t('settings.musicQuality.low') }} - 128Kbps
            </option>
            <option value="192000">
              {{ $t('settings.musicQuality.medium') }} - 192Kbps
            </option>
            <option value="320000">
              {{ $t('settings.musicQuality.high') }} - 320Kbps
            </option>
            <option value="flac">
              {{ $t('settings.musicQuality.lossless') }} - FLAC
            </option>
            <option value="999000">Hi-Res</option>
          </select>
        </div>
      </div>
      <div v-if="isElectron" class="item">
        <div class="left">
          <div class="title"> {{ $t('settings.deviceSelector') }} </div>
        </div>
        <div class="right">
          <select v-model="outputDevice">
            <option
              v-for="device in allOutputDevices"
              :key="device.deviceId"
              :value="device.deviceId"
              :selected="device.deviceId == outputDevice"
            >
              {{ $t(device.label) }}
            </option>
          </select>
        </div>
      </div>

      <h3 v-if="isElectron">缓存</h3>
      <div v-if="isElectron" class="item">
        <div class="left">
          <div class="title">
            {{ $t('settings.automaticallyCacheSongs') }}
          </div>
        </div>
        <div class="right">
          <div class="toggle">
            <input
              id="automatically-cache-songs"
              v-model="automaticallyCacheSongs"
              type="checkbox"
              name="automatically-cache-songs"
            />
            <label for="automatically-cache-songs"></label>
          </div>
        </div>
      </div>
      <div v-if="isElectron" class="item">
        <div class="left">
          <div class="title"> {{ $t('settings.cacheLimit.text') }} </div>
        </div>
        <div class="right">
          <select v-model="cacheLimit">
            <option :value="false">
              {{ $t('settings.cacheLimit.none') }}
            </option>
            <option :value="512"> 500MB </option>
            <option :value="1024"> 1GB </option>
            <option :value="2048"> 2GB </option>
            <option :value="4096"> 4GB </option>
            <option :value="8192"> 8GB </option>
          </select>
        </div>
      </div>
      <div v-if="isElectron" class="item">
        <div class="left">
          <div class="title">
            {{
              $t('settings.cacheCount', {
                song: tracksCache.length,
                size: tracksCache.size,
              })
            }}</div
          >
        </div>
        <div class="right">
          <button @click="clearCache()">
            {{ $t('settings.clearSongsCache') }}
          </button>
        </div>
      </div>

      <h3>{{ $t('settings.lyric') }}</h3>
      <div class="item">
        <div class="left">
          <div class="title">{{ $t('settings.showLyricsTranslation') }}</div>
        </div>
        <div class="right">
          <div class="toggle">
            <input
              id="show-lyrics-translation"
              v-model="showLyricsTranslation"
              type="checkbox"
              name="show-lyrics-translation"
            />
            <label for="show-lyrics-translation"></label>
          </div>
        </div>
      </div>
      <div class="item">
        <div class="left">
          <div class="title">{{ $t('settings.lyricsBackground.text') }}</div>
        </div>
        <div class="right">
          <select v-model="lyricsBackground">
            <option :value="false">
              {{ $t('settings.lyricsBackground.off') }}
            </option>
            <option :value="true">
              {{ $t('settings.lyricsBackground.on') }}
            </option>
            <option value="blur"> 模糊封面 </option>
            <option value="dynamic">
              {{ $t('settings.lyricsBackground.dynamic') }}
            </option>
          </select>
        </div>
      </div>
      <div class="item">
        <div class="left">
          <div class="title"> {{ $t('settings.showLyricsTime') }} </div>
        </div>
        <div class="right">
          <div class="toggle">
            <input
              id="show-lyrics-time"
              v-model="showLyricsTime"
              type="checkbox"
              name="show-lyrics-time"
            />
            <label for="show-lyrics-time"></label>
          </div>
        </div>
      </div>
      <div class="item">
        <div class="left">
          <div class="title"> {{ $t('settings.lyricFontSize.text') }} </div>
        </div>
        <div class="right">
          <select v-model="lyricFontSize">
            <option value="16">
              {{ $t('settings.lyricFontSize.small') }} - 16px
            </option>
            <option value="22">
              {{ $t('settings.lyricFontSize.medium') }} - 22px
            </option>
            <option value="28">
              {{ $t('settings.lyricFontSize.large') }} - 28px
            </option>
            <option value="36">
              {{ $t('settings.lyricFontSize.xlarge') }} - 36px
            </option>
          </select>
        </div>
      </div>
      <div v-if="isElectron && isLinux" class="item">
        <div class="left">
          <div class="title">
            {{ $t('settings.unm.enable') }}
            <a target="_blank" href="https://github.com/osdlyrics/osdlyrics"
              >OSDLyrics</a
            >
            {{ $t('settings.enableOsdlyricsSupport.title') }}
          </div>
          <div class="description">
            {{ $t('settings.enableOsdlyricsSupport.desc1') }}
            <br />
            {{ $t('settings.enableOsdlyricsSupport.desc2') }}
          </div>
        </div>
        <div class="right">
          <div class="toggle">
            <input
              id="enable-osdlyrics-support"
              v-model="enableOsdlyricsSupport"
              type="checkbox"
              name="enable-osdlyrics-support"
            />
            <label for="enable-osdlyrics-support"></label>
          </div>
        </div>
      </div>

      <section v-if="isElectron" class="unm-configuration">
        <h3>UnblockNeteaseMusic</h3>
        <div class="item">
          <div class="left">
            <div class="title"
              >{{ $t('settings.unm.enable') }}
              <a
                href="https://github.com/UnblockNeteaseMusic/server"
                target="blank"
                >UnblockNeteaseMusic</a
              ></div
            >
          </div>
          <div class="right">
            <div class="toggle">
              <input
                id="enable-unblock-netease-music"
                v-model="enableUnblockNeteaseMusic"
                type="checkbox"
                name="enable-unblock-netease-music"
              />
              <label for="enable-unblock-netease-music"></label>
            </div>
          </div>
        </div>

        <div class="item">
          <div class="left">
            <div class="title">
              {{ $t('settings.unm.audioSource.title') }}
            </div>
            <div class="description">
              音源的具体代号
              <a
                href="https://github.com/UnblockNeteaseMusic/server-rust/blob/main/README.md#支援的所有引擎"
                target="_blank"
              >
                可以点此到 UNM 的说明页面查询。 </a
              ><br />
              多个音源请用 <code>,</code> 逗号分隔。<br />
              留空则使用 UNM 内置的默认值。
            </div>
          </div>
          <div class="right">
            <input
              v-model="unmSource"
              class="text-input margin-right-0"
              placeholder="例 bilibili, kuwo"
            />
          </div>
        </div>

        <div class="item">
          <div class="left">
            <div class="title"> {{ $t('settings.unm.enableFlac.title') }} </div>
            <div class="description">
              {{ $t('settings.unm.enableFlac.desc') }}
            </div>
          </div>
          <div class="right">
            <div class="toggle">
              <input
                id="unm-enable-flac"
                v-model="unmEnableFlac"
                type="checkbox"
              />
              <label for="unm-enable-flac" />
            </div>
          </div>
        </div>

        <div class="item">
          <div class="left">
            <div class="title"> {{ $t('settings.unm.searchMode.title') }} </div>
          </div>
          <div class="right">
            <select v-model="unmSearchMode">
              <option value="fast-first">
                {{ $t('settings.unm.searchMode.fast') }}
              </option>
              <option value="order-first">
                {{ $t('settings.unm.searchMode.order') }}
              </option>
            </select>
          </div>
        </div>

        <div class="item">
          <div class="left">
            <div class="title">{{ $t('settings.unm.cookie.joox') }}</div>
            <div class="description">
              <a
                href="https://github.com/UnblockNeteaseMusic/server-rust/tree/main/engines#joox-cookie-設定說明"
                target="_blank"
                >{{ $t('settings.unm.cookie.desc1') }}
              </a>
              {{ $t('settings.unm.cookie.desc2') }}
            </div>
          </div>
          <div class="right">
            <input
              v-model="unmJooxCookie"
              class="text-input margin-right-0"
              placeholder="wmid=..; session_key=.."
            />
          </div>
        </div>

        <div class="item">
          <div class="left">
            <div class="title"> {{ $t('settings.unm.cookie.qq') }} </div>
            <div class="description">
              <a
                href="https://github.com/UnblockNeteaseMusic/server-rust/tree/main/engines#qq-cookie-設定說明"
                target="_blank"
                >{{ $t('settings.unm.cookie.desc1') }}
              </a>
              {{ $t('settings.unm.cookie.desc2') }}
            </div>
          </div>
          <div class="right">
            <input
              v-model="unmQQCookie"
              class="text-input margin-right-0"
              placeholder="uin=..; qm_keyst=..;"
            />
          </div>
        </div>

        <div class="item">
          <div class="left">
            <div class="title"> {{ $t('settings.unm.ytdl') }} </div>
            <div class="description">
              <a
                href="https://github.com/UnblockNeteaseMusic/server-rust/tree/main/engines#ytdlexe-設定說明"
                target="_blank"
                >{{ $t('settings.unm.cookie.desc1') }}
              </a>
              {{ $t('settings.unm.cookie.desc2') }}
            </div>
          </div>
          <div class="right">
            <input
              v-model="unmYtDlExe"
              class="text-input margin-right-0"
              placeholder="ex. youtube-dl"
            />
          </div>
        </div>

        <div class="item">
          <div class="left">
            <div class="title"> {{ $t('settings.unm.proxy.title') }} </div>
            <div class="description">
              {{ $t('settings.unm.proxy.desc1') }}<br />
              {{ $t('settings.unm.proxy.desc2') }}
            </div>
          </div>
          <div class="right">
            <input
              v-model="unmProxyUri"
              class="text-input margin-right-0"
              placeholder="ex. https://192.168.11.45"
            />
          </div>
        </div>
      </section>

      <h3>{{ $t('settings.customization') }}</h3>
      <div class="item">
        <div class="left">
          <div class="title">
            {{
              isLastfmConnected
                ? `已连接到 Last.fm (${lastfm.name})`
                : '连接 Last.fm '
            }}</div
          >
        </div>
        <div class="right">
          <button v-if="isLastfmConnected" @click="lastfmDisconnect()"
            >断开连接
          </button>
          <button v-else @click="lastfmConnect()"> 授权连接 </button>
        </div>
      </div>
      <div v-if="isElectron" class="item">
        <div class="left">
          <div class="title">
            {{ $t('settings.enableDiscordRichPresence') }}</div
          >
        </div>
        <div class="right">
          <div class="toggle">
            <input
              id="enable-discord-rich-presence"
              v-model="enableDiscordRichPresence"
              type="checkbox"
              name="enable-discord-rich-presence"
            />
            <label for="enable-discord-rich-presence"></label>
          </div>
        </div>
      </div>

      <h3>{{ $t('settings.others') }}</h3>
      <div v-if="isElectron && !isMac" class="item">
        <div class="left">
          <div class="title"> {{ $t('settings.closeAppOption.text') }} </div>
        </div>
        <div class="right">
          <select v-model="closeAppOption">
            <option value="ask">
              {{ $t('settings.closeAppOption.ask') }}
            </option>
            <option value="exit">
              {{ $t('settings.closeAppOption.exit') }}
            </option>
            <option value="minimizeToTray">
              {{ $t('settings.closeAppOption.minimizeToTray') }}
            </option>
          </select>
        </div>
      </div>

      <!-- 「其他」分组 6 个开关项配置驱动渲染：DOM 结构与原逐项手写标记逐 attr 对齐，仅收敛样板，顺序与显示条件不变 -->
      <template v-for="toggle in otherToggles" :key="toggle.id">
        <div v-if="toggle.show ? toggle.show() : true" class="item">
          <div class="left">
            <div class="title" :style="toggle.titleStyle">
              {{ toggle.titleKey ? $t(toggle.titleKey) : toggle.title }}
            </div>
          </div>
          <div class="right">
            <div class="toggle">
              <input
                :id="toggle.id"
                :checked="toggle.model.value"
                type="checkbox"
                :name="toggle.id"
                @change="setToggle(toggle, $event)"
              />
              <label :for="toggle.id"></label>
            </div>
          </div>
        </div>
      </template>

      <div v-if="isElectron">
        <h3>代理</h3>
        <div class="item">
          <div class="left">
            <div class="title"> 代理协议 </div>
          </div>
          <div class="right">
            <select v-model="proxyProtocol">
              <option value="noProxy"> 关闭代理 </option>
              <option value="HTTP"> HTTP 代理 </option>
              <option value="HTTPS"> HTTPS 代理 </option>
            </select>
          </div>
        </div>
        <div id="proxy-form" :class="{ disabled: proxyProtocol === 'noProxy' }">
          <input
            v-model="proxyServer"
            class="text-input"
            placeholder="服务器地址"
            :disabled="proxyProtocol === 'noProxy'"
          /><input
            v-model="proxyPort"
            class="text-input"
            placeholder="端口"
            type="number"
            min="1"
            max="65535"
            :disabled="proxyProtocol === 'noProxy'"
          />
          <button @click="sendProxyConfig">更新代理</button>
        </div>
      </div>
      <div v-if="isElectron">
        <h3>Real IP</h3>
        <div class="item">
          <div class="left">
            <div class="title"> Real IP </div>
          </div>
          <div class="right">
            <div class="toggle">
              <input
                id="enable-real-ip"
                v-model="enableRealIP"
                type="checkbox"
                name="enable-real-ip"
              />
              <label for="enable-real-ip"></label>
            </div>
          </div>
        </div>
        <div id="real-ip" :class="{ disabled: !enableRealIP }">
          <input
            v-model="realIP"
            class="text-input"
            placeholder="IP地址"
            :disabled="!enableRealIP"
          />
        </div>
      </div>

      <div v-if="isElectron">
        <h3>快捷键</h3>
        <div class="item">
          <div class="left">
            <div class="title"> {{ $t('settings.enableGlobalShortcut') }}</div>
          </div>
          <div class="right">
            <div class="toggle">
              <input
                id="enable-enable-global-shortcut"
                v-model="enableGlobalShortcut"
                type="checkbox"
                name="enable-enable-global-shortcut"
              />
              <label for="enable-enable-global-shortcut"></label>
            </div>
          </div>
        </div>
        <div
          id="shortcut-table"
          :class="{ 'global-disabled': !enableGlobalShortcut }"
          tabindex="0"
          @keydown="handleShortcutKeydown"
        >
          <div class="row row-head">
            <div class="col">功能</div>
            <div class="col">快捷键</div>
            <div class="col">全局快捷键</div>
          </div>
          <div
            v-for="shortcut in settings.shortcuts"
            :key="shortcut.id"
            class="row"
          >
            <div class="col">{{ shortcut.name }}</div>
            <div class="col">
              <div
                class="keyboard-input"
                :class="{
                  active:
                    shortcutInput.id === shortcut.id &&
                    shortcutInput.type === 'shortcut',
                }"
                @click.stop="readyToRecordShortcut(shortcut.id, 'shortcut')"
              >
                {{
                  shortcutInput.id === shortcut.id &&
                  shortcutInput.type === 'shortcut' &&
                  recordedShortcutComputed !== ''
                    ? formatShortcut(recordedShortcutComputed)
                    : formatShortcut(shortcut.shortcut)
                }}
              </div>
            </div>
            <div class="col">
              <div
                class="keyboard-input"
                :class="{
                  active:
                    shortcutInput.id === shortcut.id &&
                    shortcutInput.type === 'globalShortcut' &&
                    enableGlobalShortcut,
                }"
                @click.stop="
                  readyToRecordShortcut(shortcut.id, 'globalShortcut')
                "
                >{{
                  shortcutInput.id === shortcut.id &&
                  shortcutInput.type === 'globalShortcut' &&
                  recordedShortcutComputed !== ''
                    ? formatShortcut(recordedShortcutComputed)
                    : formatShortcut(shortcut.globalShortcut)
                }}</div
              >
            </div>
          </div>
          <button
            class="restore-default-shortcut"
            @click="restoreDefaultShortcuts"
            >恢复默认快捷键</button
          >
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
const router = useRouter();

let _lastfmChecker = null;

import { player as playerInstance } from '@/player/singleton';
import { isLooseLoggedIn, doLogout } from '@/utils/auth';
import { auth as lastfmAuth } from '@/api/lastfm';
import {
  changeAppearance,
  changeThemeColor,
  bytesToSize,
} from '@/utils/common';
import { countDBSize as countDBSizeUtil, clearDB } from '@/utils/db';
import { ipcBridge } from '@/platform/bridge';
import { isDesktop } from '@/platform/env';
import { changeI18nLocale } from '@/locale';
import {
  ref,
  computed,
  onBeforeUnmount,
  onActivated,
  onMounted,
  onDeactivated,
} from 'vue';
import {
  useDataStore,
  usePlayerStore,
  useSettingsStore,
  useUiStore,
} from '@/stores';
import { storeToRefs } from 'pinia';

import { useRouter } from 'vue-router';

const validShortcutCodes = ['=', '-', '~', '[', ']', ';', "'", ',', '.', '/'];

const settingsStore = useSettingsStore();
const dataStore = useDataStore();
const playerStore = usePlayerStore();
const uiStore = useUiStore();

const { settings } = storeToRefs(settingsStore);
const { data, lastfm } = storeToRefs(dataStore);
const { player } = storeToRefs(playerStore);

const showToast = uiStore.showToast;

// settingComputed 工厂：给 25 个纯「读 settings[key] + 写回 updateSettings」的开关/下拉用，替代各 8~10 行 get/set 样板
// merge 'nullish' 对齐旧 ?? / 显式 undefined 判断，'or' 对齐旧 ||（falsy 归默认值）；带副作用的设置项不适用，保持手写
function settingComputed(
  key: string,
  options: {
    fallback?: any;
    merge?: 'or' | 'nullish';
    setTransform?: (v: any) => any;
  } = {}
) {
  const { fallback = undefined, merge = 'nullish', setTransform } = options;
  return computed({
    get() {
      const value = settings.value[key];
      if (merge === 'or') return value || fallback;
      if (fallback === undefined) return value;
      return value === undefined ? fallback : value;
    },
    set(value) {
      settingsStore.updateSettings({
        key,
        value: setTransform ? setTransform(value) : value,
      });
    },
  });
}

const tracksCache = ref<any>({
  size: '0KB',
  length: 0,
});

const allOutputDevices = ref<any>([
  {
    deviceId: 'default',
    label: 'settings.permissionRequired',
  },
]);

const shortcutInput = ref<any>({
  id: '',
  type: '',
  recording: false,
});

const recordedShortcut = ref<any>([]);

const fonts = computed(function fonts() {
  return uiStore.fonts;
});

const isElectron = computed(function isElectron() {
  return isDesktop();
});

const isMac = computed(function isMac() {
  return /macintosh|mac os x/i.test(navigator.userAgent);
});

const isLinux = computed(function isLinux() {
  return process.platform === 'linux';
});

const showUserInfo = computed(function showUserInfo() {
  return isLooseLoggedIn() && data.value.user.nickname;
});

const recordedShortcutComputed = computed(function recordedShortcutComputed() {
  let shortcut: string[] = [];
  recordedShortcut.value.map(e => {
    if (e.keyCode >= 65 && e.keyCode <= 90) {
      // A-Z
      shortcut.push(e.code.replace('Key', ''));
    } else if (e.key === 'Meta') {
      // ⌘ Command on macOS
      shortcut.push('Command');
    } else if (['Alt', 'Control', 'Shift'].includes(e.key)) {
      shortcut.push(e.key);
    } else if (e.keyCode >= 48 && e.keyCode <= 57) {
      // 0-9
      shortcut.push(e.code.replace('Digit', ''));
    } else if (e.keyCode >= 112 && e.keyCode <= 123) {
      // F1-F12
      shortcut.push(e.code);
    } else if (
      ['ArrowRight', 'ArrowLeft', 'ArrowUp', 'ArrowDown'].includes(e.key)
    ) {
      // Arrows
      shortcut.push(e.code.replace('Arrow', ''));
    } else if (validShortcutCodes.includes(e.key)) {
      shortcut.push(e.key);
    }
  });
  const sortTable = {
    Control: 1,
    Shift: 2,
    Alt: 3,
    Command: 4,
  };
  shortcut = shortcut.sort((a, b) => {
    if (!sortTable[a] || !sortTable[b]) return 0;
    if (sortTable[a] - sortTable[b] <= -1) {
      return -1;
    } else if (sortTable[a] - sortTable[b] >= 1) {
      return 1;
    } else {
      return 0;
    }
  });
  return shortcut.join('+');
});

const lang = computed({
  get() {
    return settings.value.lang;
  },
  set(lang) {
    // 语言包按需加载：目标语言未装载时先动态拉取再切换（见 src/locale/index.ts）
    changeI18nLocale(lang);
    settingsStore.changeLang(lang);
  },
});

const musicLanguage = settingComputed('musicLanguage', { fallback: 'all' });

const appearance = computed({
  get() {
    if (settings.value.appearance === undefined) return 'auto';
    return settings.value.appearance;
  },
  set(value) {
    settingsStore.updateSettings({
      key: 'appearance',
      value,
    });
    changeAppearance(value);
    const resolvedAppearance =
      value === 'auto'
        ? document.body?.getAttribute('data-theme') || 'light'
        : value;
    changeThemeColor(themeColor.value, resolvedAppearance);
  },
});

const themeColor = computed({
  get() {
    if (settings.value.themeColor === undefined) return 'default';
    return settings.value.themeColor;
  },
  set(value) {
    settingsStore.updateSettings({
      key: 'themeColor',
      value,
    });
    const resolvedAppearance =
      settings.value.appearance === 'auto'
        ? document.body?.getAttribute('data-theme') || 'light'
        : settings.value.appearance;
    changeThemeColor(value, resolvedAppearance);
  },
});

const imageLoadEffect = settingComputed('imageLoadEffect', {
  fallback: 'blur',
});

const fontFamilyName = computed({
  get() {
    return settings.value.fontFamilyName ?? '思源黑体中文';
  },
  set(value) {
    if (value === settings.value.fontFamilyName) return;
    localStorage.setItem('fontFamilyName', value);
    settingsStore.changefontFamilyName(value);
    clearCache();
  },
});

const trayIconTheme = computed({
  get() {
    if (settings.value.trayIconTheme === undefined) return 'auto';
    return settings.value.trayIconTheme;
  },
  set(value) {
    settingsStore.updateSettings({
      key: 'trayIconTheme',
      value,
    });
    if (isElectron.value) {
      ipcBridge.send('updateTrayIcon', value);
    }
  },
});

const musicQuality = computed({
  get() {
    return settings.value.musicQuality ?? 320000;
  },
  set(value) {
    if (value === settings.value.musicQuality) return;
    settingsStore.changeMusicQuality(value);
    clearCache();
  },
});

const lyricFontSize = computed({
  get() {
    if (settings.value.lyricFontSize === undefined) return 28;
    return settings.value.lyricFontSize;
  },
  set(value) {
    settingsStore.changeLyricFontSize(value);
  },
});

const outputDevice = computed({
  get() {
    const isValidDevice = allOutputDevices.value.find(
      device => device.deviceId === settings.value.outputDevice
    );
    if (
      settings.value.outputDevice === undefined ||
      isValidDevice === undefined
    )
      return 'default';
    return settings.value.outputDevice;
  },
  set(deviceId) {
    if (deviceId === settings.value.outputDevice || deviceId === undefined)
      return;
    settingsStore.changeOutputDevice(deviceId);
    player.value.setOutputDevice();
  },
});

const enableUnblockNeteaseMusic = settingComputed('enableUnblockNeteaseMusic', {
  fallback: true,
});

const showPlaylistsByAppleMusic = settingComputed('showPlaylistsByAppleMusic', {
  fallback: true,
});

const nyancatStyle = settingComputed('nyancatStyle', { fallback: false });

const automaticallyCacheSongs = computed({
  get() {
    if (settings.value.automaticallyCacheSongs === undefined) return false;
    return settings.value.automaticallyCacheSongs;
  },
  set(value) {
    settingsStore.updateSettings({
      key: 'automaticallyCacheSongs',
      value,
    });
    if (value === false) {
      clearCache();
    }
  },
});

const showLyricsTranslation = settingComputed('showLyricsTranslation');

const lyricsBackground = settingComputed('lyricsBackground', {
  merge: 'or',
  fallback: false,
});

const showLyricsTime = settingComputed('showLyricsTime');

const enableOsdlyricsSupport = settingComputed('enableOsdlyricsSupport');

const closeAppOption = settingComputed('closeAppOption');

const enableDiscordRichPresence = settingComputed('enableDiscordRichPresence');

const subTitleDefault = settingComputed('subTitleDefault');

const enableReversedMode = computed({
  get() {
    if (settings.value.enableReversedMode === undefined) return false;
    return settings.value.enableReversedMode;
  },
  set(value) {
    settingsStore.updateSettings({
      key: 'enableReversedMode',
      value,
    });
    if (value === false) {
      // 直写真身（镜像写入单向同步）
      playerInstance.reversed = false;
    }
  },
});

const enableGlobalShortcut = settingComputed('enableGlobalShortcut');

const showLibraryDefault = settingComputed('showLibraryDefault', {
  merge: 'or',
  fallback: false,
});

const cacheLimit = settingComputed('cacheLimit', {
  merge: 'or',
  fallback: false,
});

const proxyProtocol = computed({
  get() {
    return settings.value.proxyConfig?.protocol || 'noProxy';
  },
  set(value) {
    let config = settings.value.proxyConfig || {};
    config.protocol = value;
    if (value === 'noProxy') {
      ipcBridge.send('removeProxy');
      showToast('已关闭代理');
    }
    settingsStore.updateSettings({
      key: 'proxyConfig',
      value: config,
    });
  },
});

const proxyServer = computed({
  get() {
    return settings.value.proxyConfig?.server || '';
  },
  set(value) {
    let config = settings.value.proxyConfig || {};
    config.server = value;
    settingsStore.updateSettings({
      key: 'proxyConfig',
      value: config,
    });
  },
});

const enableRealIP = settingComputed('enableRealIP', {
  merge: 'or',
  fallback: false,
});

const realIP = settingComputed('realIP', { merge: 'or', fallback: '' });

const proxyPort = computed({
  get() {
    return settings.value.proxyConfig?.port || '';
  },
  set(value) {
    let config = settings.value.proxyConfig || {};
    config.port = value;
    settingsStore.updateSettings({
      key: 'proxyConfig',
      value: config,
    });
  },
});

// unm 系列：set 时 `value.length && value` 把空串归 0 落库是历史行为，setTransform 原样保留（读取侧 `|| ''` 不受影响）
const unmSource = settingComputed('unmSource', {
  merge: 'or',
  fallback: '',
  setTransform: value => value.length && value,
});

const unmSearchMode = settingComputed('unmSearchMode', {
  merge: 'or',
  fallback: 'fast-first',
});

const unmEnableFlac = settingComputed('unmEnableFlac', {
  merge: 'or',
  fallback: false,
});

const unmProxyUri = settingComputed('unmProxyUri', {
  merge: 'or',
  fallback: '',
  setTransform: value => value.length && value,
});

const unmJooxCookie = settingComputed('unmJooxCookie', {
  merge: 'or',
  fallback: '',
  setTransform: value => value.length && value,
});

const unmQQCookie = settingComputed('unmQQCookie', {
  merge: 'or',
  fallback: '',
  setTransform: value => value.length && value,
});

const unmYtDlExe = settingComputed('unmYtDlExe', {
  merge: 'or',
  fallback: '',
  setTransform: value => value.length && value,
});

// key 与变量名不同（settings 里叫 linuxEnableCustomTitlebar）
const enableCustomTitlebar = settingComputed('linuxEnableCustomTitlebar');

const isLastfmConnected = computed(function isLastfmConnected() {
  return lastfm.value.key !== undefined;
});

// 「其他」分组 6 个开关项的渲染配置（模板 v-for 消费）；model 是可写 computed ref：:checked 读 .value，@change 写 .value，与 v-model 监听 change 同源等价
interface ToggleItem {
  id: string;
  titleKey?: string; // 走 $t 的标题 key
  title?: string; // 直接渲染的标题（nyancat 彩蛋行）
  titleStyle?: string; // 标题行内样式
  model: { value: any }; // 可写 computed ref
  show?: () => boolean; // 原模板 v-if 条件
}

const otherToggles: ToggleItem[] = [
  {
    id: 'enable-custom-titlebar',
    titleKey: 'settings.enableCustomTitlebar',
    model: enableCustomTitlebar,
    show: () => isElectron.value && isLinux.value,
  },
  {
    id: 'show-library-default',
    titleKey: 'settings.showLibraryDefault',
    model: showLibraryDefault,
    show: () => isElectron.value,
  },
  {
    id: 'show-playlists-by-apple-music',
    titleKey: 'settings.showPlaylistsByAppleMusic',
    model: showPlaylistsByAppleMusic,
  },
  {
    id: 'sub-title-default',
    titleKey: 'settings.subTitleDefault',
    model: subTitleDefault,
  },
  {
    id: 'enable-reversed-mode',
    titleKey: 'settings.enableReversedMode',
    model: enableReversedMode,
  },
  {
    id: 'nyancat-style',
    title: '🐈️ 🏳️‍🌈',
    titleStyle: 'transform: scaleX(-1)',
    model: nyancatStyle,
  },
];

function setToggle(toggle: ToggleItem, e: Event) {
  toggle.model.value = (e.target as HTMLInputElement).checked;
}

function getAllOutputDevices() {
  navigator.mediaDevices.enumerateDevices().then(devices => {
    allOutputDevices.value = devices.filter(device => {
      return device.kind == 'audiooutput';
    });
    if (
      allOutputDevices.value.length === 0 ||
      allOutputDevices.value[0].label === ''
    ) {
      allOutputDevices.value = [
        {
          deviceId: 'default',
          label: 'settings.permissionRequired',
        },
      ];
    }
  });
}

function logout() {
  doLogout();
  router.push({ name: 'home' });
}

function countDBSize() {
  countDBSizeUtil().then(data => {
    if (data === undefined) {
      tracksCache.value = {
        size: '0KB',
        length: 0,
      };
      return;
    }
    tracksCache.value.size = bytesToSize(data.bytes);
    tracksCache.value.length = data.length;
  });
}

function clearCache() {
  clearDB().then(() => {
    countDBSize();
  });
}

function lastfmConnect() {
  lastfmAuth();
  clearInterval(_lastfmChecker);
  _lastfmChecker = setInterval(() => {
    const session = localStorage.getItem('lastfm');
    if (session) {
      dataStore.updateLastfm(JSON.parse(session));
      clearInterval(_lastfmChecker);
    }
  }, 1000);
}

function lastfmDisconnect() {
  localStorage.removeItem('lastfm');
  dataStore.updateLastfm({});
}

function sendProxyConfig() {
  if (proxyProtocol.value === 'noProxy') return;
  const config = settings.value.proxyConfig;
  if (config.server === '' || !config.port || config.protocol === 'noProxy') {
    ipcBridge.send('removeProxy');
  } else {
    ipcBridge.send('setProxy', config);
  }
  showToast('已更新代理设置');
}

function clickOutside() {
  exitRecordShortcut();
}

function formatShortcut(shortcut) {
  shortcut = shortcut
    .replaceAll('+', ' + ')
    .replace('Up', '↑')
    .replace('Down', '↓')
    .replace('Right', '→')
    .replace('Left', '←');
  if (settings.value.lang === 'zh-CN') {
    shortcut = shortcut.replace('Space', '空格');
  } else if (settings.value.lang === 'zh-TW') {
    shortcut = shortcut.replace('Space', '空白鍵');
  }
  if (process.platform === 'darwin') {
    return shortcut
      .replace('CommandOrControl', '⌘')
      .replace('Command', '⌘')
      .replace('Alt', '⌥')
      .replace('Control', '⌃')
      .replace('Shift', '⇧');
  }
  return shortcut.replace('CommandOrControl', 'Ctrl');
}

function readyToRecordShortcut(id, type) {
  if (type === 'globalShortcut' && enableGlobalShortcut.value === false) {
    return;
  }
  shortcutInput.value = { id, type, recording: true };
  recordedShortcut.value = [];
  ipcBridge.send('switchGlobalShortcutStatusTemporary', 'disable');
}

function handleShortcutKeydown(e) {
  if (shortcutInput.value.recording === false) return;
  e.preventDefault();
  if (recordedShortcut.value.find(s => s.keyCode === e.keyCode)) return;
  recordedShortcut.value.push(e);
  if (
    (e.keyCode >= 65 && e.keyCode <= 90) || // A-Z
    (e.keyCode >= 48 && e.keyCode <= 57) || // 0-9
    (e.keyCode >= 112 && e.keyCode <= 123) || // F1-F12
    ['ArrowRight', 'ArrowLeft', 'ArrowUp', 'ArrowDown'].includes(e.key) || // Arrows
    validShortcutCodes.includes(e.key)
  ) {
    saveShortcut();
  }
}

function saveShortcut() {
  const { id, type } = shortcutInput.value;
  const payload = {
    id,
    type,
    shortcut: recordedShortcutComputed.value,
  };
  settingsStore.updateShortcut(payload);
  ipcBridge.send('updateShortcut', payload);
  showToast('快捷键已保存');
  recordedShortcut.value = [];
}

function exitRecordShortcut() {
  if (shortcutInput.value.recording === false) return;
  shortcutInput.value = { id: '', type: '', recording: false };
  recordedShortcut.value = [];
  ipcBridge.send('switchGlobalShortcutStatusTemporary', 'enable');
}

function restoreDefaultShortcuts() {
  settingsStore.restoreDefaultShortcuts();
  ipcBridge.send('restoreDefaultShortcuts');
}

// 原 created 阶段调用；方法的实参本就被忽略
countDBSize();
if (isDesktop()) getAllOutputDevices();

onBeforeUnmount(function beforeUnmount() {
  clearInterval(_lastfmChecker);
});

onActivated(function activated() {
  countDBSize();
  if (isDesktop()) getAllOutputDevices();
});

onMounted(function activatedOnMount() {
  countDBSize();
  if (isDesktop()) getAllOutputDevices();
});

onDeactivated(function deactivated() {
  clearInterval(_lastfmChecker);
});
</script>

<style lang="scss" scoped>
.settings-page {
  display: flex;
  justify-content: center;
  margin-top: 32px;
}
.container {
  margin-top: 24px;
  width: 720px;
}
h2 {
  margin-top: 48px;
  font-size: 36px;
  color: var(--color-text);
}

h3 {
  margin-top: 48px;
  padding-bottom: 12px;
  font-size: 26px;
  color: var(--color-text);
  border-bottom: 1px solid rgba(128, 128, 128, 0.18);
}

.user {
  display: flex;
  align-items: center;
  justify-content: space-between;
  background: var(--color-secondary-bg);
  color: var(--color-text);
  padding: 16px 20px;
  border-radius: 16px;
  margin-bottom: 48px;
  img.avatar {
    border-radius: 50%;
    height: 64px;
    width: 64px;
  }
  img.cvip {
    height: 13px;
    margin-right: 4px;
  }
  .left {
    display: flex;
    align-items: center;
    .info {
      margin-left: 24px;
    }
    .nickname {
      font-size: 20px;
      font-weight: 600;
      margin-bottom: 2px;
    }
    .extra-info {
      font-size: 13px;
      .text {
        opacity: 0.68;
      }
      .vip {
        display: flex;
        align-items: center;
      }
    }
  }
  .right {
    .svg-icon {
      height: 18px;
      width: 18px;
      margin-right: 4px;
    }
    button {
      display: flex;
      align-items: center;
      font-size: 18px;
      font-weight: 600;
      text-decoration: none;
      border-radius: 10px;
      padding: 8px 12px;
      opacity: 0.68;
      color: var(--color-text);
      transition: 0.2s;
      margin: {
        right: 12px;
        left: 12px;
      }
      &:hover {
        opacity: 1;
        background: #eaeffd;
        color: #335eea;
      }
      &:active {
        opacity: 1;
        transform: scale(0.92);
        transition: 0.2s;
      }
    }
  }
}

.item {
  margin: 24px 0;
  display: flex;
  align-items: center;
  justify-content: space-between;
  color: var(--color-text);

  .title {
    font-size: 16px;
    font-weight: 500;
    opacity: 0.78;
  }

  .description {
    font-size: 14px;
    margin-top: 0.5em;
    opacity: 0.7;
  }
}

select {
  min-width: 192px;
  max-width: 600px;
  font-weight: 600;
  border: none;
  padding: 8px 12px 8px 12px;
  border-radius: 8px;
  color: var(--color-text);
  background: var(--color-secondary-bg);
  appearance: none;
  &:focus {
    outline: none;
    color: var(--color-primary);
    background: var(--color-primary-bg);
  }
}

button {
  color: var(--color-text);
  background: var(--color-secondary-bg);
  padding: 8px 12px 8px 12px;
  font-weight: 600;
  border-radius: 8px;
  transition: 0.2s;
  &:hover {
    transform: scale(1.06);
  }
  &:active {
    transform: scale(0.94);
  }
}

input.text-input.margin-right-0 {
  margin-right: 0;
}
input.text-input {
  background: var(--color-secondary-bg);
  border: none;
  margin-right: 22px;
  padding: 8px 12px 8px 12px;
  border-radius: 8px;
  color: var(--color-text);
  font-weight: 600;
  font-size: 16px;
}
input::-webkit-outer-spin-button,
input::-webkit-inner-spin-button {
  -webkit-appearance: none;
}
input[type='number'] {
  -moz-appearance: textfield;
}

#proxy-form,
#real-ip {
  display: flex;
  align-items: center;
}
#proxy-form.disabled,
#real-ip.disabled {
  opacity: 0.47;
  button:hover {
    transform: unset;
  }
}

#shortcut-table {
  font-size: 14px;
  user-select: none;
  color: var(--color-text);
  .row {
    display: flex;
  }
  .row.row-head {
    opacity: 0.58;
    font-size: 13px;
    font-weight: 500;
  }
  .col {
    min-width: 192px;
    padding: 8px;
    display: flex;
    align-items: center;
    &:first-of-type {
      padding-left: 0;
      min-width: 128px;
    }
  }
  .keyboard-input {
    font-weight: 600;
    background-color: var(--color-secondary-bg);
    padding: 8px 12px 8px 12px;
    border-radius: 0.5rem;
    min-width: 146px;
    min-height: 34px;
    box-sizing: border-box;
    &.active {
      color: var(--color-primary);
      background-color: var(--color-primary-bg);
    }
  }
  .restore-default-shortcut {
    margin-top: 12px;
  }
  &.global-disabled {
    .row .col:last-child {
      opacity: 0.48;
    }
    .row.row-head .col:last-child {
      opacity: 1;
    }
  }
  &:focus {
    outline: none;
  }
}

.beforeAnimation {
  -webkit-transition: 0.2s cubic-bezier(0.24, 0, 0.5, 1);
  transition: 0.2s cubic-bezier(0.24, 0, 0.5, 1);
}
.afterAnimation {
  box-shadow: 0 0 0 1px hsla(0, 0%, 0%, 0.1), 0 4px 0px 0 hsla(0, 0%, 0%, 0.04),
    0 4px 9px hsla(0, 0%, 0%, 0.13), 0 3px 3px hsla(0, 0%, 0%, 0.05);
  -webkit-transition: 0.35s cubic-bezier(0.54, 1.6, 0.5, 1);
  transition: 0.35s cubic-bezier(0.54, 1.6, 0.5, 1);
}
.toggle {
  margin: auto;
}
.toggle input {
  opacity: 0;
  position: absolute;
}
.toggle input + label {
  position: relative;
  display: inline-block;
  -webkit-user-select: none;
  -moz-user-select: none;
  -ms-user-select: none;
  user-select: none;
  -webkit-transition: 0.4s ease;
  transition: 0.4s ease;
  height: 32px;
  width: 52px;
  background: var(--color-secondary-bg);
  border-radius: 8px;
}
.toggle input + label:before {
  content: '';
  position: absolute;
  display: block;
  -webkit-transition: 0.2s cubic-bezier(0.24, 0, 0.5, 1);
  transition: 0.2s cubic-bezier(0.24, 0, 0.5, 1);
  height: 32px;
  width: 52px;
  top: 0;
  left: 0;
  border-radius: 8px;
}
.toggle input + label:after {
  content: '';
  position: absolute;
  display: block;
  box-shadow: 0 0 0 1px hsla(0, 0%, 0%, 0.02), 0 4px 0px 0 hsla(0, 0%, 0%, 0.01),
    0 4px 9px hsla(0, 0%, 0%, 0.08), 0 3px 3px hsla(0, 0%, 0%, 0.03);
  -webkit-transition: 0.35s cubic-bezier(0.54, 1.6, 0.5, 1);
  transition: 0.35s cubic-bezier(0.54, 1.6, 0.5, 1);
  background: #fff;
  height: 20px;
  width: 20px;
  top: 6px;
  left: 6px;
  border-radius: 6px;
}
.toggle input:checked + label:before {
  background: var(--color-primary-gradient);
  -webkit-transition: width 0.2s cubic-bezier(0, 0, 0, 0.1);
  transition: width 0.2s cubic-bezier(0, 0, 0, 0.1);
}
.toggle input:checked + label:after {
  left: 26px;
}
</style>
