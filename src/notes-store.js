/**
 * 할 일(todo.md) · 메모(notes.json) 저장
 * -------------------------------------------------------------
 * 할 일은 평범한 마크다운이다. 메모장 · VS Code 로 직접 고쳐도 되고,
 * Claude Code 에게 "todo 에 ○○ 추가해줘" 해도 된다. 앱은 파일이 바뀌면 다시 읽는다.
 *
 *   # 할 일
 *
 *   ## 2026-09-30            ← 날짜 (일자별)
 *   ### 오전                  ← 카테고리 (이름은 자유 — 오전 · 오후 · 3시 전까지 · 회의 …)
 *   - [ ] 승인모듈 검토 (~11:00)          ← 기한: (~시각) · (~날짜) · (~날짜 시각)
 *   - [x] 끝낸 것
 *
 *   ## 언젠가                 ← 백로그 (기약 없는 일). "백로그" 라고 써도 된다
 *   - [ ] 개발표준 다시 읽기
 *
 * 카테고리 이름에 시각이 들어 있으면 그 시각을 기한으로 본다 (항목에 기한을 따로 안 적었을 때):
 *   오전 → 12:00 · 오후 → 18:00 · "3시 전까지" / "15시 전" → 15:00 (1~7시는 오후로 본다)
 * 날짜 제목이 없는 곳(맨 위)에 적힌 항목은 백로그로 본다 (예전 평평한 목록 호환).
 *
 * 앱이 고치는 건 항목 줄과, 항목을 넣을 때 필요한 제목 줄뿐이다. 나머지 줄은 그대로 둔다.
 * electron 을 쓰지 않는다 (경로를 받아서 node 만으로 시험할 수 있게).
 */
const fs = require('fs');
const path = require('path');

