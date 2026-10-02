/**
 * 바로가기 — 자주 여는 폴더 · 파일 · 주소 · 프로그램 · 명령
 * -------------------------------------------------------------
 * userData/shortcuts.json — [{ id, name, target, kind }]
 *   kind: auto(기본 — target 을 보고 정한다) | url | path | command
 *   - url:     http(s):// … → 기본 브라우저
 *   - path:    있는 파일 · 폴더 → 기본 프로그램 (폴더는 탐색기)
 *   - command: 그 밖의 것 → 셸 명령으로 실행 (예: code "C:\work\DESK-PET")
 * electron 을 쓰지 않는 부분(읽기 · 쓰기 · 종류 판별)만 둔다 — 실행은 main.js
 */
const fs = require('fs');
const path = require('path');

function load(file) {
  try {
    const j = JSON.parse(fs.readFileSync(file, 'utf8'));
    return Array.isArray(j) ? j : [];
  } catch {
    return [];
  }
}

function save(file, list) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = file + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(list, null, 2));
  fs.renameSync(tmp, file);
  return list;
}

/** 실행 방식 판별 */
function kindOf(item) {
  if (item.kind && item.kind !== 'auto') return item.kind;
  const t = String(item.target || '').trim();
  if (/^(https?|mailto|ftp):/i.test(t)) return 'url';
  const unq = t.replace(/^"(.*)"$/, '$1');
  if (fs.existsSync(unq)) return 'path';
  return 'command';
}

/** 추가 · 수정 (id 가 있으면 수정) */
function upsert(file, item) {
  const list = load(file);
  const clean = {
    id: item.id || 's' + Date.now().toString(36),
    name: String(item.name || '').trim().slice(0, 60) || String(item.target || '').trim().slice(0, 60),
    target: String(item.target || '').trim(),
    kind: ['auto', 'url', 'path', 'command'].includes(item.kind) ? item.kind : 'auto',
  };
  if (!clean.target) return list;
  const i = list.findIndex((x) => x.id === clean.id);
  if (i >= 0) list[i] = clean; else list.push(clean);
  return save(file, list);
}

function remove(file, id) {
  return save(file, load(file).filter((x) => x.id !== id));
}

/** 순서 바꾸기 (위 · 아래) */
function move(file, id, dir) {
  const list = load(file);
  const i = list.findIndex((x) => x.id === id);
  const j = i + (dir < 0 ? -1 : 1);
  if (i < 0 || j < 0 || j >= list.length) return list;
  [list[i], list[j]] = [list[j], list[i]];
  return save(file, list);
}

module.exports = { load, save, kindOf, upsert, remove, move };
