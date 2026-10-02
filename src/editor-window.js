/**
 * 입력 창 — 할 일 추가 · 메모 쓰기
 * -------------------------------------------------------------
 * 캐릭터 창은 투명 · focusable:false 라서 글자를 받을 수 없다. 글을 쓸 때만 이 작은 일반 창을 띄운다.
 * 한 번에 하나만 연다 (이미 떠 있으면 그 창을 앞으로).
 *
 *   open({ display, mode, title, text, color, hint, todo }) → Promise<{ text, color, … } | null>  (취소면 null)
 *   mode 'todo' 면 todo = { date, backlog, category, categories } 를 기본값으로 날짜 · 분류 · 기한 칸이 붙고
 *   결과에 { date, backlog, category, due, repeat? } 가 더해진다 (todo.repeat = { rule, time } 이면 반복 틀로 시작)
 */
const { BrowserWindow, ipcMain } = require('electron');
const path = require('path');

let current = null;      // { win, resolve }

function open(opts) {
  if (current && !current.win.isDestroyed()) {
    current.win.show();
    current.win.focus();
    return Promise.resolve(null);
  }
  const W = opts.mode === 'todo' ? 520 : 420, H = opts.mode === 'note' ? 330 : opts.mode === 'todo' ? 520 : 300;
  const wa = opts.display.workArea;
  const win = new BrowserWindow({
    width: W,
    height: H,
    // 캐릭터가 있는 모니터 가운데 (안 그러면 주 모니터에 뜬다)
    x: Math.round(wa.x + (wa.width - W) / 2),
    y: Math.round(wa.y + (wa.height - H) / 2),
    title: opts.title || 'DeskPet',
    resizable: true,
    minimizable: false,
    maximizable: false,
    alwaysOnTop: true,
    skipTaskbar: false,
    autoHideMenuBar: true,
    backgroundColor: '#1d2130',
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload-editor.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  win.setMenu(null);
  win.loadFile(path.join(__dirname, 'renderer', 'editor.html'));
  win.once('ready-to-show', () => { win.show(); win.focus(); });

  return new Promise((resolve) => {
    current = { win, resolve, opts };
    win.on('closed', () => {
      if (current && current.win === win) { current.resolve(null); current = null; }
    });
  });
}

ipcMain.handle('editor:init', (e) => {
  if (!current || e.sender !== current.win.webContents) return null;
  const { mode, title, text, color, hint, todo } = current.opts;
  return { mode, title, text: text || '', color: color || 'yellow', hint: hint || '', todo: todo || null };
});

ipcMain.on('editor:done', (e, result) => {
  if (!current || e.sender !== current.win.webContents) return;
  const c = current;
  current = null;
  c.resolve(result || null);
  if (!c.win.isDestroyed()) c.win.close();
});

module.exports = { open };
