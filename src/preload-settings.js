const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('prefsAPI', {
  /** 지금 설정 전부 + 고를 수 있는 값들 (모니터 · 버전 · 단축키 …) */
  get: () => ipcRenderer.invoke('prefs:get'),
  /** 하나 바꾸기 → 바뀐 뒤의 get() 결과 (단축키는 { failed } 가 더 붙는다) */
  set: (key, value) => ipcRenderer.invoke('prefs:set', key, value),
  /** 버튼 — update · whatsnew · log · data · todo · claude-on · claude-off */
  action: (name) => ipcRenderer.invoke('prefs:action', name),
  /** 메뉴 · 트레이에서 바뀌었을 때 */
  onChanged: (cb) => ipcRenderer.on('prefs:changed', () => cb()),
});
