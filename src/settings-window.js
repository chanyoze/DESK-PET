/**
 * 설정 창 — 메뉴에 흩어져 있던 설정을 한곳에
 * -------------------------------------------------------------
 * 캐릭터 · 할 일 알림 · Claude · 도구(단축키) · 성능 · 일반. 바꾸면 바로 저장하고 적용한다 (main.js 의 prefs:*).
 * 필요할 때만 만들고 닫으면 없앤다. 이미 떠 있으면 앞으로.
 */
const { BrowserWindow } = require('electron');
const path = require('path');

let win = null;

function open(display) {
  if (win && !win.isDestroyed()) {
    if (win.isMinimized()) win.restore();
    win.show();
    win.focus();
    return win;
  }
  const W = 620, H = 720;
  const wa = display.workArea;
  win = new BrowserWindow({
    width: W,
    height: Math.min(H, wa.height - 40),
    minWidth: 480,
    minHeight: 400,
    x: Math.round(wa.x + (wa.width - W) / 2),
    y: Math.round(wa.y + Math.max(20, (wa.height - H) / 2)),
    title: 'DeskPet 설정',
    autoHideMenuBar: true,
    minimizable: false,
    maximizable: false,
    show: false,
    backgroundColor: '#1d2130',
    webPreferences: {
      preload: path.join(__dirname, 'preload-settings.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  win.setMenu(null);
  win.loadFile(path.join(__dirname, 'renderer', 'settings.html'));
  win.once('ready-to-show', () => { win.show(); win.focus(); });
  win.on('closed', () => { win = null; });
  return win;
}

/** 다른 곳(메뉴 · 트레이)에서 설정이 바뀌면 떠 있는 창도 다시 그린다 */
function refresh() {
  if (win && !win.isDestroyed()) win.webContents.send('prefs:changed');
}

const window_ = () => (win && !win.isDestroyed() ? win : null);

module.exports = { open, refresh, window: window_ };
