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
  sizeScale: 1,
  reminders: [],       // { id, text, at: "HH:MM" | epoch ms, repeat: "daily"|null, done }
  notifyPort: 45678,
  speakOnClaude: true,
};

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
