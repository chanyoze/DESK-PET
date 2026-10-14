/**
 * 스티커 메모 — 한 장이 창 하나
 * -------------------------------------------------------------
 * 예전엔 캐릭터 창(투명 · 포커스 없음 · 모니터 하나) 안의 DOM 이라, 캐릭터가 있는 모니터 밖으로 못 나가고
 * 글도 따로 뜨는 입력 창에서만 쓸 수 있었다. 이제 메모마다 작은 창을 띄운다:
 *   - 어느 모니터로든 끌어다 놓는다 (자리 · 크기는 화면 좌표로 notes.json 에)
 *   - 메모에 바로 쓰고, 쓰는 대로 저장된다 (저장 버튼 없음)
 *   - 굵게 · 기울임 · 밑줄 · 취소선 · 글머리표 (html 에 남긴다. text 는 같은 글의 서식 없는 판 — 밖에서 넣은 메모 · 옛 파일은 text 만 있다)
 *   - 닫기(×)와 지우기(🗑)가 따로다 — 닫은 메모는 창만 없고 notes.json 에 남아서 트레이 "닫은 메모"로 다시 연다
 *
 * notes.json  [{ id, text, html?, color, x, y, w, h, collapsed, closed?, abs }]
 *   abs: true 면 x · y 가 화면 좌표. 없으면 옛 형식(캐릭터 모니터 안 좌표)이라 처음 읽을 때 한 번 바꾼다.
 *   x · y 가 null 이면 아직 자리가 없는 메모 (밖에서 넣은 것) — 띄울 때 정한다.
 *
 * 글은 렌더러 → 메인 한 방향으로만 간다 (메인이 되돌려 넣으면 한글 조합이 깨진다).
 * 숨기기(메뉴 "메모 · 할 일 카드 숨기기")는 창을 없앤다 — 숨긴 창도 메모리를 먹는다. 글은 메인이 들고 있다.
 */
const { app, BrowserWindow, ipcMain, screen, Menu } = require('electron');
const path = require('path');
const notesStore = require('./notes-store');

const COLORS = { yellow: '#f6e58d', pink: '#f8b4c8', green: '#b8e6b0', blue: '#a9d2f5', gray: '#d5d8e0' };
const DEF_W = 240, DEF_H = 200, MIN_W = 170, MIN_H = 80, HEAD_H = 30;
const MAX_TEXT = 20000, MAX_HTML = 100000;

let opts = null;                 // { file(), hidden(), petDisplay() }
let list = [];
const wins = new Map();          // id → BrowserWindow
const quiet = new Set();         // 우리가 setBounds 하는 동안은 moved · resized 를 저장하지 않는다
let saveTimer = null;
let quitting = false;
app.on('before-quit', () => { quitting = true; });

const find = (id) => list.find((n) => n.id === id);
const idOf = (sender) => { for (const [id, w] of wins) if (!w.isDestroyed() && w.webContents === sender) return id; return null; };

function saveNow() {
  clearTimeout(saveTimer);
  saveTimer = null;
  try { notesStore.saveNotes(opts.file(), list); } catch (e) { console.error('[notes] 저장 실패:', e.message); }
}
/** 글 · 자리처럼 자주 바뀌는 건 모아서 쓴다 */
function saveSoon() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(saveNow, 400);
}
function flush() { if (saveTimer) saveNow(); }

/** 새 메모 기본 자리 — 캐릭터 모니터 오른쪽 위에서 왼쪽으로 줄지어 */
function defaultSpot(n) {
  const wa = opts.petDisplay().workArea;
  return {
    x: wa.x + wa.width - 300 - (DEF_W + 14) * (1 + (n % 4)),
    y: wa.y + 24 + 34 * Math.floor(n / 4),
  };
}

/** 어느 화면에도 안 걸쳐 있으면(모니터를 뺐을 때) 캐릭터 모니터로 데려온다. 걸쳐 있으면 머리줄이 잡히게만 맞춘다 */
function onScreen(b) {
  const hit = screen.getAllDisplays().some((d) => {
    const a = d.workArea;
    return b.x + b.width > a.x + 40 && b.x < a.x + a.width - 40 && b.y >= a.y - 4 && b.y < a.y + a.height - 24;
  });
  return hit ? null : defaultSpot(0);
}

function boundsOf(n) {
  return { x: Math.round(n.x), y: Math.round(n.y), width: Math.round(n.w || DEF_W), height: n.collapsed ? HEAD_H : Math.round(n.h || DEF_H) };
}

