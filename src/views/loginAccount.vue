<template>
  <div class="login">
    <div class="login-container">
      <div class="section-1">
        <img src="@/assets/img/logos/netease-music.png" />
      </div>
      <div class="title">{{ $t('login.loginText') }}</div>
      <div class="section-2">
        <div v-show="mode === 'phone'" class="input-box">
          <div
            class="container"
            :class="{ active: ['phone', 'countryCode'].includes(inputFocus) }"
          >
            <svg-icon icon-class="mobile" />
            <div class="inputs">
              <input
                id="countryCode"
                v-model="countryCode"
                :placeholder="
                  inputFocus === 'countryCode' ? '' : $t('login.countryCode')
                "
                @focus="inputFocus = 'countryCode'"
                @blur="inputFocus = ''"
                @keyup.enter="login"
              />
              <input
                id="phoneNumber"
                v-model="phoneNumber"
                :placeholder="inputFocus === 'phone' ? '' : $t('login.phone')"
                @focus="inputFocus = 'phone'"
                @blur="inputFocus = ''"
                @keyup.enter="login"
              />
            </div>
          </div>
        </div>

        <div v-show="mode === 'email'" class="input-box">
          <div class="container" :class="{ active: inputFocus === 'email' }">
            <svg-icon icon-class="mail" />
            <div class="inputs">
              <input
                id="email"
                v-model="email"
                type="email"
                :placeholder="inputFocus === 'email' ? '' : $t('login.email')"
                @focus="inputFocus = 'email'"
                @blur="inputFocus = ''"
                @keyup.enter="login"
              />
            </div>
          </div>
        </div>
        <div v-show="mode === 'phone' || mode === 'email'" class="input-box">
          <div class="container" :class="{ active: inputFocus === 'password' }">
            <svg-icon icon-class="lock" />
            <div class="inputs">
              <input
                id="password"
                v-model="password"
                type="password"
                :placeholder="
                  inputFocus === 'password' ? '' : $t('login.password')
                "
                @focus="inputFocus = 'password'"
                @blur="inputFocus = ''"
                @keyup.enter="login"
              />
            </div>
          </div>
        </div>

        <div v-show="mode == 'qrCode'">
          <div v-show="qrCodeSvg" class="qr-code-container">
            <img :src="qrCodeSvg" loading="lazy" />
          </div>
          <div class="qr-code-info">
            {{ qrCodeInformation }}
          </div>
        </div>

        <div v-show="mode === 'cookie'" class="cookie-mode">
          <p class="cookie-hint">
            在浏览器登录
            <a
              href="https://music.163.com"
              target="_blank"
              rel="noopener noreferrer"
              >music.163.com</a
            >，打开开发者工具
            <code>Application → Cookies → music.163.com</code>， 复制
            <code>MUSIC_U</code> 的值粘贴到下方（也可直接粘贴整行 Cookie）。
          </p>
          <textarea
            v-model="cookieInput"
            class="cookie-input"
            rows="4"
            spellcheck="false"
            placeholder="MUSIC_U=... 或整串 Cookie"
            @keydown.enter.ctrl="login"
          ></textarea>
        </div>
      </div>
      <div v-show="mode !== 'qrCode'" class="confirm">
        <button v-show="!processing" @click="login">
          {{ $t('login.login') }}
        </button>
        <button v-show="processing" class="loading" disabled>
          <span></span>
          <span></span>
          <span></span>
        </button>
      </div>
      <div class="other-login">
        <a v-show="mode !== 'email'" @click="changeMode('email')">{{
          $t('login.loginWithEmail')
        }}</a>
        <span v-show="mode === 'qrCode'">|</span>
        <a v-show="mode !== 'phone'" @click="changeMode('phone')">{{
          $t('login.loginWithPhone')
        }}</a>
        <span v-show="mode !== 'qrCode'">|</span>
        <a v-show="mode !== 'qrCode'" @click="changeMode('qrCode')">
          二维码登录
        </a>
        <span v-show="mode !== 'qrCode'">|</span>
        <a v-show="mode !== 'cookie'" @click="changeMode('cookie')">
          Cookie登录
        </a>
      </div>
      <div
        v-show="mode !== 'qrCode'"
        class="notice"
        v-html="isElectron ? $t('login.noticeElectron') : $t('login.notice')"
      ></div>
    </div>
  </div>
</template>

<script setup lang="ts">
const router = useRouter();
const route = useRoute();

