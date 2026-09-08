/**
 * 캐릭터 구동부: 상태머신 + 물리 + 마우스 상호작용
 * -------------------------------------------------------------
 * 창은 화면 전체를 덮는 투명 창이지만, 실제로 그리는 캔버스는
 * 캐릭터 하나 크기뿐이다. 이동은 CSS transform으로 처리해서
 * 매 프레임 전체 화면을 지우는 낭비를 피한다.
 */
(function () {
  'use strict';

  const M = window.Character.METRICS;

  // ── 튜닝 값 ─────────────────────────────────────────────────
  const SCALE = 2.2;           // 유닛 → 화면 픽셀 배율 (캐릭터 키 ≈ 141px)
  const GRAVITY = 900 * SCALE;    // px/s²
  const WALK_SPEED = 26 * SCALE;  // px/s
  const CLIMB_SPEED = 55 * SCALE; // 벽 타고 올라가는 속도 px/s (화면 높이를 ~8초에)
  const CLIMB_CHANCE = 0.55;      // 벽에 부딪혔을 때 타고 오를 확률
  const THROW_MAX = 2000;         // 던질 때 속도 상한 px/s
  const BOUNCE = 0.30;

  // ── 캔버스 준비 ─────────────────────────────────────────────
  const canvas = document.getElementById('pet');
  const ctx = canvas.getContext('2d');

  const UNIT_W = M.width + M.padSide * 2;
  const UNIT_H = M.height + M.padTop + M.padBottom;
  const CSS_W = UNIT_W * SCALE;
  const CSS_H = UNIT_H * SCALE;
  // 캔버스 안에서 발바닥(원점)이 놓이는 위치
  const ORIGIN_X = (UNIT_W / 2) * SCALE;
  const ORIGIN_Y = (M.padTop + M.height) * SCALE;

  let dpr = window.devicePixelRatio || 1;
  function sizeCanvas() {
    dpr = window.devicePixelRatio || 1;
    canvas.width = Math.round(CSS_W * dpr);
    canvas.height = Math.round(CSS_H * dpr);
    canvas.style.width = CSS_W + 'px';
    canvas.style.height = CSS_H + 'px';
  }
  sizeCanvas();

  // ── 무대 ────────────────────────────────────────────────────
  let stage = { width: 1920, height: 1080, ground: 1040, workTop: 0, workLeft: 0, workRight: 1920 };

  // ── 상태 ────────────────────────────────────────────────────
  const S = {
    x: 400,
    y: 0,
    vx: 0,
    vy: 0,
    dir: 1,        // 걷는 방향
    facing: 1,     // 바라보는 방향
    wall: 0,       // 매달린 벽: -1 왼쪽 / 1 오른쪽 / 0 없음
    state: 'idle',
    t: 0,          // 현재 상태 진입 후 경과 시간(초)
    until: 2,      // 남은 지속 시간(초), 0 이하면 다음 행동 선택
  };

  const rand = (a, b) => a + Math.random() * (b - a);
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

  function setState(name, dur) {
    if (S.state !== name) {
      S.state = name;
      S.t = 0;
    }
    S.until = dur == null ? 0 : dur;
    if (name === 'idle' || name === 'sit' || name === 'sleep' || name === 'pet') S.vx = 0;
  }

  /** 다음에 뭘 할지 고른다 (아주 단순한 행동 스케줄러) */
  function pickNext() {
    const r = Math.random();
    if (S.state === 'sleep') return setState('sit', rand(2, 4));
    if (S.state === 'sit' && r < 0.45) return setState('sleep', rand(10, 25));
    if (r < 0.45) {
      S.dir = Math.random() < 0.5 ? -1 : 1;
      return setState('walk', rand(2, 5.5));
    }
    if (r < 0.78) return setState('idle', rand(1.5, 4));
    return setState('sit', rand(4, 10));
  }

  const RESTING = ['idle', 'walk', 'sit', 'sleep', 'pet'];

  /** 벽에 붙어서 위로 올라간다. x는 벽에 고정, 중력은 끈다. */
  function updateClimb(dt) {
    // 손이 화면 끝에 닿아 보이도록 벽에 바짝 붙인다
    S.x = S.wall < 0
      ? stage.workLeft + 12 * SCALE
      : stage.workRight - 12 * SCALE;
    S.facing = S.wall;   // 로컬 +x가 벽을 향하게
    S.vx = 0;
    S.vy = -CLIMB_SPEED;
    if (S.hold) return;  // 자세 확인용: 제자리에서 동작만 재생
    S.y += S.vy * dt;

    const top = stage.workTop + (M.height + 8) * SCALE;
    S.until -= dt;

    if (S.y <= top || S.until <= 0) {
      S.y = Math.max(S.y, top);
      S.vy = -60;               // 손을 놓고
      S.vx = -S.wall * 110;     // 벽을 밀어내며 떨어진다
      S.wall = 0;
      setState('fall');
    }
  }

  function update(dt) {
    S.t += dt;

    if (S.state === 'drag') return; // 위치는 mousemove가 직접 옮긴다
    if (S.state === 'climb') return updateClimb(dt);

    const airborne = S.y < stage.ground - 0.5 || Math.abs(S.vy) > 1;
    if (airborne) S.vy += GRAVITY * dt;

    if (S.state === 'walk') S.vx = S.dir * WALK_SPEED;

    S.x += S.vx * dt;
    S.y += S.vy * dt;

    // 좌우 벽 — 걸어서 닿았으면 타고 오를지 결정하고, 아니면 튕긴다
    const half = (M.width / 2) * SCALE;
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
        S.vy = -S.vy * BOUNCE;       // 통통 튄다
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

  function render() {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.translate(ORIGIN_X, ORIGIN_Y);
    ctx.scale(SCALE, SCALE);

    // 발밑 그림자 (공중에 뜰수록 작고 옅게)
    const air = clamp((stage.ground - S.y) / 260, 0, 1);
    const k = 1 - air * 0.7;
    ctx.save();
    ctx.globalAlpha = 0.2 * k;
    ctx.fillStyle = '#0b1226';
    ctx.beginPath();
    ctx.ellipse(0, 1.5, 15 * k, 3.8 * k, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    window.Character.draw(ctx, S.state, S.t, S.facing);

    canvas.style.transform =
      'translate3d(' + (S.x - ORIGIN_X).toFixed(1) + 'px,' + (S.y - ORIGIN_Y).toFixed(1) + 'px,0)';
  }

  // ── 마우스 ──────────────────────────────────────────────────
  let hover = false;
  let drag = null;
  let cursor = { x: -1, y: -1 };

  /** 커서가 캐릭터 위에 있는지 (넉넉하게 잡는다) */
  function hitTest(px, py) {
    const halfW = 21 * SCALE;
    const top = S.y - (M.height + 6) * SCALE;
    const bottom = S.y + 6 * SCALE;
    return px >= S.x - halfW && px <= S.x + halfW && py >= top && py <= bottom;
  }

  /** 캐릭터 위에 있을 때만 클릭을 받고, 나머지 시간엔 클릭을 통과시킨다 */
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
      // 속도는 살짝 평활화해서 던질 때 튀지 않게
      S.vx = S.vx * 0.4 + ((nx - S.x) / dt) * 0.6;
      S.vy = S.vy * 0.4 + ((ny - S.y) / dt) * 0.6;
      drag.moved += Math.hypot(e.clientX - drag.lx, e.clientY - drag.ly);
      drag.lx = e.clientX; drag.ly = e.clientY; drag.lt = now;
      S.x = nx;
      S.y = ny;
      if (Math.abs(S.vx) > 60) S.facing = S.vx > 0 ? 1 : -1;
      return;
    }
    syncInteractive(false);
  });

  window.addEventListener('mousedown', (e) => {
    if (e.button !== 0 || !hitTest(e.clientX, e.clientY)) return;
    e.preventDefault();
    const now = performance.now();
    drag = {
      ox: S.x - e.clientX,
      oy: S.y - e.clientY,
      t0: now, lt: now,
      lx: e.clientX, ly: e.clientY,
      moved: 0,
    };
    S.vx = 0; S.vy = 0;
    S.wall = 0;              // 집어들면 벽에서 떨어진다
    setState('drag');
    document.body.style.cursor = 'grabbing';
  });

  window.addEventListener('mouseup', () => {
    if (!drag) return;
    const held = performance.now() - drag.t0;
    const tapped = drag.moved < 7 && held < 400;
    drag = null;

    if (tapped) {
      S.vx = 0; S.vy = 0;
      setState('pet', 1.7);           // 쓰다듬기 반응
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
    // 한 프레임이 터져도 루프는 살려둔다 (투명 창이라 멈춘 걸 알아채기 어렵다)
    try {
      update(dt);
      render();
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

  window.petAPI.getStage().then((s) => {
    applyStage(s);
    S.x = (s.workLeft + s.workRight) / 2;
    S.y = s.ground - 260;   // 처음엔 하늘에서 툭 떨어진다
    setState('fall');
    requestAnimationFrame(frame);
  });

  window.petAPI.onStage(applyStage);

  window.petAPI.onCommand((cmd) => {
    if (cmd === 'recall') {
      S.x = (stage.workLeft + stage.workRight) / 2;
      S.y = stage.ground - 300;
      S.vx = 0; S.vy = 0;
      setState('fall');
    } else if (cmd === 'wake') {
      setState('idle', 3);
    } else if (cmd === 'climb' || cmd === 'climbhold') {
      // 가까운 쪽 벽으로 붙어서 타고 오른다
      const mid = (stage.workLeft + stage.workRight) / 2;
      S.wall = S.x < mid ? -1 : 1;
      S.hold = cmd === 'climbhold';          // 개발용: 제자리 고정
      S.y = S.hold ? stage.ground - 300 : stage.ground;
      S.vx = 0; S.vy = 0;
      setState('climb', 8);
    }
  });

  window.addEventListener('resize', sizeCanvas);

  // 디버깅용
  window.__pet = S;
  if (location.search.indexOf('trace') >= 0 || window.__trace) {
    setInterval(() => {
      console.log(
        'state=' + S.state + ' y=' + S.y.toFixed(0) + ' x=' + S.x.toFixed(0) +
        ' vy=' + S.vy.toFixed(0) + ' wall=' + S.wall + ' until=' + S.until.toFixed(1) +
        ' ground=' + stage.ground + ' top=' + stage.workTop
      );
    }, 600);
  }
})();
