'use strict';
import {
  app,
  protocol,
  BrowserWindow,
  shell,
  dialog,
  globalShortcut,
  nativeTheme,
  screen,
} from 'electron';
import {
  isWindows,
  isMac,
  isLinux,
  isDevelopment,
  isCreateTray,
  isCreateMpris,
} from '@/utils/platform';
import { createProtocol } from 'vue-cli-plugin-electron-builder/lib';
import { startNeteaseMusicApi } from './electron/services';
import { initIpcMain } from './electron/ipcMain.js';
import {
  initDesktopLyrics,
  ensureLyricsWindow,
} from './electron/desktopLyricsWindow';
import { createMenu } from './electron/menu';
import { createTray } from '@/electron/tray';
import { createTouchBar } from './electron/touchBar';
import { createDockMenu } from './electron/dockMenu';
import { registerGlobalShortcut } from './electron/globalShortcut';
import { autoUpdater } from 'electron-updater';
import installExtension, { VUEJS_DEVTOOLS } from 'electron-devtools-installer';
import { EventEmitter } from 'events';
import express from 'express';
import expressProxy from 'express-http-proxy';
import Store from 'electron-store';
import { createMpris, createDbus } from '@/electron/mpris';
import { spawn } from 'child_process';
const clc = require('cli-color');
const log = text => {
  console.log(`${clc.blueBright('[background.js]')} ${text}`);
};

const closeOnLinux = (e, win, store) => {
  let closeOpt = store.get('settings.closeAppOption');
  if (closeOpt !== 'exit') {
    e.preventDefault();
  }

  if (closeOpt === 'ask') {
    dialog
      .showMessageBox({
        type: 'info',
        title: 'Information',
        cancelId: 2,
        defaultId: 0,
        message: '确定要关闭吗？',
        buttons: ['最小化到托盘', '直接退出'],
        checkboxLabel: '记住我的选择',
      })
      .then(result => {
        if (result.checkboxChecked && result.response !== 2) {
          win.webContents.send(
            'rememberCloseAppOption',
            result.response === 0 ? 'minimizeToTray' : 'exit'
          );
        }

        if (result.response === 0) {
          win.hide(); //调用 最小化实例方法
        } else if (result.response === 1) {
          win = null;
          app.exit(); //exit()直接关闭客户端，不会执行quit();
        }
      })
      .catch(err => {
        log(err);
      });
  } else if (closeOpt === 'exit') {
    win = null;
    app.quit();
  } else {
    win.hide();
  }
};

class Background {
  constructor() {
    this.window = null;
    this.ypmTrayImpl = null;
    this.store = new Store({
      windowWidth: {
        width: { type: 'number', default: 1440 },
        height: { type: 'number', default: 840 },
      },
    });
    this.neteaseMusicAPI = null;
    this.expressApp = null;
    this.willQuitApp = !isMac;

    this.init();
  }

  init() {
    log('initializing');

    // Make sure the app is singleton.
    if (!app.requestSingleInstanceLock()) return app.quit();

    // register URL scheme yesplaymusic:// so web pages can open the client
    this.registerProtocolClient();

    // start netease music api
    this.neteaseMusicAPI = startNeteaseMusicApi();

    // create Express app
    this.createExpressApp();

    // Scheme must be registered before the app is ready
    protocol.registerSchemesAsPrivileged([
      { scheme: 'app', privileges: { secure: true, standard: true } },
    ]);

    // handle app events
    this.handleAppEvents();

    // disable chromium mpris
    if (isCreateMpris) {
      app.commandLine.appendSwitch(
        'disable-features',
        'HardwareMediaKeyHandling,MediaSessionService'
      );
    }
  }

  async initDevtools() {
    // Install Vue Devtools extension
    try {
      await installExtension(VUEJS_DEVTOOLS);
    } catch (e) {
      console.error('Vue Devtools failed to install:', e.toString());
    }

    // Exit cleanly on request from parent process in development mode.
    if (isWindows) {
      process.on('message', data => {
        if (data === 'graceful-exit') {
          app.quit();
        }
      });
    } else {
      process.on('SIGTERM', () => {
        app.quit();
      });
    }
  }

