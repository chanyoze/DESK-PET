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
  // ── 할 일 · recap ──
  /** { items: [{ i, text, done }], doneToday, file, recap: { every, from, to, weekdays } } */
  todoGet: () => ipcRenderer.invoke('todo:get'),
  /** 입력 창을 띄워 할 일을 추가한다 (창이 닫히면 새 목록으로 풀린다) */
  todoAdd: (defaults) => ipcRenderer.invoke('todo:add', defaults),
  todoToggle: (i, text) => ipcRenderer.invoke('todo:toggle', i, text),
  /** 입력 창에 지금 내용을 채워 고친다 · 지운다 (설명 줄까지) */
  todoEdit: (i, text) => ipcRenderer.invoke('todo:edit', i, text),
  todoRemove: (i, text) => ipcRenderer.invoke('todo:remove', i, text),
  todoClearDone: () => ipcRenderer.invoke('todo:clearDone'),
  /** 여러 개 한꺼번에 — refs [{ i, text }], target 'today' | 'backlog' | 'done' (밀린 것 정리) */
  todoMove: (refs, target) => ipcRenderer.invoke('todo:move', refs, target),
  /** todo.md 를 편집기로 연다 */
  todoOpen: () => ipcRenderer.invoke('todo:open'),
  recapNow: () => ipcRenderer.invoke('recap:now'),
  /** 0(끔) · 30 · 60 · 120 분 */
  recapSetEvery: (m) => ipcRenderer.invoke('recap:setEvery', m),
  /** 파일이 바뀌면 새 할 일 목록 */
  onTodo: (cb) => ipcRenderer.on('pet:todo', (_e, s) => cb(s)),
  /** recap 시각 { reason, open: [글], total, doneToday } */
  onRecap: (cb) => ipcRenderer.on('pet:recap', (_e, r) => cb(r)),
  // ── 스티커 메모 · 카드 ── (모두 { notes, todoCard, hidden } 을 돌려준다)
  notesGet: () => ipcRenderer.invoke('notes:get'),
  /** 입력 창을 띄워 새 메모 — pos 는 처음 붙일 자리 */
  notesAdd: (pos) => ipcRenderer.invoke('notes:add', pos),
  notesEdit: (id) => ipcRenderer.invoke('notes:edit', id),
  /** 위치 · 접힘만 */
  notesUpdate: (id, patch) => ipcRenderer.invoke('notes:update', id, patch),
  notesRemove: (id) => ipcRenderer.invoke('notes:remove', id),
  notesSetTodoCard: (patch) => ipcRenderer.invoke('notes:setTodoCard', patch),
  notesSetHidden: (v) => ipcRenderer.invoke('notes:setHidden', v),
  // ── 알림 ──
  /** 안 읽은 알림 수 → 트레이 아이콘 빨간 점 */
  inboxCount: (n) => ipcRenderer.send('inbox:count', n),
  /** 윈도우 알림(토스트) 켜기 · 끄기 → 켜졌는지 */
  toastSet: (v) => ipcRenderer.invoke('toast:set', v),
  /** 팔레트 창 — 'memo' | 'clip' | 'links' */
  openPalette: (tab) => ipcRenderer.invoke('palette:open', tab),
  // ── 업데이트 ──
  /** 확인 창 (지금 업데이트 / 나중에 / 건너뛰기) */
  updatePrompt: () => ipcRenderer.invoke('update:prompt'),
  updateCheck: () => ipcRenderer.invoke('update:check'),
  /** 새로 바뀐 것 창 (최근 버전 몇 개) */
  whatsNew: () => ipcRenderer.invoke('whatsnew:show'),
  /** 새 버전 { version, current } */
  onUpdate: (cb) => ipcRenderer.on('pet:update', (_e, u) => cb(u)),
  /** 받는 중 % */
  onUpdateProgress: (cb) => ipcRenderer.on('pet:update-progress', (_e, p) => cb(p)),
  /** 커서 놀이 'none' | 'chase' | 'flee' */
  setCursorMode: (m) => ipcRenderer.invoke('settings:setCursorMode', m),
  /** { available, on } — 개발 실행에선 available=false */
  getAutoStart: () => ipcRenderer.invoke('autostart:get'),
  setAutoStart: (v) => ipcRenderer.invoke('autostart:set', v),

  // ── 메인 → 렌더러 ──
  /** 트레이 메뉴 등에서 오는 명령 */
  onCommand: (cb) => ipcRenderer.on('pet:command', (_e, cmd) => cb(cmd)),
  /** 설정 창에서 바꾼 값 { tone, chatter, cursorMode, fps } */
  onPrefs: (cb) => ipcRenderer.on('pet:prefs', (_e, v) => cb(v)),
  /** 설정 창 열기 */
  openSettings: () => ipcRenderer.invoke('settings:open'),
  /** 해상도 변경 시 새 무대 정보 */
  onStage: (cb) => ipcRenderer.on('pet:stage', (_e, stage) => cb(stage)),
  /** 외부 알림·리마인더 → 말풍선 */
  onSay: (cb) => ipcRenderer.on('pet:say', (_e, msg) => cb(msg)),
  /** Claude Code 훅 이벤트 { kind: start|done|quick|fail|permission|waiting, project, sec, busy, quiet } */
  onClaude: (cb) => ipcRenderer.on('pet:claude', (_e, ev) => cb(ev)),
  /** 메인이 읽은 커서 좌표 (창 기준) — 클릭 통과 중에도 온다 */
  onCursor: (cb) => ipcRenderer.on('pet:cursor', (_e, p) => cb(p)),
});
