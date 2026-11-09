const { app, BrowserWindow, screen, ipcMain, Tray, Menu, nativeImage, shell } = require('electron');
const path = require('path');
const fs = require('fs');

// 打包后没有控制台，日志一律写文件（userData + exe 同目录，双份便于排查）
function log(...args) {
  const line = new Date().toISOString() + ' ' + args.map((a) =>
    typeof a === 'string' ? a : JSON.stringify(a)).join(' ') + '\n';
  const targets = [path.join(app.getPath('userData'), 'lumo.log')];
  try { targets.push(path.join(path.dirname(app.getPath('exe')), 'lumo.log')); } catch {}
  for (const t of targets) {
    try { fs.appendFileSync(t, line); } catch {}
  }
  try { console.log(...args); } catch {}
}

log('[lumo] boot', app.getVersion(), 'packaged=', app.isPackaged);

app.disableHardwareAcceleration();
if (!app.requestSingleInstanceLock()) app.quit();

// 自检：--claim-test 使用独立数据目录，不污染真实存档
if (process.argv.includes('--claim-test')) {
  app.setPath('userData', path.join(__dirname, '_testdata'));
}

let win = null;
let settingsWin = null;
let universeWin = null;
let reportWin = null;
let tray = null;

// 打包后没有控制台，日志写文件便于排查
function log(...args) {
  const line = new Date().toISOString() + ' ' + args.map((a) =>
    typeof a === 'string' ? a : JSON.stringify(a)).join(' ') + '\n';
  try {
    fs.appendFileSync(path.join(app.getPath('userData'), 'lumo.log'), line);
  } catch {}
  console.log(...args);
}

// ---------- 默认设置 ----------
const DEFAULTS = {
  kbTrackLength: 2500,
  mouseTrackLength: 1500,
  easeTau: 110,
  goldAfterMin: 3,
  yawnAfterSec: 60,
  sleepAfterMin: 45,
  kbColor: '#6ee7ff',
  mouseColor: '#ff9ec7',
  autostart: false
};

const SETTINGS_FILE = path.join(app.getPath('userData'), 'lumo-settings.json');

function readSettings() {
  try {
    return { ...DEFAULTS, ...JSON.parse(fs.readFileSync(SETTINGS_FILE, 'utf8')) };
  } catch {
    return { ...DEFAULTS };
  }
}

function writeSettings(s) {
  try {
    fs.mkdirSync(path.dirname(SETTINGS_FILE), { recursive: true });
    fs.writeFileSync(SETTINGS_FILE, JSON.stringify(s, null, 2), 'utf8');
  } catch (e) {
    log('[lumo] 设置写入失败:', e.message);
  }
}

// ---------- 状态持久化 ----------
const STATE_FILE = path.join(app.getPath('userData'), 'lumo-state.json');
let pendingState = null;
let writeTimer = null;

function readState() {
  try { return JSON.parse(fs.readFileSync(STATE_FILE, 'utf8')); } catch { return null; }
}

function flushState() {
  if (!pendingState) return;
  try {
    fs.mkdirSync(path.dirname(STATE_FILE), { recursive: true });
    const tmp = STATE_FILE + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(pendingState, null, 2), 'utf8');
    fs.renameSync(tmp, STATE_FILE);
    pendingState = null;
  } catch (e) {
    log('[lumo] 状态写入失败:', e.message);
  }
}

function scheduleWrite(state) {
  pendingState = state;
  if (writeTimer) return;
  writeTimer = setTimeout(() => { writeTimer = null; flushState(); }, 2000);
}

ipcMain.handle('state:load', () => readState());
ipcMain.on('state:save', (_e, state) => scheduleWrite(state));
ipcMain.handle('stars:load', () => {
  const s = pendingState || readState();
  return (s && Array.isArray(s.stars)) ? s.stars : [];
});
ipcMain.handle('settings:get', () => readSettings());
ipcMain.on('settings:set', (_e, s) => {
  const merged = { ...DEFAULTS, ...s };
  writeSettings(merged);
  if (win && !win.isDestroyed()) win.webContents.send('settings:changed', merged);
  if (settingsWin && !settingsWin.isDestroyed()) settingsWin.webContents.send('settings:changed', merged);
});
ipcMain.on('state:reset', () => {
  if (win && !win.isDestroyed()) win.webContents.send('state:reset');
});

// 周报结算：报告窗请求 → 转给跑道窗（唯一的数据写入方）→ 回传结果
ipcMain.on('report:claim', () => {
  if (win && !win.isDestroyed()) win.webContents.send('report:claim');
});
ipcMain.on('report:claimed', (_e, star) => {
  if (reportWin && !reportWin.isDestroyed()) reportWin.webContents.send('report:claimed', star);
});

