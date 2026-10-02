const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('prefsAPI', {
  /** 지금 설정 전부 + 고를 수 있는 값들 (모니터 · 버전 · 단축키 …) */
  get: () => ipcRenderer.invoke('prefs:get'),
  /** 하나 바꾸기 → 바뀐 뒤의 get() 결과 (단축키는 { failed } 가 더 붙는다) */
  set: (key, value) => ipcRenderer.invoke('prefs:set', key, value),
  /** 버튼 — update · whatsnew · log · data · todo · claude-on · claude-off */
  action: (name) => ipcRenderer.invoke('prefs:action', name),
  // 캐릭터 관리 — 목록 [{ id, name, kind: bundled|downloaded|made|user, hidden, main, companion }]
  charsList: () => ipcRenderer.invoke('chars:admin'),
  charsHide: (id, hidden) => ipcRenderer.invoke('chars:hide', id, hidden),     // → { list, error? }
  charsRemove: (id) => ipcRenderer.invoke('chars:remove', id),                 // → { list, error? }
  charsUse: (id) => ipcRenderer.invoke('chars:use', id),                       // → list
  charsFolder: () => ipcRenderer.invoke('chars:folder'),
  /** .deskpet 로 내보내기 (저장 위치를 묻는다) — from 은 보내는 사람 이름 (선택) */
  charsExport: (id, from) => ipcRenderer.invoke('chars:export', id, from),
  /** .deskpet 가져오기 — bytes(끌어다 놓은 파일 내용)가 없으면 파일 고르기 창 → { ok, id, name, from, list } | { error } | { canceled } */
  charsImport: (bytes) => ipcRenderer.invoke('chars:import', bytes),
  /** 내 그림으로 만들기 창 — id 를 주면 그 캐릭터 고치기 */
  makerOpen: (id) => ipcRenderer.invoke('maker:open', id),
  /** 메뉴 · 트레이에서 바뀌었을 때 */
  onChanged: (cb) => ipcRenderer.on('prefs:changed', () => cb()),
});
