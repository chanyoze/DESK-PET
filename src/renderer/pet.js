/**
 * 캐릭터 구동부: 상태머신 + 물리 + 마우스 상호작용
 * -------------------------------------------------------------
 * 그리기는 '뷰'가 담당한다 (PartsView = 자체 파츠 리그 / SpineView = Spine).
 * 이 파일은 어느 쪽이 붙었는지 모른다 — 상태 이름만 넘긴다.
 *
 * 창은 화면 전체를 덮는 투명 창이지만, 실제로 그리는 캔버스는 캐릭터
 * 하나 크기뿐이다. 이동은 CSS transform으로 처리한다.
 */
(function () {
  'use strict';

  const BASE_H = 141;            // 물리 튜닝의 기준 키(px)
  const THROW_MAX = 2000;
  const BOUNCE = 0.30;

  /**
   * 벽 타기 확률. 매니페스트의 climbChance 로 켠다 (기본 0 = 꺼짐).
   *
   * 게임에서 뽑은 스켈레톤은 등반 애니메이션이 없어서 걷는 자세 그대로 벽을
   * 올라가 어색하다. 반면 자체 파츠 리그는 IK로 손발을 실제로 짚기 때문에
   * 제대로 보인다. 그래서 지우지 않고 캐릭터별로 켜고 끈다.
   */
  let CLIMB_CHANCE = 0;

  let character = null;
  let view = null;
  let PX = 1;                    // 캐릭터 크기에 따른 물리 배율
  let GRAVITY = 1980, WALK_SPEED = 57, CLIMB_SPEED = 121;

  // ── 무대 ────────────────────────────────────────────────────
  let stage = { width: 1920, height: 1080, ground: 1040, workTop: 0, workLeft: 0, workRight: 1920 };

  // ── 상태 ────────────────────────────────────────────────────
  const S = {
    x: 400, y: 0, vx: 0, vy: 0,
    dir: 1,        // 걷는 방향
    facing: 1,     // 바라보는 방향
    wall: 0,       // 매달린 벽: -1 왼쪽 / 1 오른쪽 / 0 없음
    state: 'idle',
    until: 2,      // 남은 지속 시간(초)
    hold: false,   // 개발용 고정
  };

  const rand = (a, b) => a + Math.random() * (b - a);
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

  /**
   * 우리 상태 이름 → 캐릭터가 가진 애니메이션 이름.
   * 매니페스트에 없으면 명일방주 기지 SD의 표준 이름으로 떨어진다.
   */
  const DEFAULT_ANIM = {
    idle: 'Relax',
    idle2: 'Default',
    walk: 'Move',
    sit: 'Sit',
    sleep: 'Sleep',
    pet: 'Interact',
    special: 'Special',
    drag: 'Default',
    fall: 'Default',
    climb: 'Move',
  };
  function animFor(state) {
    const map = (character && character.animations) || {};
    return map[state] || DEFAULT_ANIM[state] || state;
  }

  const STILL = ['idle', 'idle2', 'sit', 'sleep', 'pet', 'special'];

  function setState(name, dur) {
    if (S.state !== name) {
      S.state = name;
      if (view) view.play(animFor(name));
    }
    S.until = dur == null ? 0 : dur;
    if (STILL.indexOf(name) >= 0) S.vx = 0;
  }

  /**
   * 다음에 뭘 할지 고른다.
   * 전에는 앉기→자기가 45%였고 자고 일어나면 바로 다시 앉아서, 사실상
   * 앉기↔자기를 반복했다. 잠은 드물게, 깨어난 뒤에는 한동안 안 자게 한다.
   *
   * 게임 스켈레톤은 동작이 6~7개뿐이라 있는 걸 최대한 돌려 쓴다:
   *   Relax=idle  Default=idle2  Move=walk  Sit=sit  Sleep=sleep
   *   Interact=pet  Special=special(스킨 한정)
   */
  let sleepCooldown = 0;
  function pickNext() {
    const r = Math.random();
    if (sleepCooldown > 0) sleepCooldown--;

    if (S.state === 'sleep') {
      sleepCooldown = 6;                       // 깨면 당분간 다시 안 잔다
      return setState('idle', rand(2, 4));
    }
    if (S.state === 'sit' && sleepCooldown <= 0 && r < 0.15) {
      return setState('sleep', rand(6, 12));
    }
    // 가끔 특별 동작 (가진 캐릭터만)
    if (r < 0.05 && view && view.has(animFor('special'))) {
      return setState('special', rand(2.5, 4));
    }
    if (r < 0.58) {                            // 걷기를 기본 행동으로
      S.dir = Math.random() < 0.5 ? -1 : 1;
      return setState('walk', rand(3, 7));
    }
    // 서 있는 동작이 둘(Relax / Default)이라 번갈아 쓴다
    if (r < 0.85) return setState(Math.random() < 0.5 ? 'idle' : 'idle2', rand(1.5, 3.5));
    return setState('sit', rand(2.5, 6));
  }

  const RESTING = ['idle', 'idle2', 'walk', 'sit', 'sleep', 'pet', 'special'];

  /**
   * 캐릭터 폭의 절반 (충돌·클릭 판정용).
   *
   * 캔버스 폭에 비례해서 잡으면 안 된다. 캔버스는 스켈레톤 바운즈에서 나오는데
   * 그 값이 캐릭터마다 극단적으로 다르다 (켈시 823유닛 vs 페넌스 116유닛).
   * 같은 비율을 쓰면 어떤 캐릭터는 클릭 영역이 절반도 안 된다.
   * 키는 어느 캐릭터나 비슷한 기준이므로 키에서 뽑고, 캔버스를 넘지 않게 막는다.
   */
  function halfWidth() {
    if (!view) return 44;
    const h = (character && character.height) || BASE_H;
    return Math.min(view.cssW / 2, Math.max(h * 0.34, 26));
  }

  /** 클릭 판정 사각형 — 실제로 그려지는 캔버스 영역을 넘지 않는다 */
  function hitBox() {
    const h = (character && character.height) || BASE_H;
    const halfW = halfWidth() * 1.1;
    const top = Math.max(S.y - view.originY, S.y - h * 1.2);
    return { x: S.x - halfW, y: top, w: halfW * 2, h: S.y + 14 - top };
  }

  /** 벽에 붙어서 위로 올라간다. x는 벽에 고정, 중력은 끈다. */
  function updateClimb(dt) {
    const off = halfWidth() * 0.55;
    S.x = S.wall < 0 ? stage.workLeft + off : stage.workRight - off;
    S.facing = S.wall;
    S.vx = 0;
    S.vy = -CLIMB_SPEED;
    if (S.hold) return;
    S.y += S.vy * dt;

    const top = stage.workTop + (character.height || BASE_H) * 1.1;
    S.until -= dt;
    if (S.y <= top || S.until <= 0) {
      S.y = Math.max(S.y, top);
      S.vy = -60;
      S.vx = -S.wall * 110;
      S.wall = 0;
      setState('fall');
    }
  }

  function update(dt) {
    if (!character) return;
    if (S.state === 'drag') return;   // 위치는 mousemove가 직접 옮긴다
    if (S.state === 'climb') return updateClimb(dt);

    const airborne = S.y < stage.ground - 0.5 || Math.abs(S.vy) > 1;
    if (airborne) S.vy += GRAVITY * dt;
    if (S.state === 'walk') S.vx = S.dir * WALK_SPEED;

    S.x += S.vx * dt;
    S.y += S.vy * dt;

    // 좌우 벽 — 걸어서 닿았으면 타고 오를지 결정하고, 아니면 튕긴다
    const half = halfWidth();
    const grounded = S.vy === 0 && S.y >= stage.ground - 0.5;
    if (S.x < stage.workLeft + half) {
      S.x = stage.workLeft + half;
      if (S.state === 'walk' && grounded && Math.random() < CLIMB_CHANCE) {
        S.wall = -1;
        return setState('climb', rand(4, 9));
      }
      S.vx = Math.abs(S.vx) * 0.5;
      S.dir = 1;
    } else if (S.x > stage.workRight - half) {
      S.x = stage.workRight - half;
      if (S.state === 'walk' && grounded && Math.random() < CLIMB_CHANCE) {
        S.wall = 1;
        return setState('climb', rand(4, 9));
      }
      S.vx = -Math.abs(S.vx) * 0.5;
      S.dir = -1;
    }

    // 바닥(= 작업 표시줄 윗변)
    if (S.y >= stage.ground) {
      S.y = stage.ground;
      if (S.vy > 260) {
        S.vy = -S.vy * BOUNCE;
        S.vx *= 0.7;
      } else {
        S.vy = 0;
        if (S.state === 'fall') setState('idle', rand(1, 2.5));
        if (S.state !== 'walk') S.vx *= Math.exp(-9 * dt);
      }
    } else if (S.state !== 'fall' && S.state !== 'pet') {
      setState('fall');
    }

    // 바라보는 방향
    if (S.state === 'walk') S.facing = S.dir;
    else if (Math.abs(S.vx) > 40) S.facing = S.vx > 0 ? 1 : -1;

    // 다음 행동
    if (RESTING.indexOf(S.state) >= 0 && S.vy === 0) {
      S.until -= dt;
      if (S.until <= 0) {
        if (S.state === 'pet') setState('idle', rand(1, 2));
        else pickNext();
      }
    }
  }

  function render(dt) {
    if (!view) return;
    view.draw(dt, S.facing, { airHeight: stage.ground - S.y });
    view.el.style.transform =
      'translate3d(' + (S.x - view.originX).toFixed(1) + 'px,' +
      (S.y - view.originY).toFixed(1) + 'px,0)';
    // 말풍선은 캐릭터를 따라다닌다
    if (bubble) bubble.place(S.x, S.y - (character.height || BASE_H), stage);
    if (hitboxEl) {
      const b = hitBox();
      hitboxEl.style.transform = `translate3d(${b.x}px,${b.y}px,0)`;
      hitboxEl.style.width = b.w + "px";
      hitboxEl.style.height = b.h + "px";
    }
  }

  // ── 말풍선 · 메뉴 ───────────────────────────────────────────
  let bubble = null;
  let menu = null;
  let hitboxEl = null;   // --hitbox 디버그 표시

  /** 외부 알림 / 리마인더 → 캐릭터가 말하고 반응한다 */
  function say(msg) {
    if (!bubble) return;
    bubble.say(msg);
    if (!view) return;
    // 기분에 맞는 동작으로 반응 (있는 것만)
    const wanted = msg.mood === 'happy' && view.has(animFor('special')) ? 'special' : 'pet';
    if (S.state !== 'drag' && S.state !== 'fall') setState(wanted, 2.2);
  }

  function buildMenu() {
    const cur = character && character.id;
    const sections = [];

    sections.push({
      title: '캐릭터',
      items: roster.map((c) => ({ label: c.name, value: 'char:' + c.id, checked: c.id === cur })),
    });

    sections.push({
      title: '크기',
      items: [
        { label: '작게', value: 'size:0.6' },
        { label: '보통', value: 'size:1' },
        { label: '크게', value: 'size:1.45' },
      ],
    });

    const acts = [{ label: '쓰다듬기', value: 'act:pet' }];
    if (view && view.has(animFor('special'))) acts.push({ label: '특별 동작', value: 'act:special' });
    acts.push({ label: '가운데로 부르기', value: 'act:recall' });
    sections.push({ title: '동작', items: acts });

    sections.push({
      title: '리마인더',
      items: [
        { label: '5분 뒤 알림', value: 'remind:5' },
        { label: '25분 뒤 알림 (포모도로)', value: 'remind:25' },
        { label: '60분 뒤 알림', value: 'remind:60' },
      ],
    });

    if (reminders.length) {
      sections.push({
        title: '예약됨 (눌러서 취소)',
        items: reminders.map((r) => ({
          label: '✕ ' + r.text,
          value: 'unremind:' + r.id,
          danger: true,
        })),
      });
    }

    sections.push({ items: [{ label: '종료', value: 'act:quit', danger: true }] });
    menu.build(sections);
  }

  async function onMenuAction(value) {
    const [kind, arg] = [value.slice(0, value.indexOf(':')), value.slice(value.indexOf(':') + 1)];
    if (kind === 'char') {
      await switchTo(arg);
      window.petAPI.setCharacter(arg);
    } else if (kind === 'size') {
      window.petAPI.setSize(parseFloat(arg));   // 메인이 창을 새로고침한다
    } else if (kind === 'remind') {
      const min = parseInt(arg, 10);
      const text = min + '분 지났어. 쉬는 게 어때?';
      reminders = await window.petAPI.addReminder({ text, at: Date.now() + min * 60000 });
      say({ text: min + '분 뒤에 알려줄게', mood: 'happy', ms: 2500 });
    } else if (kind === 'unremind') {
      reminders = await window.petAPI.removeReminder(arg);
      say({ text: '알림 취소했어', ms: 2000 });
    } else if (kind === 'act') {
      if (arg === 'pet') setState('pet', 2.2);
      else if (arg === 'special') setState('special', 3);
      else if (arg === 'recall') {
        S.x = (stage.workLeft + stage.workRight) / 2;
        S.y = stage.ground - 300;
        S.vx = 0; S.vy = 0;
        setState('fall');
      } else if (arg === 'quit') window.petAPI.quit();
    }
  }

  // ── 마우스 ──────────────────────────────────────────────────
  let hover = false;
  let drag = null;
  const cursor = { x: -1, y: -1 };

  const inRect = (r, px, py) =>
    !!r && px >= r.x && px <= r.x + r.w && py >= r.y && py <= r.y + r.h;

  /**
   * 커서가 마우스를 받아야 할 영역 위에 있는지.
   * 캐릭터 본체 + 떠 있는 말풍선/메뉴를 모두 포함해야 클릭이 통과되지 않는다.
   */
  function hitTest(px, py) {
    if (!view || !character) return false;
    if (menu && inRect(menu.rect, px, py)) return true;
    if (bubble && inRect(bubble.rect, px, py)) return true;
    return inRect(hitBox(), px, py);
  }

  function syncInteractive(force) {
    const want = drag ? true : hitTest(cursor.x, cursor.y);
    if (want !== hover || force) {
      hover = want;
      window.petAPI.setInteractive(want);
      document.body.style.cursor = want ? 'grab' : 'default';
    }
  }

  window.addEventListener('mousemove', (e) => {
    cursor.x = e.clientX;
    cursor.y = e.clientY;

    if (drag) {
      const now = performance.now();
      const dt = Math.max(0.008, (now - drag.lt) / 1000);
      const nx = e.clientX + drag.ox;
      const ny = e.clientY + drag.oy;
      S.vx = S.vx * 0.4 + ((nx - S.x) / dt) * 0.6;
      S.vy = S.vy * 0.4 + ((ny - S.y) / dt) * 0.6;
      drag.moved += Math.hypot(e.clientX - drag.lx, e.clientY - drag.ly);
      drag.lx = e.clientX; drag.ly = e.clientY; drag.lt = now;
      S.x = nx; S.y = ny;
      if (Math.abs(S.vx) > 60) S.facing = S.vx > 0 ? 1 : -1;
      return;
    }
    syncInteractive(false);
  });

  window.addEventListener('mousedown', (e) => {
    if (e.button !== 0 || !hitTest(e.clientX, e.clientY)) return;
    // 메뉴·말풍선 위 클릭은 UI가 처리한다 (드래그 시작하지 않는다)
    if (menu && inRect(menu.rect, e.clientX, e.clientY)) return;
    if (bubble && inRect(bubble.rect, e.clientX, e.clientY)) {
      bubble.dismiss();
      return;
    }
    if (menu && menu.open) menu.close();
    e.preventDefault();
    const now = performance.now();
    drag = { ox: S.x - e.clientX, oy: S.y - e.clientY, t0: now, lt: now, lx: e.clientX, ly: e.clientY, moved: 0 };
    S.vx = 0; S.vy = 0;
    S.wall = 0;
    setState('drag');
    document.body.style.cursor = 'grabbing';
  });

  window.addEventListener('mouseup', () => {
    if (!drag) return;
    const held = performance.now() - drag.t0;
    const tapped = drag.moved < 7 && held < 400;
    drag = null;
    if (tapped) {
      // 짧게 클릭하면 메뉴를 연다 (캐릭터 교체·크기·리마인더가 여기 모여 있다)
      S.vx = 0; S.vy = 0;
      buildMenu();
      menu.show(S.x, S.y - (character.height || BASE_H) * 0.55, stage);
      syncInteractive(true);
    } else {
      S.vx = clamp(S.vx, -THROW_MAX, THROW_MAX);
      S.vy = clamp(S.vy, -THROW_MAX, THROW_MAX);
      setState('fall');
    }
    syncInteractive(true);
  });

  // ── 메인 루프 ───────────────────────────────────────────────
  window.addEventListener('error', (e) => {
    console.error('렌더 오류:', e.message, e.filename + ':' + e.lineno);
  });

  let last = performance.now();
  function frame(now) {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    try {
      update(dt);
      render(dt);
    } catch (err) {
      console.error('프레임 실패:', err && err.stack ? err.stack : err);
    }
    requestAnimationFrame(frame);
  }

  // ── 부팅 ────────────────────────────────────────────────────
  function applyStage(s) {
    stage = s;
    S.x = clamp(S.x, s.workLeft + 60, s.workRight - 60);
    S.y = Math.min(S.y, s.ground);
  }

  function loadScript(src) {
    return new Promise((resolve, reject) => {
      const el = document.createElement('script');
      el.src = src;
      el.onload = resolve;
      el.onerror = () => reject(new Error(src + ' 로드 실패'));
      document.head.appendChild(el);
    });
  }

  // ── 캐릭터 교체 ─────────────────────────────────────────────
  let roster = [];        // 설치된 캐릭터 목록
  let reminders = [];     // 예약된 리마인더
  let switching = false;
  let spineLoaded = false;

  async function makeView(next) {
    if (next.renderer === 'spine') {
      if (!spineLoaded) {
        await loadScript('../../vendor/spine/spine-webgl.js');
        spineLoaded = true;
      }
      return new window.SpineView().init(next);
    }
    return new window.PartsView().init(next);
  }

  /** 캐릭터에 맞춰 물리 배율을 다시 잡는다 */
  function applyPhysics() {
    PX = (character.height || BASE_H) / BASE_H;
    GRAVITY = 1980 * PX;
    WALK_SPEED = (character.walkSpeed || 57) * PX;
    CLIMB_SPEED = 121 * PX;
    CLIMB_CHANCE = character.climbChance || 0;
  }

  /**
   * 지정한(또는 다음) 오퍼레이터로 교체한다.
   * 위치와 상태는 그대로 두고 뷰만 갈아끼우므로 서 있던 자리에서 바뀐다.
   */
  async function switchTo(id) {
    if (switching || !roster.length) return;
    switching = true;
    const from = character && character.name;
    try {
      let targetId = id;
      if (!targetId) {
        const i = roster.findIndex((c) => c.id === (character && character.id));
        targetId = roster[(i + 1 + roster.length) % roster.length].id;
      }
      if (targetId === (character && character.id)) return;
      const loaded = await window.petAPI.loadCharacter(targetId);
      const nv = await makeView(loaded);

      const old = view;
      character = loaded;
      view = nv;
      if (old) old.dispose();       // WebGL 컨텍스트 반납

      applyPhysics();
      S.y = Math.min(S.y, stage.ground);
      view.play(animFor(S.state));
      setState('pet', 1.6);         // 등장 인사
      view.play(animFor('pet'));
      console.log('[pet] 교체:', from, '→', character.name);
    } catch (e) {
      console.error('교체 실패:', e && e.stack ? e.stack : e);
    } finally {
      switching = false;
    }
  }

  async function boot() {
    if (location.search.indexOf("hitbox") >= 0) {
      hitboxEl = document.createElement("div");
      hitboxEl.style.cssText = "position:absolute;top:0;left:0;border:2px solid #ff3b6b;background:rgba(255,59,107,.12);pointer-events:none";
      document.body.appendChild(hitboxEl);
    }
    bubble = new window.PetUI.Bubble();
    menu = new window.PetUI.PetMenu();
    menu.onAction = onMenuAction;

    const cfg = await window.petAPI.getSettings();
    reminders = cfg.reminders || [];
    roster = await window.petAPI.listCharacters();
    character = await window.petAPI.loadCharacter();
    console.log('[pet] 캐릭터:', character.name, '(' + character.renderer + ')');
    console.log('[pet] 설치된 캐릭터', roster.length + '명:', roster.map((c) => c.name).join(', '));

    view = await makeView(character);
    applyPhysics();

    const s = await window.petAPI.getStage();
    applyStage(s);
    S.x = (s.workLeft + s.workRight) / 2;
    S.y = s.ground - 260;
    view.play(animFor('fall'));
    setState('fall');

    window.petAPI.onStage(applyStage);
    window.petAPI.onSay(say);
    window.addEventListener('resize', () => view.resize());
    requestAnimationFrame(frame);
  }

  window.petAPI.onCommand((cmd) => {
    if (cmd === 'recall') {
      S.x = (stage.workLeft + stage.workRight) / 2;
      S.y = stage.ground - 300;
      S.vx = 0; S.vy = 0;
      S.hold = false;
      setState('fall');
    } else if (cmd === 'next') {
      switchTo();
    } else if (cmd === 'wake') {
      setState('idle', 3);
    } else if (cmd === 'climb' || cmd === 'climbhold') {
      const mid = (stage.workLeft + stage.workRight) / 2;
      S.wall = S.x < mid ? -1 : 1;
      S.hold = cmd === 'climbhold';
      S.y = S.hold ? stage.ground - 300 : stage.ground;
      S.vx = 0; S.vy = 0;
      setState('climb', 8);
    }
  });

  // 디버깅용
  window.__pet = S;
  if (location.search.indexOf('trace') >= 0) {
    setInterval(() => {
      console.log(
        'state=' + S.state + ' y=' + S.y.toFixed(0) + ' x=' + S.x.toFixed(0) +
        ' h=' + (character&&character.height) + ' cssW=' + (view&&view.cssW) +
        ' halfW=' + halfWidth().toFixed(0) + ' hover=' + hover +
        ' hitSelf=' + hitTest(S.x, S.y - (character.height||BASE_H)/2)
      );
    }, 600);
  }

  boot().catch((err) => console.error('부팅 실패:', err && err.stack ? err.stack : err));
})();