import { isDesktop } from '@/platform/env';
import QRCode from 'qrcode';
import md5 from 'crypto-js/md5';
import NProgress from 'nprogress';
import {
  setCookies,
  parseCookieJar,
  writeCookieJar,
  cookieHeaderOf,
  doLogout,
  getCookie,
  removeCookie,
} from '@/utils/auth';
import { userAccount } from '@/api/user';
import nativeAlert from '@/utils/nativeAlert';
import {
  loginWithPhone,
  loginWithEmail,
  loginQrCodeKey,
  loginQrCodeCheck,
} from '@/api/auth';
import { ref, computed, onBeforeUnmount } from 'vue';
import { useDataStore, useLikedStore, useUiStore } from '@/stores';

import { useRoute, useRouter } from 'vue-router';
const dataStore = useDataStore();
const likedStore = useLikedStore();
const uiStore = useUiStore();

const updateData = dataStore.updateData;

const processing = ref<any>(false);

const mode = ref<any>('qrCode');

const countryCode = ref<any>('+86');

const phoneNumber = ref<any>('');

const email = ref<any>('');

const password = ref<any>('');

const smsCode = ref<any>('');

const inputFocus = ref<any>('');

const qrCodeKey = ref<any>('');

const qrCodeSvg = ref<any>('');

// 二维码轮询定时器句柄（非响应式）：同 lyrics.vue 的 _clockTimer 一样
// 用普通变量，避免无意义的响应式开销；onBeforeUnmount 统一清理
let _qrCodeCheckInterval: ReturnType<typeof setInterval> | null = null;

const qrCodeInformation = ref<any>('打开网易云音乐APP扫码登录');

const cookieInput = ref<any>('');

const isElectron = computed(function isElectron() {
  return isDesktop();
});

function validatePhone() {
  if (
    countryCode.value === '' ||
    phoneNumber.value === '' || // 修复原版 this.phone 恒 undefined 导致手机号空值校验失效
    password.value === ''
  ) {
    nativeAlert('国家区号或手机号不正确');
    processing.value = false;
    return false;
  }
  return true;
}

function validateEmail() {
  const emailReg =
    /^(([^<>()[\]\\.,;:\s@"]+(\.[^<>()[\]\\.,;:\s@"]+)*)|(".+"))@((\[[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\])|(([a-zA-Z\-0-9]+\.)+[a-zA-Z]{2,}))$/;
  if (
    email.value === '' ||
    password.value === '' ||
    !emailReg.test(email.value)
  ) {
    nativeAlert('邮箱不正确');
    return false;
  }
  return true;
}

function loginWithCookie() {
  const jar = parseCookieJar(cookieInput.value);
  if (!jar.MUSIC_U) {
    nativeAlert('未识别到 MUSIC_U，请粘贴完整 Cookie 或 MUSIC_U 的值');
    return;
  }

  processing.value = true;
  // 先备份再写入：校验失败回滚原会话（旧实现坏 Cookie 会把已登录账号踢下线）
  const prev = {
    MUSIC_U: getCookie('MUSIC_U'),
    __csrf: getCookie('__csrf'),
  };
  const prevMode = dataStore.data.loginMode;
  writeCookieJar(jar);
  updateData({ key: 'loginMode', value: 'account' });

  userAccount()
    .then(result => {
      if (result.code !== 200 || !result.profile) {
        throw new Error(
          result.message ?? result.msg ?? `接口返回 code=${result.code}`
        );
      }
      updateData({ key: 'user', value: result.profile });
      // 机会性同步：把凭据交给后端供首页取歌使用；失败不影响播放器登录闭环
      syncCredential(cookieHeaderOf(jar));
      return likedStore.fetchLikedPlaylist();
    })
    .then(() => {
      router.push({ path: '/library' });
    })
    .catch(error => {
      processing.value = false;
      Object.keys(jar).forEach(name => removeCookie(name));
      if (prev.MUSIC_U) {
        writeCookieJar(prev.__csrf ? prev : { MUSIC_U: prev.MUSIC_U });
        updateData({ key: 'loginMode', value: prevMode });
      } else {
        doLogout();
      }
      nativeAlert(`Cookie 无效或已过期\n${error.message ?? error}`);
    });
}

function syncCredential(cookie) {
  fetch('/api/netease/credential', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ cookie }),
  }).catch(() => {
    // 同步是机会性的：失败时播放器登录态仍然有效
  });
}