  createExpressApp() {
    log('creating express app');

    const expressApp = express();
    expressApp.use('/', express.static(__dirname + '/'));
    expressApp.use('/api', expressProxy('http://127.0.0.1:10754'));
    expressApp.use('/player', (req, res) => {
      this.window.webContents
        .executeJavaScript('window.yesplaymusic.player')
        .then(result => {
          res.send({
            currentTrack: result._isPersonalFM
              ? result._personalFMTrack
              : result._currentTrack,
            progress: result._progress,
          });
        });
    });
    this.expressApp = expressApp.listen(27232, '127.0.0.1');
  }

  registerProtocolClient() {
    // 开发模式不注册，避免把系统协议关联到 Electron 调试壳
    if (isDevelopment) return;
    const ok = app.setAsDefaultProtocolClient('yesplaymusic');
    log(`register protocol "yesplaymusic://" -> ${ok}`);
  }

  // 唤醒主窗的唯一入口（activate / 协议唤起共用）：
  // 1) ready 前的事件（mac 冷启动 open-url 早于 ready）只登记不行动，
  //    窗口由 ready 流程统一创建，否则 createWindow 抛
  //    "Cannot create BrowserWindow before app is ready"；
  // 2) 引用失效（窗口已销毁）时重建，否则 show() 抛 "Object has been destroyed"，
  //    表现为"应用在后台但 Dock 点了没反应"的僵尸态；
  // 3) 坐标可能落在已拔掉的外接屏上，show 了也"看不见"，离屏时拉回主屏居中。
  showMainWindow() {
    if (!app.isReady()) return;
    if (!this.window || this.window.isDestroyed()) {
      this.createWindow();
      return;
    }
    this.window.show();
    if (this.window.isMinimized()) this.window.restore();
    const b = this.window.getBounds();
    const margin = 60; // 至少留一个角可点，否则视为离屏
    const onScreen = screen
      .getAllDisplays()
      .some(
        d =>
          b.x + margin < d.bounds.x + d.bounds.width &&
          b.x + b.width - margin > d.bounds.x &&
          b.y + margin < d.bounds.y + d.bounds.height &&
          b.y + b.height - margin > d.bounds.y
      );
    if (!onScreen) this.window.center();
    this.window.focus();
  }

  handleProtocolURL(url) {
    log(`protocol url received: ${url}`);
    if (!app.isReady()) {
      this.pendingProtocolURL = url; // ready 后统一消费
      return;
    }
    this.showMainWindow();
    if (url && url.includes('desktop-lyrics')) {
      ensureLyricsWindow();
    }
  }

