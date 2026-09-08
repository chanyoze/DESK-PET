const { app, BrowserWindow, screen, ipcMain, Tray, Menu, nativeImage } = require('electron');
const path = require('path');
const fs = require('fs');

const DEV = process.argv.includes('--dev');
const CHAR_DIR = path.join(__dirname, '..', 'characters');

/** --character=이름 으로 지정, 없으면 default */
const argChar = (process.argv.find((a) => a.startsWith('--character=')) || '').split('=')[1];
let currentCharacter = argChar || null;   // null 이면 설치된 첫 캐릭터

function listCharacters() {
  try {
    return fs.readdirSync(CHAR_DIR, { withFileTypes: true })
      .filter((e) => e.isDirectory() && fs.existsSync(path.join(CHAR_DIR, e.name, 'character.json')))
      .map((e) => {
        const m = JSON.parse(fs.readFileSync(path.join(CHAR_DIR, e.name, 'character.json'), 'utf8'));
        return { id: e.name, name: m.name || e.name, renderer: m.renderer || 'parts' };
      });
  } catch {
    return [];
  }
}

/**
 * 캐릭터 하나를 통째로 읽어서 렌더러로 보낸다.
 * file:// XHR 은 Chromium이 막으므로 파일을 직접 실어 보낸다 (프로토콜 등록 불필요).
 */
/** 트레이에서 고르는 크기 배율 */
let sizeScale = 1;
const SIZES = [
  { label: '작게', value: 0.6 },
  { label: '보통', value: 1 },
  { label: '크게', value: 1.45 },
];

function loadCharacter(id) {
  const dir = path.join(CHAR_DIR, id);
  const manifest = JSON.parse(fs.readFileSync(path.join(dir, 'character.json'), 'utf8'));
  const out = { id, ...manifest, files: {} };
  out.height = Math.round((manifest.height || 150) * sizeScale);

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
  return out;
}

/** @type {BrowserWindow|null} */
let win = null;
/** @type {Tray|null} */
let tray = null;

/** 캐릭터가 서 있을 무대(= 주 모니터 전체) 정보를 계산한다. */
function getStage() {
  const display = screen.getPrimaryDisplay();
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
  const { bounds } = screen.getPrimaryDisplay();

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

  const TRACE = process.argv.includes('--trace');
  win.loadFile(path.join(__dirname, 'renderer', 'index.html'), TRACE ? { search: 'trace' } : {});

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

function createTray() {
  const icon = nativeImage.createFromPath(path.join(__dirname, '..', 'assets', 'tray.png'));
  tray = new Tray(icon);
  tray.setToolTip('DeskPet');
  const chars = listCharacters();
  tray.setContextMenu(Menu.buildFromTemplate([
    {
      label: '캐릭터',
      submenu: chars.map((c) => ({
        label: c.name + (c.renderer === 'spine' ? '' : ' (파츠)'),
        type: 'radio',
        checked: c.id === currentCharacter,
        click: () => {
          currentCharacter = c.id;
          win?.reload();      // 렌더러가 부팅하며 새 캐릭터를 불러온다
        },
      })),
    },
    {
      label: '크기',
      submenu: SIZES.map((s) => ({
        label: s.label,
        type: 'radio',
        checked: s.value === sizeScale,
        click: () => {
          sizeScale = s.value;
          win?.reload();
        },
      })),
    },
    { type: 'separator' },
    { label: '가운데로 불러오기', click: () => win?.webContents.send('pet:command', 'recall') },
    { label: '깨우기', click: () => win?.webContents.send('pet:command', 'wake') },
    { label: '다음 오퍼레이터', click: () => win?.webContents.send('pet:command', 'next') },
    { label: '벽 타기', click: () => win?.webContents.send('pet:command', 'climb') },
    { type: 'separator' },
    { label: '개발자 도구', click: () => win?.webContents.openDevTools({ mode: 'detach' }) },
    { type: 'separator' },
    { label: '종료', click: () => { app.quit(); } },
  ]));
}

// 두 번 실행 방지
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.whenReady().then(() => {
    createWindow();
    createTray();

    // 해상도/작업표시줄이 바뀌면 창 크기와 바닥선을 다시 맞춘다
    const resync = () => {
      if (!win) return;
      const { bounds } = screen.getPrimaryDisplay();
      win.setBounds(bounds);
      win.webContents.send('pet:stage', getStage());
    };
    screen.on('display-metrics-changed', resync);
    screen.on('display-added', resync);
    screen.on('display-removed', resync);
  });
}

ipcMain.handle('stage:get', () => getStage());
ipcMain.handle('character:list', () => listCharacters());
ipcMain.handle('character:load', (_e, id) => {
  const list = listCharacters();
  const want = id || currentCharacter || (list[0] && list[0].id);
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
ipcMain.on('mouse:interactive', (_e, interactive) => {
  if (!win) return;
  if (interactive) win.setIgnoreMouseEvents(false);
  else win.setIgnoreMouseEvents(true, { forward: true });
});

app.on('window-all-closed', () => app.quit());
