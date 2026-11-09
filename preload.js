const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('lumoAPI', {
  onInput: (cb) => ipcRenderer.on('input-events', (_e, data) => cb(data)),
  loadState: () => ipcRenderer.invoke('state:load'),
  saveState: (state) => ipcRenderer.send('state:save', state),

  getSettings: () => ipcRenderer.invoke('settings:get'),
  saveSettings: (s) => ipcRenderer.send('settings:set', s),
  onSettings: (cb) => ipcRenderer.on('settings:changed', (_e, s) => cb(s)),

  getStars: () => ipcRenderer.invoke('stars:load'),

  resetTrack: () => ipcRenderer.send('state:reset'),
  onResetTrack: (cb) => ipcRenderer.on('state:reset', () => cb()),

  // 周报开箱结算
  claimWeek: () => ipcRenderer.send('report:claim'),
  onClaimRequest: (cb) => ipcRenderer.on('report:claim', () => cb()),
  sendClaimed: (star) => ipcRenderer.send('report:claimed', star),
  onClaimed: (cb) => ipcRenderer.on('report:claimed', (_e, star) => cb(star)),

  // 开机自启
  getAutostart: () => ipcRenderer.invoke('autostart:get'),
  setAutostart: (v) => ipcRenderer.invoke('autostart:set', v)
});
