const { app, BrowserWindow, screen, ipcMain, Tray, Menu, nativeImage, shell, Notification, dialog, globalShortcut } = require('electron');
const path = require('path');
const fs = require('fs');
const { pathToFileURL } = require('url');
const settings = require('./settings');
const notify = require('./notify-server');
const pmd = require('./pmd');

// 윈도우 전용(PowerShell 훅 · 창 앞으로 · deskpet.ps1)은 맥에서 건너뛴다
const IS_WIN = process.platform === 'win32';
const IS_MAC = process.platform === 'darwin';
const claudeHooks = require('./claude-hooks');
const psScripts = require('./ps-scripts');
const notesStore = require('./notes-store');
const editorWindow = require('./editor-window');
const updater = require('./updater');
const clipHistory = require('./clipboard-history');
const shortcutsStore = require('./shortcuts-store');
const palette = require('./palette-window');
const settingsWindow = require('./settings-window');
const makerWindow = require('./maker-window');

const DEV = process.argv.includes('--dev');

/** Claude Code 훅이 부르는 스크립트 (연결할 때 만든다). 이름의 'deskpet' 이 우리 훅 표식이다 */
const claudeHookScript = () => path.join(app.getPath('userData'), 'deskpet-claude-hook.ps1');

/**
 * 캐릭터는 두 곳에서 읽는다.
 *  1) 앱에 동봉된 것 — 자체 제작 기본 캐릭터
 *  2) 사용자가 넣은 것 — %APPDATA%/deskpet/characters
 * 패키징하면 앱 내부는 asar 안이라 손댈 수 없으므로, 캐릭터를 추가하려면
 * 2번이 필요하다. 같은 이름이면 사용자 쪽이 이긴다.
 */
const BUNDLED_CHAR_DIR = path.join(__dirname, '..', 'characters');
const userCharDir = () => path.join(app.getPath('userData'), 'characters');
const charDirs = () => [userCharDir(), BUNDLED_CHAR_DIR];

/** Spine 런타임도 동봉본 → 사용자 폴더 순으로 찾는다 */
function spineRuntimePath() {
  const candidates = [
    path.join(app.getPath('userData'), 'vendor', 'spine', 'spine-webgl.js'),
    path.join(__dirname, '..', 'vendor', 'spine', 'spine-webgl.js'),
  ];
  return candidates.find((p) => fs.existsSync(p)) || null;
}

/** --character=이름 으로 지정, 없으면 저장된 설정 → 설치된 첫 캐릭터 */
const argChar = (process.argv.find((a) => a.startsWith('--character=')) || '').split('=')[1];
let currentCharacter = argChar || null;

/** 캐릭터 폴더의 실제 경로를 찾는다 (사용자 폴더 우선) */
function charPath(id) {
  for (const base of charDirs()) {
    const p = path.join(base, id);
    if (fs.existsSync(path.join(p, 'character.json'))) return p;
  }
  return null;
}

function listCharacters() {
  const seen = new Map();
  for (const base of charDirs()) {
    let entries = [];
    try {
      entries = fs.readdirSync(base, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const e of entries) {
      if (!e.isDirectory() || seen.has(e.name)) continue;
      const f = path.join(base, e.name, 'character.json');
      if (!fs.existsSync(f)) continue;
      try {
        const m = JSON.parse(fs.readFileSync(f, 'utf8'));
        // "hidden": true 인 캐릭터는 목록에서 뺀다 (지우지 않고 잠시 치워 둘 때)
        if (m.hidden) { seen.set(e.name, null); continue; }
        seen.set(e.name, { id: e.name, name: m.name || e.name, renderer: m.renderer || 'parts', user: base === userCharDir() });
      } catch { /* 깨진 매니페스트는 건너뛴다 */ }
    }
  }
  // 빌드 프리셋의 onlyCharacters 가 있으면 앱에 든 캐릭터는 그것만 보인다 — 공용 빌드 설정 때문에
  // 기본 캐릭터가 같이 따라 들어가도 목록에는 안 나오게. 사용자 폴더의 캐릭터(받은 것 · 직접 넣은 것)는 늘 보인다
  const only = settings.load().onlyCharacters;
  const list = [...seen.values()].filter(Boolean);
  if (Array.isArray(only) && only.length) {
    const picked = list.filter((c) => c.user || only.includes(c.id));
    if (picked.length) return picked;
  }
  return list;
}

/**
 * 캐릭터 하나를 통째로 읽어서 렌더러로 보낸다.
 * file:// XHR 은 Chromium이 막으므로 파일을 직접 실어 보낸다 (프로토콜 등록 불필요).
 */
/** 크기 배율 (설정에 저장된다) */
const SIZES = [
  { label: '작게', value: 0.6 },
  { label: '보통', value: 1 },
  { label: '크게', value: 1.45 },
];
const sizeScale = () => settings.load().sizeScale || 1;

function loadCharacter(id) {
  const dir = charPath(id);
  if (!dir) throw new Error('캐릭터를 찾을 수 없다: ' + id);
  const manifest = JSON.parse(fs.readFileSync(path.join(dir, 'character.json'), 'utf8'));
  const out = { id, ...manifest, files: {} };
  out.height = Math.round((manifest.height || 150) * sizeScale());

  if (manifest.renderer === 'spine') {
    const atlasText = fs.readFileSync(path.join(dir, manifest.atlas), 'utf8');
    out.files.atlas = atlasText;
    out.files.skeleton = fs.readFileSync(path.join(dir, manifest.skeleton)).toString('base64');

    // 아틀라스가 참조하는 png들을 data URL로 (아틀라스 문법: 빈 줄 뒤 파일명)
    out.files.textures = {};
    for (const line of atlasText.split(/\r?\n/)) {
      const t = line.trim();
      if (/\.(png|jpg|jpeg)$/i.test(t) && !out.files.textures[t]) {
        const p = path.join(dir, t);
        if (fs.existsSync(p)) {
          const ext = path.extname(t).slice(1).toLowerCase();
          out.files.textures[t] =
            `data:image/${ext === 'jpg' ? 'jpeg' : ext};base64,` + fs.readFileSync(p).toString('base64');
        }
      }
    }
  }
  if (manifest.renderer === 'sprite') {
    // 시트 이미지를 data URL 로 (시트 이름 → 이미지)
    out.files.sheets = {};
    for (const [name, def] of Object.entries(manifest.sheets || {})) {
      const p = path.join(dir, def.file);
      if (!fs.existsSync(p)) continue;
      const ext = path.extname(def.file).slice(1).toLowerCase();
      out.files.sheets[name] =
        `data:image/${ext === 'jpg' ? 'jpeg' : ext};base64,` + fs.readFileSync(p).toString('base64');
    }
  }
  return out;
}

/** @type {BrowserWindow|null} */
let win = null;
/** @type {Tray|null} */
let tray = null;

/**
 * 캐릭터가 돌아다닐 모니터.
 * 설정의 display(모니터 id)를 쓰고, 그 모니터가 빠졌으면 주 모니터로 돌아간다.
 */
function targetDisplay() {
  const id = settings.load().display;
  return screen.getAllDisplays().find((d) => d.id === id) || screen.getPrimaryDisplay();
}

/**
 * 모니터 목록 — 왼쪽부터 번호를 붙인다.
 * 윈도우 설정의 "1 · 2 · 3" 번호는 앱에서 알 수 없어서, 위치와 해상도로 구분하게 한다.
 */
function displayList() {
  const primary = screen.getPrimaryDisplay().id;
  const cur = targetDisplay().id;
  return screen.getAllDisplays()
    .slice()
    .sort((a, b) => a.bounds.x - b.bounds.x || a.bounds.y - b.bounds.y)
    .map((d, i) => ({
      id: d.id,
      label: '모니터 ' + (i + 1) + ' · ' + (d.label ? d.label + ' · ' : '') + Math.round(d.size.width * d.scaleFactor) + '×' +
        Math.round(d.size.height * d.scaleFactor) + (d.id === primary ? ' (주)' : ''),
      current: d.id === cur,
    }));
}

/** 창을 다른 모니터로 옮기고 펫들을 그쪽 가운데에 다시 떨어뜨린다 */
function moveToDisplay(id) {
  const d = screen.getAllDisplays().find((x) => x.id === id);
  if (!d || !win) return;
  settings.save({ display: d.id });
  // 배율(DPI)이 다른 모니터로 옮기면 첫 setBounds 는 크기가 어긋날 수 있어서 두 번 맞춘다
  win.setBounds(d.bounds);
  win.setBounds(d.bounds);
  // 캔버스 해상도·무대가 모니터마다 달라서 새로 부팅하는 게 가장 확실하다
  win.reload();
}

/** 캐릭터가 서 있을 무대(= 고른 모니터 전체) 정보를 계산한다. */
function getStage() {
  const display = targetDisplay();
  const { bounds, workArea } = display;
  return {
    // 창은 모니터 전체를 덮으므로, 창 로컬 좌표 = 화면 좌표 - bounds 원점
    width: bounds.width,
    height: bounds.height,
    // 작업 표시줄 윗변 = 캐릭터가 걸어다닐 바닥선
    ground: workArea.y + workArea.height - bounds.y,
    workTop: workArea.y - bounds.y,
    workLeft: workArea.x - bounds.x,
    workRight: workArea.x + workArea.width - bounds.x,
  };
}

function createWindow() {
  const { bounds } = targetDisplay();

  win = new BrowserWindow({
    x: bounds.x,
    y: bounds.y,
    width: bounds.width,
    height: bounds.height,
    transparent: true,
    frame: false,
    resizable: false,
    movable: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    skipTaskbar: true,
    hasShadow: false,
    // 캐릭터를 클릭해도 지금 작업 중인 창의 포커스를 뺏지 않는다
    focusable: false,
    alwaysOnTop: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      backgroundThrottling: false,
    },
  });

  // 'screen-saver' 레벨이라야 대부분의 always-on-top 창보다 위로 온다
  win.setAlwaysOnTop(true, 'screen-saver');
  // 맥: 데스크톱(Spaces)을 넘겨도 · 전체화면 앱 위에서도 보이게
  if (IS_MAC) win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  // 기본은 클릭 통과. forward:true 덕분에 renderer는 mousemove를 계속 받는다.
  win.setIgnoreMouseEvents(true, { forward: true });
  // 새로고침(모니터 이동·크기 변경)할 때마다 클릭 통과로 되돌린다. 렌더러는 새로 부팅하며
  // "클릭 안 받음"에서 시작하는데, 메뉴를 누르던 중의 "받음" 상태가 남아 있으면
  // 그 모니터 전체의 클릭을 이 창이 먹어 버린다.
  win.webContents.on('did-start-loading', () => win?.setIgnoreMouseEvents(true, { forward: true }));
  // 커서 좌표는 바뀔 때만 보내는데, 렌더러가 뜨기 전에 보낸 값은 버려진다.
  // 로드가 끝나면 한 번 다시 보내게 해서 마우스를 안 움직여도 커서 위치를 알게 한다.
  win.webContents.on('did-finish-load', () => { lastCursor = ''; });

  const flags = ['trace', 'hitbox'].filter((f) => process.argv.includes('--' + f));
  if (/^\d+$/.test(process.env.DESKPET_FPS || '')) flags.push('fps=' + process.env.DESKPET_FPS);   // 측정용 — 프레임 고정
  win.loadFile(path.join(__dirname, 'renderer', 'index.html'), flags.length ? { search: flags.join('&') } : {});

  // 렌더러 콘솔을 터미널로 넘긴다 (투명 창이라 오류를 눈으로 볼 수 없다)
  win.webContents.on('console-message', (...args) => {
    const e = args[0];
    const msg = e && typeof e === 'object' && 'message' in e
      ? `${e.message} (${e.sourceId}:${e.lineNumber})`   // Electron 신버전
      : `${args[2]} (${args[4]}:${args[3]})`;            // 구버전 시그니처
    console.log('[renderer]', msg);
  });

  if (DEV) win.webContents.openDevTools({ mode: 'detach' });

  // 개발용: 창 내용만 PNG로 저장하고 종료 (--shot=경로[,지연ms])
  // 화면 캡처와 달리 다른 창에 가려지지 않아 우리가 그린 것만 정확히 보인다.
  const shot = (process.argv.find((a) => a.startsWith('--shot=')) || '').split('=')[1];
  if (shot) {
    const [shotPath, delay] = shot.split(',');
    win.webContents.once('did-finish-load', () => {
      setTimeout(async () => {
        try {
          const img = await win.webContents.capturePage();
          fs.writeFileSync(shotPath, img.toPNG());
          console.log('[shot] 저장됨:', shotPath, img.getSize());
        } catch (e) {
          console.error('[shot] 실패:', e.message);
        }
        app.quit();
      }, parseInt(delay || '4000', 10));
    });
  }

  // 특정 동작을 바로 확인하고 싶을 때: electron . --start=climb
  const start = (process.argv.find((a) => a.startsWith('--start=')) || '').split('=')[1];
  if (start) {
    win.webContents.once('did-finish-load', () => {
      setTimeout(() => win?.webContents.send('pet:command', start), 400);
    });
  }

  win.on('closed', () => { win = null; });
}

