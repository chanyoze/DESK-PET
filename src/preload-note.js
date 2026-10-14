const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('noteAPI', {
  /** { text, html(없으면 null), color, collapsed, colors: { 이름: '#색' } } */
  init: () => ipcRenderer.invoke('note:init'),
  /** 쓰는 대로 보낸다 { text, html } — 저장은 메인이 모아서 한다 */
  text: (c) => ipcRenderer.send('note:text', c),
  color: (c) => ipcRenderer.send('note:color', c),
  collapse: (v) => ipcRenderer.send('note:collapse', v),
  /** 창만 닫는다 (메모는 남는다 — 트레이 "닫은 메모") */
  close: () => ipcRenderer.send('note:close'),
  remove: () => ipcRenderer.send('note:remove'),
  /** 이 메모 옆에 새 메모 */
  add: () => ipcRenderer.send('note:new'),
});
