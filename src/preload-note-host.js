const { contextBridge, ipcRenderer } = require('electron');

// 메모 어미 창 — 메인이 "이 메모 창 열어 줘" 하면 페이지가 window.open 으로 연다 (note-window.js)
contextBridge.exposeInMainWorld('noteHostAPI', {
  onOpen: (cb) => ipcRenderer.on('host:open', (_e, id) => cb(String(id))),
});
