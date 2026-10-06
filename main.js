const { app, BrowserWindow, ipcMain, dialog, shell, protocol } = require('electron');
const path = require('path');
const fs = require('fs');
const english = require('./renderer/locales/en.json');
const { createUpdates } = require('./updates');
let language = 'tr';
const tr = source => language === 'en' ? (english[source] || source) : source;
protocol.registerSchemesAsPrivileged([{ scheme: 'epdf-ocr', privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true } }]);

let win = null;
let pendingFile = null;
let documentEdited = false;

function confirmLeave() {
  if (!documentEdited) return true;
  return dialog.showMessageBoxSync(win, {
    type: 'question', title: tr('PDF henüz kaydedilmedi'),
    message: tr('Notların PDF dosyasına kaydedilmedi.'),
    detail: tr('Taslak bu bilgisayarda tutulur. PDF olarak kaydetmek için önce geri dönüp Kaydet seçeneğini kullanabilirsin.'),
    buttons: [tr('Geri dön'), tr('Kaydetmeden devam et')], defaultId: 0, cancelId: 0
  }) === 1;
}

function pdfFromArgs(argv) {
  return argv.slice(1).find(a => a.toLowerCase().endsWith('.pdf') && fs.existsSync(a)) || null;
}

function sendOpen(file) {
  if (!file) return;
  if (win && win.webContents && !win.webContents.isLoading()) {
    win.webContents.send('open-file', file);
  } else {
    pendingFile = file;
  }
}

function createWindow() {
  win = new BrowserWindow({
    width: 1280,
    height: 860,
    minWidth: 800,
    minHeight: 500,
    backgroundColor: '#1e1f24',
    title: 'Ders PDF Editor',
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  });
  win.setMenuBarVisibility(false);
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  win.webContents.on('will-navigate', (event) => event.preventDefault());
  win.on('close', (event) => { if (!confirmLeave()) event.preventDefault(); });
  win.loadFile(path.join(__dirname, 'renderer', 'index.html'));
  win.webContents.on('did-finish-load', () => {
    if (pendingFile) {
      win.webContents.send('open-file', pendingFile);
      pendingFile = null;
    }
  });
  win.on('closed', () => { win = null; });
}

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on('second-instance', (_e, argv) => {
    if (win) {
      if (win.isMinimized()) win.restore();
      win.focus();
    }
    sendOpen(pdfFromArgs(argv));
  });

  app.whenReady().then(() => {
    protocol.handle('epdf-ocr', async request => {
      const url = new URL(request.url);
      const match = /^\/(eng|tur)\.traineddata\.gz$/.exec(url.pathname);
      if (url.hostname !== 'models' || !match || request.method !== 'GET') return new Response('Not found', { status: 404 });
      const code = match[1];
      const file = path.join(path.dirname(require.resolve(`@tesseract.js-data/${code}/package.json`)), '4.0.0_best_int', `${code}.traineddata.gz`);
      return new Response(await fs.promises.readFile(file), { headers: { 'Content-Type': 'application/octet-stream', 'Access-Control-Allow-Origin': '*' } });
    });
    pendingFile = pdfFromArgs(process.argv);
    createWindow();
  });

  app.on('window-all-closed', () => app.quit());
}

ipcMain.handle('dialog:open', async () => {
  const r = await dialog.showOpenDialog(win, {
    title: tr('PDF aç'),
    filters: [{ name: 'PDF', extensions: ['pdf'] }],
    properties: ['openFile']
  });
  return r.canceled ? null : r.filePaths[0];
});

ipcMain.handle('file:read', async (_e, file) => {
  const buf = await fs.promises.readFile(file);
  return new Uint8Array(buf);
});

ipcMain.handle('dialog:save', async (_e, defaultPath, bytes, sourcePath) => {
  const r = await dialog.showSaveDialog(win, {
    title: tr('PDF olarak kaydet'),
    defaultPath,
    filters: [{ name: 'PDF', extensions: ['pdf'] }]
  });
  if (r.canceled || !r.filePath) return null;
  if (sourcePath && path.resolve(r.filePath).toLowerCase() === path.resolve(sourcePath).toLowerCase()) {
    throw new Error(tr('Orijinal PDF korunur. Lütfen kopya için farklı bir dosya adı seç.'));
  }
  await fs.promises.writeFile(r.filePath, Buffer.from(bytes));
  return r.filePath;
});

ipcMain.handle('file:write', async (_e, file, bytes) => {
  await fs.promises.writeFile(file, Buffer.from(bytes));
  return file;
});

ipcMain.handle('font:load', async () => {
  const candidates = [
    'C:\\Windows\\Fonts\\arial.ttf',
    'C:\\Windows\\Fonts\\segoeui.ttf',
    'C:\\Windows\\Fonts\\calibri.ttf'
  ];
  for (const f of candidates) {
    try { return new Uint8Array(await fs.promises.readFile(f)); } catch { /* sıradaki */ }
  }
  return null;
});

ipcMain.handle('path:info', (_e, file) => ({
  dir: path.dirname(file),
  name: path.basename(file, path.extname(file))
}));

ipcMain.on('document:edited', (_e, edited) => { documentEdited = edited === true; });
ipcMain.handle('document:confirm-leave', () => confirmLeave());
ipcMain.handle('app:version', () => require('./package.json').version);
ipcMain.handle('pdfium:wasm', async () => new Uint8Array(await fs.promises.readFile(require.resolve('@embedpdf/pdfium/pdfium.wasm'))));
ipcMain.on('app:language', (_e, value) => { language = value === 'en' ? 'en' : 'tr'; });
const updates = createUpdates(state => { win?.webContents.send('updates:state', state); }, () => {
  if (!confirmLeave()) return false;
  documentEdited = false;
  return true;
});
ipcMain.handle('updates:status', () => updates.status());
ipcMain.handle('updates:check', () => updates.check());
ipcMain.handle('updates:download', () => updates.download());
ipcMain.handle('updates:install', () => updates.install());
ipcMain.handle('support:open', async (_e, value) => {
  const url = new URL(value);
  if (url.protocol !== 'https:' || url.username || url.password || url.port ||
      !['github.com', 'instagram.com', 'www.instagram.com', 'egoradigital.com', 'www.egoradigital.com'].includes(url.hostname)) {
    throw new Error('Yalnızca izin verilen resmi HTTPS destek bağlantıları açılabilir.');
  }
  await shell.openExternal(url.href);
});
