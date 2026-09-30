const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('petAPI', {
  /** 무대(화면 크기·바닥선) 정보를 가져온다 */
  getStage: () => ipcRenderer.invoke('stage:get'),
  /** 모니터 목록 [{id, label, current}] 과 옮기기 (id 또는 'cursor') */
  listDisplays: () => ipcRenderer.invoke('display:list'),
  setDisplay: (id) => ipcRenderer.invoke('display:set', id),
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
  getSpinePath: () => ipcRenderer.invoke('spine:path'),
  getPaths: () => ipcRenderer.invoke('paths:get'),
  setChat: (v) => ipcRenderer.invoke('settings:setChat', v),
  /** 분위기 'light' | 'dark' */
  setTone: (v) => ipcRenderer.invoke('settings:setTone', v),
  setMode: (id, m) => ipcRenderer.invoke('settings:setMode', id, m),
  /** 함께 다닐 동료 (null = 혼자) */
  setCompanion: (id) => ipcRenderer.invoke('settings:setCompanion', id),
  quit: () => ipcRenderer.send('app:quit'),

  // ── Claude Code 연결 · 자동 시작 ──
  /** { connected, legacy, speak, error? } — ~/.claude/settings.json 에 우리 훅이 걸려 있는지 */
  claudeStatus: () => ipcRenderer.invoke('claude:status'),
  claudeConnect: () => ipcRenderer.invoke('claude:connect'),
  claudeDisconnect: () => ipcRenderer.invoke('claude:disconnect'),
  /** 연결은 둔 채 말만 끄고 켠다 */
  claudeSetSpeak: (v) => ipcRenderer.invoke('claude:setSpeak', v),
  /** 세션 목록 [{ sid, project, state, sec, hasWindow }] — 최근 소식 순 */
  claudeSessions: () => ipcRenderer.invoke('claude:sessions'),
  /** 그 세션의 터미널 창을 앞으로 → { ok, reason? } */
  claudeFocus: (sid) => ipcRenderer.invoke('claude:focus', sid),
  /** 커서 놀이 'none' | 'chase' | 'flee' */
  setCursorMode: (m) => ipcRenderer.invoke('settings:setCursorMode', m),
  /** { available, on } — 개발 실행에선 available=false */
  getAutoStart: () => ipcRenderer.invoke('autostart:get'),
  setAutoStart: (v) => ipcRenderer.invoke('autostart:set', v),

  // ── 메인 → 렌더러 ──
  /** 트레이 메뉴 등에서 오는 명령 */
  onCommand: (cb) => ipcRenderer.on('pet:command', (_e, cmd) => cb(cmd)),
  /** 해상도 변경 시 새 무대 정보 */
  onStage: (cb) => ipcRenderer.on('pet:stage', (_e, stage) => cb(stage)),
  /** 외부 알림·리마인더 → 말풍선 */
  onSay: (cb) => ipcRenderer.on('pet:say', (_e, msg) => cb(msg)),
  /** Claude Code 훅 이벤트 { kind: start|done|quick|fail|permission|waiting, project, sec, busy, quiet } */
  onClaude: (cb) => ipcRenderer.on('pet:claude', (_e, ev) => cb(ev)),
  /** 메인이 읽은 커서 좌표 (창 기준) — 클릭 통과 중에도 온다 */
  onCursor: (cb) => ipcRenderer.on('pet:cursor', (_e, p) => cb(p)),
});
