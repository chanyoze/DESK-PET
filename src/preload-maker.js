const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('makerAPI', {
  /** 새로 만들기면 { edit: null }, 고치기면 { edit: id, manifest, sheets: { 이름: dataURL } } */
  init: () => ipcRenderer.invoke('maker:init'),
  /** 이미 떠 있는 창에서 다른 캐릭터를 고치려고 다시 열었을 때 */
  onReset: (cb) => ipcRenderer.on('maker:reset', () => cb()),
  /** { id?, manifest, sheets: { 이름: base64 png }, use } → { ok, id, error } */
  save: (payload) => ipcRenderer.invoke('maker:save', payload),
  close: () => ipcRenderer.send('maker:close'),
});