const ITEM = /^(\s*[-*]\s+\[)([ xX])(\]\s?)(.*)$/;
const H2 = /^##\s+(.+?)\s*$/;
const H3 = /^###\s+(.+?)\s*$/;
const DATE = /^(\d{4})-(\d{2})-(\d{2})\b/;
// \b 는 한글 뒤에서 경계로 안 잡혀서 쓰지 않는다
const BACKLOG = /^(언젠가|백로그|someday|backlog)(?=$|[\s(:·-])/i;
/** 항목 끝의 기한 — (~15:00) (~10-01) (~2026-10-01) (~10-01 15:00) */
const DUE = /\s*\(~\s*(?:((?:\d{4}-)?\d{1,2}-\d{1,2}))?\s*(\d{1,2}:\d{2})?\s*\)\s*$/;

const BACKLOG_TITLE = '언젠가';
const REPEAT_TITLE = '반복';
const REPEAT = /^(반복|repeat)(?=$|[\s(:·-])/i;
/** 반복 규칙 — (매일) (평일 09:00) (주말) (매주 월,수 17:30) (매월 1일) */
const RULE = /\s*\((매일|평일|주말|매주\s*[월화수목금토일](?:\s*[,·]\s*[월화수목금토일])*|매월\s*\d{1,2}\s*일)(?:\s+(\d{1,2}:\d{2}))?\)\s*$/;
/** 설명 줄 — 두 칸 이상 들여쓴 줄 (공백뿐인 줄도 설명 안의 빈 줄로 본다) */
const CONT = /^ {2,}/;

const TEMPLATE = [
  '# 할 일',
  '',
  '<!-- DeskPet 이 읽는 목록. "## 날짜" 아래 "### 카테고리" 아래 "- [ ] 할 일 (~기한)". 기약 없는 일은 "## 언젠가" -->',
  '',
].join('\n');

const pad = (n) => String(n).padStart(2, '0');
const ymd = (d) => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());

function readRaw(file) {
  try {
    return fs.readFileSync(file, 'utf8').replace(/^﻿/, '');
  } catch {
    return null;
  }
}

/** 카테고리 이름 → 기한 시각 "HH:MM" (없으면 null) */
function categoryTime(cat) {
  if (!cat) return null;
  const s = cat.replace(/\s+/g, '');
  let m = /(\d{1,2})(?::(\d{2}))?시?(?:전|까지)/.exec(s) || /(\d{1,2})시/.exec(s);
  if (m) {
    let h = parseInt(m[1], 10);
    if (h >= 1 && h <= 7) h += 12;                  // "3시 전까지" 는 오후 3시
    if (/오후/.test(s) && h < 12) h += 12;
    return pad(h) + ':' + (m[2] || '00');
  }
  if (/^오전/.test(s)) return '12:00';
  if (/^오후/.test(s)) return '18:00';
  return null;
}

/** 항목 글에서 기한을 떼어 낸다 → { text, due: "YYYY-MM-DD HH:MM" | "YYYY-MM-DD" | null } */
function splitDue(raw, sectionDate, category) {
  const m = DUE.exec(raw);
  let text = raw, dDate = null, dTime = null;
  if (m && (m[1] || m[2])) {
    text = raw.slice(0, m.index).trim();
    if (m[1]) {
      const parts = m[1].split('-');
      const y = parts.length === 3 ? parts[0] : (sectionDate || ymd(new Date())).slice(0, 4);
      const [mo, d] = parts.slice(-2);
      dDate = y + '-' + pad(mo) + '-' + pad(d);
    }
    if (m[2]) dTime = pad(m[2].split(':')[0]) + ':' + m[2].split(':')[1];
  }
  if (!dTime && !dDate) dTime = categoryTime(category);   // 카테고리 이름의 시각
  if (dTime && !dDate) dDate = sectionDate;               // 시각만 있으면 그 날짜의
  const due = dDate ? dDate + (dTime ? ' ' + dTime : '') : null;
  return { text: text.trim(), due, explicitDue: !!(m && (m[1] || m[2])) };
}

/**
 * 파일 → { lines, items, sections, eol }
 * item: { i, line, text, done, date, backlog, category, due }
 * sections: [{ key: 날짜 | '언젠가', line, cats: [{ name, line }] }]
 */
function parse(raw) {
  const eol = /\r\n/.test(raw) ? '\r\n' : '\n';
  const lines = raw.split(/\r?\n/);
  const items = [];
  const sections = [];
  let date = null, backlog = true, repeat = false, category = null, sec = null;   // 제목 전 항목은 백로그
  let last = null;                                                  // 설명 줄을 붙일 바로 앞 항목
  lines.forEach((l, line) => {
    let m;
    // 항목 바로 아래 두 칸 이상 들여쓴 줄은 그 항목의 설명 (빈 줄이 끼면 끊긴다)
    if (last && CONT.test(l) && !ITEM.exec(l)) {
      last.detailLines.push(l.replace(/^ {2}/, ''));
      last.lineEnd = line;
      return;
    }
    last = null;
    if ((m = H2.exec(l))) {
      const t = m[1];
      const dm = DATE.exec(t);
      date = dm ? dm[0] : null;
      backlog = !dm && BACKLOG.test(t);
      repeat = !dm && !backlog && REPEAT.test(t);
      category = null;
      sec = { key: dm ? dm[0] : t, date, backlog, repeat, line, cats: [] };
      sections.push(sec);
      return;
    }
    if ((m = H3.exec(l))) {
      category = m[1];
      if (sec) sec.cats.push({ name: category, line });
      return;
    }
    if ((m = ITEM.exec(l)) && m[4].trim()) {
      if (repeat) {
        // 반복 틀 — 끝의 (규칙 시각) 을 떼어 둔다. 날짜 · 기한은 없다 (그날 할 일로 만들 때 붙는다)
        const raw = m[4].trim();
        const r = RULE.exec(raw);
        last = {
          i: items.length, line, lineEnd: line, text: (r ? raw.slice(0, r.index) : raw).trim(), done: m[2] !== ' ',
          date: null, backlog: false, inRepeat: true, category, due: null, explicitDue: false, detailLines: [],
          repeat: r ? { rule: r[1].replace(/\s+/g, ' ').trim(), time: r[2] ? pad(r[2].split(':')[0]) + ':' + r[2].split(':')[1] : null } : null,
        };
        items.push(last);
        return;
      }
      const { text, due, explicitDue } = splitDue(m[4].trim(), date, category);
      last = {
        i: items.length, line, lineEnd: line, text, done: m[2] !== ' ',
        date, backlog: backlog || (!date && !sec), category, due, explicitDue, detailLines: [],
      };
      items.push(last);
    }
  });
  for (const it of items) {
    it.detail = it.detailLines.join('\n').replace(/\s+$/, '');
    delete it.detailLines;
  }
  return { lines, items, sections, eol };
}

/** 항목 줄들 — "- [ ] 제목 (~기한)" + 두 칸 들여쓴 설명 줄 (설명 안의 빈 줄은 공백 두 칸으로 이어 둔다) */
function itemLines(title, detail, due, secDate, done, repeat) {
  const tail = repeat ? ' (' + repeat.rule + (repeat.time ? ' ' + repeat.time : '') + ')' : dueSuffix(due, secDate);
  const out = ['- [' + (done ? 'x' : ' ') + '] ' + title + tail];
  if (detail) for (const d of String(detail).split(/\r?\n/)) out.push('  ' + d);
  return out;
}

/** 입력 글 → [{ title, detail }] — split 이면 줄마다 하나, 아니면 첫 줄 제목 + 나머지 설명 */
function toEntries(text, split) {
  const strip = (t) => t.replace(/^\s*[-*]\s+(\[[ xX]\]\s*)?/, '').trim();
  const raw = String(text || '').replace(/\s+$/, '').split(/\r?\n/);
  if (split) return raw.map(strip).filter(Boolean).map((t) => ({ title: t, detail: '' }));
  while (raw.length && !raw[0].trim()) raw.shift();
  if (!raw.length) return [];
  return [{ title: strip(raw[0]), detail: raw.slice(1).join('\n').replace(/^\s*\n/, '') }];
}

function load(file) {
  const raw = readRaw(file);
  if (raw == null) return { items: [], categories: [], exists: false };
  const p = parse(raw);
  const categories = [...new Set(p.items.map((x) => x.category).filter(Boolean))];
  return { items: p.items, categories, exists: true };
}

function write(file, lines, eol) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = file + '.tmp';
  fs.writeFileSync(tmp, lines.join(eol), 'utf8');
  fs.renameSync(tmp, file);
}

