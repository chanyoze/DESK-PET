const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('editorAPI', {
  /** { mode: 'todo' | 'note', title, text, color, hint } */
  init: () => ipcRenderer.invoke('editor:init'),
  /** 저장 { text, color } · 취소 null */
  done: (result) => ipcRenderer.send('editor:done', result),
  /** 등록한 분류 목록 저장 (입력 창에서 + 등록 · × 로 고친다) */
  setCategories: (list) => ipcRenderer.invoke('todoCats:set', list),
});