/**
 * 트레이 메뉴는 열 때마다 새로 만든다.
 * 한 번 만들어 두면 좌클릭 메뉴로 캐릭터·크기를 바꿔도 체크 표시가 그대로 남고,
 * 사용자 폴더에 새로 넣은 캐릭터도 재시작 전까지 목록에 안 뜬다.
 */
function buildTrayMenu() {
  const chars = listCharacters();
  return Menu.buildFromTemplate([
    // 놓친 알림 — 트레이에 빨간 점이 있을 때 여기서 바로 목록을 연다
    { label: inboxUnread ? '🔔 놓친 알림 ' + inboxUnread + '개 보기' : '최근 알림 보기', click: () => win?.webContents.send('pet:command', 'inbox') },
    { type: 'separator' },
    { label: ('빠른 메모  ' + hotkeyLabel('memo')).trim(), click: () => palette.open('memo') },
    { label: ('클립보드 기록  ' + hotkeyLabel('clip')).trim(), click: () => palette.open('clip') },
    { label: ('바로가기  ' + hotkeyLabel('links')).trim(), click: () => palette.open('links') },
    { type: 'separator' },
    { label: '할 일 추가…', click: () => win?.webContents.send('pet:command', 'todo:add') },
    { label: '지금 할 일 정리해줘', click: () => sendRecap('manual') },
    // 화면 공유 · 회의 때 — 캐릭터를 못 잡아도 여기서 숨길 수 있게
    { label: '메모 · 할 일 카드 숨기기', type: 'checkbox', checked: !!settings.load().notesHidden, click: (it) => setNotesHidden(it.checked) },
    { type: 'separator' },
    {
      label: '캐릭터',
      submenu: chars.map((c) => ({
        label: c.name + (c.renderer === 'parts' ? ' (파츠)' : ''),
        type: 'radio',
        checked: c.id === currentCharacter,
        click: () => {
          currentCharacter = c.id;
          settings.save({ character: c.id });
          win?.reload();      // 렌더러가 부팅하며 새 캐릭터를 불러온다
        },
      })),
    },
    {
      // 도망가기 중엔 캐릭터를 못 잡으니 여기서도 끌 수 있게 남겨 둔다
      label: '커서',
      submenu: [['none', '신경 안 쓰기'], ['chase', '쫓아오기'], ['flee', '도망가기']].map(([m, label]) => ({
        label,
        type: 'radio',
        checked: (settings.load().cursorMode || 'none') === m,
        click: () => { settings.save({ cursorMode: m }); sendPetPrefs(); },
      })),
    },
    { label: '가운데로 불러오기', click: () => win?.webContents.send('pet:command', 'recall') },
    { type: 'separator' },
    { label: '설정…', click: () => openSettings() },
    { label: updateInfo ? '⬆ 업데이트 v' + updateInfo.version + '…' : '업데이트 확인 (지금 v' + app.getVersion() + ')', click: () => (updateInfo ? promptUpdate() : checkUpdate(true)) },
    ...(app.isPackaged ? [] : [{ label: '개발자 도구', click: () => win?.webContents.openDevTools({ mode: 'detach' }) }]),
    { type: 'separator' },
    { label: '종료', click: () => { app.quit(); } },
  ]);
}

function createTray() {
  tray = new Tray(trayImage());
  tray.setToolTip('DeskPet');
  // setContextMenu 대신 열 때마다 최신 상태로 띄운다
  const popup = () => tray.popUpContextMenu(buildTrayMenu());
  tray.on('right-click', popup);
  tray.on('click', popup);
}

/**
 * 리마인더 스케줄러.
 * 20초마다 훑어서 시간이 된 것을 말풍선으로 띄운다.
 * at 이 "HH:MM" 이면 매일, 숫자면 그 시각(epoch ms)에 한 번.
 */
// ════════════════════════════════════════════════════════════
//  할 일 · 정각 recap · 메모
// ════════════════════════════════════════════════════════════
/**
 * 할 일은 userData 의 todo.md (마크다운 체크리스트) — 앱 밖에서 고쳐도 된다 (메모장 · Claude Code).
 * 폴더를 지켜보다가 바뀌면 다시 읽어서 렌더러에 보낸다. 에디터는 임시 파일에 쓰고 이름을 바꾸는
 * 경우가 많아서 파일이 아니라 폴더를 본다. 한 번 저장에 이벤트가 여러 번 오므로 300ms 모아서 읽는다.
 *
 * recap: 정해 둔 간격(기본 60분)마다 정각 기준으로, 근무 시간(기본 평일 9~18시)에만
 * 캐릭터가 남은 할 일을 말해 준다. 설정 recap = { every, from, to, weekdays } (every 0 = 끔)
 */
const todoFile = () => path.join(app.getPath('userData'), 'todo.md');
const notesFile = () => path.join(app.getPath('userData'), 'notes.json');
const RECAP_DEFAULT = { every: 60, from: 9, to: 18, weekdays: true };
const recapCfg = () => ({ ...RECAP_DEFAULT, ...(settings.load().recap || {}) });

let todo = { items: [], exists: false };
let todoWatcher = null;
let todoTimer = null;

/** 다시 읽고, 새로 끝낸 항목을 오늘 끝낸 수에 더한 뒤 렌더러에 알린다 */
function refreshTodo() {
  makeRepeats();
  // 구역까지 넣어 짝짓는다 — 반복 틀과 그날 만든 항목은 제목이 같다
  const key = (x) => (x.date || (x.inRepeat ? '반복' : '언젠가')) + '|' + x.text;
  const prev = new Map(todo.items.map((x) => [key(x), x.done]));
  todo = notesStore.load(todoFile());
  const newlyDone = todo.items.filter((x) => x.done && !x.inRepeat && prev.get(key(x)) === false).length;   // 반복 틀 체크(쉬기)는 빼고
  if (newlyDone) {
    const today = new Date().toDateString();
    const log = settings.load().todoDone || {};
    settings.save({ todoDone: { date: today, n: (log.date === today ? log.n : 0) + newlyDone } });
  }
  win?.webContents.send('pet:todo', todoState());
  return todoState();
}

/**
 * 반복 할 일 — 오늘에 해당하는 틀을 오늘 구역에 넣는다. 오늘 만든 제목은 설정(repeatMade)에 적어 두어
 * 사용자가 지우거나 옮긴 걸 같은 날 다시 만들지 않는다. 파일이 바뀌면 지켜보기가 다시 부르지만 made 때문에 돌지 않는다.
 */
function makeRepeats() {
  try {
    const today = notesStore.ymd(new Date());
    const prev = settings.load().repeatMade || {};
    const r = notesStore.materialize(todoFile(), new Date(), prev.date === today ? prev.texts : []);
    if (prev.date !== today || r.added.length) settings.save({ repeatMade: { date: today, texts: r.made } });
    if (r.added.length) console.log('[todo] 반복 할 일 넣음', r.added.length);
  } catch (e) {
    console.error('[todo] 반복 만들기 실패:', e.message);
  }
}

function todoState() {
  const log = settings.load().todoDone || {};
  return {
    items: todo.items,
    categories: todo.categories || [],
    today: notesStore.ymd(new Date()),
    doneToday: log.date === new Date().toDateString() ? log.n : 0,
    file: todoFile(),
    recap: recapCfg(),
  };
}

function watchTodo() {
  const dir = path.dirname(todoFile());
  const name = path.basename(todoFile());
  try {
    todoWatcher?.close();
    todoWatcher = fs.watch(dir, (_ev, f) => {
      if (f && f !== name) return;
      clearTimeout(todoTimer);
      todoTimer = setTimeout(refreshTodo, 300);
    });
    todoWatcher.on('error', () => setTimeout(watchTodo, 2000));   // 폴더가 잠깐 막히면 다시 건다
  } catch (e) {
    console.error('[todo] 지켜보기 실패:', e.message);
  }
}

/** recap 보내기 — reason: 'scheduled' | 'manual' */
/**
 * recap 보내기 — reason: 'scheduled' | 'manual'
 * 대상은 오늘 날짜의 안 끝낸 일 + 지난 날짜에서 밀린 일. 언젠가(백로그)는 개수만.
 */
function sendRecap(reason) {
  refreshTodo();
  const today = notesStore.ymd(new Date());
  const open = todo.items.filter((x) => !x.done && !x.backlog && x.date && x.date <= today)
    .map((x) => ({ text: x.text, date: x.date, due: x.due, category: x.category, late: x.date < today }));
  const todayAll = todo.items.filter((x) => x.date === today).length;
  const backlogOpen = todo.items.filter((x) => x.backlog && !x.done).length;
  console.log('[todo] recap', reason, '남은', open.length, '언젠가', backlogOpen);
  win?.webContents.send('pet:recap', {
    reason, open, todayAll, backlogOpen, total: todo.items.length, doneToday: todoState().doneToday, now: Date.now(),
  });
}

/**
 * 기한 알림 — 시각이 있는 안 끝낸 일은 10분 전 · 기한이 되면 한 번씩 말해 준다.
 * recap 과 달리 근무 시간 · 요일을 따지지 않는다 (기한을 적었다는 건 알려 달라는 뜻이라서).
 */
const dueFired = new Set();
function dueTick(now) {
  for (const it of todo.items) {
    if (it.done || !it.due || it.due.length < 16) continue;          // 시각이 있는 기한만
    const at = new Date(it.due.replace(' ', 'T') + ':00').getTime();
    const left = at - now.getTime();
    const key = (k) => k + '|' + it.due + '|' + it.text;
    if (left > 0 && left <= 10 * 60e3 && !dueFired.has(key('soon'))) {
      dueFired.add(key('soon'));
      const t = it.text + ' — ' + Math.ceil(left / 60e3) + '분 남음 (~' + it.due.slice(11) + ')';
      win?.webContents.send('pet:say', { text: t, source: '할 일', level: 'due', mood: 'alert', ms: 12000 });
      toast('할 일 기한 ' + Math.ceil(left / 60e3) + '분 전', it.text + ' (~' + it.due.slice(11) + ')');
    } else if (left <= 0 && left > -5 * 60e3 && !dueFired.has(key('now'))) {
      dueFired.add(key('now'));
      win?.webContents.send('pet:say', { text: it.text + ' — 기한이야 (~' + it.due.slice(11) + ')', source: '할 일', level: 'due', mood: 'alert', ms: 12000 });
      toast('할 일 기한', it.text + ' (~' + it.due.slice(11) + ')');
    }
  }
  if (dueFired.size > 500) dueFired.clear();
}