/** 없으면 안내 문구가 든 빈 목록을 만든다 */
function ensure(file) {
  if (readRaw(file) == null) {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, TEMPLATE, 'utf8');
  }
}

/** 기한 → 항목 끝에 붙일 "(~…)" (같은 날짜면 시각만) */
function dueSuffix(due, sectionDate) {
  if (!due) return '';
  const [d, t] = due.split(' ');
  if (d === sectionDate && t) return ' (~' + t + ')';
  return ' (~' + d.slice(5) + (t ? ' ' + t : '') + ')';
}

/** 구역(블록)의 끝 — 다음 같은 수준 이상의 제목 전, 끝의 빈 줄 앞 */
function blockEnd(lines, from, stopAtH3) {
  let end = lines.length;
  for (let n = from + 1; n < lines.length; n++) {
    if (H2.test(lines[n]) || (stopAtH3 && H3.test(lines[n]))) { end = n; break; }
  }
  while (end > from + 1 && lines[end - 1].trim() === '') end--;
  return end;
}

/**
 * 항목을 넣는다.
 *   opts = { text(여러 줄이면 줄마다 하나), date: "YYYY-MM-DD" | null, backlog, category, due: "YYYY-MM-DD[ HH:MM]" }
 * 날짜 · 백로그 구역과 카테고리 제목이 없으면 만든다. 날짜 구역은 날짜순, 백로그는 맨 끝.
 */