  createWindow() {
    log('creating app window');

    const appearance = this.store.get('settings.appearance');
    const showLibraryDefault = this.store.get('settings.showLibraryDefault');

    const options = {
      width: this.store.get('window.width') || 1440,
      height: this.store.get('window.height') || 840,
      minWidth: 1080,
      minHeight: 720,
      titleBarStyle: 'hiddenInset',
      frame: !(
        isWindows ||
        (isLinux && this.store.get('settings.linuxEnableCustomTitlebar'))
      ),
      title: 'YesPlayMusic',
      show: false,
      webPreferences: {
        webSecurity: false,
        nodeIntegration: true,
        enableRemoteModule: true,
        contextIsolation: false,
      },
      backgroundColor:
        ((appearance === undefined || appearance === 'auto') &&
          nativeTheme.shouldUseDarkColors) ||
        appearance === 'dark'
          ? '#222'
          : '#fff',
    };

    if (this.store.get('window.x') && this.store.get('window.y')) {
      let x = this.store.get('window.x');
      let y = this.store.get('window.y');

      let displays = screen.getAllDisplays();
      let isResetWindiw = false;
      if (displays.length === 1) {
        let { bounds } = displays[0];
        if (
          x < bounds.x ||
          x > bounds.x + bounds.width - 50 ||
          y < bounds.y ||
          y > bounds.y + bounds.height - 50
        ) {
          isResetWindiw = true;
        }
      } else {
        isResetWindiw = true;
        for (let i = 0; i < displays.length; i++) {
          let { bounds } = displays[i];
          if (
            x > bounds.x &&
            x < bounds.x + bounds.width &&
            y > bounds.y &&
            y < bounds.y - bounds.height
          ) {
            // 检测到APP窗口当前处于一个可用的屏幕里，break
            isResetWindiw = false;
            break;
          }
        }
      }

      if (!isResetWindiw) {
        options.x = x;
        options.y = y;
      }
    }

    this.window = new BrowserWindow(options);

    // hide menu bar on Microsoft Windows and Linux
    this.window.setMenuBarVisibility(false);

    if (process.env.WEBPACK_DEV_SERVER_URL) {
      // Load the url of the dev server if in development mode
      this.window.loadURL(
        showLibraryDefault
          ? `${process.env.WEBPACK_DEV_SERVER_URL}/#/library`
          : process.env.WEBPACK_DEV_SERVER_URL
      );
      if (!process.env.IS_TEST) this.window.webContents.openDevTools();
    } else {
      createProtocol('app');
      this.window.loadURL(
        showLibraryDefault
          ? 'http://localhost:27232/#/library'
          : 'http://localhost:27232'
      );
    }
  }

  checkForUpdates() {
    if (isDevelopment) return;
    log('checkForUpdates');
    autoUpdater.checkForUpdatesAndNotify();

    const showNewVersionMessage = info => {
      dialog
        .showMessageBox({
          title: '发现新版本 v' + info.version,
          message: '发现新版本 v' + info.version,
          detail: '是否前往 GitHub 下载新版本安装包？',
          buttons: ['下载', '取消'],
          type: 'question',
          noLink: true,
        })
        .then(result => {
          if (result.response === 0) {
            shell.openExternal('https://github.com/qier222/YesPlayMusic');
          }
        });
    };

    autoUpdater.on('update-available', info => {
      showNewVersionMessage(info);
    });
  }

  handleWindowEvents() {
    this.window.once('ready-to-show', () => {
      log('window ready-to-show event');
      this.window.show();
      this.store.set('window', this.window.getBounds());
    });

    this.window.on('close', e => {
      log('window close event');

      if (isLinux) {
        closeOnLinux(e, this.window, this.store);
      } else if (isMac) {
        if (this.willQuitApp) {
          this.window = null;
          app.quit();
        } else {
          e.preventDefault();
          this.window.hide();
        }
      } else {
        let closeOpt = this.store.get('settings.closeAppOption');
        if (this.willQuitApp && (closeOpt === 'exit' || closeOpt === 'ask')) {
          this.window = null;
          app.quit();
        } else {
          e.preventDefault();
          this.window.hide();
        }
      }
    });

    this.window.on('closed', () => {
      // 引用必须清空，否则 activate/协议唤起拿着死引用 show() 直接抛错
      log('main window closed');
      this.window = null;
    });

    this.window.on('resized', () => {
      this.store.set('window', this.window.getBounds());
    });

    this.window.on('moved', () => {
      this.store.set('window', this.window.getBounds());
    });

    this.window.on('maximize', () => {
      this.window.webContents.send('isMaximized', true);
    });

    this.window.on('unmaximize', () => {
      this.window.webContents.send('isMaximized', false);
    });

    this.window.webContents.on('new-window', function (e, url) {
      e.preventDefault();
      log('open url');
      const excludeHosts = ['www.last.fm'];
      const exclude = excludeHosts.find(host => url.includes(host));
      if (exclude) {
        const newWindow = new BrowserWindow({
          width: 800,
          height: 600,
          titleBarStyle: 'default',
          title: 'YesPlayMusic',
          webPreferences: {
            webSecurity: false,
            nodeIntegration: true,
            enableRemoteModule: true,
            contextIsolation: false,
          },
        });
        newWindow.loadURL(url);
        return;
      }
      shell.openExternal(url);
    });
  }