const recapFired = new Set();
function recapTick(now) {
  const r = recapCfg();
  if (!r.every) return;
  const day = now.getDay();
  if (r.weekdays && (day === 0 || day === 6)) return;
  const h = now.getHours(), m = now.getMinutes();
  if (h < r.from || h > r.to || (h === r.to && m > 0)) return;       // 9:00 ~ 18:00 (18:00 포함 — 퇴근 전 마지막 정리)
  if ((h * 60 + m) % r.every !== 0) return;
  const key = now.toDateString() + ' ' + h + ':' + m;
  if (recapFired.has(key)) return;
  recapFired.add(key);
  if (recapFired.size > 64) recapFired.delete(recapFired.values().next().value);
  sendRecap('scheduled');
}

/** 입력 창을 캐릭터가 있는 모니터에 띄운다 */
function openEditor(opts) {
  return editorWindow.open({ display: targetDisplay(), ...opts });
}

/** todo.md 를 기본 프로그램으로 — .md 연결이 없으면 메모장 */
async function openTodoFile() {
  notesStore.ensure(todoFile());
  const err = await shell.openPath(todoFile());
  if (err) require('child_process').spawn('notepad.exe', [todoFile()], { detached: true, stdio: 'ignore' }).unref();
}

function startReminderLoop() {
  const fired = new Set();       // 오늘 이미 울린 매일 리마인더
  let lastDay = new Date().getDate();

  setInterval(() => {
    const now = new Date();
    if (now.getDate() !== lastDay) {   // 날짜가 바뀌면 매일 항목 초기화
      fired.clear();
      lastDay = now.getDate();
      refreshTodo();               // 반복 할 일 · 오늘 날짜가 바뀐다
    }

    const cfg = settings.load();
    const list = cfg.reminders || [];
    let changed = false;

    for (const r of list) {
      if (typeof r.at === 'string') {
        const [h, m] = r.at.split(':').map(Number);
        const key = r.id + '@' + now.toDateString();
        if (now.getHours() === h && now.getMinutes() === m && !fired.has(key)) {
          fired.add(key);
          win?.webContents.send('pet:say', { text: r.text, mood: 'alert' });
        }
      } else if (!r.done && Date.now() >= r.at) {
        r.done = true;
        changed = true;
        win?.webContents.send('pet:say', { text: r.text, mood: 'alert' });
      }
    }
    if (changed) settings.save({ reminders: list.filter((r) => !r.done) });
    recapTick(now);
    dueTick(now);
  }, 20000);
}

/**
 * Claude Code 훅 이벤트 → 세션 현황 + 펫 반응.
 * 훅이 넘긴 JSON 을 해석해서 세션별 상태를 기억하고(메뉴의 세션 목록), 렌더러에
 * { kind, sid, project, sec, busy } 로 보낸다. 대사는 렌더러가 고른다.
 *
 *  SessionStart                → 세션 등록 (말 없음)
 *  UserPromptSubmit            → start       (일 시작 — 시각을 기억해 둔다)
 *  Stop                        → done        (CLAUDE_QUIET_SEC 보다 짧게 끝난 턴은 quick — 말 안 함)
 *  StopFailure                 → fail        (API 오류 등으로 끊김)
 *  Notification permission_prompt           → permission (허락 필요 — 커서 쪽으로 달려온다)
 *  Notification idle_prompt · agent_needs_input · elicitation_dialog → waiting
 *  SessionEnd                  → 세션 목록에서 뺀다
 *
 * Stop 은 짧은 대답에도 매번 오므로, 사용자가 터미널을 보고 있을 법한 짧은 턴은 조용히 넘긴다.
 *
 * 터미널 창: 앱이 모르는 세션이면 응답에 needWindow 를 실어 보낸다 → 훅이 자기 조상 프로세스를
 * 따라 올라가 창(Windows Terminal · VS Code · 콘솔)을 찾아 /claude-window 로 알려 준다.
 * 세션마다 처음 한 번만이라 훅이 매번 느려지지 않는다.
 */
const CLAUDE_QUIET_SEC = 20;
/** @type {Map<string, {sid, project, cwd, state, at, turnStart, win}>} */
const claudeSessions = new Map();
const WAITING_TYPES = ['idle_prompt', 'agent_needs_input', 'elicitation_dialog', 'elicitation_url_dialog'];

const busyCount = () => [...claudeSessions.values()].filter((s) => s.turnStart).length;

function onClaudeEvent(ev, kind) {
  const sid = String(ev.session_id || '');
  if (kind === 'window') {
    const s = claudeSessions.get(sid);
    if (s && ev.hwnd) { s.win = { pid: ev.pid, hwnd: String(ev.hwnd), name: ev.name }; s.winTries = 0; }
    console.log('[claude] 창 찾음:', s ? s.project : sid, ev.name, ev.hwnd);
    return null;
  }

  const name = ev.hook_event_name;
  const project = ev.cwd ? path.basename(String(ev.cwd)) : '';
  console.log('[claude]', name, ev.notification_type || '', project);

  // 12시간 넘게 소식 없는 세션은 치운다 (SessionEnd 를 놓친 경우)
  for (const [k, s] of claudeSessions) if (Date.now() - s.at > 12 * 3600e3) claudeSessions.delete(k);

  if (name === 'SessionEnd') {
    claudeSessions.delete(sid);
    win?.webContents.send('pet:claude', { kind: 'end', sid, project, busy: busyCount(), quiet: true });
    return null;
  }

  let s = claudeSessions.get(sid);
  if (!s) {
    s = { sid, project, cwd: ev.cwd || '', state: 'idle', at: Date.now(), turnStart: 0, win: null };
    claudeSessions.set(sid, s);
  }
  s.at = Date.now();
  if (project) s.project = project;

  let out = null;
  if (name === 'UserPromptSubmit') {
    s.state = 'working';
    s.turnStart = Date.now();
    out = { kind: 'start' };
  } else if (name === 'Stop') {
    const sec = s.turnStart ? Math.round((Date.now() - s.turnStart) / 1000) : null;
    s.state = 'done';
    s.turnStart = 0;
    out = { kind: sec != null && sec < CLAUDE_QUIET_SEC ? 'quick' : 'done', sec };
  } else if (name === 'StopFailure') {
    s.state = 'fail';
    s.turnStart = 0;
    out = { kind: 'fail' };
  } else if (name === 'Notification') {
    const t = ev.notification_type || '';
    const msg = String(ev.message || '');
    // notification_type 이 없는 옛 버전은 메시지로 짐작한다
    if (t === 'permission_prompt' || (!t && /permission/i.test(msg))) { s.state = 'permission'; out = { kind: 'permission' }; }
    else if (WAITING_TYPES.includes(t) || (!t && /waiting/i.test(msg))) { s.state = 'waiting'; out = { kind: 'waiting' }; }
  }
  if (out) {
    if (!settings.load().speakOnClaude && out.kind !== 'start') out.quiet = true;
    if (out.kind === 'permission') toast('Claude · ' + (s.project || '세션'), '허락이 필요해 — 눌러서 터미널로', sid);
    else if (out.kind === 'fail') toast('Claude · ' + (s.project || '세션'), '오류로 멈췄어 — 눌러서 터미널로', sid);
    win?.webContents.send('pet:claude', { ...out, sid, project: s.project, busy: busyCount() });
  }
  // 창을 아직 모르면 훅에게 찾아 달라고 한다
  // 창 찾기는 0.6초쯤 걸려서, 못 찾는 환경이면 세션당 두 번까지만 부탁한다
  if (s.win || s.winTries >= 2) return null;
  s.winTries = (s.winTries || 0) + 1;
  return { needWindow: sid };
}

/** 메뉴용 세션 목록 — 최근 소식 순 */
function claudeSessionList() {
  const now = Date.now();
  return [...claudeSessions.values()]
    .sort((a, b) => b.at - a.at)
    .map((s) => ({
      sid: s.sid, project: s.project, state: s.state, hasWindow: !!s.win,
      sec: Math.round((now - (s.state === 'working' && s.turnStart ? s.turnStart : s.at)) / 1000),
    }));
}

/**
 * 세션의 터미널 창을 앞으로 가져온다. 창 핸들은 훅이 찾아 둔 것.
 * 윈도우는 백그라운드 프로세스가 다른 창을 앞으로 올리는 걸 막아서, ALT 를 누른 채로
 * SetForegroundWindow 를 부르는 흔한 우회를 쓴다 (userData 의 deskpet-focus.ps1).
 */
/**
 * 결과 { ok, reason } — reason: nowindow(창을 아직 모름) · nosession(앱을 켠 뒤 그 세션 소식이 없음) ·
 * gone(창이 닫힘) · flash(윈도우가 막아서 작업 표시줄에서 깜빡이게만 함)
 */
function focusClaudeSession(sid) {
  if (!IS_WIN) return Promise.resolve({ ok: false });
  const s = claudeSessions.get(sid);
  console.log('[claude] 창 앞으로 요청:', sid.slice(0, 8), s ? s.project : '(세션 모름)', s && s.win ? s.win.name + ' ' + s.win.hwnd : '(창 모름)');
  if (!s) return Promise.resolve({ ok: false, reason: 'nosession' });
  if (!s.win) return Promise.resolve({ ok: false, reason: 'nowindow' });
  const script = path.join(app.getPath('userData'), 'deskpet-focus.ps1');
  try {
    fs.writeFileSync(script, psScripts.focusScript(), 'utf8');
  } catch (e) {
    return Promise.resolve({ ok: false, reason: e.message });
  }
  const { execFile } = require('child_process');
  return new Promise((resolve) => {
    execFile('powershell', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', script, '-Hwnd', s.win.hwnd],
      { windowsHide: true, timeout: 8000 }, (err, stdout) => {
        const r = String(stdout || '').trim();
        console.log('[claude] 창 앞으로 결과:', s.project, r || (err && err.message));
        if (r === 'gone') s.win = null;       // 창이 닫혔으면 다음 훅 때 다시 찾는다
        resolve({ ok: r === 'ok' || r === 'ok2', reason: r || 'error' });
      });
  });
}

function claudeStatus() {
  const cfg = settings.load();
  // 훅 스크립트가 PowerShell 이라 윈도우에서만 연결할 수 있다
  if (!IS_WIN) return { available: false, connected: false, speak: cfg.speakOnClaude !== false, toast: cfg.toastOn !== false };
  return {
    ...claudeHooks.status({ scriptPath: claudeHookScript() }),
    speak: cfg.speakOnClaude !== false,
    toast: cfg.toastOn !== false,
  };
}

/**
 * 윈도우 알림(토스트) — 메인 모니터 오른쪽 아래, 알림 센터에 남는다.
 * 급한 것만: Claude 허락 요청 · 오류, 할 일 기한, 빌드 실패. (작업 끝남은 말풍선만 — 잦아서)
 * 누르면 그 세션의 터미널로 (sid 가 있을 때).
 */