function add(file, opts, retried) {
  if (typeof opts === 'string') opts = { text: opts, date: ymd(new Date()) };
  ensure(file);
  const { lines, sections, eol } = parse(readRaw(file));
  const news = toEntries(opts.text, opts.split);
  if (!news.length) return load(file);

  const repeat = opts.repeat ? normRule(opts.repeat) : null;          // { rule, time } — 반복 틀로 넣기
  const backlog = !repeat && (!!opts.backlog || !opts.date);
  const key = backlog || repeat ? null : opts.date;
  const cat = (opts.category || '').trim() || null;

  // 1) 구역 찾기 · 만들기 — 날짜 구역은 날짜순, 반복은 언젠가 앞, 언젠가는 맨 끝
  let sec = sections.find((s) => (repeat ? s.repeat : backlog ? s.backlog : s.date === key));
  if (!sec) {
    if (retried) throw new Error('할 일 구역을 만들지 못했다: ' + (repeat ? REPEAT_TITLE : backlog ? BACKLOG_TITLE : key));
    const title = '## ' + (repeat ? REPEAT_TITLE : backlog ? BACKLOG_TITLE : key);
    let at;
    if (backlog) {
      at = lines.length;
    } else if (repeat) {
      const after = sections.find((s) => s.backlog);
      at = after ? after.line : lines.length;
    } else {
      // 날짜순 — 이 날짜보다 늦은 첫 날짜 구역이나 반복 · 백로그 앞
      const after = sections.find((s) => s.backlog || s.repeat || (s.date && s.date > key));
      at = after ? after.line : lines.length;
    }
    while (at > 0 && lines[at - 1].trim() === '') at--;
    const block = ['', title];
    lines.splice(at, 0, ...block);
    return add(writeAndReload(file, lines, eol), opts, true);     // 줄 번호가 바뀌었으니 다시 읽어서 넣는다
  }

  // 2) 카테고리 — 없으면 구역 끝에 만든다. 카테고리가 없는 항목은 구역 첫 카테고리 앞에
  let at;
  const next = sections[sections.indexOf(sec) + 1];
  const secEnd = next ? next.line : lines.length;
  if (cat) {
    const c = sec.cats.find((x) => x.name === cat);
    if (c) {
      at = blockEnd(lines, c.line, true);
      if (at > secEnd) at = secEnd;
    } else {
      at = blockEnd(lines, sec.line, false);
      lines.splice(at, 0, '### ' + cat);
      at++;
    }
  } else {
    at = sec.cats.length ? sec.cats[0].line : blockEnd(lines, sec.line, false);
    while (at > sec.line + 1 && lines[at - 1].trim() === '') at--;
  }
  const secDate = backlog || repeat ? null : key;
  lines.splice(at, 0, ...news.flatMap((e) => itemLines(e.title, e.detail, repeat ? null : opts.due, secDate, opts.done, repeat)));
  if (lines[lines.length - 1] !== '') lines.push('');
  write(file, lines, eol);
  return load(file);
}

/** 순번 + 제목으로 항목을 찾는다 (그 사이 파일이 바뀌어 순번이 밀렸으면 제목으로) */
function findItem(items, i, text) {
  return items.find((x) => x.i === i && x.text === text) || items.find((x) => x.text === text);
}

/** 항목 지우기 — 설명 줄까지 */
function remove(file, i, text) {
  const raw = readRaw(file);
  if (raw == null) return load(file);
  const { lines, items, eol } = parse(raw);
  const it = findItem(items, i, text);
  if (!it) return load(file);
  lines.splice(it.line, it.lineEnd - it.line + 1);
  write(file, lines, eol);
  return load(file);
}

/**
 * 항목 고치기 — opts = { text(첫 줄 제목 + 설명), date, backlog, category, due }
 * 날짜 · 분류가 그대로면 그 자리에서 바꾸고, 바뀌었으면 빼서 새 자리에 넣는다. 체크 상태는 유지.
 */