/**
 * 배율이 다른 모니터에선 첫 setBounds 가 어긋날 수 있어 두 번 맞춘다 (main.js moveToDisplay 와 같은 이유).
 * 그래도 배율 150% 같은 화면에선 틀 없는 창이 달라는 것보다 1~2px 크게 잡혀서 (켤 때마다 조금씩 커진다),
 * 실제로 잡힌 크기를 보고 그만큼 덜 달라고 다시 맞춘다.
 */
function applyBounds(id, w, b) {
  quiet.add(id);
  w.setBounds(b);
  w.setBounds(b);
  let ask = { ...b };
  for (let i = 0; i < 3; i++) {
    const got = w.getBounds();
    const d = { x: got.x - b.x, y: got.y - b.y, width: got.width - b.width, height: got.height - b.height };
    if (!d.x && !d.y && !d.width && !d.height) break;
    ask = { x: ask.x - d.x, y: ask.y - d.y, width: ask.width - d.width, height: ask.height - d.height };
    w.setBounds(ask);
  }
  setTimeout(() => quiet.delete(id), 300);
}

function create(n, focus) {
  if (n.x == null || n.y == null) Object.assign(n, defaultSpot(list.indexOf(n)), { abs: true });
  const moved = onScreen(boundsOf(n));
  if (moved) Object.assign(n, moved);
  const b = boundsOf(n);
  const w = new BrowserWindow({
    ...b,
    minWidth: MIN_W,
    minHeight: n.collapsed ? HEAD_H : MIN_H,
    frame: false,
    resizable: true,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    skipTaskbar: true,
    alwaysOnTop: true,
    show: false,
    backgroundColor: COLORS[n.color] || COLORS.yellow,
    webPreferences: {
      preload: path.join(__dirname, 'preload-note.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  wins.set(n.id, w);
  w.loadFile(path.join(__dirname, 'renderer', 'note.html'));
  w.once('ready-to-show', () => {
    applyBounds(n.id, w, boundsOf(n));
    // 밖에서 넣은 메모 · 켤 때 다시 뜨는 메모는 지금 쓰던 창의 포커스를 뺏지 않는다
    if (focus) { w.show(); w.focus(); } else w.showInactive();
  });
  const keep = () => {
    if (quiet.has(n.id) || w.isDestroyed()) return;
    const cur = w.getBounds();
    n.x = cur.x; n.y = cur.y; n.w = cur.width; n.abs = true;
    if (!n.collapsed) n.h = cur.height;
    saveSoon();
  };
  w.on('moved', keep);
  w.on('resized', keep);
  // Alt+F4 · 머리줄 오른쪽 버튼의 닫기도 메모의 × 와 같게 — 창만 닫고 메모는 남긴다 (우리가 치울 땐 destroy 라 여길 안 탄다)
  w.on('close', (e) => {
    if (quitting) return;
    e.preventDefault();
    setImmediate(() => close(n.id));
  });
  w.on('closed', () => { if (wins.get(n.id) === w) wins.delete(n.id); });
  // 틀 없는 창엔 오른쪽 버튼 메뉴가 없다 — 붙여넣기 정도는 있어야 한다
  w.webContents.on('context-menu', (_e, p) => {
    if (!p.isEditable && !p.selectionText) return;
    Menu.buildFromTemplate([
      { label: '잘라내기', role: 'cut', enabled: p.isEditable && !!p.selectionText },
      { label: '복사', role: 'copy', enabled: !!p.selectionText },
      { label: '붙여넣기', role: 'paste', enabled: p.isEditable },
      { type: 'separator' },
      { label: '모두 선택', role: 'selectAll' },
    ]).popup({ window: w });
  });
  return w;
}

function destroy(id) {
  const w = wins.get(id);
  wins.delete(id);
  if (w && !w.isDestroyed()) w.destroy();
}

/** 목록과 창을 맞춘다 — 없는 창은 띄우고, 지워진 메모의 창은 닫는다. focusId 는 방금 사람이 만든 메모 */
function sync(focusId) {
  for (const id of [...wins.keys()]) if (opts.hidden() || !find(id) || find(id).closed) destroy(id);
  if (opts.hidden()) return;
  for (const n of list) if (!n.closed && !wins.has(n.id)) create(n, n.id === focusId);
}

function init(o) {
  opts = o;
  list = notesStore.loadNotes(opts.file()).filter((n) => n && typeof n.id === 'string');
  // 옛 형식 — 캐릭터 모니터 안 좌표를 화면 좌표로 (한 번만)
  let changed = false;
  const base = opts.petDisplay().bounds;
  for (const n of list) {
    n.text = String(n.text || '');
    if (n.abs) continue;
    if (n.x != null && n.y != null) { n.x += base.x; n.y += base.y; }
    n.abs = true;
    changed = true;
  }
  if (changed) saveNow();
  sync();
}

/**
 * 메모 하나 붙이기. at = { x, y } 화면 좌표(없으면 기본 자리), focus = 사람이 직접 만든 것(바로 쓸 수 있게 포커스)
 */
function add({ text = '', color = 'yellow', at = null, focus = false } = {}) {
  const n = {
    id: 'n' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5),
    text: String(text).slice(0, MAX_TEXT),
    color: COLORS[color] ? color : 'yellow',
    x: at ? Math.round(at.x) : null,
    y: at ? Math.round(at.y) : null,
    collapsed: false,
    abs: true,
  };
  list.push(n);
  sync(focus ? n.id : null);
  saveNow();
  return n.id;
}

function remove(id) {
  list = list.filter((n) => n.id !== id);
  destroy(id);
  saveNow();
}

/** 닫기 — 창만 치우고 메모는 남긴다. 빈 메모는 남길 게 없으니 지운다 */
function close(id) {
  const n = find(id);
  if (!n) return;
  if (!n.text.trim()) { remove(id); return; }
  n.closed = true;
  destroy(id);
  saveNow();
}
/** 닫은 메모 다시 열기 (id 없으면 전부) */
function reopen(id) {
  for (const n of list) if (n.closed && (!id || n.id === id)) delete n.closed;
  sync(id || null);
  saveNow();
}
/** 트레이 "닫은 메모" 목록 — [{ id, title }] */
const closedList = () => list.filter((n) => n.closed).map((n) => ({ id: n.id, title: (n.text.trim().split(/\r?\n/)[0] || '메모').slice(0, 30) }));

/** 숨기기를 켜고 끌 때 — 설정은 부르는 쪽이 이미 바꿨다 */
function setHidden() {
  flush();
  sync();
}

/** 모니터가 빠지거나 해상도가 바뀌면 화면 밖에 남은 메모를 데려온다 */
function rescue() {
  for (const n of list) {
    const w = wins.get(n.id);
    if (!w || w.isDestroyed()) continue;
    const spot = onScreen(w.getBounds());
    if (!spot) continue;
    Object.assign(n, spot);
    applyBounds(n.id, w, boundsOf(n));
    saveSoon();
  }
}

// ── 메모 창이 부르는 것 ──────────────────────────────────────
ipcMain.handle('note:init', (e) => {
  const n = find(idOf(e.sender));
  return n ? { text: n.text, html: typeof n.html === 'string' ? n.html : null, color: n.color, collapsed: !!n.collapsed, colors: COLORS } : null;
});
/** { text, html } — text 는 서식 없는 글(접힌 제목 · 닫은 메모 목록 · 밖에서 읽기용), html 은 서식 든 본문 */
ipcMain.on('note:text', (e, c) => {
  const n = find(idOf(e.sender));
  if (!n || !c) return;
  n.text = String(c.text || '').slice(0, MAX_TEXT);
  const html = String(c.html || '');
  if (html && html.length <= MAX_HTML) n.html = html; else delete n.html;
  saveSoon();
});
ipcMain.on('note:close', (e) => {
  const id = idOf(e.sender);
  if (id) close(id);
});
ipcMain.on('note:color', (e, color) => {
  const n = find(idOf(e.sender));
  if (!n || !COLORS[color]) return;
  n.color = color;
  wins.get(n.id)?.setBackgroundColor(COLORS[color]);
  saveNow();
});
ipcMain.on('note:collapse', (e, v) => {
  const n = find(idOf(e.sender));
  const w = n && wins.get(n.id);
  if (!w) return;
  n.collapsed = !!v;
  w.setMinimumSize(MIN_W, n.collapsed ? HEAD_H : MIN_H);
  applyBounds(n.id, w, boundsOf(n));
  saveNow();
});
ipcMain.on('note:remove', (e) => {
  const id = idOf(e.sender);
  if (id) remove(id);
});
/** 메모의 + — 이 메모 옆에 새 메모 */
ipcMain.on('note:new', (e) => {
  const n = find(idOf(e.sender));
  if (!n) return;
  add({ color: n.color, at: { x: n.x + 28, y: n.y + 28 }, focus: true });
});

module.exports = { init, add, remove, close, reopen, closedList, sync, setHidden, rescue, flush, count: () => list.length, COLORS };