  handleAppEvents() {
    app.on('ready', async () => {
      // This method will be called when Electron has finished
      // initialization and is ready to create browser windows.
      // Some APIs can only be used after this event occurs.
      log('app ready event');

      // for development
      if (isDevelopment) {
        this.initDevtools();
      }

      // create window
      this.createWindow();
      this.window.once('ready-to-show', () => {
        this.window.show();
      });
      this.handleWindowEvents();

      // create tray
      if (isCreateTray) {
        this.trayEventEmitter = new EventEmitter();
        this.ypmTrayImpl = createTray(
          this.window,
          this.trayEventEmitter,
          this.store
        );
      }

      // init ipcMain
      initIpcMain(this.window, this.store, this.trayEventEmitter);

      // init desktop lyrics window manager
      initDesktopLyrics(this.window, this.store);

      // 冷启动协议唤起：Win/Linux 的 URL 在 argv；mac 的 open-url 早于 ready，
      // 已被 handleProtocolURL 暂存到 pendingProtocolURL
      const coldStartURL =
        process.argv.find(arg => arg.startsWith('yesplaymusic://')) ||
        this.pendingProtocolURL;
      if (coldStartURL) this.handleProtocolURL(coldStartURL);

      // set proxy
      const proxyRules = this.store.get('proxy');
      if (proxyRules) {
        this.window.webContents.session.setProxy({ proxyRules }, result => {
          log('finished setProxy', result);
        });
      }

      // check for updates
      this.checkForUpdates();

      // create menu
      createMenu(this.window, this.store);

      // create dock menu for macOS
      const createdDockMenu = createDockMenu(this.window);
      if (createDockMenu && app.dock) app.dock.setMenu(createdDockMenu);

      // create touch bar
      const createdTouchBar = createTouchBar(this.window);
      if (createdTouchBar) this.window.setTouchBar(createdTouchBar);

      // register global shortcuts
      if (this.store.get('settings.enableGlobalShortcut') !== false) {
        registerGlobalShortcut(this.window, this.store);
      }

      // try to start osdlyrics process on start
      if (this.store.get('settings.enableOsdlyricsSupport')) {
        await createDbus(this.window);
        log('try to start osdlyrics process');
        const osdlyricsProcess = spawn('osdlyrics');

        osdlyricsProcess.on('error', err => {
          log(`failed to start osdlyrics: ${err.message}`);
        });

        osdlyricsProcess.on('exit', (code, signal) => {
          log(`osdlyrics process exited with code ${code}, signal ${signal}`);
        });
      }

      // create mpris
      if (isCreateMpris) {
        createMpris(this.window);
      }
    });

    // macOS：协议唤起走 open-url 事件
    if (isMac) {
      app.on('open-url', (e, url) => {
        e.preventDefault();
        this.handleProtocolURL(url);
      });
    }

    app.on('activate', () => {
      // On macOS it's common to re-create a window in the app when the
      // dock icon is clicked and there are no other windows open.
      log('app activate event');
      this.showMainWindow();
    });

    app.on('window-all-closed', () => {
      if (!isMac) {
        app.quit();
      }
    });

    app.on('before-quit', () => {
      this.willQuitApp = true;
    });

    app.on('quit', () => {
      this.expressApp.close();
    });

    app.on('will-quit', () => {
      // unregister all global shortcuts
      globalShortcut.unregisterAll();
    });

    if (!isMac) {
      app.on('second-instance', (e, cl) => {
        this.showMainWindow();
        const url = (cl || []).find(arg => arg.startsWith('yesplaymusic://'));
        if (url) this.handleProtocolURL(url);
      });
    }
  }
}

new Background();
