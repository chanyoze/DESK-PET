/**
 * 설정 저장 — userData 폴더의 JSON 하나.
 * 캐릭터·크기·리마인더가 재시작 후에도 유지된다.
 */
const fs = require('fs');
const path = require('path');
const { app } = require('electron');

const FILE = () => path.join(app.getPath('userData'), 'settings.json');

const DEFAULTS = {
  character: null,     // null = 설치된 첫 캐릭터
  companion: null,     // 함께 다닐 두 번째 캐릭터 (null = 혼자)
  display: null,       // 돌아다닐 모니터 id (null = 주 모니터)
  tone: 'light',       // 분위기: light 가볍게 / dark 원작처럼
  sizeScale: 1,
  reminders: [],       // { id, text, at: "HH:MM" | epoch ms, repeat: "daily"|null, done }
  notifyPort: 45678,
  speakOnClaude: true,
};

/**
 * 빌드에 preset.json 이 들어 있으면 기본값으로 쓴다 (개인 빌드용 — tools/build-private.js).
 * 공개 빌드에는 없어서 DEFAULTS 그대로다. 사용자가 바꾼 설정은 이 위에 덮인다.
 */
try {
  Object.assign(DEFAULTS, JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'preset.json'), 'utf8')));
} catch { /* 없으면 그만 */ }

let cache = null;

function load() {
  if (cache) return cache;
  try {
    cache = { ...DEFAULTS, ...JSON.parse(fs.readFileSync(FILE(), 'utf8')) };
  } catch {
    cache = { ...DEFAULTS };
  }
  return cache;
}

function save(patch) {
  const next = { ...load(), ...patch };
  cache = next;
  try {
    fs.mkdirSync(path.dirname(FILE()), { recursive: true });
    fs.writeFileSync(FILE(), JSON.stringify(next, null, 2));
  } catch (e) {
    console.error('[settings] 저장 실패:', e.message);
  }
  return next;
}

module.exports = { load, save, FILE };