function toast(title, body, sid, onClick) {
  if (settings.load().toastOn === false || !Notification.isSupported()) return;
  try {
    const n = new Notification({ title, body, silent: false, icon: fs.existsSync(privateIconPath()) ? privateIconPath() : path.join(__dirname, '..', 'assets', 'icon.png') });
    // 윈도우는 시작 메뉴에 등록되지 않은 포터블 앱의 토스트 클릭을 앱에 잘 넘겨주지 않는다 — 들어오는지 로그로 본다
    n.on('click', () => console.log('[toast] 클릭:', title));
    if (onClick) n.on('click', onClick);
    else if (sid) n.on('click', () => focusClaudeSession(sid));
    n.show();
  } catch (e) {
    console.error('[toast] 실패:', e.message);
  }
}

/**
 * 트레이 아이콘 빨간 점 — 안 읽은 알림이 있으면 (렌더러가 개수를 알려 준다).
 * 작업 표시줄 버튼이 없는 창이라 깜빡일 수가 없어서 트레이로 대신한다.
 */
let trayIcons = null;
let inboxUnread = 0;           // 트레이 메뉴 맨 위 "놓친 알림 N개 보기"

/** 트레이 아이콘 — 맥 메뉴바는 18pt 가 적당하다 (32px 그대로면 크게 튄다) */
/**
 * 개인 아이콘 — userData/private-icon.png 가 있으면 트레이 · 윈도우 알림에 쓴다 (exe 아이콘은 개인 빌드가 넣는다).
 * 실행 중에 읽으므로 업데이트로 공개판이 돼도 트레이 아이콘은 그대로다.
 */
const privateIconPath = () => path.join(app.getPath('userData'), 'private-icon.png');
/** 개인 빌드에 아이콘이 들어 있으면 처음 켤 때 userData 로 꺼내 둔다 — 새 PC 에서도 트레이 · 알림 아이콘이 같고, 업데이트 뒤에도 남는다 */
function unpackPrivateIcon() {
  const bundled = path.join(__dirname, '..', 'private-icon.png');
  try {
    if (!fs.existsSync(privateIconPath()) && fs.existsSync(bundled)) {
      fs.mkdirSync(path.dirname(privateIconPath()), { recursive: true });
      fs.writeFileSync(privateIconPath(), fs.readFileSync(bundled));
      console.log('[app] 개인 아이콘 꺼냄');
    }
  } catch (e) {
    console.error('[app] 개인 아이콘 꺼내기 실패:', e.message);
  }
}
/**
 * 포터블 exe 는 켤 때마다 임시 폴더(%TEMP%\<무작위>)에 앱을 풀고, 정상으로 꺼지면 실행기가 지운다.
 * 강제 종료 · 전원 꺼짐이면 그 폴더(약 330MB)가 남는다 → 켤 때 지난 것들을 치운다.
 * 다른 DeskPet 이 쓰고 있는 폴더는 건드리지 않는다 — 실행 중인 exe 는 쓰기로 열 수 없다(EBUSY)는 걸로 가린다.
 * (폴더 이름 바꾸기는 실행 중에도 돼서 판단에 못 쓴다 — 2026-10-02 시험)
 */
function cleanStalePortable() {
  if (!IS_WIN || !app.isPackaged || !process.env.PORTABLE_EXECUTABLE_FILE) return;
  const mine = path.dirname(process.execPath);
  const tmp = path.dirname(mine);
  let names = [];
  try { names = fs.readdirSync(tmp); } catch { return; }
  let freed = 0;
  const rm = (p) => fs.promises.rm(p, { recursive: true, force: true }).catch(() => {});   // 몇 GB 일 수 있어 비동기로
  for (const n of names) {
    const dir = path.join(tmp, n);
    if (/^[0-9A-Za-z]{20,40}\.deskpet-old$/.test(n)) { rm(dir); continue; }      // 지난번에 다 못 지운 것
    if (dir.toLowerCase() === mine.toLowerCase() || !/^[0-9A-Za-z]{20,40}$/.test(n)) continue;
    try {
      if (!fs.existsSync(path.join(dir, 'DeskPet.exe')) || !fs.existsSync(path.join(dir, 'resources', 'app.asar'))) continue;
      if (Date.now() - fs.statSync(dir).mtimeMs < 10 * 60e3) continue;      // 막 풀리는 중일 수 있다
      fs.closeSync(fs.openSync(path.join(dir, 'DeskPet.exe'), 'r+'));       // 실행 중이면 여기서 실패한다 (EBUSY)
      const gone = dir + '.deskpet-old';
      fs.renameSync(dir, gone);
      rm(gone);
      freed++;
    } catch { /* 쓰는 중 · 권한 — 그대로 둔다 */ }
  }
  if (freed) console.log('[app] 지난 실행이 남긴 임시 폴더 지움:', freed + '개');
}
function trayImage() {
  const own = privateIconPath();
  if (fs.existsSync(own)) {
    const img = nativeImage.createFromPath(own);
    if (!img.isEmpty()) return img.resize({ width: IS_MAC ? 18 : 32, height: IS_MAC ? 18 : 32, quality: 'best' });
  }
  const img = nativeImage.createFromPath(path.join(__dirname, '..', 'assets', 'tray.png'));
  return IS_MAC ? img.resize({ width: 18, height: 18 }) : img;
}
function setTrayAlert(n) {
  inboxUnread = n;
  if (!tray) return;
  if (!trayIcons) {
    const base = trayImage();
    const { width: w, height: h } = base.getSize();
    const bmp = Buffer.from(base.toBitmap());           // BGRA
    const r = Math.max(3, Math.round(w * 0.22)), cx = w - r - 1, cy = r + 1;
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const d = Math.hypot(x - cx, y - cy);
        if (d > r + 0.5) continue;
        const o = (y * w + x) * 4;
        const edge = d > r - 1;                           // 흰 테두리로 아이콘과 떼어 보이게
        bmp[o] = edge ? 255 : 48; bmp[o + 1] = edge ? 255 : 62; bmp[o + 2] = edge ? 255 : 229; bmp[o + 3] = 255;
      }
    }
    trayIcons = { base, alert: nativeImage.createFromBitmap(bmp, { width: w, height: h }) };
  }
  tray.setImage(n ? trayIcons.alert : trayIcons.base);
  tray.setToolTip(n ? 'DeskPet — 놓친 알림 ' + n + '개' : 'DeskPet');
}

/**
 * 윈도우 시작 시 자동 실행.
 * 포터블 exe 는 실행할 때마다 임시 폴더에 풀려서 execPath 가 매번 바뀐다 →
 * electron-builder 가 넣어 주는 PORTABLE_EXECUTABLE_FILE(원래 exe 경로)을 등록해야 한다.
 * 개발 실행(electron .)은 등록하지 않는다.
 */
const loginExe = () => process.env.PORTABLE_EXECUTABLE_FILE || process.execPath;

// ════════════════════════════════════════════════════════════
//  업데이트 (src/updater.js)
// ════════════════════════════════════════════════════════════
/**
 * 켤 때 1분 뒤 · 그 뒤 3시간마다 GitHub Releases 를 본다. 새 버전이 있으면 알림 카드 + 윈도우 알림,
 * 누르면 확인 창 → "지금 업데이트" 면 받아서 바꿔 끼우고 다시 켠다. "이 버전 건너뛰기" 는 설정 updateSkip.
 */
const UPDATE_EVERY = 3 * 3600e3;
let updateInfo = null;          // 찾은 새 버전 { version, notes, url, asset }
let updating = false;

async function checkUpdate(manual) {
  if (!manual && settings.load().updateCheck === false) return;      // 설정 창에서 자동 확인을 껐으면
  try {
    const r = await updater.check(manual ? null : settings.load().updateSkip);
    const was = updateInfo && updateInfo.version;
    updateInfo = r;
    if (!r) {
      if (manual) win?.webContents.send('pet:say', { text: '지금이 최신이야 (v' + app.getVersion() + ')', ms: 3000, quiet: true });
      return;
    }
    console.log('[update] 새 버전', r.version, '(지금', app.getVersion() + ')');
    if (was === r.version && !manual) return;            // 같은 버전은 한 번만 알린다
    win?.webContents.send('pet:update', { version: r.version, current: app.getVersion() });
    toast('DeskPet 새 버전 v' + r.version, '눌러서 업데이트 (지금 v' + app.getVersion() + ')', null, () => promptUpdate());
  } catch (e) {
    console.error('[update] 확인 실패:', e.message);
    if (manual) win?.webContents.send('pet:say', { text: '업데이트를 확인하지 못했어… (' + e.message + ')', ms: 4000, quiet: true });
  }
}

/** 확인 창 — 지금 업데이트 / 나중에 / 이 버전 건너뛰기 */
async function promptUpdate() {
  if (updating) return;
  if (!updateInfo) return checkUpdate(true);
  const r = updateInfo;
  const can = updater.canInstall();
  const { response } = await dialog.showMessageBox({
    type: 'info',
    title: 'DeskPet 업데이트',
    message: '새 버전 v' + r.version + ' 이 나왔어요 (지금 v' + app.getVersion() + ')',
    detail: (r.notes ? r.notes + '\n\n' : '') + (can.ok
      ? '지금 업데이트하면 받아서 바꿔 끼운 뒤 다시 켜요. 캐릭터 · 설정 · 할 일은 그대로예요.'
      : can.why + ' — 릴리스 페이지를 열어요.'),
    buttons: [can.ok ? '지금 업데이트' : '릴리스 페이지 열기', '나중에', '이 버전 건너뛰기'],
    defaultId: 0,
    cancelId: 1,
    noLink: true,
  });
  if (response === 2) {
    settings.save({ updateSkip: r.version });
    win?.webContents.send('pet:say', { text: 'v' + r.version + ' 은 건너뛸게', ms: 2400, quiet: true });
    return;
  }
  if (response !== 0) return;
  updating = true;
  win?.webContents.send('pet:say', { text: 'v' + r.version + ' 받는 중…', source: 'DeskPet', level: 'update', ms: 60000, quiet: true });
  try {
    const res = await updater.install(r, (p) => {
      win?.webContents.send('pet:update-progress', Math.round(p * 100));
    });
    if (!res.ok) win?.webContents.send('pet:say', { text: res.why, ms: 6000, quiet: true });
  } catch (e) {
    console.error('[update] 설치 실패:', e.message);
    win?.webContents.send('pet:say', { text: '업데이트 실패… ' + e.message, source: 'DeskPet', level: 'fail', ms: 8000 });
  } finally {
    updating = false;
  }
}

/**
 * 새로 바뀐 것 — 버전이 올라간 뒤 처음 켤 때 한 번 (src/whatsnew.json).
 * 설정 lastVersion 과 비교해서 그 사이 버전들의 요약을 창으로 보여 준다.
 *  - lastVersion 이 없는데 설정 파일은 있었다 → 이 기능 전 버전에서 올라온 것 → 지금 버전 요약만
 *  - 설정 파일도 없었다 → 처음 설치 → 보여 주지 않는다
 */
function whatsNewBetween(from, to) {
  let data = {};
  try { data = require('./whatsnew.json'); } catch { /* 없으면 빈 것 */ }
  return Object.keys(data)
    .filter((v) => /^\d+\.\d+\.\d+$/.test(v) && (!from || updater.cmp(v, from) > 0) && updater.cmp(v, to) <= 0)
    .sort((a, b) => updater.cmp(b, a))
    .map((v) => ({ version: v, items: data[v] || [] }));
}