function login() {
  if (mode.value === 'cookie') {
    loginWithCookie();
    return;
  }
  if (mode.value === 'phone') {
    processing.value = validatePhone();
    if (!processing.value) return;
    loginWithPhone({
      countrycode: countryCode.value.replace('+', '').replace(/\s/g, ''),
      phone: phoneNumber.value.replace(/\s/g, ''),
      password: 'fakePassword',
      md5_password: md5(password.value).toString(),
    })
      .then(handleLoginResponse)
      .catch(error => {
        processing.value = false;
        nativeAlert(`发生错误，请检查你的账号密码是否正确\n${error}`);
      });
  } else {
    processing.value = validateEmail();
    if (!processing.value) return;
    loginWithEmail({
      email: email.value.replace(/\s/g, ''),
      password: 'fakePassword',
      md5_password: md5(password.value).toString(),
    })
      .then(handleLoginResponse)
      .catch(error => {
        processing.value = false;
        nativeAlert(`发生错误，请检查你的账号密码是否正确\n${error}`);
      });
  }
}

function handleLoginResponse(data) {
  if (!data) {
    processing.value = false;
    return;
  }
  if (data.code === 200) {
    setCookies(data.cookie);

    updateData({ key: 'loginMode', value: 'account' });
    dataStore.fetchUserProfile().then(() => {
      likedStore.fetchLikedPlaylist().then(() => {
        router.push({ path: '/library' });
      });
    });
  } else {
    processing.value = false;
    nativeAlert(data.msg ?? data.message ?? '账号或密码错误，请检查');
  }
}

function getQrCodeKey() {
  // 双参 then：失败处理不额外套一层 catch 链，成功路径不必整体缩进
  return loginQrCodeKey().then(
    result => {
      if (result.code === 200) {
        qrCodeKey.value = result.data.unikey;
        QRCode.toString(
          `https://music.163.com/login?codekey=${qrCodeKey.value}`,
          {
            width: 192,
            margin: 0,
            color: {
              dark: '#335eea',
              light: '#00000000',
            },
            type: 'svg',
          }
        )
          .then(svg => {
            qrCodeSvg.value = `data:image/svg+xml;utf8,${encodeURIComponent(
              svg
            )}`;
          })
          .catch(err => {
            console.error(err);
          })
          .finally(() => {
            NProgress.done();
          });
      }
      checkQrCodeLogin();
    },
    err => {
      console.warn('[login] getQrCodeKey failed:', err?.message ?? err);
      NProgress.done();
    }
  );
}

function checkQrCodeLogin() {
  // 清除二维码检测
  clearInterval(_qrCodeCheckInterval);
  _qrCodeCheckInterval = setInterval(() => {
    if (qrCodeKey.value === '') return;
    loginQrCodeCheck(qrCodeKey.value).then(
      result => {
        // 8821：网易云扫码通道已被风控全面拦截，继续轮询只会让新人
        // 对着死二维码干等 —— 停轮询并自动改道 Cookie 导入
        if (result.code === 8821) {
          clearInterval(_qrCodeCheckInterval);
          changeMode('cookie');
          uiStore.showToast('扫码登录已被网易云风控拦截，请改用 Cookie 导入');
        } else if (result.code === 800) {
          getQrCodeKey(); // 重新生成QrCode
          qrCodeInformation.value = '二维码已失效，请重新扫码';
        } else if (result.code === 802) {
          qrCodeInformation.value = '扫描成功，请在手机上确认登录';
        } else if (result.code === 801) {
          qrCodeInformation.value = '打开网易云音乐APP扫码登录';
        } else if (result.code === 803) {
          clearInterval(_qrCodeCheckInterval);
          qrCodeInformation.value = '登录成功，请稍等...';
          result.code = 200;
          result.cookie = result.cookie.replace('HTTPOnly', '');
          handleLoginResponse(result);
        }
      },
      // interval 内无兜底时一次网络抖动就是一个未捕获 rejection；
      // 静默降级，下一秒自动重试
      err => console.warn('[login] qrCode check failed:', err?.message ?? err)
    );
  }, 1000);
}

function changeMode(targetMode) {
  // 参数改名 targetMode：原迁移版被同名 ref 遮蔽，mode.value = mode 自赋值，切换登录方式失效
  mode.value = targetMode;
  if (targetMode === 'qrCode') {
    checkQrCodeLogin();
  } else {
    clearInterval(_qrCodeCheckInterval);
  }
}

// 路由 query 是 string | string[]，单值语义，取首元素收窄
const queryMode = Array.isArray(route.query.mode)
  ? route.query.mode[0]
  : route.query.mode;
