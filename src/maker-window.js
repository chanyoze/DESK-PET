/**
 * 캐릭터 만들기 창 — "내 그림 넣기" (renderer/maker.html · preload-maker.js)
 * -------------------------------------------------------------
 * PNG · GIF 를 동작 칸에 끌어다 놓으면 창 안에서 배경 지우기 · 자르기 · 좌우 뒤집기까지 해서
 * 스프라이트 캐릭터(시트 + character.json)를 만든다. 저장은 main.js 의 maker:save.
 * 한 번에 하나만. 고치기는 저장된 시트를 다시 칸으로 잘라 불러온다.
 */
const { BrowserWindow } = require('electron');
const path = require('path');

let win = null;
let editId = null;

function open(display, id) {
  editId = id || null;
  if (win && !win.isDestroyed()) {
    win.webContents.send('maker:reset', editId);
    win.show();
    win.focus();
    return win;
  }
  const W = 820, H = 760;
  const wa = display.workArea;
  win = new BrowserWindow({
    width: W,
    height: Math.min(H, wa.height - 40),
    minWidth: 640,
    minHeight: 480,
    x: Math.round(wa.x + (wa.width - W) / 2),
    y: Math.round(wa.y + Math.max(20, (wa.height - H) / 2)),
    title: 'DeskPet — 내 그림으로 캐릭터 만들기',
    autoHideMenuBar: true,
    minimizable: false,
    maximizable: false,
    show: false,
    backgroundColor: '#1d2130',
    webPreferences: {
      preload: path.join(__dirname, 'preload-maker.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  win.setMenu(null);
  win.loadFile(path.join(__dirname, 'renderer', 'maker.html'));
  win.once('ready-to-show', () => { win.show(); win.focus(); });
  win.on('closed', () => { win = null; });
  return win;
}

const editing = () => editId;
const close = () => { if (win && !win.isDestroyed()) win.close(); };

module.exports = { open, close, editing };
