/**
 * 화면에 붙는 카드 — 할 일 카드 하나 + 스티커 메모 여러 장
 * -------------------------------------------------------------
 * 투명 창 위의 DOM 이다. 평소엔 클릭이 통과하므로, pet.js 의 히트 테스트가 카드 영역을
 * 알 수 있게 hit(x, y) 를 내놓는다 (카드 위에서만 마우스를 받는다).
 *
 *  - 머리줄을 끌어서 옮긴다 (놓으면 위치 저장)
 *  - ‒ 접기 / ✎ 편집 / × 닫기(할 일 카드) · 지우기(메모 — 두 번 눌러야 지운다)
 *  - 할 일 카드: 체크박스로 바로 체크, + 로 추가 (todo.md 에 쓴다)
 *  - 메모: 더블클릭하면 편집 창
 * 글자 입력은 이 창에서 못 받아서(포커스 없는 창) 편집은 메인이 띄우는 입력 창에서 한다.
 */
(function () {
  'use strict';

  const NOTE_COLORS = { yellow: '#f6e58d', pink: '#f8b4c8', green: '#b8e6b0', blue: '#a9d2f5', gray: '#d5d8e0' };
  const TODO_SHOW = 12;      // 카드에 보여 줄 항목 수 (나머지는 스크롤)

  const api = () => window.petAPI;
  let layer = null;
  let stage = null;
  let hidden = false;
  let notes = [];
  let todoCard = { x: null, y: null, collapsed: false, shown: true };
  let todo = { items: [] };
  let drag = null;
  const els = new Map();     // id → element ('todo' = 할 일 카드)

  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

  function init(st) {
    stage = st;
    layer = document.createElement('div');
    layer.className = 'notes-layer';
    // 캐릭터 · 말풍선 · 메뉴보다 먼저 넣어서 그 아래에 깔리게 한다
    document.body.insertBefore(layer, document.body.firstChild);
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  }

  function setStage(st) {
    stage = st;
    render();
  }

  function setData(d) {
    notes = d.notes || [];
    todoCard = { ...todoCard, ...(d.todoCard || {}) };
    hidden = !!d.hidden;
    render();
  }

  function setTodo(t) {
    todo = t || { items: [] };
    render();
  }

  function setHidden(v) {
    hidden = !!v;
    render();
  }

  /** 기본 자리 — 할 일 카드는 오른쪽 위, 메모는 그 왼쪽으로 줄지어 */
  function defaultPos(kind, n) {
    if (kind === 'todo') return { x: stage.workRight - 280, y: stage.workTop + 20 };
    return { x: stage.workRight - 280 - 230 * (1 + (n % 4)), y: stage.workTop + 20 + 30 * Math.floor(n / 4) };
  }

  function place(el, x, y) {
    const w = el.offsetWidth || 220, h = el.offsetHeight || 60;
    const cx = clamp(x, stage.workLeft, stage.workRight - w);
    const cy = clamp(y, stage.workTop, stage.ground - Math.min(h, 40));
    el.style.transform = 'translate3d(' + Math.round(cx) + 'px,' + Math.round(cy) + 'px,0)';
    el._pos = { x: cx, y: cy };
  }

  function button(label, title, fn) {
    const b = document.createElement('button');
    b.className = 'card-btn';
    b.textContent = label;
    b.title = title;
    b.addEventListener('mousedown', (e) => e.stopPropagation());
    b.addEventListener('click', (e) => { e.stopPropagation(); fn(b); });
    return b;
  }

  function header(el, title, id, btns) {
    const h = document.createElement('div');
    h.className = 'card-head';
    const t = document.createElement('span');
    t.className = 'card-title';
    t.textContent = title;
    h.appendChild(t);
    for (const b of btns) h.appendChild(b);
    h.addEventListener('mousedown', (e) => {
      if (e.button !== 0) return;
      e.preventDefault();
      drag = { id, el, dx: e.clientX - el._pos.x, dy: e.clientY - el._pos.y };
      el.classList.add('dragging');
    });
    el.appendChild(h);
  }

  // ── 할 일 카드 — 날짜별 보기 ─────────────────────────────
  // view: 0 = 오늘, ±n = 며칠 앞뒤, 'backlog' = 언젠가
  let view = 0;
  const WEEK = ['일', '월', '화', '수', '목', '금', '토'];
  const pad = (n) => String(n).padStart(2, '0');
  const ymd = (d) => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  const todayStr = () => ymd(new Date());
  const shift = (days) => { const d = new Date(); d.setDate(d.getDate() + days); return ymd(d); };
  const viewDate = () => (view === 'backlog' ? null : shift(view));
  const dueAt = (due) => new Date(due.replace(' ', 'T') + (due.length > 10 ? ':00' : 'T23:59:00')).getTime();

  function dateLabel(ds) {
    const d = new Date(ds + 'T00:00:00');
    const md = (d.getMonth() + 1) + '/' + d.getDate() + '(' + WEEK[d.getDay()] + ')';
    const diff = Math.round((d - new Date(todayStr() + 'T00:00:00')) / 864e5);
    return (diff === 0 ? '오늘 ' : diff === 1 ? '내일 ' : diff === -1 ? '어제 ' : '') + md;
  }

  /** 카드에서 + 를 누르거나 메뉴에서 추가할 때의 기본값 — 지금 보고 있는 날짜 · 언젠가 */
  function addDefaults() {
    return view === 'backlog' ? { backlog: true } : { date: viewDate() };
  }

  function itemRow(it, extraTag) {
    const row = document.createElement('label');
    row.className = 'todo-item' + (it.done ? ' done' : '');
    const cb = document.createElement('input');
    cb.type = 'checkbox';
    cb.checked = it.done;
    cb.addEventListener('change', () => api().todoToggle(it.i, it.text).then(setTodo));
    const tx = document.createElement('span');
    tx.className = 'todo-text';
    tx.textContent = it.text;
    row.appendChild(cb);
    row.appendChild(tx);
    if (extraTag) {
      const t = document.createElement('span');
      t.className = 'chip-date';
      t.textContent = extraTag;
      row.appendChild(t);
    }
    if (it.due) {
      const c = document.createElement('span');
      const at = dueAt(it.due);
      const left = at - Date.now();
      c.className = 'chip-due' + (!it.done && left < 0 ? ' over' : !it.done && left < 3600e3 ? ' soon' : '');
      const [d, t] = it.due.split(' ');
      c.textContent = '~' + (d === it.date && t ? t : parseInt(d.slice(5, 7), 10) + '/' + parseInt(d.slice(8), 10) + (t ? ' ' + t : ''));
      c.title = '기한 ' + it.due;
      row.appendChild(c);
    }
    return row;
  }

  function group(body, title, items, tagOf) {
    if (!items.length) return;
    if (title) {
      const h = document.createElement('div');
      h.className = 'todo-group';
      h.textContent = title;
      body.appendChild(h);
    }
    // 안 끝낸 것 먼저
    items.filter((x) => !x.done).concat(items.filter((x) => x.done)).forEach((it) => body.appendChild(itemRow(it, tagOf && tagOf(it))));
  }

  /** 분류별로 묶는다 — 분류 없는 것 먼저, 그다음 파일에 적힌 순서 */
  function byCategory(body, items, afterOther) {
    const cats = [...new Set(items.map((x) => x.category).filter(Boolean))];
    // 위에 다른 묶음(밀린 것 · 분류)이 있으면 분류 없는 것에도 제목을 달아 섞여 보이지 않게
    group(body, afterOther || cats.length ? '기타' : null, items.filter((x) => !x.category));
    for (const c of cats) group(body, c, items.filter((x) => x.category === c));
  }

  function buildTodo() {
    const el = document.createElement('div');
    el.className = 'card todo-card' + (todoCard.collapsed ? ' collapsed' : '');
    const items = todo.items || [];
    const today = todoStr();
    let title, shown;
    if (view === 'backlog') {
      shown = items.filter((x) => x.backlog);
      title = '언젠가 · ' + shown.filter((x) => !x.done).length;
    } else {
      const ds = viewDate();
      shown = items.filter((x) => !x.backlog && x.date === ds);
      title = dateLabel(ds) + ' · ' + shown.filter((x) => !x.done).length;
    }
    const late = view === 0 ? items.filter((x) => !x.done && !x.backlog && x.date && x.date < today) : [];

    header(el, title, 'todo', [
      button('◀', '전날', () => { view = view === 'backlog' ? 0 : view - 1; render(); }),
      button('▶', '다음 날', () => { view = view === 'backlog' ? 0 : view + 1; render(); }),
      button(view === 'backlog' ? '날짜' : '언젠가', view === 'backlog' ? '날짜별로 보기' : '기약 없는 일 보기', () => { view = view === 'backlog' ? 0 : 'backlog'; render(); }),
      button('+', '할 일 추가 (지금 보는 날짜로)', () => api().todoAdd(addDefaults()).then(setTodo)),
      button(todoCard.collapsed ? '▾' : '‒', todoCard.collapsed ? '펼치기' : '접기', () => {
        todoCard.collapsed = !todoCard.collapsed;
        api().notesSetTodoCard({ collapsed: todoCard.collapsed });
        render();
      }),
      button('×', '카드 닫기 (메뉴에서 다시 켤 수 있다)', () => {
        todoCard.shown = false;
        api().notesSetTodoCard({ shown: false });
        render();
      }),
    ]);
    // 제목을 누르면 오늘로
    el.querySelector('.card-title').addEventListener('click', () => { if (view !== 0) { view = 0; render(); } });

    if (!todoCard.collapsed) {
      const body = document.createElement('div');
      body.className = 'card-body todo-list';
      group(body, late.length ? '밀린 것' : null, late, (x) => parseInt(x.date.slice(5, 7), 10) + '/' + parseInt(x.date.slice(8), 10));
      byCategory(body, shown, late.length > 0);
      if (!late.length && !shown.length) {
        const empty = document.createElement('div');
        empty.className = 'todo-empty';
        empty.textContent = view === 'backlog' ? '기약 없는 일은 여기에 — + 로 추가' : '비어 있어 — + 로 추가하면 정각마다 짚어 줄게';
        body.appendChild(empty);
      }
      if (!todoCard.h) body.style.maxHeight = TODO_SHOW * 26 + 'px';   // 크기를 정했으면 그 높이에 맞춘다
      el.appendChild(body);
    }
    return el;
  }
  const todoStr = todayStr;

  function buildNote(n) {
    const el = document.createElement('div');
    el.className = 'card note-card' + (n.collapsed ? ' collapsed' : '');
    el.style.setProperty('--note', NOTE_COLORS[n.color] || NOTE_COLORS.yellow);
    const first = (n.text || '').split(/\r?\n/)[0].slice(0, 24) || '메모';
    header(el, n.collapsed ? first : '', n.id, [
      button('✎', '편집', () => api().notesEdit(n.id).then(setData)),
      button(n.collapsed ? '▾' : '‒', n.collapsed ? '펼치기' : '접기', () => {
        n.collapsed = !n.collapsed;
        api().notesUpdate(n.id, { collapsed: n.collapsed });
        render();
      }),
      button('×', '지우기 (한 번 더 누르면 지운다)', (b) => {
        if (b.dataset.armed) { api().notesRemove(n.id).then(setData); return; }
        b.dataset.armed = '1';
        b.textContent = '지울까?';
        b.classList.add('armed');
        setTimeout(() => { if (b.isConnected) { delete b.dataset.armed; b.textContent = '×'; b.classList.remove('armed'); } }, 3000);
      }),
    ]);
    if (!n.collapsed) {
      const body = document.createElement('div');
      body.className = 'card-body note-text';
      body.textContent = n.text || '';
      body.title = '더블클릭해서 편집';
      body.addEventListener('dblclick', () => api().notesEdit(n.id).then(setData));
      el.appendChild(body);
    }
    return el;
  }

  function render() {
    if (!layer || !stage) return;
    if (drag) return;                 // 끄는 중엔 다시 그리지 않는다 (놓을 때 그린다)
    layer.innerHTML = '';
    els.clear();
    layer.hidden = hidden;
    if (hidden) return;
    const add = (id, el, pos, kind, idx) => {
      // 저장된 크기 (접혀 있으면 높이는 무시)
      if (pos.w) el.style.width = pos.w + 'px';
      if (pos.h && !el.classList.contains('collapsed')) { el.style.height = pos.h + 'px'; el.classList.add('sized'); }
      if (!el.classList.contains('collapsed')) addGrip(el, id);
      layer.appendChild(el);
      const d = defaultPos(kind, idx);
      place(el, pos.x == null ? d.x : pos.x, pos.y == null ? d.y : pos.y);
      els.set(id, el);
    };
    if (todoCard.shown !== false) add('todo', buildTodo(), todoCard, 'todo', 0);
    notes.forEach((n, i) => add(n.id, buildNote(n), n, 'note', i));
  }

  // ── 크기 조절 — 오른쪽 아래 모서리를 끈다 ──────────────────
  const MIN_W = 180, MIN_H = 70;

  function addGrip(el, id) {
    const g = document.createElement('div');
    g.className = 'card-grip';
    g.title = '끌어서 크기 조절';
    g.addEventListener('mousedown', (e) => {
      if (e.button !== 0) return;
      e.preventDefault();
      e.stopPropagation();
      drag = { id, el, resize: true, sx: e.clientX, sy: e.clientY, w: el.offsetWidth, h: el.offsetHeight };
      el.classList.add('dragging');
    });
    el.appendChild(g);
  }

  function onMove(e) {
    if (!drag) return;
    if (drag.resize) {
      // 화면(작업 영역) 밖으로는 못 늘린다
      const p = drag.el._pos;
      const w = clamp(drag.w + e.clientX - drag.sx, MIN_W, stage.workRight - p.x);
      const h = clamp(drag.h + e.clientY - drag.sy, MIN_H, stage.ground - p.y);
      drag.el.style.width = Math.round(w) + 'px';
      drag.el.style.height = Math.round(h) + 'px';
      drag.el.classList.add('sized');
      return;
    }
    place(drag.el, e.clientX - drag.dx, e.clientY - drag.dy);
  }

  function onUp() {
    if (!drag) return;
    const { id, el, resize } = drag;
    drag = null;
    el.classList.remove('dragging');
    const pos = resize
      ? { w: el.offsetWidth, h: el.offsetHeight }
      : { x: Math.round(el._pos.x), y: Math.round(el._pos.y) };
    if (id === 'todo') {
      Object.assign(todoCard, pos);
      api().notesSetTodoCard(pos);
    } else {
      const n = notes.find((x) => x.id === id);
      if (n) Object.assign(n, pos);
      api().notesUpdate(id, pos);
    }
  }

  /** 이 좌표에 카드가 있는지 (끄는 중이면 늘 true) */
  function hit(x, y) {
    if (drag) return true;
    if (hidden || !layer) return false;
    for (const el of els.values()) {
      const p = el._pos;
      if (p && x >= p.x && x <= p.x + el.offsetWidth && y >= p.y && y <= p.y + el.offsetHeight) return true;
    }
    return false;
  }

  /** 새 메모 기본 자리 (캐릭터 근처) */
  function spotNear(x) {
    return { x: clamp(x - 110, stage.workLeft + 10, stage.workRight - 230), y: clamp(stage.ground - 320, stage.workTop + 10, stage.ground - 200) };
  }

  window.PetNotes = { init, setStage, setData, setTodo, setHidden, hit, spotNear, addDefaults, get hidden() { return hidden; }, get todoShown() { return todoCard.shown !== false; } };
})();
