/**
 * 캐릭터 리그 (파츠 분리 방식)
 * -------------------------------------------------------------
 * 그림 한 장 한 장을 프레임으로 찍는 대신, 몸을 파츠로 쪼개고
 * 각 관절의 각도를 코드로 움직인다. 122장 대신 파츠 6개면 된다.
 *
 * 나중에 진짜 아트가 생기면 각 파츠의 DRAW만 이미지 drawImage로
 * 바꾸면 애니메이션 코드는 그대로 쓸 수 있다.
 *
 * 좌표계: 발바닥 가운데가 원점 (0,0), 위쪽이 -y, 키는 64유닛.
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
    order: ['legBack', 'armBack', 'body', 'legFront', 'armFront', 'head'],
    parts: {
      body: { parent: null, pivot: [0, -14] },        // 골반
      head: { parent: 'body', pivot: [0, -20] },      // 목
      armBack: { parent: 'body', pivot: [-8, -16] },  // 어깨
      armFront: { parent: 'body', pivot: [8, -16] },
      legBack: { parent: null, pivot: [-4.5, -14] },  // 고관절
      legFront: { parent: null, pivot: [4.5, -14] },
    },
  };

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
    legBack: (ctx) => limb(ctx, 13, 6.5, PALETTE.bodyDark),
    legFront: (ctx) => limb(ctx, 13, 6.5, PALETTE.limb),
    armBack: (ctx) => limb(ctx, 15, 5.5, PALETTE.bodyDark),
    armFront: (ctx) => limb(ctx, 15, 5.5, PALETTE.limb),

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
          // 감은 눈: 아래로 볼록한 호
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
        armBack: { angle: 0.10 + b * 0.04 },
        armFront: { angle: -0.10 - b * 0.04 },
        eye: blink(t),
      };
    },

    walk(t) {
      const s = Math.sin(t * 8.5);
      return {
        legFront: { angle: s * 0.55 },
        legBack: { angle: -s * 0.55 },
        armFront: { angle: -s * 0.5 },
        armBack: { angle: s * 0.5 },
        body: { dy: -Math.abs(s) * 1.6, angle: 0.06 },
        head: { angle: -0.04 + s * 0.03, dy: -Math.abs(s) * 0.6 },
        eye: blink(t),
      };
    },

    sit(t) {
      const b = Math.sin(t * 1.6);
      return {
        root: { dy: 11 },
        legFront: { angle: -1.5 },
        legBack: { angle: -1.32 },
        armFront: { angle: 0.55 },
        armBack: { angle: 0.48 },
        body: { angle: -0.07, dy: b * 0.4 },
        head: { angle: 0.06 + b * 0.02 },
        eye: blink(t),
      };
    },

    sleep(t) {
      const b = Math.sin(t * 0.9);
      return {
        root: { dy: 12 },
        legFront: { angle: -1.52 },
        legBack: { angle: -1.34 },
        armFront: { angle: 0.62 },
        armBack: { angle: 0.55 },
        body: { angle: -0.1, dy: b * 0.6 },
        head: { angle: 0.32, dy: b * 0.4 + 1 },
        eye: 0,
        zzz: true,
      };
    },

    drag(t) {
      const s = Math.sin(t * 6);
      return {
        armFront: { angle: 2.6 + s * 0.12 },
        armBack: { angle: -2.6 - s * 0.12 },
        legFront: { angle: 0.2 + s * 0.18 },
        legBack: { angle: -0.15 - s * 0.18 },
        body: { angle: s * 0.05 },
        head: { angle: -s * 0.06 },
        eye: 1,
      };
    },

    fall(t) {
      const s = Math.sin(t * 14);
      return {
        armFront: { angle: 2.4 + s * 0.3 },
        armBack: { angle: -2.4 + s * 0.3 },
        legFront: { angle: 0.45 },
        legBack: { angle: -0.4 },
        body: { angle: s * 0.08 },
        eye: 1,
      };
    },

    /** 쓰다듬어 줬을 때 */
    pet(t) {
      const b = Math.sin(t * 9);
      return {
        body: { dy: 1 + b * 0.8, angle: b * 0.03 },
        head: { angle: b * 0.09, dy: 1 + b * 0.5 },
        armBack: { angle: 0.5 + b * 0.25 },
        armFront: { angle: -0.5 - b * 0.25 },
        legFront: { angle: b * 0.1 },
        legBack: { angle: -b * 0.1 },
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
    if (pose.root) ctx.translate(pose.root.dx || 0, pose.root.dy || 0);

    // 1) 관절 트랜스폼 계산 (부모 → 자식)
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

    // 2) 그리는 순서는 계층과 따로 (팔이 몸통 뒤로 갈 수 있게)
    const base = ctx.getTransform();
    for (const name of RIG.order) {
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
      const x = 13 + p * 11;
      const y = -42 - p * 22;
      ctx.strokeText('z', x, y);
      ctx.fillText('z', x, y);
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
    PALETTE: PALETTE,
    /** 캐릭터가 차지하는 유닛 크기 (발바닥 원점 기준) */
    METRICS: { height: 64, width: 40, padTop: 28, padSide: 18, padBottom: 4 },
    STATES: Object.keys(ANIMS),
  };
})();