async function showWhatsNew(list, fromVersion) {
  if (!list.length) return;
  const cur = app.getVersion();
  const shown = list.slice(0, 4);                 // 여러 버전을 건너뛰었으면 최근 넷까지
  await dialog.showMessageBox({
    type: 'info',
    title: 'DeskPet — 새로 바뀐 것',
    message: fromVersion ? 'v' + fromVersion + ' → v' + cur + ' 에서 바뀐 것' : 'v' + cur + ' 에서 바뀐 것',
    detail: shown.map((v) => 'v' + v.version + '\n' + v.items.map((t) => '  • ' + t).join('\n')).join('\n\n') +
      (list.length > shown.length ? '\n\n… 그 전 버전 ' + (list.length - shown.length) + '개는 README 의 로드맵에' : ''),
    buttons: ['확인'],
    noLink: true,
  });
}

/** 켤 때 — 버전이 올라갔으면 보여 주고 lastVersion 을 지금 버전으로 */
function checkWhatsNew(hadSettings) {
  const cur = app.getVersion();
  const last = settings.load().lastVersion;
  let list = [];
  if (last && updater.cmp(cur, last) > 0) list = whatsNewBetween(last, cur);
  else if (!last && hadSettings) list = whatsNewBetween(null, cur).slice(0, 1);
  if (last !== cur) settings.save({ lastVersion: cur });
  if (!list.length) return;
  console.log('[whatsnew]', last || '(없음)', '→', cur, list.map((v) => v.version).join(','));
  // 캐릭터가 뜬 뒤에 (창이 먼저 뜨면 어색하다)
  const show = () => setTimeout(() => showWhatsNew(list, last), 3000);
  if (win && !win.webContents.isLoading()) show(); else win?.webContents.once('did-finish-load', show);
}

/** 업데이트로 새로 뜬 앱 — 옛 exe 정리, 자동 시작을 새 경로로, "업데이트했어" */
function afterUpdate() {
  updater.cleanupOld(process.argv);
  const from = (process.argv.find((a) => a.startsWith('--updated-from=')) || '').split('=')[1];
  const rep = process.argv.find((a) => a.startsWith('--replaced='));
  if (rep && app.isPackaged && process.platform === 'win32') {
    const old = rep.slice('--replaced='.length);
    try {
      if (app.getLoginItemSettings({ path: old }).openAtLogin) {
        app.setLoginItemSettings({ openAtLogin: false, path: old });
        app.setLoginItemSettings({ openAtLogin: true, path: loginExe() });
      }
    } catch { /* 없으면 그만 */ }
  }
  if (from) {
    win?.webContents.once('did-finish-load', () => setTimeout(() => {
      win?.webContents.send('pet:say', { text: 'v' + from + ' → v' + app.getVersion() + ' 업데이트했어', source: 'DeskPet', level: 'update', ms: 8000 });
    }, 2500));
  }
}
function autoStartStatus() {
  if (!app.isPackaged) return { available: false, on: false };
  return { available: true, on: app.getLoginItemSettings({ path: loginExe() }).openAtLogin };
}

/**
 * 설정(빌드의 preset.json)의 autoInstall 에 적힌 레시피 캐릭터가 아직 없으면 받아 온다.
 *   "autoInstall": ["pokemon/herdier"]   → tools/recipes/pokemon/herdier.json
 * 그림을 빌드에 넣지 않고 쓰는 사람 PC 에서 처음 켤 때 받기 위해서다 (지인용 맥 빌드).
 * 받는 동안은 있는 캐릭터가 알려 주고, 끝나면 새로고침해서 바로 보이게 한다.
 * 인터넷이 안 되면 다음에 켤 때 다시 시도한다.
 */
async function autoInstallCharacters(cfg) {
  // 받는 게 금방 끝나면 새로고침한 뒤에 "데려오는 중"이 늦게 뜬다 → 끝났으면 그 말은 버린다
  let busy = null;
  const say = (msg) => {
    if (!win) return;
    const send = () => { if (!msg.whileBusy || busy === msg.whileBusy) win?.webContents.send('pet:say', msg); };
    if (win.webContents.isLoading()) win.webContents.once('did-finish-load', () => setTimeout(send, 1500));
    else send();
  };
  let installed = 0;
  for (const rel of cfg.autoInstall || []) {
    let recipe;
    try {
      recipe = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'tools', 'recipes', rel + '.json'), 'utf8'));
    } catch (e) {
      console.error('[pmd] 레시피 없음:', rel, e.message);
      continue;
    }
    if (charPath(recipe.id)) continue;
    const name = (recipe.manifest && recipe.manifest.name) || recipe.id;
    busy = recipe.id;
    say({ text: name + ' 데려오는 중… 잠깐만!', mood: 'happy', ms: 6000, whileBusy: recipe.id });
    try {
      await pmd.importRecipe(recipe, path.join(userCharDir(), recipe.id), { log: (m) => console.log('[pmd] ' + m) });
      busy = null;
      installed++;
      console.log('[pmd] 설치됨:', recipe.id);
    } catch (e) {
      console.error('[pmd] 설치 실패:', recipe.id, e.message);
      busy = null;
      say({ text: name + '를 못 데려왔어. 인터넷 연결을 확인하고 다시 켜 줘', mood: 'alert', ms: 8000 });
    }
  }
  if (installed) win?.reload();      // 새 캐릭터로 다시 부팅
}

// 시험용 — 설정 폴더를 바꿔서 실행 중인 앱과 겹치지 않게 (중복 실행 잠금도 설정 폴더 기준이다)
if (process.env.DESKPET_USERDATA) app.setPath('userData', process.env.DESKPET_USERDATA);

/**
 * 로그 파일 — exe 로 돌 땐 콘솔이 안 보여서, 클릭 · 창 찾기 · 업데이트 같은 일을 userData/deskpet.log 에 남긴다.
 * (렌더러 콘솔도 메인으로 넘어오므로 같이 남는다) 1MB 를 넘으면 켤 때 deskpet.log.old 로 넘긴다.
 */
(function fileLog() {
  try {
    const file = path.join(app.getPath('userData'), 'deskpet.log');
    fs.mkdirSync(path.dirname(file), { recursive: true });
    if (fs.existsSync(file) && fs.statSync(file).size > 1048576) fs.renameSync(file, file + '.old');
    const out = fs.createWriteStream(file, { flags: 'a' });
    const stamp = () => { const d = new Date(); return d.toLocaleDateString('sv') + ' ' + d.toTimeString().slice(0, 8); };
    for (const k of ['log', 'warn', 'error']) {
      const orig = console[k].bind(console);
      console[k] = (...a) => {
        orig(...a);
        try {
          out.write(stamp() + (k === 'log' ? ' ' : ' ' + k.toUpperCase() + ' ') +
            a.map((x) => (typeof x === 'string' ? x : x instanceof Error ? x.stack : JSON.stringify(x))).join(' ') + '\n');
        } catch { /* 로그 실패는 무시 */ }
      };
    }
    console.log('[app] 시작 v' + app.getVersion(), process.platform, app.isPackaged ? 'exe' : 'dev', process.env.PORTABLE_EXECUTABLE_FILE || process.execPath);
    /*
     * 처리 안 된 오류 — Electron 은 기본으로 "A JavaScript error occurred in the main process" 창을 띄운다.
     * 타이머 안에서 나면 1초마다 창이 쌓인다 (2026-10-02 클립보드 기록에서 겪음). 상시 켜 두는 앱이라
     * 창 대신 로그에 남기고 계속 돈다. 같은 오류는 1분에 한 번만 적는다.
     */
    const seen = new Map();
    const report = (kind, e) => {
      const msg = (e && e.stack) || String(e);
      const key = msg.split('\n')[0];
      if (Date.now() - (seen.get(key) || 0) < 60e3) return;
      seen.set(key, Date.now());
      console.error('[app] ' + kind + ':', msg);
    };
    process.on('uncaughtException', (e) => report('처리 안 된 오류', e));
    process.on('unhandledRejection', (e) => report('처리 안 된 Promise 거부', e));
  } catch { /* 로그를 못 남겨도 앱은 돈다 */ }
})();

/**
 * GPU — 스프라이트 · 파츠 캐릭터는 2D 캔버스라 하드웨어 가속 없이도 그린다. 끄면 GPU 프로세스가 가벼워진다
 * (가볍게 만들기, ROADMAP). Spine 캐릭터는 WebGL 이라 켠다.
 * 설정 gpu: 'auto'(기본 — 주인공 · 동료 중 Spine 이 있을 때만 켬) | 'on' | 'off'. 앱이 뜨기 전에 정해야 한다.
 */
function wantGpu() {
  if (process.env.DESKPET_GPU) return process.env.DESKPET_GPU === 'on';     // 측정 · 시험용
  const cfg = settings.load();
  if (cfg.gpu === 'on') return true;
  if (cfg.gpu === 'off') return false;
  const ids = [cfg.character, cfg.companion].filter(Boolean);
  if (!ids.length) return false;                                              // 기본 캐릭터(파츠)
  return ids.some((id) => {
    const dir = charPath(id);
    if (!dir) return false;
    try { return JSON.parse(fs.readFileSync(path.join(dir, 'character.json'), 'utf8')).renderer === 'spine'; } catch { return false; }
  });
}
const gpuOn = wantGpu();
if (!gpuOn) app.disableHardwareAcceleration();

// 두 번 실행 방지
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.whenReady().then(() => {
    const hadSettings = fs.existsSync(settings.FILE());           // 처음 설치인지 (새로 바뀐 것 창)
    if (IS_WIN) app.setAppUserModelId('com.chanyoze.deskpet');     // 윈도우 알림에 DeskPet 으로 뜨게
    if (IS_MAC && app.dock) app.dock.hide();                       // 맥: Dock 에 아이콘 없이 메뉴바에만
    const cfg = settings.load();
    if (!currentCharacter) currentCharacter = cfg.character || null;

    unpackPrivateIcon();
    setTimeout(cleanStalePortable, 60e3);          // 켜는 데 방해되지 않게 1분 뒤
    createWindow();
    createTray();
    autoInstallCharacters(cfg);

    // 외부에서 말을 시킬 수 있는 로컬 서버 (Claude Code 훅, 빌드 스크립트 등)
    notify.start(cfg.notifyPort, (msg) => {
      console.log('[notify] say:', msg.mood, msg.source || '', msg.text);
      if (msg.source && msg.level === 'fail') toast(msg.source + ' 실패', msg.text);
      win?.webContents.send('pet:say', msg);
    }, onClaudeEvent);

    // 이미 연결돼 있으면 이 버전에 맞춰 다시 건다 — 스크립트 내용 · 포트 · 거는 이벤트가 바뀌었을 수 있다.
    // install 은 우리 훅만 걷어내고 다시 넣으므로 몇 번을 불러도 같다.
    if (IS_WIN && fs.existsSync(claudeHookScript())) {
      try {
        let st = claudeHooks.status({ scriptPath: claudeHookScript() });
        if (st.connected && !st.legacy) {
          fs.writeFileSync(claudeHookScript(), claudeHooks.hookScript(cfg.notifyPort), 'utf8');   // settings.json 은 그대로
        } else if (!st.error) {
          st = claudeHooks.install({ scriptPath: claudeHookScript(), port: cfg.notifyPort });   // 이벤트가 늘었으면 다시 건다
        }
        console.log('[claude] 훅:', st.connected ? '연결됨' : '확인 필요', st.error || '');
      } catch (e) {
        console.error('[claude] 훅 갱신 실패:', e.message);
      }
    }

    // 명령줄 도구 (빌드 · 서버 기동 알림) — 설치 위치가 늘 같도록 userData 에 둔다
    if (IS_WIN) {
      try {
        fs.writeFileSync(path.join(app.getPath('userData'), 'deskpet.ps1'), psScripts.cliScript(cfg.notifyPort), 'utf8');
      } catch (e) {
        console.error('[cli] deskpet.ps1 쓰기 실패:', e.message);
      }
    }

    settings.onSave((patch) => { if (Object.keys(patch).some((k) => PREF_KEYS.includes(k))) settingsWindow.refresh(); });
    startReminderLoop();
    clipHistory.start(app.getPath('userData'), () => !!settings.load().clipPaused);
    registerHotkeys();
    afterUpdate();
    checkWhatsNew(hadSettings);
    // 개발 옵션 --update-now: 확인 창 없이 바로 받아서 바꿔 끼운다 (업데이트 과정 시험용)
    if (process.argv.includes('--update-now')) {
      setTimeout(async () => {
        await checkUpdate(true);
        if (updateInfo) updater.install(updateInfo, (p) => console.log('[update] 받는 중', Math.round(p * 100) + '%'))
          .then((r) => console.log('[update] 결과', JSON.stringify(r))).catch((e) => console.error('[update] 실패', e.message));
      }, 5000);
    } else setTimeout(() => checkUpdate(false), 60e3);
    setInterval(() => checkUpdate(false), UPDATE_EVERY);
    refreshTodo();
    watchTodo();

    // 해상도/작업표시줄이 바뀌면 창 크기와 바닥선을 다시 맞춘다
    const resync = () => {
      if (!win) return;
      const { bounds } = targetDisplay();
      win.setBounds(bounds);
      win.webContents.send('pet:stage', getStage());
    };
    screen.on('display-metrics-changed', resync);
    screen.on('display-added', resync);
    screen.on('display-removed', resync);
  });
}

