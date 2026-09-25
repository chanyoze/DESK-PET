const { app, BrowserWindow, screen, ipcMain, Tray, Menu, nativeImage } = require('electron');
const path = require('path');
const fs = require('fs');
const { pathToFileURL } = require('url');
const settings = require('./settings');
const notify = require('./notify-server');

const DEV = process.argv.includes('--dev');

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
        seen.set(e.name, { id: e.name, name: m.name || e.name, renderer: m.renderer || 'parts' });
      } catch { /* 깨진 매니페스트는 건너뛴다 */ }
    }
  }
  return [...seen.values()].filter(Boolean);
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
  // 기본은 클릭 통과. forward:true 덕분에 renderer는 mousemove를 계속 받는다.
  win.setIgnoreMouseEvents(true, { forward: true });
  // 새로고침(모니터 이동·크기 변경)할 때마다 클릭 통과로 되돌린다. 렌더러는 새로 부팅하며
  // "클릭 안 받음"에서 시작하는데, 메뉴를 누르던 중의 "받음" 상태가 남아 있으면
  // 그 모니터 전체의 클릭을 이 창이 먹어 버린다.
  win.webContents.on('did-start-loading', () => win?.setIgnoreMouseEvents(true, { forward: true }));

  const flags = ['trace', 'hitbox'].filter((f) => process.argv.includes('--' + f));
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
      label: '크기',
      submenu: SIZES.map((s) => ({
        label: s.label,
        type: 'radio',
        checked: s.value === sizeScale(),
        click: () => {
          settings.save({ sizeScale: s.value });
          win?.reload();
        },
      })),
    },
    { type: 'separator' },
    {
      label: '모니터',
      submenu: displayList().map((d) => ({
        label: d.label,
        type: 'radio',
        checked: d.current,
        click: () => moveToDisplay(d.id),
      })).concat([
        { type: 'separator' },
        { label: '지금 마우스가 있는 모니터로', click: () => moveToDisplay(screen.getDisplayNearestPoint(screen.getCursorScreenPoint()).id) },
      ]),
    },
    { label: '가운데로 불러오기', click: () => win?.webContents.send('pet:command', 'recall') },
    { label: '깨우기', click: () => win?.webContents.send('pet:command', 'wake') },
    { label: '다음 캐릭터', click: () => win?.webContents.send('pet:command', 'next') },
    { type: 'separator' },
    { label: '개발자 도구', click: () => win?.webContents.openDevTools({ mode: 'detach' }) },
    { type: 'separator' },
    { label: '종료', click: () => { app.quit(); } },
  ]);
}

function createTray() {
  const icon = nativeImage.createFromPath(path.join(__dirname, '..', 'assets', 'tray.png'));
  tray = new Tray(icon);
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
function startReminderLoop() {
  const fired = new Set();       // 오늘 이미 울린 매일 리마인더
  let lastDay = new Date().getDate();

  setInterval(() => {
    const now = new Date();
    if (now.getDate() !== lastDay) {   // 날짜가 바뀌면 매일 항목 초기화
      fired.clear();
      lastDay = now.getDate();
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
  }, 20000);
}

// 두 번 실행 방지
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.whenReady().then(() => {
    const cfg = settings.load();
    if (!currentCharacter) currentCharacter = cfg.character || null;

    createWindow();
    createTray();

    // 외부에서 말을 시킬 수 있는 로컬 서버 (Claude Code 훅, 빌드 스크립트 등)
    notify.start(cfg.notifyPort, (msg) => {
      win?.webContents.send('pet:say', msg);
    });

    startReminderLoop();

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
  return { ...cfg, currentCharacter, sizes: SIZES, settingsPath: settings.FILE() };
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
