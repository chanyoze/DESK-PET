/**
 * 캐릭터 리그 (파츠 분리 + 2단 관절 + IK)
 * -------------------------------------------------------------
 * 그림 한 장 한 장을 프레임으로 찍는 대신, 몸을 파츠로 쪼개고
 * 각 관절의 각도를 코드로 움직인다.
 *
 * 팔다리는 상완/전완, 허벅지/정강이의 2단 관절이다. 덕분에
 * IK(역운동학)를 쓸 수 있다 — "손을 여기에 놓아라"라고 목표점만
 * 주면 어깨·팔꿈치 각도를 역산해준다. 벽 타기처럼 잡을 위치가
 * 매번 달라지는 동작은 이 방식이 아니면 만들 수 없다.
 *
 * 좌표계: 발바닥 가운데가 원점 (0,0), 위쪽이 -y, 키는 64유닛.
 * 뼈는 로컬 +y 방향(아래)을 향하고, 각도 θ는 그 방향을 회전시킨다.
 *   끝점 방향 = (-sin θ, cos θ)   →   방향 (dx,dy)를 향하려면 θ = atan2(-dx, dy)
 */
(function () {
  'use strict';

  // ── 팔레트: 색을 바꾸고 싶으면 여기만 ────────────────────────
  const PALETTE = {
    body: '#9dbcff',
    bodyDark: '#6d92e4',
    limb: '#89aefb',
    outline: '#2b3550',
    face: '#232d4a',
    blush: '#ff9fb2',
    hi: '#ffffff',
  };
  const OUTLINE = 2.0;

  // ── 뼈대: pivot은 부모 관절 기준 상대 좌표 ───────────────────
  const RIG = {
    // 그리는 순서 (뒤 → 앞)
    order: [
      'legBackU', 'legBackL', 'armBackU', 'armBackL',
      'body',
      'legFrontU', 'legFrontL', 'armFrontU', 'armFrontL',
      'head',
    ],
    parts: {
      body: { parent: null, pivot: [0, -14] },            // 골반
      head: { parent: 'body', pivot: [0, -20] },          // 목

      armBackU: { parent: 'body', pivot: [-8, -16] },     // 어깨
      armBackL: { parent: 'armBackU', pivot: [0, 8] },    // 팔꿈치
      armFrontU: { parent: 'body', pivot: [8, -16] },
      armFrontL: { parent: 'armFrontU', pivot: [0, 8] },

      legBackU: { parent: null, pivot: [-4.5, -14] },     // 고관절
      legBackL: { parent: 'legBackU', pivot: [0, 7] },    // 무릎
      legFrontU: { parent: null, pivot: [4.5, -14] },
      legFrontL: { parent: 'legFrontU', pivot: [0, 7] },
    },
  };

  /** 뼈 길이 — IK 계산과 그리기가 같은 값을 쓴다 */
  const LEN = {
    armBackU: 8, armBackL: 7,
    armFrontU: 8, armFrontL: 7,
    legBackU: 7, legBackL: 7,
    legFrontU: 7, legFrontL: 7,
  };
  const WID = {
    armBackU: 5.5, armBackL: 5.0,
    armFrontU: 5.5, armFrontL: 5.0,
    legBackU: 6.5, legBackL: 6.0,
    legFrontU: 6.5, legFrontL: 6.0,
  };

  /** IK 체인 이름 → 상완/전완 파츠 */
  const CHAINS = {
    armBack: ['armBackU', 'armBackL'],
    armFront: ['armFrontU', 'armFrontL'],
    legBack: ['legBackU', 'legBackL'],
    legFront: ['legFrontU', 'legFrontL'],
  };

  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

  /**
   * 2관절 IK — 목표점 (tx, ty)에 끝점이 닿도록 두 각도를 구한다.
   * 좌표는 상완 관절이 원점인 로컬 공간. bend는 팔꿈치가 접히는 방향(+1/-1).
   * 코사인 법칙 닫힌 해라 반복 계산이 없다.
   */
  function ik2(tx, ty, L1, L2, bend) {
    bend = bend || 1;
    const dmax = L1 + L2 - 0.01;
    const dmin = Math.abs(L1 - L2) + 0.01;
    const d = clamp(Math.hypot(tx, ty), dmin, dmax); // 닿을 수 없으면 최대한 뻗는다

    const base = Math.atan2(-tx, ty);                        // 목표를 직접 겨누는 각
    const A = Math.acos(clamp((L1 * L1 + d * d - L2 * L2) / (2 * L1 * d), -1, 1));
    const B = Math.acos(clamp((L1 * L1 + L2 * L2 - d * d) / (2 * L1 * L2), -1, 1));

    return {
      upper: base + A * bend,
      lower: -(Math.PI - B) * bend,   // 전완은 상완 기준 상대각
    };
  }

  /** 팔·다리: 굵은 선 두 번(테두리색 → 몸색)이면 캡슐 + 아웃라인이 공짜 */
  function limb(ctx, len, w, color) {
    ctx.lineCap = 'round';
    ctx.strokeStyle = PALETTE.outline;
    ctx.lineWidth = w + OUTLINE * 2;
    ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(0, len); ctx.stroke();
    ctx.strokeStyle = color;
    ctx.lineWidth = w;
    ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(0, len); ctx.stroke();
  }

  /** 같은 경로를 테두리 → 채우기 순으로 두 번 그린다 */
  function outlined(ctx, path, fill) {
    ctx.lineJoin = 'round';
    ctx.strokeStyle = PALETTE.outline;
    ctx.lineWidth = OUTLINE * 2;
    path(); ctx.stroke();
    ctx.fillStyle = fill;
    path(); ctx.fill();
  }

  // ── 파츠별 그리기 (각자 자기 관절이 원점) ────────────────────
  const DRAW = {
    body: (ctx) => {
      outlined(ctx, () => {
        ctx.beginPath();
        ctx.ellipse(0, -10, 11, 12.5, 0, 0, Math.PI * 2);
      }, PALETTE.body);
    },

    head: (ctx, pose) => {
      const R = 15;
      const cy = -14;

      // 귀 (머리통보다 먼저 그려서 뒤에 깔린다)
      outlined(ctx, () => {
        ctx.beginPath();
        ctx.moveTo(-12, cy - 9); ctx.lineTo(-15.5, cy - 21); ctx.lineTo(-4.5, cy - 14);
        ctx.closePath();
        ctx.moveTo(12, cy - 9); ctx.lineTo(15.5, cy - 21); ctx.lineTo(4.5, cy - 14);
        ctx.closePath();
      }, PALETTE.bodyDark);

      // 머리통
      outlined(ctx, () => {
        ctx.beginPath();
        ctx.ellipse(0, cy, R, R * 0.94, 0, 0, Math.PI * 2);
      }, PALETTE.body);

      // 눈
      const open = pose.eye == null ? 1 : pose.eye;
      const ex = 6.2, ey = cy + 1.5;
      for (const s of [-1, 1]) {
        if (open > 0.15) {
          ctx.fillStyle = PALETTE.face;
          ctx.beginPath();
          ctx.ellipse(s * ex, ey, 2.6, 3.4 * open, 0, 0, Math.PI * 2);
          ctx.fill();
          ctx.fillStyle = PALETTE.hi;
          ctx.beginPath();
          ctx.ellipse(s * ex + 0.9, ey - 1.2 * open, 0.9, 1.1 * open, 0, 0, Math.PI * 2);
          ctx.fill();
        } else {
          ctx.strokeStyle = PALETTE.face;
          ctx.lineWidth = 1.6; ctx.lineCap = 'round';
          ctx.beginPath();
          ctx.arc(s * ex, ey - 1, 3, 0.25 * Math.PI, 0.75 * Math.PI);
          ctx.stroke();
        }
      }

      // 볼터치
      ctx.fillStyle = PALETTE.blush;
      ctx.globalAlpha = 0.55;
      for (const s of [-1, 1]) {
        ctx.beginPath();
        ctx.ellipse(s * 10.5, ey + 4, 3, 1.9, 0, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;

      // 입
      ctx.strokeStyle = PALETTE.face;
      ctx.lineWidth = 1.4; ctx.lineCap = 'round';
      ctx.beginPath();
      if (pose.smile) {
        ctx.arc(0, ey + 3.5, 2.6, 0.15 * Math.PI, 0.85 * Math.PI);
      } else {
        ctx.moveTo(-1.6, ey + 5.4); ctx.lineTo(1.6, ey + 5.4);
      }
      ctx.stroke();
    },
  };

  // 팔다리는 규격이 같으므로 자동 생성 (뒤쪽 파츠는 어두운 색)
  for (const name of Object.keys(LEN)) {
    const dark = name.indexOf('Back') >= 0;
    DRAW[name] = (ctx) => limb(ctx, LEN[name], WID[name], dark ? PALETTE.bodyDark : PALETTE.limb);
  }

  // ── 애니메이션: 경과 시간 t(초) → 관절 포즈 ──────────────────
  function blink(t) {
    const c = (t * 1000) % 4300;
    return c < 90 ? 0 : c < 170 ? 0.45 : 1;
  }

  const ANIMS = {
    idle(t) {
      const b = Math.sin(t * 2.2);
      return {
        body: { dy: b * 0.5 },
        head: { angle: Math.sin(t * 0.6) * 0.05, dy: b * 0.4 },
        armBackU: { angle: 0.10 + b * 0.04 }, armBackL: { angle: -0.14 },
        armFrontU: { angle: -0.10 - b * 0.04 }, armFrontL: { angle: -0.14 },
        legBackU: { angle: 0.03 }, legBackL: { angle: 0.05 },
        legFrontU: { angle: -0.03 }, legFrontL: { angle: 0.05 },
        eye: blink(t),
      };
    },

    walk(t) {
      const p = t * 8.5;
      const s = Math.sin(p);
      // 무릎은 다리를 들어올릴 때만 굽힌다 (발이 바닥을 스치지 않게)
      const knee = (ph) => 0.12 + Math.max(0, Math.sin(ph - 1.3)) * 0.75;
      return {
        legFrontU: { angle: s * 0.55 }, legFrontL: { angle: knee(p) },
        legBackU: { angle: -s * 0.55 }, legBackL: { angle: knee(p + Math.PI) },
        armFrontU: { angle: -s * 0.5 }, armFrontL: { angle: -0.3 - Math.max(0, s) * 0.25 },
        armBackU: { angle: s * 0.5 }, armBackL: { angle: -0.3 - Math.max(0, -s) * 0.25 },
        body: { dy: -Math.abs(s) * 1.6, angle: 0.06 },
        head: { angle: -0.04 + s * 0.03, dy: -Math.abs(s) * 0.6 },
        eye: blink(t),
      };
    },

    sit(t) {
      const b = Math.sin(t * 1.6);
      return {
        root: { dy: 5 },
        // 무릎이 생겨서 이제 진짜로 앉는다
        legFrontU: { angle: -1.35 }, legFrontL: { angle: 1.45 },
        legBackU: { angle: -1.18 }, legBackL: { angle: 1.32 },
        armFrontU: { angle: 0.3 }, armFrontL: { angle: 0.2 },
        armBackU: { angle: 0.26 }, armBackL: { angle: 0.2 },
        body: { angle: -0.07, dy: b * 0.4 },
        head: { angle: 0.06 + b * 0.02 },
        eye: blink(t),
      };
    },

    sleep(t) {
      const b = Math.sin(t * 0.9);
      return {
        root: { dy: 6 },
        legFrontU: { angle: -1.4 }, legFrontL: { angle: 1.5 },
        legBackU: { angle: -1.22 }, legBackL: { angle: 1.38 },
        armFrontU: { angle: 0.38 }, armFrontL: { angle: 0.3 },
        armBackU: { angle: 0.32 }, armBackL: { angle: 0.3 },
        body: { angle: -0.1, dy: b * 0.6 },
        head: { angle: 0.32, dy: b * 0.4 + 1 },
        eye: 0,
        zzz: true,
      };
    },

    drag(t) {
      const s = Math.sin(t * 6);
      return {
        armFrontU: { angle: 2.6 + s * 0.12 }, armFrontL: { angle: 0.35 },
        armBackU: { angle: -2.6 - s * 0.12 }, armBackL: { angle: -0.35 },
        legFrontU: { angle: 0.2 + s * 0.18 }, legFrontL: { angle: 0.3 },
        legBackU: { angle: -0.15 - s * 0.18 }, legBackL: { angle: 0.3 },
        body: { angle: s * 0.05 },
        head: { angle: -s * 0.06 },
        eye: 1,
      };
    },

    fall(t) {
      const s = Math.sin(t * 14);
      return {
        armFrontU: { angle: 2.4 + s * 0.3 }, armFrontL: { angle: 0.4 },
        armBackU: { angle: -2.4 + s * 0.3 }, armBackL: { angle: -0.4 },
        legFrontU: { angle: 0.45 }, legFrontL: { angle: 0.35 },
        legBackU: { angle: -0.4 }, legBackL: { angle: 0.35 },
        body: { angle: s * 0.08 },
        eye: 1,
      };
    },

    /**
     * 벽 타기 — 여기가 IK를 쓰는 이유.
     * 손발의 '목표점'만 주면 관절 각도는 역산된다. 잡을 높이가
     * 매번 달라져도(창 모서리, 화면 끝) 같은 코드로 대응된다.
     * 벽은 로컬 +x 쪽에 있다고 본다.
     */
    climb(t) {
      const s = Math.sin(t * 2.6);
      return {
        // 몸통을 벽 쪽으로 기울여 '매달린' 느낌을 준다. 어깨가 움직여도
        // IK가 알아서 다시 풀기 때문에 손은 벽에 붙어 있는다.
        body: { angle: 0.24, dy: -s * 0.7 },
        head: { angle: 0.1 },
        // 머리가 커서 어깨 위가 다 가려진다. 벽 쪽 팔만 머리 위로 올려 그린다.
        order: [
          'legBackU', 'legBackL', 'armBackU', 'armBackL',
          'body',
          'legFrontU', 'legFrontL',
          'head',
          'armFrontU', 'armFrontL',
        ],
        ik: {
          // 손은 번갈아 위를 잡고, 발은 번갈아 벽을 민다
          armFront: { x: 12, y: -44 + s * 5, bend: -1 },
          armBack: { x: 2, y: -38 - s * 5, bend: -1 },
          legFront: { x: 10, y: -20 - s * 5, bend: -1 },
          legBack: { x: 4, y: -10 + s * 5, bend: -1 },
        },
        eye: 1,
      };
    },

    /** 쓰다듬어 줬을 때 */
    pet(t) {
      const b = Math.sin(t * 9);
      return {
        body: { dy: 1 + b * 0.8, angle: b * 0.03 },
        head: { angle: b * 0.09, dy: 1 + b * 0.5 },
        armBackU: { angle: 0.5 + b * 0.25 }, armBackL: { angle: -0.4 },
        armFrontU: { angle: -0.5 - b * 0.25 }, armFrontL: { angle: -0.4 },
        legFrontU: { angle: b * 0.1 }, legFrontL: { angle: 0.06 },
        legBackU: { angle: -b * 0.1 }, legBackL: { angle: 0.06 },
        eye: 0,
        smile: true,
        hearts: true,
      };
    },
  };

  // ── 렌더러 ───────────────────────────────────────────────────
  /**
   * @param {CanvasRenderingContext2D} ctx 원점이 발바닥에 오도록 이미 변환된 컨텍스트
   * @param {string} state 애니메이션 이름
   * @param {number} t 상태 진입 후 경과 시간(초)
   * @param {number} facing 1 = 오른쪽, -1 = 왼쪽
   */
  function draw(ctx, state, t, facing) {
    const anim = ANIMS[state] || ANIMS.idle;
    const pose = anim(t);

    ctx.save();
    if (facing < 0) ctx.scale(-1, 1);
    if (pose.root) {
      ctx.translate(pose.root.dx || 0, pose.root.dy || 0);
      if (pose.root.angle) ctx.rotate(pose.root.angle);
    }

    // 관절 트랜스폼 계산 (부모 → 자식, 메모이제이션)
    const world = {};
    function resolve(name) {
      if (world[name]) return world[name];
      const part = RIG.parts[name];
      const p = pose[name] || {};
      const base = part.parent ? resolve(part.parent) : new DOMMatrix();
      const m = base
        .translate(part.pivot[0], part.pivot[1])
        .translate(p.dx || 0, p.dy || 0)
        .rotate(((p.angle || 0) * 180) / Math.PI);
      world[name] = m;
      return m;
    }

    // 1) IK 패스 — 목표점을 각도로 바꿔서 pose에 써넣는다.
    //    U/L 뼈를 resolve 하기 전에 끝내야 하므로 부모까지만 계산한다.
    if (pose.ik) {
      for (const chain of Object.keys(pose.ik)) {
        const tgt = pose.ik[chain];
        const names = CHAINS[chain];
        if (!names) continue;
        const part = RIG.parts[names[0]];
        // 상완 관절의 월드 행렬 (자기 회전은 아직 반영 전)
        const parentM = part.parent ? resolve(part.parent) : new DOMMatrix();
        const jointM = parentM.translate(part.pivot[0], part.pivot[1]);
        // 목표점을 그 관절의 로컬 좌표로 옮긴다
        const local = jointM.inverse().transformPoint(new DOMPoint(tgt.x, tgt.y));
        const sol = ik2(local.x, local.y, LEN[names[0]], LEN[names[1]], tgt.bend);
        pose[names[0]] = { angle: sol.upper };
        pose[names[1]] = { angle: sol.lower };
      }
    }

    // 2) 그리는 순서는 계층과 따로 (팔이 몸통 뒤로 갈 수 있게).
    //    동작에 따라 순서를 바꿔야 할 때가 있어 pose.order로 덮어쓸 수 있다.
    const base = ctx.getTransform();
    for (const name of (pose.order || RIG.order)) {
      ctx.setTransform(base.multiply(resolve(name)));
      DRAW[name](ctx, pose);
    }
    ctx.setTransform(base);

    // 3) 부가 효과
    if (pose.zzz) drawZzz(ctx, t);
    if (pose.hearts) drawHearts(ctx, t);

    ctx.restore();
  }

  function drawZzz(ctx, t) {
    ctx.save();
    ctx.textAlign = 'center';
    ctx.fillStyle = '#dbe7ff';
    ctx.strokeStyle = PALETTE.outline;
    ctx.lineWidth = 0.8;
    for (let i = 0; i < 3; i++) {
      const p = (t * 0.42 + i / 3) % 1;
      ctx.globalAlpha = Math.sin(p * Math.PI) * 0.95;
      const size = 7 + p * 7;
      ctx.font = 'bold ' + size.toFixed(1) + 'px system-ui, sans-serif';
      ctx.strokeText('z', 13 + p * 11, -42 - p * 22);
      ctx.fillText('z', 13 + p * 11, -42 - p * 22);
    }
    ctx.restore();
  }

  function drawHearts(ctx, t) {
    ctx.save();
    for (let i = 0; i < 2; i++) {
      const p = (t * 0.9 + i / 2) % 1;
      ctx.globalAlpha = Math.sin(p * Math.PI);
      const x = (i === 0 ? -14 : 15) + Math.sin(p * 6 + i) * 3;
      const y = -50 - p * 20;
      const s = 0.22 + p * 0.14;
      ctx.save();
      ctx.translate(x, y);
      ctx.scale(s, s);
      ctx.fillStyle = '#ff7d9c';
      ctx.beginPath();
      ctx.moveTo(0, 8);
      ctx.bezierCurveTo(-12, -2, -8, -14, 0, -7);
      ctx.bezierCurveTo(8, -14, 12, -2, 0, 8);
      ctx.fill();
      ctx.restore();
    }
    ctx.restore();
  }

  window.Character = {
    draw: draw,
    ik2: ik2,
    PALETTE: PALETTE,
    /** 캐릭터가 차지하는 유닛 크기 (발바닥 원점 기준) */
    METRICS: { height: 64, width: 40, padTop: 28, padSide: 18, padBottom: 4 },
    STATES: Object.keys(ANIMS),
  };
})();