ipcMain.handle('stage:get', () => getStage());
ipcMain.handle('display:list', () => displayList());
ipcMain.handle('display:set', (_e, id) => {
  if (id === 'cursor') id = screen.getDisplayNearestPoint(screen.getCursorScreenPoint()).id;
  moveToDisplay(id);
});

// ── 설정 · 리마인더 ─────────────────────────────────────────
ipcMain.handle('settings:get', () => {
  const cfg = settings.load();
  return { ...cfg, currentCharacter, sizes: SIZES, settingsPath: settings.FILE(), hotkeys: hotkeys() };
});
ipcMain.handle('settings:setSize', (_e, value) => {
  settings.save({ sizeScale: value });
  win?.reload();
});
ipcMain.handle('settings:setCharacter', (_e, id) => {
  currentCharacter = id;
  settings.save({ character: id });
});
ipcMain.handle('reminders:add', (_e, r) => {
  const list = settings.load().reminders || [];
  list.push({ id: 'r' + Date.now().toString(36), text: r.text, at: r.at });
  settings.save({ reminders: list });
  return list;
});
ipcMain.handle('reminders:remove', (_e, id) => {
  const list = (settings.load().reminders || []).filter((r) => r.id !== id);
  settings.save({ reminders: list });
  return list;
});
ipcMain.handle('settings:setChat', (_e, v) => settings.save({ chatter: !!v }));

// ── Claude Code 연결 · 자동 시작 ─────────────────────────────
ipcMain.handle('claude:status', () => claudeStatus());
ipcMain.handle('claude:connect', () => claudeConnect());
function claudeConnect() {
  try {
    claudeHooks.install({ scriptPath: claudeHookScript(), port: settings.load().notifyPort });
    return claudeStatus();
  } catch (e) {
    console.error('[claude] 연결 실패:', e.message);
    return { ...claudeStatus(), error: e.message };
  }
}
ipcMain.handle('claude:disconnect', () => claudeDisconnect());
function claudeDisconnect() {
  try {
    claudeHooks.uninstall({ scriptPath: claudeHookScript() });
    try { fs.unlinkSync(claudeHookScript()); } catch { /* 없으면 그만 */ }
    return claudeStatus();
  } catch (e) {
    console.error('[claude] 연결 끊기 실패:', e.message);
    return { ...claudeStatus(), error: e.message };
  }
}
ipcMain.handle('claude:setSpeak', (_e, v) => {
  settings.save({ speakOnClaude: !!v });
  return claudeStatus();
});
ipcMain.handle('claude:sessions', () => claudeSessionList());
ipcMain.handle('claude:focus', (_e, sid) => focusClaudeSession(sid));
ipcMain.handle('settings:setCursorMode', (_e, m) =>
  settings.save({ cursorMode: ['chase', 'flee'].includes(m) ? m : 'none' }));
// ── 할 일 · recap ────────────────────────────────────────────
ipcMain.handle('todo:get', () => refreshTodo());
/** 할 일 추가 — defaults 는 카드에서 보고 있던 날짜 · 언젠가 · 분류 */
ipcMain.handle('todo:add', async (_e, defaults) => {
  const d = defaults || {};
  const r = await openEditor({
    mode: 'todo', title: '할 일 추가',
    hint: '첫 줄이 할 일, 다음 줄부터는 설명. 여러 개를 한꺼번에 넣으려면 아래 "줄마다 따로" 를 켠다.',
    todo: {
      date: d.date || notesStore.ymd(new Date()), backlog: !!d.backlog, category: d.category || '', categories: todo.categories || [], saved: todoCats(),
      repeat: d.repeat ? { rule: '매일', time: null } : null,
    },
  });
  if (r && r.text.trim()) {
    notesStore.add(todoFile(), { text: r.text, date: r.date, backlog: r.backlog, category: r.category, due: r.due, split: !!r.split, repeat: r.repeat || null });
  }
  return refreshTodo();
});
/** 할 일 고치기 — 카드의 ✎ · 더블클릭. 입력 창에 지금 내용을 채워 띄운다 */
ipcMain.handle('todo:edit', async (_e, i, text) => {
  const it = todo.items.find((x) => x.i === i && x.text === text) || todo.items.find((x) => x.text === text);
  if (!it) return refreshTodo();
  const r = await openEditor({
    mode: 'todo', title: '할 일 수정',
    hint: '첫 줄이 할 일, 다음 줄부터는 설명.',
    text: it.text + (it.detail ? '\n' + it.detail : ''),
    todo: {
      edit: true, date: it.date || notesStore.ymd(new Date()), backlog: !!it.backlog, category: it.category || '',
      due: it.explicitDue ? it.due : '', categories: todo.categories || [], saved: todoCats(), repeat: it.repeat || null,
    },
  });
  if (r && r.text.trim()) {
    notesStore.update(todoFile(), it.i, it.text, { text: r.text, date: r.date, backlog: r.backlog, category: r.category, due: r.due, repeat: r.repeat || null });
  }
  return refreshTodo();
});
/** 여러 개 한꺼번에 옮기기 — 밀린 것 정리. target = 'today' | 'backlog' | 'done' */
ipcMain.handle('todo:move', (_e, refs, target) => {
  const t = target === 'today' ? { date: notesStore.ymd(new Date()) } : target === 'backlog' ? { backlog: true } : target === 'done' ? { done: true } : null;
  if (t && Array.isArray(refs)) {
    const r = notesStore.moveItems(todoFile(), refs.map((x) => ({ i: x.i, text: String(x.text) })), t);
    console.log('[todo] 한꺼번에', target, r.moved);
  }
  return refreshTodo();
});
ipcMain.handle('todo:remove', (_e, i, text) => { notesStore.remove(todoFile(), i, text); return refreshTodo(); });
/** 등록한 분류 (입력 창의 버튼) — 처음엔 예시 몇 개, 사용자가 + 등록 · × 로 고친다 */
const todoCats = () => settings.load().todoCategories || ['오전', '오후', '3시 전까지', '퇴근 전'];
ipcMain.handle('todoCats:set', (_e, list) => {
  const clean = [...new Set((Array.isArray(list) ? list : []).map((x) => String(x).trim().slice(0, 30)).filter(Boolean))].slice(0, 20);
  settings.save({ todoCategories: clean });
  return clean;
});
ipcMain.handle('todo:toggle', (_e, i, text) => { notesStore.toggle(todoFile(), i, text); return refreshTodo(); });
ipcMain.handle('todo:clearDone', () => { notesStore.clearDone(todoFile()); return refreshTodo(); });
ipcMain.handle('todo:open', () => openTodoFile());
ipcMain.handle('recap:now', () => sendRecap('manual'));

// ── 스티커 메모 · 카드 ──────────────────────────────────────
// 메모는 notes.json [{ id, text, color, x, y, collapsed }], 할 일 카드 자리 · 숨김은 설정(todoCard · notesHidden)
function notesState() {
  const cfg = settings.load();
  return { notes: notesStore.loadNotes(notesFile()), todoCard: cfg.todoCard || {}, hidden: !!cfg.notesHidden };
}
function setNotesHidden(v) {
  settings.save({ notesHidden: !!v });
  win?.webContents.send('pet:command', 'notes:hidden:' + (v ? 1 : 0));
}
ipcMain.handle('notes:get', () => notesState());
ipcMain.handle('notes:add', async (_e, pos) => {
  const r = await openEditor({ mode: 'note', title: '메모', hint: '화면에 붙여 둘 메모. 색을 고를 수 있다.' });
  if (r && r.text.trim()) {
    const list = notesStore.loadNotes(notesFile());
    list.push({ id: 'n' + Date.now().toString(36), text: r.text, color: r.color, x: pos && pos.x, y: pos && pos.y, collapsed: false });
    notesStore.saveNotes(notesFile(), list);
    if (settings.load().notesHidden) setNotesHidden(false);   // 숨겨 둔 채 새로 쓰면 안 보여서 헷갈린다
  }
  return notesState();
});
ipcMain.handle('notes:edit', async (_e, id) => {
  const n = notesStore.loadNotes(notesFile()).find((x) => x.id === id);
  if (!n) return notesState();
  const r = await openEditor({ mode: 'note', title: '메모 편집', text: n.text, color: n.color, hint: '비우고 저장하면 그대로 둔다 (지우려면 카드의 ×).' });
  if (r && r.text.trim()) {
    const list = notesStore.loadNotes(notesFile()).map((x) => (x.id === id ? { ...x, text: r.text, color: r.color } : x));
    notesStore.saveNotes(notesFile(), list);
  }
  return notesState();
});
ipcMain.handle('notes:update', (_e, id, patch) => {
  const allowed = {};
  for (const k of ['x', 'y', 'w', 'h', 'collapsed']) if (patch && k in patch) allowed[k] = patch[k];
  const list = notesStore.loadNotes(notesFile()).map((x) => (x.id === id ? { ...x, ...allowed } : x));
  notesStore.saveNotes(notesFile(), list);
  return notesState();
});
ipcMain.handle('notes:remove', (_e, id) => {
  notesStore.saveNotes(notesFile(), notesStore.loadNotes(notesFile()).filter((x) => x.id !== id));
  return notesState();
});
ipcMain.handle('notes:setTodoCard', (_e, patch) => {
  const allowed = {};
  for (const k of ['x', 'y', 'w', 'h', 'collapsed', 'shown']) if (patch && k in patch) allowed[k] = patch[k];
  settings.save({ todoCard: { ...(settings.load().todoCard || {}), ...allowed } });
  return notesState();
});
ipcMain.handle('notes:setHidden', (_e, v) => { setNotesHidden(v); return notesState(); });
ipcMain.handle('recap:setEvery', (_e, every) => {
  settings.save({ recap: { ...recapCfg(), every: [0, 30, 60, 120].includes(every) ? every : 60 } });
  return refreshTodo();
});
ipcMain.on('inbox:count', (_e, n) => setTrayAlert(Number(n) || 0));
ipcMain.handle('toast:set', (_e, v) => { settings.save({ toastOn: !!v }); return !!v; });
ipcMain.handle('update:prompt', () => promptUpdate());
ipcMain.handle('whatsnew:show', () => showWhatsNew(whatsNewBetween(null, app.getVersion()).slice(0, 3)));
ipcMain.handle('update:check', () => checkUpdate(true));

