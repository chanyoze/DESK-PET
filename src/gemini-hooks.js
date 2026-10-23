/**
 * Gemini CLI (agy) 훅 연결
 * -------------------------------------------------------------
 * ~/.gemini/config/hooks.json 에 우리 훅을 넣고 뺀다.
 * Stop 이벤트 발생 시(턴/세션 종료) 데스크펫 로컬 알림 서버로 전달하여
 * "제미나이 완료" 카드가 말풍선으로 안내되도록 한다.
 */
const fs = require('fs');
const path = require('path');
const os = require('os');

const KEY = 'deskpet-notify';

const defaultHooksPath = () => path.join(os.homedir(), '.gemini', 'config', 'hooks.json');
const defaultScriptPath = () => path.join(os.homedir(), '.gemini', 'config', 'hooks', 'deskpet-stop-hook.js');

function hookScript(port) {
  return `/**
 * DeskPet - Gemini CLI (agy) Stop Hook
 * 세션 루프 종료 시 DeskPet 로컬 서버로 완료/오류 알림을 전송한다.
 */
const http = require('http');
const path = require('path');
const fs = require('fs');

function finish() {
  process.stdout.write(JSON.stringify({}) + '\\n');
  process.exit(0);
}

try {
  const raw = fs.readFileSync(0, 'utf8').trim();
  const payload = raw ? JSON.parse(raw) : {};
  const reason = String(payload.terminationReason || '');

  // NO_TOOL_CALL: 일반 완료, ERROR: 오류
  const isDone = reason === 'NO_TOOL_CALL' || reason === '' || reason === 'TERMINAL_STEP_TYPE';
  const isFail = reason === 'ERROR';

  if (!isDone && !isFail) {
    finish();
  }

  const ws = Array.isArray(payload.workspacePaths) && payload.workspacePaths[0];
  const project = ws ? path.basename(ws) : '';
  const body = JSON.stringify({
    source: 'Gemini',
    level: isFail ? 'fail' : 'done',
    mood: isFail ? 'alert' : 'happy',
    title: isFail ? '제미나이 오류' : '제미나이 완료',
    text: isFail ? '제미나이 작업 중 오류가 발생했어' : '제미나이 작업이 끝났어. 확인해 봐',
    project: project,
    ms: 9000
  });

  const req = http.request({
    hostname: '127.0.0.1',
    port: ${port},
    path: '/say',
    method: 'POST',
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Content-Length': Buffer.byteLength(body)
    },
    timeout: 1500
  }, () => finish());

  req.on('error', () => finish());
  req.on('timeout', () => { req.destroy(); finish(); });
  req.write(body);
  req.end();
} catch (_) {
  finish();
}
`;
}

function readHooks(file) {
  if (!fs.existsSync(file)) return {};
  const raw = fs.readFileSync(file, 'utf8').replace(/^\\uFEFF/, '');
  if (!raw.trim()) return {};
  try {
    return JSON.parse(raw);
  } catch (e) {
    throw new Error('hooks.json 을 읽을 수 없습니다: ' + e.message);
  }
}

function writeHooks(file, obj) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(obj, null, 2), 'utf8');
}

function status({ hooksPath = defaultHooksPath(), scriptPath = defaultScriptPath() } = {}) {
  const cfg = readHooks(hooksPath);
  const entry = cfg[KEY];
  const scriptOk = fs.existsSync(scriptPath);
  const connected = !!(entry && entry.enabled !== false && Array.isArray(entry.Stop) && entry.Stop.length > 0 && scriptOk);
  return { connected, hooksPath, scriptPath };
}

function install({ hooksPath = defaultHooksPath(), scriptPath = defaultScriptPath(), port = 45678 } = {}) {
  const cfg = readHooks(hooksPath);
  fs.mkdirSync(path.dirname(scriptPath), { recursive: true });
  fs.writeFileSync(scriptPath, hookScript(port), 'utf8');

  cfg[KEY] = {
    enabled: true,
    Stop: [
      {
        type: 'command',
        command: 'node ./hooks/deskpet-stop-hook.js',
        timeout: 5
      }
    ]
  };

  writeHooks(hooksPath, cfg);
  return status({ hooksPath, scriptPath });
}

function uninstall({ hooksPath = defaultHooksPath(), scriptPath = defaultScriptPath() } = {}) {
  const cfg = readHooks(hooksPath);
  delete cfg[KEY];
  writeHooks(hooksPath, cfg);
  try { if (fs.existsSync(scriptPath)) fs.unlinkSync(scriptPath); } catch (_) {}
  return status({ hooksPath, scriptPath });
}

module.exports = { status, install, uninstall, defaultHooksPath, defaultScriptPath, hookScript };
