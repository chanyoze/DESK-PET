/**
 * 캐릭터 구동부: 상태머신 + 물리 + 마우스 상호작용
 * -------------------------------------------------------------
 * 그리기는 '뷰'가 담당한다 (PartsView = 자체 파츠 리그 / SpineView = Spine / SpriteView = 시트).
 * 이 파일은 어느 쪽이 붙었는지 모른다 — 상태 이름만 넘긴다.
 *
 * 창은 화면 전체를 덮는 투명 창이지만, 실제로 그리는 캔버스는 캐릭터
 * 하나 크기뿐이다. 이동은 CSS transform으로 처리한다.
 *
 * 펫은 한두 마리다. 첫째(주인공)는 설정의 character, 둘째(동료)는 companion.
 * 클릭·드래그·메뉴는 커서 아래에 있는 펫에게 간다.
 */
(function () {
  'use strict';

  const BASE_H = 141;            // 물리 튜닝의 기준 키(px)
  const THROW_MAX = 2000;
  const BOUNCE = 0.30;

  const rand = (a, b) => a + Math.random() * (b - a);
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

  // ── 무대 ────────────────────────────────────────────────────
  let stage = { width: 1920, height: 1080, ground: 1040, workTop: 0, workLeft: 0, workRight: 1920 };

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

  const STILL = ['idle', 'idle2', 'sit', 'sleep', 'pet', 'special', 'hug', 'hugged'];
  const MOVING = ['walk', 'run', 'approach'];
  const RESTING = ['idle', 'idle2', 'walk', 'run', 'sit', 'sleep', 'pet', 'special', 'hug'];
  /** 껴안기를 시작해도 되는 상태 — 자거나 연출 중이면 방해하지 않는다 */
  const HUGGABLE = ['idle', 'idle2', 'walk', 'run', 'sit'];

  /** 매니페스트에 정의된 무장 모드들 (animations 키의 @ 뒤) */
  function modesOf(ch) {
    const set = new Set();
    for (const k of Object.keys((ch && ch.animations) || {})) {
      const i = k.indexOf('@');
      if (i > 0) set.add(k.slice(i + 1));
    }
    return [...set];
  }

  // ── 공용 상태 ───────────────────────────────────────────────
  let menu = null;
  let menuPet = null;     // 메뉴를 연 펫
  let chatOn = true;      // 혼잣말 켜짐 (설정에 저장)
  let modeByChar = {};    // 캐릭터별 무장 모드 (설정에 저장)
  let hitboxEl = null;    // --hitbox 디버그 표시
  let roster = [];        // 설치된 캐릭터 목록
  let reminders = [];     // 예약된 리마인더
  let spineLoaded = false;

  /** @type {Pet[]} 0 = 주인공, 1 = 동료 */
  const pets = [];

  function loadScript(src) {
    return new Promise((resolve, reject) => {
      const el = document.createElement('script');
      el.src = src;
      el.onload = resolve;
      el.onerror = () => reject(new Error(src + ' 로드 실패'));
      document.head.appendChild(el);
    });
  }

  async function makeView(next) {
    if (next.renderer === 'spine') {
      if (!spineLoaded) {
        const url = await window.petAPI.getSpinePath();
        if (!url) throw new Error('Spine 런타임이 없다. npm run fetch-spine 또는 userData/vendor/spine 에 넣을 것');
        await loadScript(url);
        spineLoaded = true;
      }
      return new window.SpineView().init(next);
    }
    if (next.renderer === 'sprite') return new window.SpriteView().init(next);
    return new window.PartsView().init(next);
  }

  // ════════════════════════════════════════════════════════════
  //  펫 한 마리
  // ════════════════════════════════════════════════════════════
  class Pet {
    constructor(role) {
      this.role = role;              // 'main' | 'companion'
      this.character = null;
      this.view = null;
      this.S = {
        x: 400, y: 0, vx: 0, vy: 0,
        dir: 1,        // 걷는 방향
        facing: 1,     // 바라보는 방향
        wall: 0,       // 매달린 벽: -1 왼쪽 / 1 오른쪽 / 0 없음
        state: 'idle',
        until: 2,      // 남은 지속 시간(초)
        hold: false,   // 개발용 고정
      };
      this.PX = 1;
      this.GRAVITY = 1980; this.WALK_SPEED = 57; this.RUN_SPEED = 148; this.CLIMB_SPEED = 121;
      /**
       * 벽 타기 확률. 매니페스트의 climbChance 로 켠다 (기본 0 = 꺼짐).
       * 게임 스켈레톤은 등반 동작이 없어 걷는 자세로 올라가 어색하다.
       */
      this.CLIMB_CHANCE = 0;
      /**
       * 무장 모드 — "walk@knife" 처럼 모드가 붙은 키가 있으면 그 모드일 때 그쪽을 쓴다.
       * 무기를 걷기 풀에 섞으면 걷다 멈출 때마다 무기가 바뀌어서 모드로 뺐다.
       */
      this.mode = '';
      this.sleepCooldown = 0;
      this.hidden = false;           // 껴안기 중인 상대는 잠깐 숨긴다 (둘이 한 그림에 그려진다)
      this.bubble = new window.PetUI.Bubble();
      this.chatter = new window.Chatter({
        say: (m) => this.say(m),
        getState: () => this.S.state,
        // 둘이면 혼잣말이 두 배가 되지 않게 동료는 절반만
        enabled: () => chatOn && !this.hidden && (this.role === 'main' || Math.random() < 0.5),
      });
    }

    get id() { return this.character && this.character.id; }
    get height() { return (this.character && this.character.height) || BASE_H; }

    async load(id) {
      const loaded = await window.petAPI.loadCharacter(id);
      const nv = await makeView(loaded);
      const old = this.view;
      this.character = loaded;
      this.view = nv;
      if (old) old.dispose();       // WebGL 컨텍스트 반납
      this.applyPhysics();
      this.chatter.setCharacter(loaded);
      return this;
    }

    dispose() {
      this.chatter.stop();
      this.bubble.dismiss();
      if (this.bubble.el.parentNode) this.bubble.el.parentNode.removeChild(this.bubble.el);
      if (this.view) this.view.dispose();
      this.view = null;
    }

    /** 캐릭터에 맞춰 물리 배율을 다시 잡는다 */
    applyPhysics() {
      const c = this.character;
      this.PX = (c.height || BASE_H) / BASE_H;
      this.GRAVITY = 1980 * this.PX;
      this.WALK_SPEED = (c.walkSpeed || 57) * this.PX;
      this.RUN_SPEED = (c.runSpeed || (c.walkSpeed || 57) * 2.6) * this.PX;
      this.CLIMB_SPEED = 121 * this.PX;
      this.CLIMB_CHANCE = c.climbChance || 0;
      // 무장 모드는 캐릭터마다 저장된다. 그 캐릭터에 없는 모드면 맨손
      const saved = (modeByChar && modeByChar[c.id]) || '';
      this.mode = modesOf(c).indexOf(saved) >= 0 ? saved : '';
    }

    animFor(state) {
      const map = (this.character && this.character.animations) || {};
      if (state === 'approach') state = this.canRun() ? 'run' : 'walk';
      if (state === 'hugged') state = 'idle';
      let v = (this.mode && map[state + '@' + this.mode]) || map[state] || DEFAULT_ANIM[state] || state;
      // 배열이면 변형 풀 — 이 상태에 들어갈 때마다 하나를 고른다
      if (Array.isArray(v)) {
        const ok = this.view ? v.filter((n) => this.view.has(n)) : v;
        const pool = ok.length ? ok : v;
        v = pool[Math.floor(Math.random() * pool.length)];
      }
      return v;
    }

    /** 달리기는 전용 동작이 있을 때만. 무장 중엔 그 모드용 달리기가 있어야 한다 */
    canRun() {
      const map = (this.character && this.character.animations) || {};
      if (!map.run || !this.view || !this.view.has(map.run instanceof Array ? map.run[0] : map.run)) return false;
      return !this.mode || !!map['run@' + this.mode];
    }

    setState(name, dur) {
      const S = this.S;
      if (S.state !== name) {
        S.state = name;
        if (this.view) this.view.play(this.animFor(name));
      }
      S.until = dur == null ? 0 : dur;
      if (STILL.indexOf(name) >= 0) S.vx = 0;
    }

    /**
     * 다음에 뭘 할지 고른다.
     * 잠은 드물게, 깨어난 뒤에는 한동안 안 자게 한다 (앉기↔자기 반복 방지).
     */
    pickNext() {
      const S = this.S;
      const r = Math.random();
      if (this.sleepCooldown > 0) this.sleepCooldown--;

      if (S.state === 'sleep') {
        this.sleepCooldown = 6;                  // 깨면 당분간 다시 안 잔다
        return this.setState('idle', rand(2, 4));
      }
      if (S.state === 'sit' && this.sleepCooldown <= 0 && r < 0.15) {
        return this.setState('sleep', rand(6, 12));
      }
      // 가끔 특별 동작 (가진 캐릭터만)
      if (r < 0.05 && this.view && this.view.has(this.animFor('special'))) {
        return this.setState('special', rand(2.5, 4));
      }
      if (r < 0.58) {                            // 걷기를 기본 행동으로
        S.dir = Math.random() < 0.5 ? -1 : 1;
        if (this.canRun() && Math.random() < 0.25) return this.setState('run', rand(1.5, 3.2));
        return this.setState('walk', rand(3, 7));
      }
      if (r < 0.85) return this.setState(Math.random() < 0.5 ? 'idle' : 'idle2', rand(1.5, 3.5));
      return this.setState('sit', rand(2.5, 6));
    }

    /**
     * 캐릭터 폭의 절반 (충돌·클릭 판정용).
     * 캔버스 폭에 비례하면 안 된다 — 스켈레톤 바운즈가 캐릭터마다 극단적으로 다르다.
     * 키에서 뽑고 캔버스를 넘지 않게 막는다.
     */
    halfWidth() {
      if (!this.view) return 44;
      return Math.min(this.view.cssW / 2, Math.max(this.height * 0.34, 26));
    }

    /** 클릭 판정 사각형 — 실제로 그려지는 캔버스 영역을 넘지 않는다 */
    hitBox() {
      const S = this.S;
      const halfW = this.halfWidth() * 1.1;
      const top = Math.max(S.y - this.view.originY, S.y - this.height * 1.2);
      return { x: S.x - halfW, y: top, w: halfW * 2, h: S.y + 14 - top };
    }

    /** 벽에 붙어서 위로 올라간다. x는 벽에 고정, 중력은 끈다. */
    updateClimb(dt) {
      const S = this.S;
      const off = this.halfWidth() * 0.55;
      S.x = S.wall < 0 ? stage.workLeft + off : stage.workRight - off;
      S.facing = S.wall;
      S.vx = 0;
      S.vy = -this.CLIMB_SPEED;
      if (S.hold) return;
      S.y += S.vy * dt;

      const top = stage.workTop + this.height * 1.1;
      S.until -= dt;
      if (S.y <= top || S.until <= 0) {
        S.y = Math.max(S.y, top);
        S.vy = -60;
        S.vx = -S.wall * 110;
        S.wall = 0;
        this.setState('fall');
      }
    }

    update(dt) {
      const S = this.S;
      if (!this.character) return;
      if (S.state === 'drag') return;   // 위치는 mousemove가 직접 옮긴다
      if (S.state === 'climb') return this.updateClimb(dt);
      if (S.state === 'hugged') return; // 껴안긴 동안은 상대가 둘 다 그린다

      const airborne = S.y < stage.ground - 0.5 || Math.abs(S.vy) > 1;
      if (airborne) S.vy += this.GRAVITY * dt;
      if (S.state === 'walk') S.vx = S.dir * this.WALK_SPEED;
      else if (S.state === 'run') S.vx = S.dir * this.RUN_SPEED;
      else if (S.state === 'approach') S.vx = S.dir * (this.canRun() ? this.RUN_SPEED : this.WALK_SPEED * 1.3);

      S.x += S.vx * dt;
      S.y += S.vy * dt;

      // 좌우 벽 — 걸어서 닿았으면 타고 오를지 결정하고, 아니면 튕긴다
      const half = this.halfWidth();
      const grounded = S.vy === 0 && S.y >= stage.ground - 0.5;
      if (S.x < stage.workLeft + half) {
        S.x = stage.workLeft + half;
        if (S.state === 'walk' && grounded && Math.random() < this.CLIMB_CHANCE) {
          S.wall = -1;
          return this.setState('climb', rand(4, 9));
        }
        S.vx = Math.abs(S.vx) * 0.5;
        S.dir = 1;
      } else if (S.x > stage.workRight - half) {
        S.x = stage.workRight - half;
        if (S.state === 'walk' && grounded && Math.random() < this.CLIMB_CHANCE) {
          S.wall = 1;
          return this.setState('climb', rand(4, 9));
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
          if (S.state === 'fall') this.setState('idle', rand(1, 2.5));
          if (MOVING.indexOf(S.state) < 0) S.vx *= Math.exp(-9 * dt);
        }
      } else if (S.state !== 'fall' && S.state !== 'pet') {
        this.setState('fall');
      }

      // 바라보는 방향
      if (MOVING.indexOf(S.state) >= 0) S.facing = S.dir;
      else if (Math.abs(S.vx) > 40) S.facing = S.vx > 0 ? 1 : -1;

      // 다음 행동
      if (RESTING.indexOf(S.state) >= 0 && S.vy === 0) {
        S.until -= dt;
        if (S.until <= 0) {
          if (S.state === 'hug') hug.finish();
          else if (S.state === 'pet') this.setState('idle', rand(1, 2));
          else this.pickNext();
        }
      }
    }

    render(dt) {
      const S = this.S;
      if (!this.view) return;
      this.view.el.style.visibility = this.hidden ? 'hidden' : '';
      if (!this.hidden) this.view.draw(dt, S.facing, { airHeight: stage.ground - S.y });
      this.view.el.style.transform =
        'translate3d(' + (S.x - this.view.originX).toFixed(1) + 'px,' +
        (S.y - this.view.originY).toFixed(1) + 'px,0)';
      // 말풍선은 캐릭터를 따라다닌다
      this.bubble.place(S.x, S.y - this.height, stage);
    }

    /** 외부 알림 / 리마인더 → 캐릭터가 말하고 반응한다 */
    say(msg) {
      this.bubble.say(msg);
      if (!this.view || msg.quiet) return;
      if (hug.busy(this)) return;       // 껴안는 중엔 말만 한다
      // 기분에 맞는 동작으로 반응 (있는 것만)
      const wanted = msg.mood === 'happy' && this.view.has(this.animFor('special')) ? 'special' : 'pet';
      if (this.S.state !== 'drag' && this.S.state !== 'fall') this.setState(wanted, 2.2);
    }

    setMode(m) {
      this.mode = m;
      window.petAPI.setMode(this.id, m);
      if (this.view) this.view.play(this.animFor(this.S.state));   // 지금 동작도 바로 바꿔 든다
    }

    /** 무대 가운데 위에서 떨어뜨린다 (등장 · 불러오기) */
    drop(x) {
      const S = this.S;
      S.x = clamp(x, stage.workLeft + 60, stage.workRight - 60);
      S.y = stage.ground - 280;
      S.vx = 0; S.vy = 0;
      S.hold = false;
      this.setState('fall');
      if (this.view) this.view.play(this.animFor('fall'));
    }
  }

  // ════════════════════════════════════════════════════════════
  //  껴안기
  // ════════════════════════════════════════════════════════════
  /**
   * 매니페스트의 hug 로 켠다:
   *   "hug": { "with": "termina-marina", "clip": "hug", "lines": [...], "partnerLines": [...] }
   * clip 은 두 사람이 한 칸에 같이 그려진 그림이다 (이쪽이 왼쪽). 상대가 왼쪽에 있으면
   * 좌우를 뒤집어 그린다. 껴안는 동안 상대 펫은 숨긴다.
   *
   * 흐름: 둘 다 한가하면 가끔 → 이쪽이 상대에게 다가간다(approach) → 붙으면 hug →
   *       끝나면 상대가 옆에 다시 나타나고 둘 다 대기로.
   * 도중에 둘 중 하나라도 집어 들거나 떨어지면 바로 취소한다.
   */
  const hug = {
    who: null,           // 다가가는 쪽
    partner: null,
    phase: '',           // '' | 'approach' | 'hug'
    cooldown: 40,        // 첫 껴안기까지 최소 대기(초)
    timer: 0,

    /** pets 중 껴안을 수 있는 짝 — [다가가는 쪽, 상대] */
    pair() {
      if (pets.length < 2) return null;
      for (const a of pets) {
        const cfg = a.character && a.character.hug;
        if (!cfg || !a.view || !a.view.has(cfg.clip)) continue;
        const b = pets.find((p) => p !== a && p.id === cfg.with);
        if (b) return [a, b];
      }
      return null;
    },

    busy(p) { return !!this.phase && (p === this.who || p === this.partner); },

    tick(dt) {
      if (this.phase) return this.step(dt);
      this.cooldown -= dt;
      if (this.cooldown > 0) return;
      const pr = this.pair();
      if (!pr) return;
      const [a, b] = pr;
      const ready = (p) => HUGGABLE.indexOf(p.S.state) >= 0 && p.S.vy === 0 && p.S.y >= stage.ground - 0.5;
      if (!ready(a) || !ready(b)) return;
      // 초당 1/120 — 평균 2분에 한 번꼴
      if (Math.random() < dt / 120) this.start(a, b);
    },

    start(a, b) {
      this.who = a; this.partner = b;
      this.phase = 'approach';
      this.timer = 12;                    // 12초 안에 못 붙으면 포기
      b.setState('idle', 1e6);            // 상대는 기다린다
      b.S.facing = a.S.x < b.S.x ? -1 : 1;
      a.S.dir = b.S.x > a.S.x ? 1 : -1;
      a.setState('approach', 1e6);
    },

    step(dt) {
      const a = this.who, b = this.partner;
      const broken = (p) => ['drag', 'fall', 'climb'].indexOf(p.S.state) >= 0 || pets.indexOf(p) < 0;
      if (broken(a) || broken(b)) return this.cancel();

      if (this.phase === 'approach') {
        this.timer -= dt;
        if (this.timer <= 0) return this.cancel();
        const dx = b.S.x - a.S.x;
        a.S.dir = dx > 0 ? 1 : -1;
        if (Math.abs(dx) < Math.max(a.halfWidth(), b.halfWidth()) * 0.9) this.embrace();
      }
    },

    embrace() {
      const a = this.who, b = this.partner;
      const cfg = a.character.hug;
      this.phase = 'hug';
      const aLeft = a.S.x <= b.S.x;
      a.S.x = (a.S.x + b.S.x) / 2;
      a.S.vx = 0;
      // 그림은 이쪽이 왼쪽. 이쪽이 오른쪽에 있으면 뒤집는다 (sprite 클립 mirror)
      a.S.facing = aLeft ? 1 : -1;
      this.side = aLeft ? 1 : -1;         // 끝나고 상대를 어느 쪽에 내려놓을지
      a.S.state = 'hug';
      a.S.until = rand(4.5, 7);
      a.view.play(cfg.clip);
      b.setState('hugged', 1e6);
      b.hidden = true;
      if (cfg.lines && cfg.lines.length) {
        a.bubble.say({ text: cfg.lines[Math.floor(Math.random() * cfg.lines.length)], mood: 'happy', ms: 2600 });
      }
    },

    finish() {
      const a = this.who, b = this.partner;
      const cfg = a.character.hug || {};
      b.hidden = false;
      b.S.x = a.S.x + this.side * a.halfWidth() * 1.4;
      b.S.y = stage.ground; b.S.vy = 0;
      b.S.facing = -this.side;
      a.S.x -= this.side * a.halfWidth() * 0.5;
      a.S.facing = this.side;
      a.setState('idle', rand(1.5, 3));
      a.view.play(a.animFor('idle'));
      b.setState('idle', rand(1.5, 3));
      if (cfg.partnerLines && cfg.partnerLines.length) {
        b.bubble.say({ text: cfg.partnerLines[Math.floor(Math.random() * cfg.partnerLines.length)], ms: 2400 });
      }
      this.reset();
    },

    cancel() {
      if (this.partner) {
        this.partner.hidden = false;
        if (this.partner.S.state === 'hugged') this.partner.setState('idle', rand(1, 2));
      }
      if (this.who && (this.who.S.state === 'approach' || this.who.S.state === 'hug')) {
        this.who.setState('idle', rand(1, 2));
      }
      this.reset();
    },

    reset() {
      this.who = this.partner = null;
      this.phase = '';
      this.cooldown = rand(90, 180);      // 다음 껴안기까지 1.5~3분
    },
  };

  // ════════════════════════════════════════════════════════════
  //  메뉴
  // ════════════════════════════════════════════════════════════
  const MODE_LABEL = { knife: '칼', shotgun: '산탄총', pistol: '권총' };

  function buildMenu(p) {
    const sections = [];
    const main = pets[0];
    const comp = pets[1];

    sections.push({
      title: pets.length > 1 ? '캐릭터 (이 아이)' : '캐릭터',
      items: roster.map((c) => ({ label: c.name, value: 'char:' + c.id, checked: c.id === p.id })),
    });

    // 함께 다니기 — 주인공 말고 한 명 더
    sections.push({
      title: '함께 다니기',
      items: [{ label: '혼자', value: 'comp:', checked: !comp }].concat(
        roster.filter((c) => c.id !== main.id)
          .map((c) => ({ label: c.name, value: 'comp:' + c.id, checked: !!comp && comp.id === c.id }))),
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
    if (p.view && p.view.has(p.animFor('special'))) acts.push({ label: '특별 동작', value: 'act:special' });
    if (hug.pair() && !hug.phase) acts.push({ label: '껴안기', value: 'act:hug' });
    acts.push({ label: '말 시키기', value: 'act:talk' });
    acts.push({ label: '가운데로 부르기', value: 'act:recall' });
    sections.push({ title: '동작', items: acts });

    const modes = modesOf(p.character);
    if (modes.length) {
      sections.push({
        title: '무장',
        items: [{ label: '맨손', value: 'mode:', checked: !p.mode }]
          .concat(modes.map((m) => ({ label: MODE_LABEL[m] || m, value: 'mode:' + m, checked: p.mode === m }))),
      });
    }

    sections.push({
      items: [{ label: '혼잣말', value: 'act:chat', checked: chatOn }],
    });

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
    const p = menuPet || pets[0];
    const [kind, arg] = [value.slice(0, value.indexOf(':')), value.slice(value.indexOf(':') + 1)];
    if (kind === 'char') {
      await switchTo(p, arg);
    } else if (kind === 'comp') {
      await setCompanion(arg || null, true);
    } else if (kind === 'mode') {
      p.setMode(arg);
      p.say({ text: arg ? (MODE_LABEL[arg] || arg) + ' 들었어' : '내려놨어', ms: 1800 });
    } else if (kind === 'size') {
      window.petAPI.setSize(parseFloat(arg));   // 메인이 창을 새로고침한다
    } else if (kind === 'remind') {
      const min = parseInt(arg, 10);
      const text = min + '분 지났어. 쉬는 게 어때?';
      reminders = await window.petAPI.addReminder({ text, at: Date.now() + min * 60000 });
      p.say({ text: min + '분 뒤에 알려줄게', mood: 'happy', ms: 2500 });
    } else if (kind === 'unremind') {
      reminders = await window.petAPI.removeReminder(arg);
      p.say({ text: '알림 취소했어', ms: 2000 });
    } else if (kind === 'act') {
      if (arg === 'pet') p.setState('pet', 2.2);
      else if (arg === 'special') p.setState('special', 3);
      else if (arg === 'hug') { const pr = hug.pair(); if (pr) hug.start(pr[0], pr[1]); }
      else if (arg === 'talk') p.chatter.prod();
      else if (arg === 'chat') {
        chatOn = !chatOn;
        window.petAPI.setChat(chatOn);
        p.say({ text: chatOn ? '이제 종종 말 걸게' : '조용히 있을게', ms: 2200 });
      } else if (arg === 'recall') {
        p.drop((stage.workLeft + stage.workRight) / 2);
      } else if (arg === 'quit') window.petAPI.quit();
    }
  }

  // ════════════════════════════════════════════════════════════
  //  캐릭터 교체 · 동료
  // ════════════════════════════════════════════════════════════
  let switching = false;

  /**
   * 지정한(또는 다음) 캐릭터로 교체한다.
   * 위치와 상태는 그대로 두고 뷰만 갈아끼우므로 서 있던 자리에서 바뀐다.
   */
  async function switchTo(p, id) {
    if (switching || !roster.length) return;
    switching = true;
    const from = p.character && p.character.name;
    try {
      let targetId = id;
      if (!targetId) {
        const i = roster.findIndex((c) => c.id === p.id);
        targetId = roster[(i + 1 + roster.length) % roster.length].id;
      }
      if (targetId === p.id) return;
      if (hug.phase) hug.cancel();
      await p.load(targetId);
      p.S.y = Math.min(p.S.y, stage.ground);
      p.view.play(p.animFor(p.S.state));
      p.setState('pet', 1.6);         // 등장 인사
      p.view.play(p.animFor('pet'));
      console.log('[pet] 교체:', from, '→', p.character.name);
      // 주인공은 재시작·새로고침 후에도 유지되게, 동료는 동료 설정으로 저장
      if (p.role === 'main') window.petAPI.setCharacter(p.id);
      else window.petAPI.setCompanion(p.id);
    } catch (e) {
      console.error('교체 실패:', e && e.stack ? e.stack : e);
    } finally {
      switching = false;
    }
  }

  /** 동료를 부르거나(id) 돌려보낸다(null) */
  async function setCompanion(id, save) {
    if (hug.phase) hug.cancel();
    const cur = pets[1];
    if (cur && (!id || cur.id !== id)) {
      pets.splice(1, 1);
      cur.dispose();
    }
    if (id && (!pets[1] || pets[1].id !== id)) {
      try {
        const p = new Pet('companion');
        await p.load(id);
        const m = pets[0].S;
        // 주인공 옆, 화면 안쪽으로 떨어뜨린다
        const mid = (stage.workLeft + stage.workRight) / 2;
        p.drop(m.x + (m.x < mid ? 1 : -1) * rand(160, 280));
        p.chatter.start();
        pets.push(p);
        console.log('[pet] 동료:', p.character.name);
      } catch (e) {
        console.error('동료 부르기 실패:', e && e.stack ? e.stack : e);
        id = null;
      }
    }
    if (save) window.petAPI.setCompanion(id || null);
  }

  // ════════════════════════════════════════════════════════════
  //  마우스
  // ════════════════════════════════════════════════════════════
  let hover = false;
  let drag = null;        // { pet, ... }
  const cursor = { x: -1, y: -1 };

  const inRect = (r, px, py) =>
    !!r && px >= r.x && px <= r.x + r.w && py >= r.y && py <= r.y + r.h;

  /** 커서 아래 펫 (나중에 그린 쪽이 위) */
  function petAt(px, py) {
    for (let i = pets.length - 1; i >= 0; i--) {
      const p = pets[i];
      if (p.view && !p.hidden && inRect(p.hitBox(), px, py)) return p;
    }
    return null;
  }

  /** 말풍선이 걸린 펫 */
  function bubbleAt(px, py) {
    return pets.find((p) => inRect(p.bubble.rect, px, py)) || null;
  }

  /**
   * 커서가 마우스를 받아야 할 영역 위에 있는지.
   * 캐릭터 본체 + 떠 있는 말풍선/메뉴를 모두 포함해야 클릭이 통과되지 않는다.
   */
  function hitTest(px, py) {
    if (!pets.length) return false;
    if (menu && inRect(menu.rect, px, py)) return true;
    if (bubbleAt(px, py)) return true;
    return !!petAt(px, py);
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
      const S = drag.pet.S;
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
    const bp = bubbleAt(e.clientX, e.clientY);
    if (bp) {
      bp.bubble.dismiss();
      return;
    }
    const p = petAt(e.clientX, e.clientY);
    if (!p) return;
    if (menu && menu.open) menu.close();
    e.preventDefault();
    const S = p.S;
    const now = performance.now();
    drag = { pet: p, ox: S.x - e.clientX, oy: S.y - e.clientY, t0: now, lt: now, lx: e.clientX, ly: e.clientY, moved: 0 };
    S.vx = 0; S.vy = 0;
    S.wall = 0;
    p.setState('drag');
    document.body.style.cursor = 'grabbing';
  });

  window.addEventListener('mouseup', () => {
    if (!drag) return;
    const p = drag.pet;
    const S = p.S;
    const held = performance.now() - drag.t0;
    const tapped = drag.moved < 7 && held < 400;
    drag = null;
    if (tapped) {
      // 짧게 클릭하면 메뉴를 연다 (캐릭터 교체·크기·리마인더가 여기 모여 있다)
      // 누르는 순간 drag 상태가 됐으니 되돌려야 한다. 안 그러면 잡힌 자세로 굳는다.
      // 메뉴가 열려 있는 동안은 제자리에 세워 두고, 닫히면 다시 움직인다 (menu.onClose).
      S.vx = 0; S.vy = 0;
      S.y = Math.min(S.y, stage.ground);
      p.setState(S.y >= stage.ground - 0.5 ? 'idle' : 'fall', 1e6);
      menuPet = p;
      // 열 때마다 목록을 다시 읽는다 — 실행 중에 넣은 캐릭터도 바로 보이게
      window.petAPI.listCharacters().then((list) => {
        roster = list;
        buildMenu(p);
        menu.show(S.x, S.y - p.height * 0.55, stage);
        syncInteractive(true);
      });
    } else {
      S.vx = clamp(S.vx, -THROW_MAX, THROW_MAX);
      S.vy = clamp(S.vy, -THROW_MAX, THROW_MAX);
      p.setState('fall');
    }
    syncInteractive(true);
  });

  // ════════════════════════════════════════════════════════════
  //  메인 루프
  // ════════════════════════════════════════════════════════════
  window.addEventListener('error', (e) => {
    console.error('렌더 오류:', e.message, e.filename + ':' + e.lineno);
  });

  let last = performance.now();
  function frame(now) {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    try {
      for (const p of pets) p.update(dt);
      hug.tick(dt);
      for (const p of pets) p.render(dt);
      // 커서는 가만히 있고 캐릭터가 그 밑으로 걸어 들어올 수도 있다. mousemove 때만 판정하면
      // 그동안 클릭이 바탕화면으로 새어 나간다 (크게 설정일수록 빨라서 더 잘 생긴다).
      // 값이 바뀔 때만 IPC를 보내므로 매 프레임 불러도 된다.
      if (!drag && cursor.x >= 0) syncInteractive(false);
      if (hitboxEl && pets[0] && pets[0].view) {
        const b = pets[0].hitBox();
        hitboxEl.style.transform = `translate3d(${b.x}px,${b.y}px,0)`;
        hitboxEl.style.width = b.w + 'px';
        hitboxEl.style.height = b.h + 'px';
      }
    } catch (err) {
      console.error('프레임 실패:', err && err.stack ? err.stack : err);
    }
    requestAnimationFrame(frame);
  }

  // ════════════════════════════════════════════════════════════
  //  부팅
  // ════════════════════════════════════════════════════════════
  function applyStage(s) {
    stage = s;
    for (const p of pets) {
      p.S.x = clamp(p.S.x, s.workLeft + 60, s.workRight - 60);
      p.S.y = Math.min(p.S.y, s.ground);
    }
  }

  async function boot() {
    if (location.search.indexOf('hitbox') >= 0) {
      hitboxEl = document.createElement('div');
      hitboxEl.style.cssText = 'position:absolute;top:0;left:0;border:2px solid #ff3b6b;background:rgba(255,59,107,.12);pointer-events:none';
      document.body.appendChild(hitboxEl);
    }
    menu = new window.PetUI.PetMenu();
    menu.onAction = onMenuAction;
    // 메뉴를 닫으면 세워 뒀던 펫을 다시 움직이게 한다 (항목을 골랐으면 그 동작이 뒤이어 덮어쓴다)
    menu.onClose = () => {
      const p = menuPet;
      if (p && p.S.state === 'idle' && p.S.until > 1e5) p.setState('idle', rand(0.8, 1.6));
    };

    const cfg = await window.petAPI.getSettings();
    reminders = cfg.reminders || [];
    chatOn = cfg.chatter !== false;
    modeByChar = cfg.modes || {};

    stage = await window.petAPI.getStage();
    roster = await window.petAPI.listCharacters();

    const main = new Pet('main');
    await main.load();
    pets.push(main);
    console.log('[pet] 캐릭터:', main.character.name, '(' + main.character.renderer + ')');
    console.log('[pet] 설치된 캐릭터', roster.length + '명:', roster.map((c) => c.name).join(', '));
    main.drop((stage.workLeft + stage.workRight) / 2);
    main.chatter.start();

    // 동료 — 설치돼 있고 주인공과 다를 때만
    if (cfg.companion && cfg.companion !== main.id && roster.some((c) => c.id === cfg.companion)) {
      await setCompanion(cfg.companion, false);
    }

    window.petAPI.onStage(applyStage);
    window.petAPI.onSay((msg) => pets[0] && pets[0].say(msg));   // 외부 알림은 주인공이 말한다
    window.addEventListener('resize', () => pets.forEach((p) => p.view && p.view.resize()));
    requestAnimationFrame(frame);

    booted = true;
    if (pendingCmd) runCommand(pendingCmd);
  }

  // 부팅이 끝나기 전에 온 명령(--start= 등)은 부팅 뒤로 미룬다.
  // 안 그러면 부팅 마지막의 '떨어지며 등장'이 명령을 덮어쓴다.
  let booted = false;
  let pendingCmd = null;
  window.petAPI.onCommand((cmd) => {
    if (booted) runCommand(cmd);
    else pendingCmd = cmd;
  });

  /** 개발용 명령은 주인공에게 */
  function placeOnGround(p) {
    const S = p.S;
    S.x = (stage.workLeft + stage.workRight) / 2;
    S.y = stage.ground;
    S.vx = 0; S.vy = 0;
  }

  async function runCommand(cmd) {
    const p = pets[0];
    const S = p.S;
    if (cmd.indexOf('clip:') === 0) {
      // 클립 하나를 바닥에서 계속 재생 (--start=clip:transform)
      placeOnGround(p);
      p.setState('idle', 1e6);
      p.view.play(cmd.slice(5));
    } else if (cmd.indexOf('mode:') === 0) {
      // 무장 모드로 걷기 (--start=mode:shotgun)
      p.mode = cmd.slice(5);
      placeOnGround(p);
      S.dir = 1;
      p.setState('walk', 1e6);
    } else if (cmd.indexOf('state:') === 0) {
      // 특정 상태를 바닥에서 계속 재생 (--start=state:sit)
      placeOnGround(p);
      p.setState(cmd.slice(6), 1e6);
    } else if (cmd === 'hug') {
      // 껴안기 바로 보기 (--start=hug) — 짝이 없으면 저장하지 않고 불러온다
      const cfg = p.character.hug;
      if (!hug.pair() && cfg) await setCompanion(cfg.with, false);
      const pr = hug.pair();
      if (!pr) return console.warn('[hug] 껴안을 짝이 없다');
      for (const q of pets) { q.S.y = stage.ground; q.S.vy = 0; q.setState('idle', 1e6); }
      pr[0].S.x = (stage.workLeft + stage.workRight) / 2 - 150;
      pr[1].S.x = (stage.workLeft + stage.workRight) / 2 + 150;
      hug.start(pr[0], pr[1]);
    } else if (cmd === 'recall') {
      pets.forEach((q, i) => q.drop((stage.workLeft + stage.workRight) / 2 + i * 180));
    } else if (cmd === 'next') {
      switchTo(p);
    } else if (cmd === 'wake') {
      pets.forEach((q) => q.setState('idle', 3));
    } else if (cmd === 'climb' || cmd === 'climbhold') {
      const mid = (stage.workLeft + stage.workRight) / 2;
      S.wall = S.x < mid ? -1 : 1;
      S.hold = cmd === 'climbhold';
      S.y = S.hold ? stage.ground - 300 : stage.ground;
      S.vx = 0; S.vy = 0;
      p.setState('climb', 8);
    }
  }

  // 디버깅용
  window.__pets = pets;
  if (location.search.indexOf('trace') >= 0) {
    setInterval(() => {
      for (const p of pets) {
        const S = p.S;
        console.log(
          (p.role === 'main' ? '[주] ' : '[동] ') + 'state=' + S.state + ' y=' + S.y.toFixed(0) + ' x=' + S.x.toFixed(0) +
          ' h=' + p.height + ' hidden=' + p.hidden + ' hug=' + (hug.phase || '-') + ' hover=' + hover
        );
      }
    }, 600);
  }

  boot().catch((err) => console.error('부팅 실패:', err && err.stack ? err.stack : err));
})();
