const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('petAPI', {
  /** 무대(화면 크기·바닥선) 정보를 가져온다 */
  getStage: () => ipcRenderer.invoke('stage:get'),
  /** 설치된 캐릭터 목록 */
  listCharacters: () => ipcRenderer.invoke('character:list'),
  /** 캐릭터 매니페스트 + 에셋(스켈레톤/아틀라스/텍스처)을 통째로 받는다 */
  loadCharacter: (id) => ipcRenderer.invoke('character:load', id),
  /** 커서가 캐릭터(또는 열린 메뉴) 위에 있을 때만 true → 그때만 클릭을 받는다 */
  setInteractive: (v) => ipcRenderer.send('mouse:interactive', !!v),

  // ── 설정 · 리마인더 ──
  getSettings: () => ipcRenderer.invoke('settings:get'),
  setSize: (v) => ipcRenderer.invoke('settings:setSize', v),
  setCharacter: (id) => ipcRenderer.invoke('settings:setCharacter', id),
  addReminder: (r) => ipcRenderer.invoke('reminders:add', r),
  removeReminder: (id) => ipcRenderer.invoke('reminders:remove', id),
  quit: () => ipcRenderer.send('app:quit'),

  // ── 메인 → 렌더러 ──
  /** 트레이 메뉴 등에서 오는 명령 */
  onCommand: (cb) => ipcRenderer.on('pet:command', (_e, cmd) => cb(cmd)),
  /** 해상도 변경 시 새 무대 정보 */
  onStage: (cb) => ipcRenderer.on('pet:stage', (_e, stage) => cb(stage)),
  /** 외부 알림·리마인더 → 말풍선 */
  onSay: (cb) => ipcRenderer.on('pet:say', (_e, msg) => cb(msg)),
});
