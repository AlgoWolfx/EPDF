const { app } = require('electron');
const { autoUpdater } = require('electron-updater');

function createUpdates(publish, canInstall) {
  let state = { status: 'idle', version: null, percent: 0 };
  let busy = false;
  const disabled = !app.isPackaged || !!process.env.PORTABLE_EXECUTABLE_DIR;
  const set = changes => { state = { ...state, ...changes }; publish(state); };
  autoUpdater.autoDownload = false;
  autoUpdater.autoInstallOnAppQuit = false;
  autoUpdater.setFeedURL({ provider: 'github', owner: 'AlgoWolfx', repo: 'EPDF' });
  autoUpdater.on('checking-for-update', () => set({ status: 'checking' }));
  autoUpdater.on('update-available', info => set({ status: 'available', version: info.version }));
  autoUpdater.on('update-not-available', () => set({ status: 'current' }));
  autoUpdater.on('download-progress', progress => set({ status: 'downloading', percent: Math.round(progress.percent) }));
  autoUpdater.on('update-downloaded', info => set({ status: 'downloaded', version: info.version }));
  autoUpdater.on('error', () => set({ status: 'error' }));
  return {
    status: () => ({ ...state, disabled }),
    async check() {
      if (disabled) { set({ status: 'manual' }); return this.status(); }
      if (busy || state.status === 'downloaded') return this.status();
      busy = true;
      try { await autoUpdater.checkForUpdates(); }
      catch { set({ status: 'error' }); }
      finally { busy = false; }
      return this.status();
    },
    async download() {
      if (disabled || busy || state.status !== 'available') return this.status();
      busy = true;
      set({ status: 'downloading', percent: 0 });
      try { await autoUpdater.downloadUpdate(); }
      catch { set({ status: 'error' }); }
      finally { busy = false; }
      return this.status();
    },
    install() {
      if (disabled || state.status !== 'downloaded' || !canInstall()) return false;
      autoUpdater.quitAndInstall(false, true);
      return true;
    }
  };
}
module.exports = { createUpdates };