// ════════════════════════════════════════════════════════════
//  설정 창 — 메뉴에 흩어져 있던 설정을 한곳에 (settings-window.js · renderer/settings.html)
// ════════════════════════════════════════════════════════════
/**
 * prefs:get 은 지금 값 전부, prefs:set(key, value) 는 하나 바꾸고 바로 적용한 뒤 prefs:get 결과를 돌려준다.
 * 캐릭터가 들고 있는 값(분위기 · 혼잣말 · 커서 · 프레임)은 pet:prefs 로 렌더러에 알린다.
 * fps: 'light' | 'normal' | 'smooth' (pet.js FPS_TIERS), gpu: 'auto' | 'on' | 'off' (다음에 켤 때)
 */
const FPS_PRESETS = ['light', 'normal', 'smooth'];
const PREF_KEYS = ['sizeScale', 'tone', 'chatter', 'cursorMode', 'display', 'recap', 'toastOn', 'speakOnClaude',
  'clipPaused', 'hotkeys', 'fps', 'gpu', 'updateCheck'];

function prefsState() {
  const cfg = settings.load();
  return {
    version: app.getVersion(),
    isWin: IS_WIN,
    size: sizeScale(),
    sizes: SIZES,
    tone: cfg.tone === 'dark' ? 'dark' : 'light',
    chatter: cfg.chatter !== false,
    cursorMode: cfg.cursorMode || 'none',
    displays: displayList(),
    recap: recapCfg(),
    toast: cfg.toastOn !== false,
    claude: claudeStatus(),
    hotkeys: hotkeys(),
    hotkeyDefaults: HOTKEYS_DEFAULT,
    hotkeyFailed: hotkeyFailed,
    clipPaused: !!cfg.clipPaused,
    fps: FPS_PRESETS.includes(cfg.fps) ? cfg.fps : 'normal',
    gpu: ['on', 'off'].includes(cfg.gpu) ? cfg.gpu : 'auto',
    gpuNow: gpuOn,
    autoStart: autoStartStatus(),
    updateCheck: cfg.updateCheck !== false,
    paths: { userData: app.getPath('userData') },
  };
}

/** 캐릭터 쪽이 들고 있는 값 — 바뀌면 렌더러에 */
function sendPetPrefs() {
  const cfg = settings.load();
  win?.webContents.send('pet:prefs', {
    tone: cfg.tone === 'dark' ? 'dark' : 'light',
    chatter: cfg.chatter !== false,
    cursorMode: cfg.cursorMode || 'none',
    fps: FPS_PRESETS.includes(cfg.fps) ? cfg.fps : 'normal',
    hotkeys: hotkeys(),
  });
}

/** 단축키 문자열 다듬기 — 수식키 하나 이상 + 키 하나. 빈 문자열은 끄기 */
function cleanAccel(acc) {
  const s = String(acc || '').trim();
  if (!s) return '';
  const parts = s.split('+').map((x) => x.trim()).filter(Boolean);
  const mods = parts.filter((x) => /^(CommandOrControl|Ctrl|Control|Alt|Shift|Super|Cmd|Command)$/i.test(x));
  if (!mods.length || parts.length - mods.length !== 1) return null;
  return parts.join('+');
}

ipcMain.handle('prefs:get', () => prefsState());
ipcMain.handle('prefs:set', (_e, key, value) => {
  const cfg = settings.load();
  switch (key) {
    case 'size':
      if (SIZES.some((s) => s.value === value) && value !== sizeScale()) { settings.save({ sizeScale: value }); win?.reload(); }
      break;
    case 'tone': settings.save({ tone: value === 'dark' ? 'dark' : 'light' }); sendPetPrefs(); break;
    case 'chatter': settings.save({ chatter: !!value }); sendPetPrefs(); break;
    case 'cursorMode': settings.save({ cursorMode: ['chase', 'flee'].includes(value) ? value : 'none' }); sendPetPrefs(); break;
    case 'fps': if (FPS_PRESETS.includes(value)) { settings.save({ fps: value }); sendPetPrefs(); } break;
    case 'display': if (screen.getAllDisplays().some((d) => d.id === value)) moveToDisplay(value); break;
    case 'recap': {
      const v = value || {};
      const r = { ...recapCfg() };
      if ([0, 30, 60, 120].includes(v.every)) r.every = v.every;
      if (Number.isInteger(v.from) && v.from >= 0 && v.from <= 23) r.from = v.from;
      if (Number.isInteger(v.to) && v.to >= 1 && v.to <= 24) r.to = v.to;
      if (typeof v.weekdays === 'boolean') r.weekdays = v.weekdays;
      if (r.to <= r.from) r.to = Math.min(24, r.from + 1);
      settings.save({ recap: r });
      refreshTodo();
      break;
    }
    case 'toast': settings.save({ toastOn: !!value }); break;
    case 'speak': settings.save({ speakOnClaude: !!value }); break;
    case 'clipPaused': settings.save({ clipPaused: !!value }); break;
    case 'gpu': settings.save({ gpu: ['on', 'off'].includes(value) ? value : 'auto' }); break;
    case 'updateCheck': settings.save({ updateCheck: !!value }); break;
    case 'autoStart': if (app.isPackaged) app.setLoginItemSettings({ openAtLogin: !!value, path: loginExe() }); break;
    case 'hotkey': {
      const tab = value && value.tab;
      if (!(tab in HOTKEYS_DEFAULT)) break;
      const acc = value.reset ? HOTKEYS_DEFAULT[tab] : cleanAccel(value.acc);
      if (acc == null) break;
      settings.save({ hotkeys: { ...(cfg.hotkeys || {}), [tab]: acc } });
      registerHotkeys(true);
      sendPetPrefs();
      break;
    }
    default:
      console.warn('[prefs] 모르는 설정:', key);
  }
  return prefsState();
});
ipcMain.handle('prefs:action', async (_e, name) => {
  if (name === 'update') await checkUpdate(true);
  else if (name === 'whatsnew') showWhatsNew(whatsNewBetween(null, app.getVersion()).slice(0, 3));
  else if (name === 'log') shell.showItemInFolder(path.join(app.getPath('userData'), 'deskpet.log'));
  else if (name === 'data') shell.openPath(app.getPath('userData'));
  else if (name === 'todo') openTodoFile();
  else if (name === 'claude-on') claudeConnect();
  else if (name === 'claude-off') claudeDisconnect();
  else if (name === 'hk-pause') globalShortcut.unregisterAll();     // 단축키를 새로 누르는 동안은 지금 것이 가로채지 않게
  else if (name === 'hk-resume') registerHotkeys(true);
  return { ...prefsState(), update: updateInfo ? updateInfo.version : null };
});

// ════════════════════════════════════════════════════════════
//  캐릭터 관리 · 내 그림으로 만들기 (설정 창 "캐릭터", maker-window.js)
// ════════════════════════════════════════════════════════════
/**
 * 종류: bundled 앱에 든 것 · downloaded 받아 온 것(포켓몬 등) · made 내 그림으로 만든 것(id 가 my-) · user 직접 넣은 폴더
 * 숨기기는 사용자 폴더 캐릭터의 character.json 에 "hidden": true (지우지 않는다 — 받아 온 건 지우면 다음에 켤 때 다시 받는다).
 * 지우기는 내가 만든 것만.
 */
const MADE_ID = /^my-[a-z0-9]{4,24}$/;
const SHEET_NAME = /^[a-z][a-z0-9]{0,15}$/;

function charsAdmin() {
  const cfg = settings.load();
  const seen = new Map();
  for (const base of charDirs()) {
    let entries = [];
    try { entries = fs.readdirSync(base, { withFileTypes: true }); } catch { continue; }
    for (const e of entries) {
      if (!e.isDirectory() || seen.has(e.name)) continue;
      const dir = path.join(base, e.name);
      let m;
      try { m = JSON.parse(fs.readFileSync(path.join(dir, 'character.json'), 'utf8')); } catch { continue; }
      const user = base === userCharDir();
      const kind = !user ? 'bundled' : MADE_ID.test(e.name) ? 'made'
        : fs.existsSync(path.join(dir, 'CREDITS.txt')) ? 'downloaded' : 'user';
      seen.set(e.name, {
        id: e.name, name: m.name || e.name, renderer: m.renderer || 'parts', kind, hidden: !!m.hidden,
        main: e.name === (currentCharacter || cfg.character), companion: e.name === cfg.companion,
      });
    }
  }
  const shown = new Set(listCharacters().map((c) => c.id));
  // 목록에 안 나오는 앱 속 캐릭터(onlyCharacters 로 가린 기본 캐릭터 등)는 관리 목록에서도 뺀다
  return [...seen.values()].filter((c) => c.kind !== 'bundled' || shown.has(c.id));
}

ipcMain.handle('chars:admin', () => charsAdmin());
ipcMain.handle('chars:hide', (_e, id, hidden) => {
  const c = charsAdmin().find((x) => x.id === id);
  if (!c || c.kind === 'bundled') return { error: '앱에 든 캐릭터는 숨길 수 없어요', list: charsAdmin() };
  if (hidden && (c.main || c.companion)) return { error: '지금 나와 있는 캐릭터는 숨길 수 없어요 — 먼저 다른 캐릭터로 바꿔 주세요', list: charsAdmin() };
  const f = path.join(userCharDir(), id, 'character.json');
  const m = JSON.parse(fs.readFileSync(f, 'utf8'));
  if (hidden) m.hidden = true; else delete m.hidden;
  fs.writeFileSync(f, JSON.stringify(m, null, 2));
  console.log('[chars]', hidden ? '숨김' : '보임', id);
  return { list: charsAdmin() };
});
ipcMain.handle('chars:remove', (_e, id) => {
  const c = charsAdmin().find((x) => x.id === id);
  if (!c || c.kind !== 'made') return { error: '내가 만든 캐릭터만 지울 수 있어요', list: charsAdmin() };
  if (c.main || c.companion) return { error: '지금 나와 있는 캐릭터는 지울 수 없어요 — 먼저 다른 캐릭터로 바꿔 주세요', list: charsAdmin() };
  fs.rmSync(path.join(userCharDir(), id), { recursive: true, force: true });
  console.log('[chars] 지움', id);
  return { list: charsAdmin() };
});
ipcMain.handle('chars:folder', () => { fs.mkdirSync(userCharDir(), { recursive: true }); shell.openPath(userCharDir()); });
ipcMain.handle('chars:use', (_e, id) => {
  if (!listCharacters().some((c) => c.id === id)) return charsAdmin();
  currentCharacter = id;
  const patch = { character: id };
  if (settings.load().companion === id) patch.companion = null;
  settings.save(patch);
  win?.reload();
  return charsAdmin();
});