// ---------- 开机自启（默认关闭，由设置里的开关控制） ----------
function autostartPath() {
  // 开发态用 electron + 应用目录；打包后直接用 exe
  if (app.isPackaged) return { path: app.getPath('exe'), args: [] };
  return { path: app.getPath('exe'), args: [app.getAppPath()] };
}

function setAutostart(enabled) {
  const { path: exe, args } = autostartPath();
  try {
    app.setLoginItemSettings({ openAtLogin: !!enabled, path: exe, args });
    return app.getLoginItemSettings({ path: exe, args }).openAtLogin;
  } catch (e) {
    log('[lumo] 设置开机自启失败:', e.message);
    return false;
  }
}

ipcMain.handle('autostart:get', () => {
  const { path: exe, args } = autostartPath();
  try {
    return app.getLoginItemSettings({ path: exe, args }).openAtLogin;
  } catch {
    return false;
  }
});

ipcMain.handle('autostart:set', (_e, enabled) => {
  const actual = setAutostart(enabled);
  const s = { ...readSettings(), autostart: actual };
  writeSettings(s);
  if (settingsWin && !settingsWin.isDestroyed()) settingsWin.webContents.send('settings:changed', s);
  return actual;
});

// ---------- 真实输入统计 ----------
let uIOhook = null;
try {
  uIOhook = require('uiohook-napi').uIOhook;
  log('[lumo] uiohook 加载成功');
} catch (e) {
  log('[lumo] uiohook 加载失败:', e.message);
}
let kbCount = 0;
let mouseCount = 0;

function startInputHook() {
  if (!uIOhook) {
    log('[lumo] 输入钩子不可用，跳过');
    return;
  }
  uIOhook.on('keydown', () => { kbCount++; });
  uIOhook.on('mousedown', () => { mouseCount++; });
  uIOhook.on('wheel', () => { mouseCount++; });
  uIOhook.start();
  setInterval(() => {
    if (win && !win.isDestroyed() && win.webContents && !win.webContents.isLoading()) {
      win.webContents.send('input-events', { kb: kbCount, mouse: mouseCount });
    }
    kbCount = 0;
    mouseCount = 0;
  }, 100);
}

// ---------- 跑道窗口 ----------
const LAYOUT = { inset: 8 };

function computeBounds() {
  const d = screen.getPrimaryDisplay();
  const { workArea } = d;
  const taskbarTop = workArea.y + workArea.height;
  const WIN_ABOVE = 40;
  const height = WIN_ABOVE + 2;
  return {
    x: workArea.x + LAYOUT.inset,
    y: taskbarTop - height,
    width: workArea.width - LAYOUT.inset * 2,
    height
  };
}

