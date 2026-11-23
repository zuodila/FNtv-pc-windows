'use strict';

const { app, BrowserWindow, ipcMain, Menu, shell, dialog, globalShortcut, Tray, nativeImage } = require('electron');
const path = require('path');
const fs = require('fs');
const CTRL_CSS = require('./ctrl_css.js');

// ---------------------------------------------------------------------------
// 配置：只存在用户本机，绝不内置任何服务器地址
// ---------------------------------------------------------------------------
const CONFIG_PATH = path.join(app.getPath('userData'), 'config.json');

function readConfig() {
  try {
    if (fs.existsSync(CONFIG_PATH)) {
      return JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
    }
  } catch (e) {
    /* ignore */
  }
  return { serverUrl: '', ignoreCert: false, history: [] };
}

function writeConfig(cfg) {
  try {
    fs.mkdirSync(path.dirname(CONFIG_PATH), { recursive: true });
    fs.writeFileSync(CONFIG_PATH, JSON.stringify(cfg, null, 2), 'utf8');
  } catch (e) {
    /* ignore */
  }
}

let cfg = readConfig();
let mainWindow = null;
let tray = null;
let isQuitting = false;

// 把用户输入规整成基础地址，并拼出飞牛影视 Web 入口
// 用户可填：192.168.1.5 / http://192.168.1.5:5666 / https://media.example.com:8443
function normalizeServer(input) {
  let s = String(input || '').trim();
  if (!s) return null;
  if (!/^https?:\/\//i.test(s)) s = 'http://' + s;
  s = s.replace(/\/+$/, '');
  let u;
  try {
    u = new URL(s);
  } catch (e) {
    return null;
  }
  if (!u.hostname) return null;
  return u.origin; // scheme + host + port，去掉任何路径
}

function mediaUrl(origin) {
  return origin.replace(/\/+$/, '') + '/v';
}

// ---------------------------------------------------------------------------
// 窗口
// ---------------------------------------------------------------------------
function applyIgnoreCert(win, enabled) {
  // 仅对当前会话生效；开启后允许自签证书（很多外网 NAS 用自签）
  win.webContents.session.setCertificateVerifyProc((request, callback) => {
    if (enabled) callback(0); // 0 = 信任
    else callback(-3);        // 使用默认校验
  });
}

// ---------------------------------------------------------------------------
// 系统托盘
// ---------------------------------------------------------------------------
function showMainWindow() {
  if (!mainWindow) { createWindow(); return; }
  if (mainWindow.isMinimized()) mainWindow.restore();
  if (!mainWindow.isVisible()) mainWindow.show();
  mainWindow.focus();
}

function toggleMainWindow() {
  if (mainWindow && mainWindow.isVisible() && !mainWindow.isMinimized()) mainWindow.hide();
  else showMainWindow();
}

function createTray() {
  if (tray) return;
  try {
    let img = nativeImage.createFromPath(path.join(__dirname, 'build', 'icon.png'));
    if (!img.isEmpty()) img = img.resize({ width: 32, height: 32 });
    tray = new Tray(img);
  } catch (e) {
    tray = null;
    return;
  }
  tray.setToolTip('飞牛影视桌面客户端');
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: '显示 / 隐藏主界面', click: toggleMainWindow },
    { type: 'separator' },
    { label: '更换服务器...', click: () => { showMainWindow(); loadSetup(); } },
    { label: '重新加载页面', click: () => { showMainWindow(); if (mainWindow) mainWindow.reload(); } },
    { type: 'separator' },
    { label: '关于', click: () => dialog.showMessageBox({
      type: 'info', title: '关于 飞牛影视', message: '飞牛影视 桌面客户端',
      detail: '作者：东哥\n\n连接你自己的飞牛 NAS 观看影视。\n所有账号与媒体数据均直连你填写的服务器。'
    }) },
    { type: 'separator' },
    { label: '退出', click: () => { isQuitting = true; app.quit(); } }
  ]));
  tray.on('click', toggleMainWindow);
  tray.on('double-click', showMainWindow);
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1366,
    height: 768,
    minWidth: 960,
    minHeight: 600,
    show: false,
    frame: false,
    icon: path.join(__dirname, 'build', 'icon.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      webSecurity: true,
      spellcheck: false
    }
  });

  mainWindow.once('ready-to-show', () => mainWindow.show());

  // 点关闭 -> 收进系统托盘（后台继续播放/保活），只有托盘菜单"退出"才真正关闭
  mainWindow.on('close', (e) => {
    if (isQuitting) return;
    e.preventDefault();
    mainWindow.hide();
    if (!cfg.trayHinted && tray && process.platform === 'win32') {
      cfg.trayHinted = true;
      writeConfig(cfg);
      try {
        tray.displayBalloon({
          title: '飞牛影视仍在后台运行',
          content: '单击托盘图标可恢复窗口，右键托盘图标可退出。'
        });
      } catch (err) { /* ignore */ }
    }
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  // 外链一律用系统浏览器打开，不在客户端内跳转
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//i.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });

  // 每次页面加载完成都注入控制条样式（远程页面 CSP 不影响 insertCSS）
  mainWindow.webContents.on('did-finish-load', () => {
    if (mainWindow) mainWindow.webContents.insertCSS(CTRL_CSS).catch(() => {});
  });

  route();
}

// 每次启动都先显示连接向导，绝不自动连接任何服务器。
// 这是通用客户端：无论本机是否残留旧配置，使用者都必须主动填写/选择自己的 NAS。
function route() {
  if (!mainWindow) return;
  loadSetup();
}

function loadSetup(msg) {
  if (!mainWindow) return;
  applyIgnoreCert(mainWindow, false);
  const q = msg ? '?msg=' + encodeURIComponent(msg) : '';
  mainWindow.loadFile(path.join(__dirname, 'renderer', 'setup.html'), { query: msg ? { msg } : {} });
}

function loadMedia(origin) {
  if (!mainWindow) return;
  applyIgnoreCert(mainWindow, !!cfg.ignoreCert);
  const url = mediaUrl(origin);
  mainWindow.loadURL(url, { userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36' });
}

// ---------------------------------------------------------------------------
// IPC
// ---------------------------------------------------------------------------
ipcMain.handle('get-state', () => ({
  serverUrl: cfg.serverUrl || '',
  ignoreCert: !!cfg.ignoreCert,
  history: cfg.history || []
}));

ipcMain.handle('connect', async (event, payload) => {
  const origin = normalizeServer(payload.serverUrl);
  if (!origin) return { ok: false, error: '地址格式不正确' };
  // 探测可达性（可选，失败也允许继续，由页面加载结果反馈）
  cfg.serverUrl = origin;
  cfg.ignoreCert = !!payload.ignoreCert;
  cfg.history = cfg.history || [];
  cfg.history = [origin, ...cfg.history.filter(h => h !== origin)].slice(0, 8);
  writeConfig(cfg);
  loadMedia(origin);
  return { ok: true };
});

ipcMain.handle('disconnect', async () => {
  cfg.serverUrl = '';
  writeConfig(cfg);
  loadSetup();
  return { ok: true };
});

ipcMain.handle('clear-history', async () => {
  cfg.history = [];
  writeConfig(cfg);
  return { ok: true };
});

ipcMain.handle('retry', async () => {
  const origin = normalizeServer(cfg.serverUrl);
  if (origin) loadMedia(origin);
  else loadSetup();
  return { ok: true };
});

ipcMain.handle('open-external', async (event, url) => {
  if (/^https?:\/\//i.test(url)) shell.openExternal(url);
});

// 无边框窗口控制
ipcMain.handle('win-min', () => { if (mainWindow) mainWindow.minimize(); });
ipcMain.handle('win-max', () => {
  if (!mainWindow) return;
  if (mainWindow.isMaximized()) mainWindow.unmaximize();
  else mainWindow.maximize();
});
ipcMain.handle('win-close', () => { if (mainWindow) mainWindow.close(); });
ipcMain.handle('win-ismax', () => !!(mainWindow && mainWindow.isMaximized()));
ipcMain.handle('show-menu', () => {
  if (!mainWindow) return;
  const menu = Menu.buildFromTemplate([
    { label: '更换服务器', click: () => loadSetup() },
    { label: '重新加载', click: () => mainWindow && mainWindow.reload() },
    { type: 'separator' },
    { label: '关于', click: () => dialog.showMessageBox(mainWindow, {
      type: 'info', title: '关于 飞牛影视', message: '飞牛影视 桌面客户端 v' + app.getVersion(),
      detail: '作者：东哥\n\n连接你自己的飞牛 NAS 观看影视。\n所有账号与媒体数据均直连你填写的服务器，与本软件作者无关。'
    }) },
    { type: 'separator' },
    { label: '退出', click: () => app.quit() }
  ]);
  menu.popup({ window: mainWindow });
});

// 页面加载失败 -> 注入友好提示（仅当失败的是影视主页面）
mainWindow && mainWindow.webContents.on('did-fail-load', () => {});

app.whenReady().then(() => {
  // 无边框窗口：不显示原生菜单栏
  Menu.setApplicationMenu(null);

  // 设置按钮已去掉，改用快捷键换服务器（Ctrl+Shift+S）与重新加载（Ctrl+R）
  globalShortcut.register('CommandOrControl+Shift+S', () => { showMainWindow(); loadSetup(); });
  globalShortcut.register('CommandOrControl+R', () => { if (mainWindow) { showMainWindow(); mainWindow.reload(); } });

  createWindow();
  createTray();

  mainWindow.webContents.on('did-fail-load', (event, errorCode, errorDescription, validatedURL, isMainFrame) => {
    if (!isMainFrame) return;
    if (!mainWindow || !validatedURL.startsWith('http')) return;
    if (errorCode === -3) return; // aborted
    mainWindow.loadFile(path.join(__dirname, 'renderer', 'error.html'), {
      query: { code: String(errorCode), url: validatedURL, desc: errorDescription || '' }
    });
  });

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
    else showMainWindow();
  });
});

app.on('before-quit', () => {
  isQuitting = true;
});

app.on('will-quit', () => {
  globalShortcut.unregisterAll();
  if (tray) { tray.destroy(); tray = null; }
});

app.on('window-all-closed', () => {
  // 托盘常驻：关闭窗口不退出程序，由托盘菜单「退出」结束
  if (process.platform === 'darwin' && isQuitting) app.quit();
});