// 만들기 창
ipcMain.handle('maker:open', (_e, id) => { makerWindow.open(targetDisplay(), id && MADE_ID.test(id) ? id : null); return true; });
ipcMain.on('maker:close', () => makerWindow.close());
ipcMain.handle('maker:init', () => {
  const id = makerWindow.editing();
  if (!id) return { edit: null };
  const dir = path.join(userCharDir(), id);
  try {
    const manifest = JSON.parse(fs.readFileSync(path.join(dir, 'character.json'), 'utf8'));
    const sheets = {};
    for (const [name, def] of Object.entries(manifest.sheets || {})) {
      sheets[name] = 'data:image/png;base64,' + fs.readFileSync(path.join(dir, def.file)).toString('base64');
    }
    return { edit: id, manifest, sheets };
  } catch (e) {
    console.error('[maker] 불러오기 실패:', id, e.message);
    return { edit: null };
  }
});
ipcMain.handle('maker:save', (_e, p) => {
  try {
    const id = p.id && MADE_ID.test(p.id) ? p.id : 'my-' + Date.now().toString(36);
    const m = p.manifest || {};
    if (!m.name || !m.sheets || !m.clips || !m.clips.idle) throw new Error('이름과 대기 그림이 필요해요');
    const dir = path.join(userCharDir(), id);
    const tmp = dir + '.part';
    fs.rmSync(tmp, { recursive: true, force: true });
    fs.mkdirSync(tmp, { recursive: true });
    for (const [name, def] of Object.entries(m.sheets)) {
      if (!SHEET_NAME.test(name) || typeof p.sheets[name] !== 'string') throw new Error('시트 이름이 이상해요: ' + name);
      def.file = name + '.png';
      fs.writeFileSync(path.join(tmp, def.file), Buffer.from(p.sheets[name], 'base64'));
    }
    const manifest = { ...m, renderer: 'sprite', maker: 1 };
    delete manifest.hidden;
    fs.writeFileSync(path.join(tmp, 'character.json'), JSON.stringify(manifest, null, 2));
    fs.rmSync(dir, { recursive: true, force: true });
    fs.renameSync(tmp, dir);
    console.log('[maker] 저장:', id, Object.keys(m.sheets).join(','));
    const cfg = settings.load();
    if (p.use) {
      currentCharacter = id;
      settings.save({ character: id, companion: cfg.companion === id ? null : cfg.companion });
      win?.reload();
    } else if (id === (currentCharacter || cfg.character) || id === cfg.companion) {
      win?.reload();                     // 나와 있는 캐릭터를 고쳤으면 바로 보이게
    }
    settingsWindow.refresh();
    return { ok: true, id };
  } catch (e) {
    console.error('[maker] 저장 실패:', e.message);
    return { ok: false, error: e.message };
  }
});

function openSettings() {
  settingsWindow.open(targetDisplay());
}
ipcMain.handle('settings:open', () => { openSettings(); return true; });
// ════════════════════════════════════════════════════════════
//  빠른 메모 · 클립보드 기록 · 바로가기 (팔레트 창, 전역 단축키)
// ════════════════════════════════════════════════════════════
/**
 * 단축키는 설정 hotkeys 로 바꿀 수 있다. 다른 프로그램이 먼저 잡고 있으면 등록이 실패한다 → 로그 · 말풍선으로 알린다.
 * 클립보드 내용은 로그에 찍지 않는다.
 */
const HOTKEYS_DEFAULT = {
  memo: 'CommandOrControl+Alt+Space',
  clip: 'CommandOrControl+Alt+V',
  links: 'CommandOrControl+Alt+O',
};
const hotkeys = () => ({ ...HOTKEYS_DEFAULT, ...(settings.load().hotkeys || {}) });
const hotkeyLabel = (tab) => (hotkeys()[tab] || '').replace('CommandOrControl', IS_MAC ? 'Cmd' : 'Ctrl');
const shortcutsFile = () => path.join(app.getPath('userData'), 'shortcuts.json');

let hotkeyFailed = [];
function registerHotkeys(quiet) {
  globalShortcut.unregisterAll();
  const failed = [];
  for (const [tab, acc] of Object.entries(hotkeys())) {
    if (!acc) continue;
    let ok = false;
    try { ok = globalShortcut.register(acc, () => palette.open(tab)); } catch { ok = false; }
    if (!ok) failed.push(acc);
  }
  console.log('[tools] 단축키', JSON.stringify(hotkeys()), failed.length ? '— 등록 실패: ' + failed.join(', ') : '');
  hotkeyFailed = failed;
  if (failed.length && !quiet) {
    win?.webContents.once('did-finish-load', () => setTimeout(() => win?.webContents.send('pet:say', {
      text: '단축키 ' + failed.join(', ') + ' 는 다른 프로그램이 쓰고 있어서 못 잡았어 (메뉴에서 열 수는 있어)', ms: 8000, quiet: true,
    }), 4000));
  }
}

ipcMain.handle('palette:init', () => ({
  tab: palette.initialTab(),
  hotkeys: { memo: hotkeyLabel('memo'), clip: hotkeyLabel('clip'), links: hotkeyLabel('links') },
}));
ipcMain.on('palette:close', () => palette.close());
ipcMain.handle('palette:open', (_e, tab) => palette.open(tab) && true);

// 빠른 메모 — 오늘 할 일 · 언젠가 · 스티커 메모
ipcMain.handle('memo:save', (_e, m) => {
  const text = String((m && m.text) || '');
  if (!text.trim()) return { ok: false };
  if (m.target === 'note') {
    const list = notesStore.loadNotes(notesFile());
    list.push({ id: 'n' + Date.now().toString(36), text, color: 'yellow', x: null, y: null, collapsed: false });
    notesStore.saveNotes(notesFile(), list);
    if (settings.load().notesHidden) setNotesHidden(false);
    win?.webContents.send('pet:command', 'notes:reload');
  } else {
    notesStore.add(todoFile(), m.target === 'backlog' ? { text, backlog: true } : { text, date: notesStore.ymd(new Date()) });
    refreshTodo();
  }
  console.log('[tools] 빠른 메모 저장 →', m.target);
  win?.webContents.send('pet:say', { text: m.target === 'note' ? '메모 붙여 뒀어' : m.target === 'backlog' ? '언젠가 목록에 적어 뒀어' : '오늘 할 일에 적어 뒀어', ms: 2200, quiet: true });
  return { ok: true };
});

// 클립보드 기록
ipcMain.handle('clip:read', () => clipHistory.read());          // Electron 44: 클립보드는 Promise
ipcMain.handle('clip:list', () => clipHistory.list());
ipcMain.handle('clip:copy', (_e, t) => clipHistory.copy(t));
ipcMain.handle('clip:pin', (_e, t, on) => clipHistory.pin(t, on));
ipcMain.handle('clip:remove', (_e, t) => clipHistory.remove(t));
ipcMain.handle('clip:clear', () => clipHistory.clear());
ipcMain.handle('clip:pause', (_e, v) => { settings.save({ clipPaused: !!v }); return clipHistory.list(); });

// 바로가기
const linksWithKind = () => shortcutsStore.load(shortcutsFile()).map((x) => ({ ...x, resolved: shortcutsStore.kindOf(x) }));
ipcMain.handle('links:list', () => linksWithKind());
ipcMain.handle('links:save', (_e, item) => { shortcutsStore.upsert(shortcutsFile(), item || {}); return linksWithKind(); });
ipcMain.handle('links:remove', (_e, id) => { shortcutsStore.remove(shortcutsFile(), id); return linksWithKind(); });
ipcMain.handle('links:move', (_e, id, dir) => { shortcutsStore.move(shortcutsFile(), id, dir); return linksWithKind(); });
ipcMain.handle('links:open', async (_e, id) => {
  const x = shortcutsStore.load(shortcutsFile()).find((s) => s.id === id);
  if (!x) return { ok: false, error: '없는 바로가기' };
  const kind = shortcutsStore.kindOf(x);
  console.log('[tools] 바로가기 열기:', x.name, '(' + kind + ')');
  try {
    if (kind === 'url') await shell.openExternal(x.target);
    else if (kind === 'path') {
      const err = await shell.openPath(x.target.replace(/^"(.*)"$/, '$1'));
      if (err) return { ok: false, error: err };
    } else {
      // 명령 — 셸로 실행하고 기다리지 않는다 (예: code "C:\work\DESK-PET", explorer, 배치 파일)
      const { spawn } = require('child_process');
      spawn(x.target, { shell: true, detached: true, stdio: 'ignore', windowsHide: true, cwd: require('os').homedir() }).unref();
    }
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e.message };
  }
});
ipcMain.handle('links:pick', async (_e, folder) => {
  palette.hold(true);
  try {
    const r = await dialog.showOpenDialog(palette.window() || undefined, { properties: [folder ? 'openDirectory' : 'openFile'] });
    return r.canceled || !r.filePaths.length ? null : r.filePaths[0];
  } finally {
    palette.hold(false);
  }
});
ipcMain.handle('autostart:get', () => autoStartStatus());
ipcMain.handle('autostart:set', (_e, on) => {
  if (app.isPackaged) app.setLoginItemSettings({ openAtLogin: !!on, path: loginExe() });
  return autoStartStatus();
});
ipcMain.handle('settings:setTone', (_e, v) => settings.save({ tone: v === 'dark' ? 'dark' : 'light' }));
ipcMain.handle('settings:setCompanion', (_e, id) => settings.save({ companion: id || null }));
ipcMain.handle('settings:setMode', (_e, id, m) => {
  const modes = { ...(settings.load().modes || {}) };
  if (m) modes[id] = m; else delete modes[id];
  settings.save({ modes });
});
ipcMain.on('app:quit', () => app.quit());
ipcMain.handle('character:list', () => listCharacters());
ipcMain.handle('spine:path', () => {
  const p = spineRuntimePath();
  return p ? pathToFileURL(p).href : null;
});
ipcMain.handle('paths:get', () => ({
  userCharacters: userCharDir(),
  userData: app.getPath('userData'),
}));
ipcMain.handle('character:load', (_e, id) => {
  const list = listCharacters();
  // 숨긴 캐릭터가 저장돼 있으면 목록의 첫 캐릭터로 대신한다
  const shown = (x) => x && list.some((c) => c.id === x);
  const want = (shown(id) && id) || (shown(currentCharacter) && currentCharacter) || (list[0] && list[0].id);
  try {
    return loadCharacter(want);
  } catch (err) {
    console.error('[main] 캐릭터 로드 실패:', want, err.message);
    const alt = list.find((c) => c.id !== want);
    if (alt) return loadCharacter(alt.id);
    throw err;
  }
});

// renderer가 "지금 커서가 캐릭터 위에 있다"고 알려주면 클릭 통과를 잠시 끈다
/**
 * 커서 위치를 메인이 직접 읽어 렌더러에 알려 준다 (초당 20번, 바뀔 때만).
 *
 * 클릭 통과 창은 setIgnoreMouseEvents 의 forward 로 mousemove 를 받는데, 이게
 * 주 모니터가 아닌 곳에서 시작하거나 창을 다른 모니터로 옮긴 뒤에는 끊긴다
 * (그러면 캐릭터 위에 커서가 있어도 클릭 전환이 안 돼서 캐릭터를 못 누른다).
 * forward 에 기대지 않고 커서 좌표를 직접 넘겨서 어느 모니터에서든 동작하게 한다.
 */
let lastCursor = '';
setInterval(() => {
  if (!win || win.isDestroyed()) return;
  const p = screen.getCursorScreenPoint();
  const b = win.getBounds();
  const x = p.x - b.x, y = p.y - b.y;
  const key = x + ',' + y;
  if (key === lastCursor) return;
  lastCursor = key;
  win.webContents.send('pet:cursor', { x, y });
}, 50);

ipcMain.on('mouse:interactive', (_e, interactive) => {
  if (!win) return;
  if (interactive) win.setIgnoreMouseEvents(false);
  else win.setIgnoreMouseEvents(true, { forward: true });
});

app.on('window-all-closed', () => app.quit());

app.on('will-quit', () => { try { globalShortcut.unregisterAll(); } catch { /* 그만 */ } clipHistory.stop(); });