function update(file, i, text, opts) {
  const raw = readRaw(file);
  if (raw == null) return load(file);
  const { lines, items, eol } = parse(raw);
  const it = findItem(items, i, text);
  if (!it) return load(file);
  const e = toEntries(opts.text, false)[0];
  if (!e) return load(file);
  const repeat = opts.repeat ? normRule(opts.repeat) : null;
  const backlog = !repeat && (!!opts.backlog || !opts.date);
  const samePlace = !!repeat === !!it.inRepeat && backlog === !!it.backlog && (backlog || repeat || opts.date === it.date) &&
    ((opts.category || '').trim() || null) === (it.category || null);
  if (samePlace) {
    lines.splice(it.line, it.lineEnd - it.line + 1,
      ...itemLines(e.title, e.detail, repeat ? null : opts.due, backlog || repeat ? null : opts.date, it.done, repeat));
    write(file, lines, eol);
    return load(file);
  }
  lines.splice(it.line, it.lineEnd - it.line + 1);
  write(file, lines, eol);
  return add(file, { ...opts, split: false, done: it.done });
}

// ── 반복 할 일 ─────────────────────────────────────────────
/**
 * 반복 규칙 다듬기 — "매주 월, 수" · { rule, time } 둘 다 받는다. 알 수 없는 규칙이면 null
 *   매일 · 평일 · 주말 · 매주 월,수 · 매월 1일  (+ 시각 HH:MM)
 */
function normRule(r) {
  const rule = typeof r === 'string' ? r : r && r.rule;
  const time = typeof r === 'object' && r ? r.time : null;
  const m = RULE.exec(' (' + String(rule || '').trim() + (time ? ' ' + time : '') + ')');
  if (!m) return null;
  const t = m[2] ? pad(m[2].split(':')[0]) + ':' + m[2].split(':')[1] : null;
  const clean = m[1].replace(/\s*[,·]\s*/g, ',').replace(/^매주\s*/, '매주 ').replace(/^매월\s*(\d+)\s*일$/, '매월 $1일');
  return { rule: clean, time: t };
}

const WEEK = ['일', '월', '화', '수', '목', '금', '토'];

/** 이 날짜(Date)에 해당하는 규칙인지 */
function ruleMatches(rule, d) {
  const dow = d.getDay();
  if (rule === '매일') return true;
  if (rule === '평일') return dow >= 1 && dow <= 5;
  if (rule === '주말') return dow === 0 || dow === 6;
  let m = /^매주 (.+)$/.exec(rule);
  if (m) return m[1].split(',').map((x) => x.trim()).includes(WEEK[dow]);
  m = /^매월 (\d+)일$/.exec(rule);
  if (m) {
    const want = parseInt(m[1], 10);
    const lastDay = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
    return d.getDate() === Math.min(want, lastDay);      // 31일 규칙은 짧은 달엔 말일에
  }
  return false;
}

/**
 * 그날 할 일 만들기 — 반복 틀 중 그날에 해당하는 것을 그 날짜 구역에 넣는다.
 *  - 이미 그날 같은 제목이 있으면 넣지 않는다
 *  - made: 그날 이미 만든 제목들 (설정에 둔다) — 사용자가 지운 걸 다시 만들지 않으려고
 *  - 틀을 체크([x])해 두면 쉬는 중으로 보고 만들지 않는다
 * @returns { added: [제목], made: [제목] }
 */
function materialize(file, d, made) {
  const raw = readRaw(file);
  const done = new Set(made || []);
  if (raw == null) return { added: [], made: [...done] };
  const { items } = parse(raw);
  const key = ymd(d);
  const added = [];
  for (const t of items.filter((x) => x.inRepeat && x.repeat && !x.done && ruleMatches(x.repeat.rule, d))) {
    if (done.has(t.text)) continue;
    done.add(t.text);
    const fresh = load(file).items;
    if (fresh.some((x) => x.date === key && x.text === t.text)) continue;
    add(file, {
      text: t.text + (t.detail ? '\n' + t.detail : ''), date: key, category: t.category,
      due: t.repeat.time ? key + ' ' + t.repeat.time : null,
    });
    added.push(t.text);
  }
  return { added, made: [...done] };
}

/**
 * 여러 항목을 한 번에 — target: { date } | { backlog: true } | { done: true }
 * 밀린 할 일 정리에 쓴다. 옮길 땐 분류 · 설명은 그대로, 같은 날짜에 붙어 있던 시각 기한은 새 날짜로 옮긴다.
 */
