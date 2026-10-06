/**
 * 물어보기 — 데스크펫에서 Claude Code 에 묻고 답을 받는다 (도구 팔레트 "물어보기" 탭)
 * -------------------------------------------------------------
 * 이 PC 에 깔린 Claude Code 를 뒤에서 한 번 실행한다 (claude -p). 쓰는 사람의 구독 그대로라 API 키가 필요 없다.
 *   --tools ""                파일 읽기 · 명령 실행 없이 대답만
 *   --no-session-persistence  세션 기록을 남기지 않는다
 *   --settings disableAllHooks 우리 훅이 이 실행을 "Claude 작업 끝났어" 로 알리지 않게
 *   질문은 stdin 으로 넘긴다 (명령줄 따옴표 · 한글 문제 없게)
 * (--bare 는 훅까지 깔끔히 끄지만 API 키가 있어야 해서 쓰지 않는다)
 *
 * 기록은 userData/ask-history.json 에 최근 30개 — 이 PC 에만.
 * electron 을 부르지 않는다. 진행 · 결과는 onChange 로 알린다.
 */
const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawn, execFile } = require('child_process');

const MAX_KEEP = 30;
const TIMEOUT = 3 * 60e3;

let dir = null;
let history = [];
let running = null;          // { id, child }
let onChange = () => {};
let exePath;                 // undefined = 아직 안 찾음, null = 없음

const histFile = () => path.join(dir, 'ask-history.json');

function init(userData, changed) {
  dir = userData;
  onChange = changed || onChange;
  try { history = JSON.parse(fs.readFileSync(histFile(), 'utf8')); } catch { history = []; }
  // 앱이 꺼지는 바람에 끝나지 못한 질문
  for (const h of history) if (h.status === 'pending') { h.status = 'error'; h.a = '앱이 꺼져서 답을 못 받았어요'; }
}
function save() {
  history = history.slice(0, MAX_KEEP);
  try { fs.writeFileSync(histFile(), JSON.stringify(history, null, 1)); } catch { /* 그만 */ }
  onChange(list());
}
const list = () => ({ items: history, busy: !!running, found: exePath !== null });

/** claude 실행 파일 찾기 — npm 전역 설치 · 네이티브 설치 · PATH 순 */
function findClaude() {
  if (exePath !== undefined) return Promise.resolve(exePath);
  const home = os.homedir();
  const cands = process.platform === 'win32'
    ? [path.join(process.env.APPDATA || '', 'npm', 'node_modules', '@anthropic-ai', 'claude-code', 'bin', 'claude.exe'),
      path.join(home, '.local', 'bin', 'claude.exe')]
    : [path.join(home, '.local', 'bin', 'claude'), '/opt/homebrew/bin/claude', '/usr/local/bin/claude'];
  const hit = cands.find((p) => { try { return fs.statSync(p).isFile(); } catch { return false; } });
  if (hit) return Promise.resolve((exePath = hit));
  return new Promise((resolve) => {
    execFile(process.platform === 'win32' ? 'where' : 'which', ['claude'], { windowsHide: true }, (err, out) => {
      const first = !err && String(out).split(/\r?\n/).map((s) => s.trim()).find((s) => s && !/\.cmd$|\.ps1$/i.test(s));
      resolve((exePath = first || null));
    });
  });
}

/** 묻기 — 한 번에 하나. model: '' (Claude Code 기본) | 'sonnet' | 'haiku' | 'opus' */
async function ask(question, model) {
  const q = String(question || '').trim();
  if (!q) return { ok: false, error: '물어볼 걸 적어 주세요' };
  if (running) return { ok: false, error: '앞 질문의 답을 기다리는 중이에요' };
  running = { id: null, child: null };          // 실행 파일을 찾는 사이에 또 묻지 못하게 먼저 잡아 둔다
  const exe = await findClaude();
  if (!exe) { running = null; return { ok: false, error: 'Claude Code 를 찾지 못했어요 (claude 명령이 깔려 있어야 해요)' }; }

  const item = { id: 'q' + Date.now().toString(36), q: q.slice(0, 8000), a: '', status: 'pending', at: Date.now(), model: model || '' };
  history.unshift(item);
  save();

  const cwd = path.join(dir, 'ask');
  fs.mkdirSync(cwd, { recursive: true });
  const args = ['-p', '--output-format', 'json', '--tools', '', '--no-session-persistence', '--settings', JSON.stringify({ disableAllHooks: true })];
  if (['sonnet', 'haiku', 'opus'].includes(model)) args.push('--model', model);
  const t0 = Date.now();
  const child = spawn(exe, args, { cwd, windowsHide: true, env: { ...process.env, DESKPET_ASK: '1' } });
  running = { id: item.id, child };
  let out = '', err = '';
  child.stdout.on('data', (d) => { out += d; });
  child.stderr.on('data', (d) => { err += d; });
  child.stdin.end(item.q, 'utf8');
  const timer = setTimeout(() => { try { child.kill(); } catch { /* 이미 끝남 */ } }, TIMEOUT);

  return new Promise((resolve) => {
    const finish = (status, text) => {
      clearTimeout(timer);
      running = null;
      item.status = status;
      item.a = text;
      item.sec = Math.round((Date.now() - t0) / 1000);
      save();
      console.log('[ask] 답', status, item.sec + '초');      // 질문 · 답 내용은 로그에 안 남긴다
      resolve({ ok: status === 'done', item });
    };
    child.on('error', (e) => finish('error', 'Claude Code 를 실행하지 못했어요: ' + e.message));
    child.on('close', (code, signal) => {
      if (signal || Date.now() - t0 >= TIMEOUT) return finish('error', '답이 너무 오래 걸려서 그만뒀어요 (3분)');
      try {
        const j = JSON.parse(out.trim().split(/\r?\n/).pop());
        if (j.is_error) return finish('error', String(j.result || '오류가 났어요'));
        return finish('done', String(j.result || '').trim() || '(빈 답)');
      } catch {
        const why = (err || out).trim().split(/\r?\n/).slice(-3).join(' ').slice(0, 300);
        return finish('error', '답을 읽지 못했어요 (코드 ' + code + ')' + (why ? ' — ' + why : ''));
      }
    });
  });
}

function cancel() {
  if (running && running.child) { try { running.child.kill(); } catch { /* 그만 */ } }
}
function remove(id) {
  if (running && running.id === id) return list();
  history = history.filter((h) => h.id !== id);
  save();
  return list();
}
function clear() {
  history = history.filter((h) => h.status === 'pending');
  save();
  return list();
}
const get = (id) => history.find((h) => h.id === id) || null;

module.exports = { init, ask, cancel, remove, clear, list, get, findClaude };
