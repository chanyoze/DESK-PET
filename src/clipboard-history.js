/**
 * 클립보드 기록
 * -------------------------------------------------------------
 * 1초마다 클립보드 글자를 보고 바뀌었으면 기록한다 (Electron 엔 "바뀜" 이벤트가 없다).
 *  - 최근 MAX 개, 같은 글은 맨 위로 올리기만, 빈 글 · 아주 긴 글(LIMIT 자 넘음)은 건너뛴다
 *  - **앱을 끄면 지워진다** — 비밀번호 · 사내 데이터가 복사돼 있을 수 있어서 디스크에 남기지 않는다.
 *    📌 고정한 것만 userData/clipboard-pins.json 에 남는다
 *  - 일시정지(설정 clipPaused) 동안은 기록하지 않는다
 *  - 내용은 로그에 절대 찍지 않는다
 *
 * Electron 44 부터 clipboard.readText · writeText 가 Promise 를 돌려준다 (예전엔 바로 글자).
 * 둘 다 되게 await 로 받는다 — 바로 글자로 쓰면 "t.trim is not a function" 이 1초마다 난다 (2026-10-02 겪음).
 */
const { clipboard } = require('electron');
const fs = require('fs');
const path = require('path');

const MAX = 25;
const LIMIT = 20000;

let items = [];          // 최근 — [{ text, at }]  (메모리에만)
let pins = [];           // 고정 — [{ text, at }]  (파일에)
let pinFile = null;
let last = '';
let timer = null;
let busy = false;
let paused = () => false;

async function read() {
  try {
    const v = await clipboard.readText();
    return typeof v === 'string' ? v : '';
  } catch {
    return '';
  }
}

async function write(text) {
  try { await clipboard.writeText(String(text)); } catch { /* 못 써도 그만 */ }
}

async function start(userData, isPaused) {
  pinFile = path.join(userData, 'clipboard-pins.json');
  try { pins = JSON.parse(fs.readFileSync(pinFile, 'utf8')); } catch { pins = []; }
  if (!Array.isArray(pins)) pins = [];
  paused = isPaused;
  last = await read();           // 켤 때 들어 있던 것은 기록하지 않는다 (앱을 켜기 전 것)
  timer = setInterval(tick, 1000);
}

async function tick() {
  if (busy) return;              // 앞 읽기가 안 끝났으면 건너뛴다
  busy = true;
  try {
    const t = await read();
    if (t === last) return;
    last = t;
    if (paused() || !t.trim() || t.length > LIMIT) return;
    items = [{ text: t, at: Date.now() }].concat(items.filter((x) => x.text !== t)).slice(0, MAX);
  } catch { /* 한 번 실패는 무시 */ } finally {
    busy = false;
  }
}

function savePins() {
  try {
    fs.mkdirSync(path.dirname(pinFile), { recursive: true });
    fs.writeFileSync(pinFile, JSON.stringify(pins, null, 2));
  } catch { /* 못 남겨도 그만 */ }
}

/** 화면용 — 고정 먼저, 그다음 최근 (고정된 글은 최근에서 뺀다) */
function list() {
  const pinned = new Set(pins.map((p) => p.text));
  return {
    pins: pins.map((p) => ({ ...p, pinned: true })),
    recent: items.filter((x) => !pinned.has(x.text)),
    paused: paused(),
  };
}

/** 다시 복사 — 우리가 넣은 것도 기록 맨 위로 */
async function copy(text) {
  text = String(text);
  last = text;                   // 다음 tick 이 새로 복사한 것으로 보지 않게 먼저
  await write(text);
  items = [{ text, at: Date.now() }].concat(items.filter((x) => x.text !== text)).slice(0, MAX);
  return list();
}

function pin(text, on) {
  text = String(text);
  if (on) { if (!pins.some((p) => p.text === text)) pins.unshift({ text, at: Date.now() }); }
  else pins = pins.filter((p) => p.text !== text);
  savePins();
  return list();
}

function remove(text) {
  items = items.filter((x) => x.text !== text);
  return list();
}

function clear() {
  items = [];
  return list();
}

function stop() {
  clearInterval(timer);
  items = [];
}

module.exports = { start, stop, list, copy, pin, remove, clear, read };