if (['phone', 'email', 'qrCode'].includes(queryMode)) {
  mode.value = queryMode;
}
getQrCodeKey();

onBeforeUnmount(function beforeUnmount() {
  clearInterval(_qrCodeCheckInterval);
});
</script>

<style lang="scss" scoped>
.login {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  margin-top: 32px;
}

.login-container {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
}

.title {
  font-size: 24px;
  font-weight: 700;
  margin-bottom: 48px;
  color: var(--color-text);
}

.section-1 {
  margin-bottom: 16px;
  display: flex;
  align-items: center;
  img {
    height: 64px;
    margin: 20px;
    user-select: none;
  }
}

.section-2 {
  display: flex;
  align-items: center;
  flex-direction: column;
}

.cookie-mode {
  width: 300px;
  margin-bottom: 16px;
  text-align: left;
}

.cookie-hint {
  margin: 0 0 12px;
  font-size: 12px;
  line-height: 1.7;
  color: var(--color-text);
  opacity: 0.7;

  a {
    color: var(--color-primary);
    text-decoration: underline;
  }

  code {
    padding: 1px 4px;
    border-radius: 4px;
    font-size: 11px;
    background: var(--color-secondary-bg);
  }
}

.cookie-input {
  width: 100%;
  box-sizing: border-box;
  padding: 10px 12px;
  border: none;
  border-radius: 8px;
  outline: none;
  resize: vertical;
  font-family: inherit;
  font-size: 13px;
  line-height: 1.5;
  color: var(--color-text);
  background: var(--color-secondary-bg);

  &::placeholder {
    color: var(--color-text);
    opacity: 0.35;
  }
}

.input-box {
  display: flex;
  justify-content: flex-end;
  margin-bottom: 16px;
  color: var(--color-text);

  .container {
    display: flex;
    align-items: center;
    height: 46px;
    background: var(--color-secondary-bg);
    border-radius: 8px;
    width: 300px;
  }

  .svg-icon {
    height: 18px;
    width: 18px;
    color: #aaaaaa;
    margin: {
      left: 12px;
      right: 6px;
    }
  }

  .inputs {
    display: flex;
    width: 85%;
  }

  input {
    font-size: 20px;
    border: none;
    background: transparent;
    width: 100%;
    font-weight: 600;
    margin-top: -1px;
    color: var(--color-text);
  }

  input::placeholder {
    color: var(--color-text);
    opacity: 0.38;
  }

  input#countryCode {
    flex: 3;
  }
  input#phoneNumber {
    flex: 12;
  }

  .active {
    background: var(--color-primary-bg);
    input,
    .svg-icon {
      color: var(--color-primary);
    }
  }
}

.confirm button {
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 20px;
  font-weight: 600;
  background-color: var(--color-primary-bg);
  color: var(--color-primary);
  border-radius: 8px;
  margin-top: 24px;
  transition: 0.2s;
  padding: 8px;
  width: 100%;
  width: 300px;
  &:hover {
    transform: scale(1.06);
  }
  &:active {
    transform: scale(0.94);
  }
}

.other-login {
  margin-top: 24px;
  font-size: 13px;
  color: var(--color-text);
  opacity: 0.68;
  a {
    padding: 0 8px;
  }
}

.notice {
  width: 300px;
  border-top: 1px solid rgba(128, 128, 128);
  margin-top: 48px;
  padding-top: 12px;
  font-size: 12px;
  color: var(--color-text);
  opacity: 0.48;
}

@keyframes loading {
  0% {
    opacity: 0.2;
  }
  20% {
    opacity: 1;
  }
  100% {
    opacity: 0.2;
  }
}

button.loading {
  height: 44px;
  cursor: unset;
  &:hover {
    transform: none;
  }
}
.loading span {
  width: 6px;
  height: 6px;
  background-color: var(--color-primary);
  border-radius: 50%;
  margin: 0 2px;
  animation: loading 1.4s infinite both;
}

.loading span:nth-child(2) {
  animation-delay: 0.2s;
}

.loading span:nth-child(3) {
  animation-delay: 0.4s;
}

.qr-code-container {
  background-color: var(--color-primary-bg);
  padding: 24px 24px 21px 24px;
  border-radius: 1.25rem;
  margin-bottom: 12px;
}
.qr-code-info {
  color: var(--color-text);
  text-align: center;
  margin-bottom: 28px;
}
</style>