function moveItems(file, refs, target) {
  let n = 0;
  const from = new Set();
  for (const ref of refs || []) {
    const raw = readRaw(file);
    if (raw == null) break;
    const { items } = parse(raw);
    const it = findItem(items, ref.i, ref.text);
    if (!it) continue;
    if (target.done) {
      if (!it.done) { toggle(file, it.i, it.text, true); n++; }
      continue;
    }
    let due = it.explicitDue ? it.due : null;
    if (due && target.date && it.date && due.startsWith(it.date + ' ')) due = target.date + due.slice(10);
    if (due && target.backlog && it.date && due.startsWith(it.date)) due = null;
    remove(file, it.i, it.text);
    if (it.date) from.add(it.date);
    n++;
    // 반복으로 그날 이미 만들어진 같은 일이 있으면 합친다 (두 줄로 늘지 않게)
    if (target.date && items.some((x) => x.date === target.date && x.text === it.text && x !== it)) continue;
    add(file, { text: it.text + (it.detail ? '\n' + it.detail : ''), date: target.date || null, backlog: !!target.backlog, category: it.category, due });
  }
  dropEmptyDates(file, [...from].filter((d) => d !== target.date));
  return { ...load(file), moved: n };
}

function writeAndReload(file, lines, eol) {
  write(file, lines, eol);
  return file;
}

/** 옮기고 나서 텅 빈 날짜 구역(분류 제목 · 빈 줄만 남은)은 지운다 — 옮겨 온 날짜만 */
function dropEmptyDates(file, dates) {
  if (!dates.length) return;
  const raw = readRaw(file);
  if (raw == null) return;
  const { lines, eol } = parse(raw);
  const want = new Set(dates);
  for (let n = lines.length - 1; n >= 0; n--) {
    const h = H2.exec(lines[n]);
    const dm = h && DATE.exec(h[1]);
    if (!dm || !want.has(dm[0])) continue;
    let end = n + 1;
    while (end < lines.length && !H2.test(lines[end])) end++;
    if (lines.slice(n + 1, end).every((l) => !l.trim() || H3.test(l))) lines.splice(n, end - n);
  }
  write(file, lines, eol);
}

/**
 * 항목 하나를 체크 / 해제. 순번과 글이 둘 다 맞을 때만 고친다 —
 * 그 사이에 파일이 바뀌어 순번이 밀렸으면 엉뚱한 줄을 건드리지 않게.
 */
function toggle(file, i, text, done) {
  const raw = readRaw(file);
  if (raw == null) return load(file);
  const { lines, items, eol } = parse(raw);
  const it = items.find((x) => x.i === i && x.text === text) || items.find((x) => x.text === text);
  if (!it) return load(file);
  const m = ITEM.exec(lines[it.line]);
  lines[it.line] = m[1] + (done == null ? (it.done ? ' ' : 'x') : done ? 'x' : ' ') + m[3] + m[4];
  write(file, lines, eol);
  return load(file);
}

/** 끝낸 항목을 모두 지운다 (항목이 없어진 빈 카테고리 · 날짜 제목은 남겨 둔다 — 사람이 쓴 틀일 수 있어서) */
function clearDone(file) {
  const raw = readRaw(file);
  if (raw == null) return load(file);
  const { lines, items, eol } = parse(raw);
  const drop = new Set();
  for (const x of items) if (x.done) for (let n = x.line; n <= x.lineEnd; n++) drop.add(n);   // 설명 줄까지
  write(file, lines.filter((_, n) => !drop.has(n)), eol);
  return load(file);
}

// ── 스티커 메모 (notes.json) ─────────────────────────────────
function loadNotes(file) {
  try {
    const j = JSON.parse(fs.readFileSync(file, 'utf8'));
    return Array.isArray(j) ? j : [];
  } catch {
    return [];
  }
}

function saveNotes(file, notes) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = file + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(notes, null, 2), 'utf8');
  fs.renameSync(tmp, file);
  return notes;
}

module.exports = { parse, load, ensure, add, update, remove, toggle, clearDone, materialize, moveItems, normRule, ruleMatches, REPEAT_TITLE, loadNotes, saveNotes, categoryTime, ymd, TEMPLATE, BACKLOG_TITLE };
