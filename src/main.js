const { app, BrowserWindow, screen, ipcMain, Tray, Menu, nativeImage } = require('electron');
const path = require('path');

const DEV = process.argv.includes('--dev');

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
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: '가운데로 불러오기', click: () => win?.webContents.send('pet:command', 'recall') },
    { label: '깨우기', click: () => win?.webContents.send('pet:command', 'wake') },
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

// renderer가 "지금 커서가 캐릭터 위에 있다"고 알려주면 클릭 통과를 잠시 끈다
ipcMain.on('mouse:interactive', (_e, interactive) => {
  if (!win) return;
  if (interactive) win.setIgnoreMouseEvents(false);
  else win.setIgnoreMouseEvents(true, { forward: true });
});

app.on('window-all-closed', () => app.quit());
