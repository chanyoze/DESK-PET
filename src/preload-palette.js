const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('paletteAPI', {
  /** { tab, hotkeys, today } */
  init: () => ipcRenderer.invoke('palette:init'),
  /** 메인이 탭을 바꾸라고 할 때 (이미 떠 있는데 다른 단축키를 누름) */
  onTab: (cb) => ipcRenderer.on('palette:tab', (_e, t) => cb(t)),
  close: () => ipcRenderer.send('palette:close'),

  // 빠른 메모 — target: today | backlog | note
  memoSave: (m) => ipcRenderer.invoke('memo:save', m),
  readClipboard: () => ipcRenderer.invoke('clip:read'),

  // 클립보드 기록 — 모두 { pins, recent, paused } 를 돌려준다
  clipList: () => ipcRenderer.invoke('clip:list'),
  clipCopy: (t) => ipcRenderer.invoke('clip:copy', t),
  clipPin: (t, on) => ipcRenderer.invoke('clip:pin', t, on),
  clipRemove: (t) => ipcRenderer.invoke('clip:remove', t),
  clipClear: () => ipcRenderer.invoke('clip:clear'),
  clipPause: (v) => ipcRenderer.invoke('clip:pause', v),

  // 바로가기 — 모두 목록 [{ id, name, target, kind }] 를 돌려준다 (open 은 { ok, error })
  linksList: () => ipcRenderer.invoke('links:list'),
  linksOpen: (id) => ipcRenderer.invoke('links:open', id),
  linksSave: (item) => ipcRenderer.invoke('links:save', item),
  linksRemove: (id) => ipcRenderer.invoke('links:remove', id),
  linksMove: (id, dir) => ipcRenderer.invoke('links:move', id, dir),
  /** 파일 · 폴더 고르기 창 → 경로 (취소면 null) */
  pickPath: (folder) => ipcRenderer.invoke('links:pick', folder),
});
