/**
 * 팔레트 창 — 빠른 메모 · 클립보드 기록 · 바로가기 (탭 셋)
 * -------------------------------------------------------------
 * 전역 단축키로 띄운다 (main.js). 커서가 있는 모니터 가운데, 다른 곳을 누르거나 Esc 면 닫는다.
 * 필요할 때만 만들고 닫으면 없앤다 — 늘 떠 있는 창이 하나 더 생기면 가볍게 만든 효과가 줄어서.
 * 이미 떠 있으면 탭만 바꾼다.
 */
const { BrowserWindow, screen } = require('electron');
const path = require('path');

let win = null;
let pendingTab = 'memo';
let holding = false;        // 파일 고르기 창을 띄운 동안은 blur 로 닫지 않는다

function open(tab) {
  pendingTab = tab || 'memo';
  if (win && !win.isDestroyed()) {
    win.webContents.send('palette:tab', pendingTab);
    win.show();
    win.focus();
    return win;
  }
  const W = 560, H = 460;
  const wa = screen.getDisplayNearestPoint(screen.getCursorScreenPoint()).workArea;
  win = new BrowserWindow({
    width: W,
    height: H,
    x: Math.round(wa.x + (wa.width - W) / 2),
    y: Math.round(wa.y + (wa.height - H) / 3),
    frame: false,
    resizable: false,
    minimizable: false,
    maximizable: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    show: false,
    backgroundColor: '#1d2130',
    webPreferences: {
      preload: path.join(__dirname, 'preload-palette.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  win.loadFile(path.join(__dirname, 'renderer', 'palette.html'));
  win.once('ready-to-show', () => { win.show(); win.focus(); });
  // 다른 곳을 누르면 닫는다 (단, 막 뜬 직후의 깜빡임은 봐준다)
  const born = Date.now();
  win.on('blur', () => { if (!holding && Date.now() - born > 400) close(); });
  win.on('closed', () => { win = null; });
  return win;
}

function close() {
  if (win && !win.isDestroyed()) win.close();
}

const initialTab = () => pendingTab;
function hold(v) { holding = !!v; if (!v && win && !win.isDestroyed()) win.focus(); }
const window_ = () => (win && !win.isDestroyed() ? win : null);
const isMine = (sender) => !!win && !win.isDestroyed() && sender === win.webContents;

module.exports = { open, close, initialTab, isMine, hold, window: window_ };