function createWindow() {
  win = new BrowserWindow({
    ...computeBounds(),
    transparent: true,
    frame: false,
    resizable: false,
    movable: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    skipTaskbar: true,
    focusable: false,
    hasShadow: false,
    alwaysOnTop: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  win.setAlwaysOnTop(true, 'screen-saver');
  win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  win.setIgnoreMouseEvents(true, { forward: true });
  win.loadFile(path.join(__dirname, 'renderer/index.html'),
    process.argv.includes('--demo') ? { query: { demo: '1' } } : undefined);

  win.webContents.on('did-finish-load', () => {
    log('[lumo] bounds=', JSON.stringify(win.getBounds()));
  });
  win.webContents.on('did-fail-load', (_e, code, desc, url) => {
    log('[lumo] 页面加载失败:', code, desc, url);
  });
  win.webContents.on('render-process-gone', (_e, det) => {
    log('[lumo] renderer 崩溃:', JSON.stringify(det));
    if (win && !win.isDestroyed()) win.reload();
  });
  win.webContents.on('console-message', (_e, level, message) => {
    log('[renderer]', message);
  });
  win.webContents.on('preload-error', (_e, p, err) => {
    log('[lumo] preload 失败:', p, err && err.message);
  });

  setInterval(() => {
    if (win && !win.isDestroyed()) {
      win.setAlwaysOnTop(true, 'screen-saver');
      win.moveTop();
    }
  }, 5000);
}

// ---------- 设置窗口 ----------
function openSettings() {
  if (settingsWin && !settingsWin.isDestroyed()) {
    settingsWin.show();
    settingsWin.focus();
    return;
  }
  settingsWin = new BrowserWindow({
    width: 460,
    height: 715,
    resizable: false,
    frame: false,
    transparent: true,
    backgroundColor: '#00000000',
    skipTaskbar: false,
    title: 'lumo 设置',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });
  settingsWin.loadFile(path.join(__dirname, 'renderer/settings.html'));
  settingsWin.on('closed', () => { settingsWin = null; });

  // 自检：--shot 参数时把窗口画面存成图，方便验证 UI
  if (process.argv.includes('--shot')) {
    settingsWin.webContents.on('did-finish-load', () => {
      setTimeout(async () => {
        try {
          const img = await settingsWin.webContents.capturePage();
          fs.writeFileSync(path.join(__dirname, '_settings_shot.png'), img.toPNG());
          log('[lumo] settings shot saved');
        } catch (e) {
          log('[lumo] shot failed:', e.message);
        }
        app.quit();
      }, 1500);
    });
  }
}

// ---------- 宇宙面板 ----------
function shotAndQuit(w, name) {
  if (!process.argv.includes('--shot')) return;
  w.webContents.on('did-finish-load', () => {
    setTimeout(async () => {
      try {
        const img = await w.webContents.capturePage();
        fs.writeFileSync(path.join(__dirname, name), img.toPNG());
        log('[lumo] shot saved:', name);
      } catch (e) {
        log('[lumo] shot failed:', e.message);
      }
      app.quit();
    }, 1800);
  });
}

function openUniverse() {
  if (universeWin && !universeWin.isDestroyed()) {
    universeWin.show();
    universeWin.focus();
    return;
  }
  universeWin = new BrowserWindow({
    width: 980,
    height: 700,
    resizable: false,
    frame: false,
    transparent: true,
    backgroundColor: '#00000000',
    title: 'lumo · 个人宇宙',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });
  const demo = process.argv.includes('--demo');
  const q = {};
  if (demo) q.demo = '1';
  if (process.argv.includes('--hero')) q.hero = '1';
  universeWin.loadFile(path.join(__dirname, 'renderer/universe.html'), Object.keys(q).length ? { query: q } : undefined);
  universeWin.on('closed', () => { universeWin = null; });
  shotAndQuit(universeWin, '_universe_shot.png');
}

// ---------- 周报 ----------
function openReport() {
  if (reportWin && !reportWin.isDestroyed()) {
    reportWin.show();
    reportWin.focus();
    return;
  }
  reportWin = new BrowserWindow({
    width: 800,
    height: 720,
    resizable: false,
    frame: false,
    transparent: true,
    backgroundColor: '#00000000',
    title: 'lumo · 本周工伤鉴定报告',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });
  const q = {};
  if (process.argv.includes('--demo')) q.demo = '1';
  if (process.argv.includes('--open')) q.open = '1';
  reportWin.loadFile(path.join(__dirname, 'renderer/report.html'), Object.keys(q).length ? { query: q } : undefined);
  reportWin.on('closed', () => { reportWin = null; });
  shotAndQuit(reportWin, '_report_shot.png');
}

// ---------- 托盘 ----------
function createTray() {
  const icon = nativeImage.createFromPath(path.join(__dirname, 'assets', 'tray.png'));
  tray = new Tray(icon);
  tray.setToolTip('lumo · 两只打工光点');
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: '个人宇宙', click: openUniverse },
    { label: '本周鉴定报告', click: openReport },
    { label: '设置…', click: openSettings },
    { label: '打开数据文件夹', click: () => shell.showItemInFolder(STATE_FILE) },
    { type: 'separator' },
    {
      label: '退出',
      click: () => { flushState(); app.quit(); }
    }
  ]));
  tray.on('double-click', openSettings);
}

app.whenReady().then(() => {
  if (!fs.existsSync(SETTINGS_FILE)) writeSettings(readSettings()); // 首次运行落盘默认值
  createWindow();
  createTray();
  startInputHook();

  if (process.argv.includes('--settings')) openSettings();
  if (process.argv.includes('--universe')) openUniverse();
  if (process.argv.includes('--report')) openReport();

  // 自检：开机自启开关能不能真的写进系统
  if (process.argv.includes('--autostart-test')) {
    setTimeout(() => {
      const read = () => {
        const { path: exe, args } = autostartPath();
        return app.getLoginItemSettings({ path: exe, args }).openAtLogin;
      };
      console.log('[autostart-test] 初始:', read());
      console.log('[autostart-test] 开启 →', setAutostart(true));
      console.log('[autostart-test] 系统读回:', read());
      console.log('[autostart-test] 关闭 →', setAutostart(false));
      console.log('[autostart-test] 系统读回:', read());
      setTimeout(() => app.quit(), 500);
    }, 1200);
  }

  // 自检：模拟一次开箱结算，打印结果后退出
  if (process.argv.includes('--claim-test')) {
    setTimeout(() => {
      console.log('[claim-test] 请求结算…');
      win.webContents.send('report:claim');
    }, 1800);
    ipcMain.on('report:claimed', (_e, star) => {
      console.log('[claim-test] 结算结果:', JSON.stringify(star));
      flushState();
      setTimeout(() => app.quit(), 800);
    });
  }

  screen.on('display-metrics-changed', () => {
    if (win && !win.isDestroyed()) win.setBounds(computeBounds());
  });
});

app.on('second-instance', () => {
  if (win && !win.isDestroyed()) win.moveTop();
});
app.on('before-quit', () => flushState());
app.on('window-all-closed', () => app.quit());
