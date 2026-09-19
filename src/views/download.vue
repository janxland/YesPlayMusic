<template>
  <div class="download-page">
    <header class="page-head">
      <a class="back" @click="goBack">← 返回播放器</a>
    </header>

    <section class="hero">
      <h1>YesPlayMusic 桌面客户端</h1>
      <p class="sub">透明桌面歌词 · 键盘弹唱 · 网易云音乐播放器</p>
      <p class="ver">版本 {{ version }} · 开源免费</p>
    </section>

    <section class="cards">
      <div
        v-for="p in platforms"
        :key="p.key"
        class="card"
        :class="{ recommended: p.key === detected }"
      >
        <div v-if="p.key === detected" class="badge">
          推荐 · 检测到你正在使用 {{ p.short }}
        </div>
        <h2>{{ p.short }}</h2>
        <p class="req">{{ p.req }}</p>
        <p class="file">{{ p.file }}</p>
        <a class="btn" :href="p.url" download>
          下载 {{ p.ext }}<span v-if="p.size"> · {{ p.size }}</span>
        </a>
        <p v-if="p.key === 'mac'" class="tip">
          首次打开如提示「无法验证开发者」：右键点应用 → 打开。
        </p>
      </div>
    </section>

    <section class="steps">
      <h3>安装后如何一键唤起桌面歌词</h3>
      <ol>
        <li>安装并启动一次桌面客户端（协议会自动注册）。</li>
        <li>回到网页版，点播放器上的「桌面歌词」旁的监视器按钮。</li>
        <li
          >浏览器询问是否打开 YesPlayMusic 时点「允许」，透明歌词即刻悬浮。</li
        >
      </ol>
    </section>

    <footer class="page-foot">
      数据仅登录网易云账号时使用 · 源码遵循 MIT 协议
    </footer>
  </div>
</template>

<script>
const RELEASES = {
  version: '0.4.12',
  mac: {
    url: 'https://cos.roginx.ink/www/music/dist/releases/YesPlayMusic-0.4.12-universal.dmg',
    file: 'YesPlayMusic-0.4.12-universal.dmg',
    size: '159 MB',
  },
  win: {
    url: 'https://cos.roginx.ink/www/music/dist/releases/YesPlayMusic-Setup-0.4.12-x64.exe',
    file: 'YesPlayMusic-Setup-0.4.12-x64.exe',
    size: '59 MB',
  },
};

export default {
  name: 'DownloadPage',
  data() {
    return {
      version: RELEASES.version,
      detected: this.detect(),
    };
  },
  computed: {
    platforms() {
      return [
        {
          key: 'mac',
          short: 'macOS',
          req: 'macOS 10.11 或更高 · Apple 芯片 / Intel 通用',
          ext: '.dmg',
          ...RELEASES.mac,
        },
        {
          key: 'win',
          short: 'Windows',
          req: 'Windows 10 / 11 · 64 位',
          ext: '.exe',
          ...RELEASES.win,
        },
      ];
    },
  },
  methods: {
    detect() {
      const ua = navigator.userAgent;
      if (/Windows NT/.test(ua)) return 'win';
      if (/Macintosh|Mac OS X/.test(ua)) return 'mac';
      return '';
    },
    goBack() {
      if (window.history.length > 1) this.$router.back();
      else this.$router.push('/');
    },
  },
};
</script>

<style lang="scss" scoped>
.download-page {
  position: fixed;
  inset: 0;
  z-index: 300;
  overflow-y: auto;
  color: #f5f5f7;
  background: radial-gradient(
      60% 50% at 20% 0%,
      rgba(88, 86, 214, 0.32) 0%,
      transparent 60%
    ),
    radial-gradient(
      50% 44% at 88% 12%,
      rgba(214, 86, 166, 0.22) 0%,
      transparent 60%
    ),
    #000;
  font-family: -apple-system, BlinkMacSystemFont, 'SF Pro Display',
    'PingFang SC', 'Microsoft YaHei', sans-serif;

  .page-head {
    max-width: 880px;
    margin: 0 auto;
    padding: 28px 24px 0;

    .back {
      color: rgba(255, 255, 255, 0.62);
      font-size: 14px;
      cursor: pointer;
      text-decoration: none;

      &:hover {
        color: #fff;
      }
    }
  }

  .hero {
    text-align: center;
    padding: 64px 24px 40px;

    h1 {
      margin: 0;
      font-size: clamp(36px, 6vw, 64px);
      font-weight: 700;
      letter-spacing: -0.02em;
      background: linear-gradient(100deg, #fff 30%, #a78bfa 70%, #f0abfc);
      -webkit-background-clip: text;
      background-clip: text;
      -webkit-text-fill-color: transparent;
    }
    .sub {
      margin: 14px 0 0;
      font-size: clamp(16px, 2.4vw, 21px);
      color: rgba(255, 255, 255, 0.56);
    }
    .ver {
      margin: 10px 0 0;
      font-size: 13px;
      color: rgba(255, 255, 255, 0.35);
    }
  }

  .cards {
    display: flex;
    gap: 20px;
    justify-content: center;
    flex-wrap: wrap;
    max-width: 880px;
    margin: 0 auto;
    padding: 0 24px;

    .card {
      position: relative;
      flex: 1 1 320px;
      max-width: 400px;
      padding: 30px 28px 26px;
      border-radius: 24px;
      background: rgba(255, 255, 255, 0.05);
      border: 1px solid rgba(255, 255, 255, 0.09);
      backdrop-filter: blur(18px);
      transition: transform 0.3s ease, border-color 0.3s ease;

      &:hover {
        transform: translateY(-4px);
      }
      &.recommended {
        border-color: rgba(10, 132, 255, 0.65);
      }

      .badge {
        position: absolute;
        top: -12px;
        left: 50%;
        transform: translateX(-50%);
        white-space: nowrap;
        padding: 4px 12px;
        border-radius: 999px;
        font-size: 12px;
        color: #fff;
        background: linear-gradient(90deg, #0a84ff, #5e5ce6);
      }

      h2 {
        margin: 0;
        font-size: 26px;
        font-weight: 700;
      }
      .req {
        margin: 8px 0 2px;
        font-size: 13px;
        color: rgba(255, 255, 255, 0.5);
      }
      .file {
        margin: 0 0 18px;
        font-size: 12px;
        color: rgba(255, 255, 255, 0.3);
        word-break: break-all;
      }
      .btn {
        display: inline-block;
        padding: 11px 26px;
        border-radius: 999px;
        background: #0a84ff;
        color: #fff;
        font-size: 15px;
        font-weight: 600;
        text-decoration: none;
        transition: background 0.2s, transform 0.1s;

        &:hover {
          background: #409cff;
        }
        &:active {
          transform: scale(0.97);
        }
      }
      .tip {
        margin: 14px 0 0;
        font-size: 12px;
        line-height: 1.6;
        color: rgba(255, 255, 255, 0.42);
      }
    }
  }

  .steps {
    max-width: 640px;
    margin: 56px auto 0;
    padding: 0 24px;

    h3 {
      font-size: 19px;
      font-weight: 700;
      margin: 0 0 14px;
    }
    ol {
      margin: 0;
      padding-left: 22px;
      color: rgba(255, 255, 255, 0.56);
      font-size: 14px;
      line-height: 2;
    }
  }

  .page-foot {
    text-align: center;
    padding: 56px 24px 40px;
    font-size: 12px;
    color: rgba(255, 255, 255, 0.28);
  }
}
</style>
