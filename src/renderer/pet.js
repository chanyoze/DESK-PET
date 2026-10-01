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

  const STILL = ['idle', 'idle2', 'sit', 'sleep', 'pet', 'special', 'hug', 'hugged', 'down', 'recover', 'bloodcast', 'vanish', 'pounce'];
  const MOVING = ['walk', 'run', 'approach', 'nightmare', 'rush'];
  const RESTING = ['idle', 'idle2', 'walk', 'run', 'sit', 'sleep', 'pet', 'special', 'hug',
    'down', 'recover', 'nightmare', 'bloodcast', 'pounce'];
  /** 원작처럼 분위기에서만 나오는 상태 — 끝나면 정해진 다음 상태로 간다 */
  const DARK_NEXT = { down: 'recover', nightmare: 'recover', recover: 'idle' };
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
  /**
   * 분위기 — 'light' 가볍게 / 'dark' 원작처럼.
   * 원작처럼이면 어두운 대사(linesDark · dialoguesDark)가 섞이고, 악몽 · 쓰러짐 ·
   * 붉은 호 순간이동이 드물게 나온다. 매니페스트에 없는 캐릭터는 달라지지 않는다.
   */
  let tone = 'light';
  let hitboxEl = null;    // --hitbox 디버그 표시
  let roster = [];        // 설치된 캐릭터 목록
  let reminders = [];     // 예약된 리마인더
  let displays = [];      // 모니터 목록 (메뉴 열 때 갱신)
  let claudeState = null; // Claude Code 훅 연결 상태 (메뉴 열 때 갱신)
  let autoStart = null;   // 윈도우 시작 시 실행 { available, on }
  let claudeSessions = []; // Claude 세션 현황 (메뉴 열 때 갱신)
  let todoState = { items: [], recap: {} };   // 할 일 목록 (메인이 파일을 지켜보다가 보내 준다)
  let updateAvail = null;  // 새 버전 (메인이 알려 준다)
  let sizeScale = 1;      // 크기 배율 (메뉴 체크 표시용 — 바꾸면 창이 새로 뜬다)
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
        // 둘이면 혼잣말이 두 배가 되지 않게 동료는 절반만. 둘이 대화 중이면 혼잣말은 쉰다
        enabled: () => chatOn && !this.hidden && !talk.active && (this.role === 'main' || Math.random() < 0.5),
        getMode: () => this.mode,
        getTone: () => tone,
        hasPartner: () => pets.length > 1,
      });
      this.thrown = false;           // 던져서 날아가는 중 (착지 반응용)
    }

    get id() { return this.character && this.character.id; }
    get height() { return (this.character && this.character.height) || BASE_H; }

    async load(id) {
      const loaded = await window.petAPI.loadCharacter(id);
      const nv = await makeView(loaded);
      // 그림 원본(base64 문자열)은 뷰가 다 읽었으니 버린다 — 캐릭터를 바꾸면 다시 받아 온다
      delete loaded.files;
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
      if (state === 'approach' || state === 'rush') state = this.canRun() ? 'run' : 'walk';
      if (state === 'hugged') state = 'idle';
      if (state === 'vanish') state = 'idle';
      // Claude 가 일하는 동안 앉아서 기다리는 대신 쓸 동작이 있으면 그걸로 (animations.work)
      if (state === 'sit' && map.work && this.role === 'main' && claude.working()) state = 'work';
      let v = (this.mode && map[state + '@' + this.mode]) || map[state] || DEFAULT_ANIM[state] || state;
      // 배열이면 변형 풀 — 이 상태에 들어갈 때마다 하나를 고른다
      if (Array.isArray(v)) {
        const ok = this.view ? v.filter((n) => this.view.has(n)) : v;
        const pool = ok.length ? ok : v;
        v = pool[Math.floor(Math.random() * pool.length)];
      }
      return v;
    }

    /** 매니페스트에 이 상태용 동작이 있는지 (DEFAULT_ANIM 으로 떨어지는 건 제외) */
    has(state) {
      const map = (this.character && this.character.animations) || {};
      return !!map[state];
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
        const anim = this.animFor(name);
        if (this.view) this.view.play(anim);
        if (anim === 'transform') this.chatter.react('transform', 1);
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
      // Claude 가 일하는 동안 주인공은 자리를 덜 뜨고 앉아서 기다린다.
      // 3분이 넘어가면 앉은 채로 꾸벅꾸벅 졸기도 한다 — 끝나면 깨서 알려 준다 (claude.on)
      if (this.role === 'main' && claude.working()) {
        if (S.state === 'sit' && claude.workedSec() > 180 && r < 0.4) return this.setState('sleep', rand(10, 20));
        if (r < 0.45) return this.setState('sit', rand(5, 10));
        if (r < 0.75) return this.setState(Math.random() < 0.5 ? 'idle' : 'idle2', rand(2, 4));
        S.dir = Math.random() < 0.5 ? -1 : 1;
        return this.setState('walk', rand(2, 4));
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
      if (S.state === 'vanish') {       // 붉은 호로 사라진 동안
        S.until -= dt;
        if (S.until <= 0) dark.reappear(this);
        return;
      }

      const airborne = S.y < stage.ground - 0.5 || Math.abs(S.vy) > 1;
      if (airborne) S.vy += this.GRAVITY * dt;
      if (S.state === 'walk') S.vx = S.dir * this.WALK_SPEED;
      else if (S.state === 'run') S.vx = S.dir * this.RUN_SPEED;
      else if (S.state === 'approach') S.vx = S.dir * (this.canRun() ? this.RUN_SPEED : this.WALK_SPEED * 1.3);
      else if (S.state === 'nightmare') S.vx = S.dir * this.WALK_SPEED * 0.3;   // 피 흘리며 천천히 기어간다
      else if (S.state === 'rush') {
        // Claude 가 허락을 구할 때 커서 쪽으로 달려온다. 닿거나 시간이 다 되면 멈춰서 올려다본다
        const dx = this.goalX - S.x;
        S.dir = dx > 0 ? 1 : -1;
        S.vx = S.dir * (this.canRun() ? this.RUN_SPEED : this.WALK_SPEED * 1.6);
        S.until -= dt;
        if (Math.abs(dx) < this.halfWidth() * 0.6 || S.until <= 0) {
          S.facing = S.dir;
          const why = this.rushWhy;
          this.rushWhy = '';
          // 커서를 쫓아가 닿으면 달려드는 동작이 있는 캐릭터는 한 번 덤빈다 (animations.pounce)
          if (why === 'chase' && this.has('pounce') && Math.abs(dx) < this.halfWidth() * 0.6) this.setState('pounce', 0.8);
          else if (this.rushEnd === 'idle') this.setState('idle', rand(1, 2));
          else this.setState('pet', 2.2);
        }
      }

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
          if (S.state === 'fall') {
            // 원작처럼: 아주 세게 던지면 가끔 쓰러졌다가 일어난다
            if (this.hardThrow && tone === 'dark' && this.has('down') && Math.random() < 0.3) {
              this.setState('down', rand(2.5, 4));
              this.chatter.react('down', 1);
            } else {
              this.setState('idle', rand(1, 2.5));
              if (this.thrown) this.chatter.react('landed', 0.6);
            }
            this.thrown = false;
            this.hardThrow = false;
          }
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
          else if (S.state === 'bloodcast') dark.vanish(this);
          else if (DARK_NEXT[S.state]) this.setState(DARK_NEXT[S.state], S.state === 'recover' ? rand(1, 2) : 2.4);
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
      if (msg.mood === 'fail') return this.collapse();
      // 기분에 맞는 동작으로 반응 (있는 것만)
      const wanted = msg.mood === 'happy' && this.view.has(this.animFor('special')) ? 'special' : 'pet';
      if (this.S.state !== 'drag' && this.S.state !== 'fall') this.setState(wanted, 2.2);
    }

    /** 실패 소식 — 쓰러지는 동작이 있으면 쓰러졌다 일어나고, 없으면 평범하게 반응 */
    collapse() {
      if (hug.busy(this)) hug.cancel();
      const grounded = this.S.y >= stage.ground - 0.5;
      if (this.has('down') && grounded) this.setState('down', 3);
      else if (this.S.state !== 'drag' && this.S.state !== 'fall') this.setState('pet', 2.2);
    }

    /**
     * x 까지 달려간다. 닿거나 timeout 초가 지나면 end 상태로 (Claude 허락 요청 · 커서 쫓기 · 도망).
     * why 는 커서 놀이가 목표를 계속 고쳐 잡을지 판단할 때 쓴다.
     */
    rushTo(x, end, timeout, why) {
      const S = this.S;
      if (['drag', 'fall', 'climb', 'vanish', 'hugged'].indexOf(S.state) >= 0) return false;
      if (hug.busy(this)) hug.cancel();
      this.goalX = clamp(x, stage.workLeft + this.halfWidth(), stage.workRight - this.halfWidth());
      this.rushEnd = end || 'pet';
      this.rushWhy = why || '';
      this.setState('rush', timeout || 8);
      return true;
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
  //  원작처럼 — 악몽 · 붉은 호
  // ════════════════════════════════════════════════════════════
  /**
   * 분위기가 '원작처럼'일 때만 돈다. 둘 다 일부러 드물게 했다.
   *  - 악몽: 새벽 2~5시에만, 평균 30분에 한 번, 같은 펫은 40분 안에 다시 안 나온다.
   *    피 흘리며 기어가다 주저앉았다 일어난다. (animations.nightmare)
   *  - 붉은 호: 매니페스트 teleport 가 있는 캐릭터(사마리)만. 평균 10분에 한 번, 7분 쿨다운.
   *    손을 베고(bloodcast) → 붉은 빛과 함께 사라졌다가 → 다른 자리에 나타난다.
   *    세게 던졌을 때도 35% 확률로 공중에서 빠져나간다.
   */
  const CALM = ['idle', 'idle2', 'walk', 'sit'];
  const dark = {
    tick(dt) {
      if (tone !== 'dark' || hug.phase || talk.active) return;
      const hour = new Date().getHours();
      for (const p of pets) {
        if (CALM.indexOf(p.S.state) < 0 || p.S.vy !== 0 || p.hidden) continue;
        p.nightmareCd = (p.nightmareCd || 0) - dt;
        p.teleportCd = (p.teleportCd == null ? rand(180, 300) : p.teleportCd) - dt;

        if (hour >= 2 && hour < 5 && p.has('nightmare') && p.nightmareCd <= 0 && Math.random() < dt / 1800) {
          p.nightmareCd = 2400;
          p.S.dir = Math.random() < 0.5 ? -1 : 1;
          p.setState('nightmare', rand(6, 9));
          p.chatter.react('nightmare', 1);
          continue;
        }
        if (this.canTeleport(p) && p.teleportCd <= 0 && Math.random() < dt / 600) {
          p.teleportCd = 420;
          p.setState(p.has('bloodcast') ? 'bloodcast' : 'idle', p.has('bloodcast') ? 1.8 : 0.1);
          if (!p.has('bloodcast')) this.vanish(p);
        }
      }
    },

    canTeleport(p) {
      return tone === 'dark' && !!(p.character && p.character.teleport) && !hug.busy(p);
    },

    /** 붉은 빛 번쩍 — 사라지는 자리와 나타나는 자리에 */
    flash(p) {
      const cfg = (p.character && p.character.teleport) || {};
      const size = Math.round(p.height * 1.3);
      const el = document.createElement('div');
      el.className = 'redarc';
      el.style.width = el.style.height = size + 'px';
      el.style.left = (p.S.x - size / 2) + 'px';
      el.style.top = (p.S.y - p.height * 0.55 - size / 2) + 'px';
      if (cfg.color) el.style.setProperty('--arc', cfg.color);
      document.body.appendChild(el);
      setTimeout(() => el.remove(), 1000);
    },

    vanish(p) {
      this.flash(p);
      p.hidden = true;
      p.bubble.dismiss();
      p.S.vx = 0; p.S.vy = 0;
      p.S.state = 'vanish';
      p.S.until = rand(0.6, 1.1);
    },

    reappear(p) {
      const S = p.S;
      const L = stage.workLeft + 80, R = stage.workRight - 80;
      // 원래 자리에서 적어도 250px 떨어진 곳
      let x = S.x;
      for (let i = 0; i < 8 && Math.abs(x - S.x) < 250; i++) x = rand(L, R);
      if (p.teleportTo != null) { x = p.teleportTo; p.teleportTo = null; }   // 녹화·테스트용 지정 위치
      S.x = x;
      S.y = stage.ground;
      S.vx = 0; S.vy = 0;
      p.hidden = false;
      p.setState('idle', rand(1.5, 3));
      p.view.play(p.animFor('idle'));
      this.flash(p);
      p.chatter.react('teleport', 0.8);
    },
  };

  // ════════════════════════════════════════════════════════════
  //  둘의 대화
  // ════════════════════════════════════════════════════════════
  /**
   * 매니페스트 dialogues 로 준다:
   *   "dialogues": [ { "with": "termina-marina", "lines": [["me", "..."], ["you", "..."]] } ]
   * me = 이 캐릭터, you = 상대. 둘 다 한가하면 몇 분에 한 번 주고받는다.
   * 대화 중에는 둘 다 혼잣말을 쉬고, 서 있는 쪽은 말하는 상대를 바라본다.
   */
  const BUSY = ['drag', 'fall', 'climb', 'hug', 'hugged', 'sleep', 'approach',
    'down', 'recover', 'nightmare', 'bloodcast', 'vanish'];
  const talk = {
    active: null,        // { script:[[pet, text]], i, wait }
    cooldown: rand(60, 120),

    candidates() {
      if (pets.length < 2) return [];
      const out = [];
      for (const a of pets) {
        const b = pets.find((p) => p !== a);
        const ds = ((a.character && a.character.dialogues) || [])
          .concat(tone === 'dark' ? (a.character && a.character.dialoguesDark) || [] : []);
        for (const d of ds) {
          if (d.with === b.id && d.lines && d.lines.length) out.push({ a, b, d });
        }
      }
      return out;
    },

    tick(dt) {
      if (this.active) return this.step(dt);
      this.cooldown -= dt;
      if (this.cooldown > 0 || !chatOn || hug.phase || drag) return;
      if (pets.some((p) => BUSY.indexOf(p.S.state) >= 0 || p.hidden)) return;
      const cands = this.candidates();
      if (!cands.length) return;
      const c = cands[Math.floor(Math.random() * cands.length)];
      this.active = {
        script: c.d.lines.map(([who, text]) => [who === 'you' ? c.b : c.a, text]),
        i: 0,
        wait: 0,
      };
    },

    step(dt) {
      const t = this.active;
      // 도중에 집어 들거나 한쪽이 사라지면 그만둔다
      if (pets.length < 2 || pets.some((p) => ['drag', 'fall', 'hugged'].indexOf(p.S.state) >= 0)) return this.end();
      t.wait -= dt;
      if (t.wait > 0) return;
      if (t.i >= t.script.length) return this.end();
      const [who, text] = t.script[t.i++];
      const other = pets.find((p) => p !== who);
      // 서 있거나 앉아 있으면 상대 쪽을 본다
      if (STILL.indexOf(who.S.state) >= 0 && other) who.S.facing = other.S.x > who.S.x ? 1 : -1;
      const ms = Math.min(5000, 1800 + text.length * 85);
      who.bubble.say({ text, ms });
      t.wait = ms / 1000 + 0.35;
      for (const p of pets) p.chatter.lastAt = Date.now();
    },

    end() {
      this.active = null;
      this.cooldown = rand(150, 300);     // 다음 대화까지 2.5~5분
      for (const p of pets) p.chatter.lastAt = Date.now();
    },
  };

  // ════════════════════════════════════════════════════════════
  //  Claude Code 연동
  // ════════════════════════════════════════════════════════════
  /**
   * 메인이 훅 이벤트를 해석해서 { kind, sid, project, sec, busy } 로 보낸다 (main.js onClaudeEvent).
   * 말은 주인공이 한다. 앞에 [프로젝트 폴더 이름] 을 붙여서 세션이 여럿이어도 구분되게 하고,
   * 말풍선을 누르면 그 세션의 터미널 창으로 간다.
   *
   * 대사는 매니페스트의 claude 로 캐릭터마다 덮어쓸 수 있다:
   *   "claude": { "done": [...], "long": [...], "sleepy": [...], "fail": [...], "permission": [...],
   *               "waiting": [...], "noWindow": [...] }
   * long 은 5분 넘게 걸린 작업 — {m} 이 걸린 분으로 바뀐다. sleepy 는 기다리다 졸던 중에 끝났을 때.
   */
  const CLAUDE_LINES = {
    done: ['끝났어. 확인해 봐', '다 됐어!', '작업 끝났어'],
    long: ['{m}분 걸렸는데, 끝났어', '오래 걸렸다… 끝났어 ({m}분)'],
    sleepy: ['음냐… 어? 끝났대!', '안 잤어! …끝났대'],
    fail: ['멈췄어… 오류가 났나 봐', '중간에 끊겼어. 한번 봐 줘'],
    permission: ['허락이 필요하대', '이거 해도 되냐고 물어봐'],
    waiting: ['네 대답 기다리고 있어', '할 거 다 하고 기다리는 중이야'],
    noWindow: ['그 창은 못 찾겠어…', '어느 창인지 모르겠어'],
  };

  /** 메뉴 세션 목록에 쓰는 상태 이름 */
  const SESSION_LABEL = {
    working: '작업 중', permission: '허락 기다림', waiting: '대답 기다림',
    done: '끝남', fail: '오류로 멈춤', idle: '대기',
  };

  const fmtAgo = (sec) => (sec < 60 ? sec + '초' : sec < 3600 ? Math.round(sec / 60) + '분' : Math.round(sec / 3600) + '시간');

  const claude = {
    busy: 0,              // 일하는 중인 세션 수 (메인이 세어서 보내 준다)
    busySince: 0,

    /** 일하는 중인지 — 끝 신호를 놓쳐도 20분 지나면 풀린다 */
    working() {
      return this.busy > 0 && performance.now() - this.busySince < 20 * 60e3;
    },
    workedSec() {
      return this.working() ? (performance.now() - this.busySince) / 1000 : 0;
    },

    line(p, kind, vars) {
      const own = p.character && p.character.claude && p.character.claude[kind];
      const pool = own && own.length ? own : CLAUDE_LINES[kind];
      let t = pool[Math.floor(Math.random() * pool.length)];
      for (const [k, v] of Object.entries(vars || {})) t = t.split('{' + k + '}').join(v);
      return t;
    },

    on(ev) {
      if (ev.kind === 'start' && !this.busy) this.busySince = performance.now();
      this.busy = ev.busy || 0;
      if (ev.sid && ev.kind !== 'permission' && ev.kind !== 'waiting') inbox.resolve(ev.sid);
      const p = pets[0];
      if (!p || !p.view || ev.quiet || ev.kind === 'start' || ev.kind === 'quick' || ev.kind === 'end') return;
      console.log('[claude] 반응:', ev.kind, ev.project || '', ev.sec != null ? ev.sec + 's' : '');

      recap.yieldTo(p);
      const sid = ev.sid || '';
      // 알림 카드 — 윗줄 출처 · 가운데 사실 · 아래 캐릭터 한마디 (대화 말풍선과 구분)
      const card = (level, title, line) => ({ source: 'Claude', project: ev.project || '', level, title, line, at: Date.now() });
      const dur = ev.sec >= 60 ? ' · ' + Math.round(ev.sec / 60) + '분' : '';
      let msg = null;
      if (ev.kind === 'done') {
        const dozing = p.S.state === 'sleep';
        const kind = dozing ? 'sleepy' : ev.sec >= 300 ? 'long' : 'done';
        const line = this.line(p, kind, { m: Math.round(ev.sec / 60) });
        msg = { text: line, mood: 'happy', ms: 9000, sid, card: card('done', '작업 끝남' + dur, line) };   // 자고 있었으면 깨면서 반응한다
      } else if (ev.kind === 'fail') {
        const line = this.line(p, 'fail');
        msg = { text: line, mood: 'fail', ms: 12000, sid, card: card('fail', '오류로 멈춤', line) };
      } else if (ev.kind === 'permission') {
        const line = this.line(p, 'permission');
        msg = { text: line, mood: 'alert', ms: 12000, quiet: true, sid, card: card('permission', '허락 필요', line) };
        // 커서 아래쪽 바닥으로 달려온다. 커서가 다른 모니터에 있으면 그쪽 끝까지 (8초 안에 못 닿으면 거기서 멈춤)
        if (cursor.seen) p.rushTo(cursor.x, 'pet', 8);
        else if (p.S.state !== 'drag' && p.S.state !== 'fall') p.setState('pet', 2.2);
      } else if (ev.kind === 'waiting') {
        const line = this.line(p, 'waiting');
        msg = { text: line, ms: 10000, sid, card: card('waiting', '입력 기다림', line) };
      }
      if (!msg) return;
      inbox.add(msg);
      p.say(msg);
    },

    /** 세션의 터미널 창으로 (말풍선 · 메뉴에서) */
    async focus(sid, p) {
      console.log('[claude] 터미널로 누름:', sid ? sid.slice(0, 8) : '(세션 없음)');
      const r = await window.petAPI.claudeFocus(sid);
      if (r.ok || !p) return;
      // 왜 못 갔는지 — 캐릭터 말투 한 줄 + 사실
      const why = {
        nosession: '앱을 켠 뒤로 그 세션 소식이 없어서 창을 몰라 — 그 터미널에서 한 번 더 대화하면 찾아 둘게',
        nowindow: '그 세션 창을 아직 못 찾았어 — 그 터미널에서 한 번 더 대화하면 다시 찾아 볼게',
        gone: '그 창은 닫혔나 봐',
        flash: '윈도우가 막아서 못 가져왔어 — 작업 표시줄에서 깜빡이는 창이야',
      }[r.reason] || '창으로 못 갔어 (' + r.reason + ')';
      p.say({ text: (r.reason === 'flash' ? '' : this.line(p, 'noWindow') + '\n') + why, ms: 6000, quiet: true });
    },

    /** 메뉴 항목 — 세션 목록 */
    menuItems(list) {
      return list.slice(0, 6).map((s) => ({
        label: (s.hasWindow ? '↗ ' : '') + (s.project || '(이름 없음)') + ' · ' + (SESSION_LABEL[s.state] || s.state) +
          ' ' + fmtAgo(s.sec) + (s.state === 'working' ? '째' : ' 전'),
        value: 'csess:' + s.sid,
      }));
    },
  };

  // ════════════════════════════════════════════════════════════
  //  커서 놀이 — 쳐다보기 · 쫓아오기 · 도망가기
  // ════════════════════════════════════════════════════════════
  /**
   * 쳐다보기는 늘 켜져 있다: 가만히 있을 때 커서가 가까우면 그쪽을 본다.
   * 쫓아오기 / 도망가기는 메뉴에서 고른다 (설정 cursorMode).
   *  - 쫓아오기: 커서가 멀어지면 달려와서 옆에 선다. 동료는 조금 더 떨어져서 선다
   *  - 도망가기: 커서가 가까이 오면 반대쪽으로 달아난다. 벽에 몰리면 커서 밑을 지나 반대편으로 빠져나간다
   * 0.25초마다 판단한다. 드래그 · 메뉴 · 껴안기 · 대화 중엔 쉰다.
   */
  const CALM_FOR_CURSOR = ['idle', 'idle2', 'walk', 'run', 'sit'];
  const cursorPlay = {
    mode: 'none',
    t: 0,

    tick(dt) {
      this.t -= dt;
      if (this.t > 0) return;
      this.t = 0.25;
      // 0.25초 동안 커서가 움직인 거리 (도망가기 판단용)
      this.speed = this.last ? Math.hypot(cursor.x - this.last.x, cursor.y - this.last.y) : 0;
      this.last = { x: cursor.x, y: cursor.y };
      if (drag || !cursor.seen || (menu && menu.open) || hug.phase || talk.active) return;
      const onStage = cursor.x >= 0 && cursor.x <= stage.width && cursor.y >= 0 && cursor.y <= stage.height;

      for (const p of pets) {
        if (p.hidden || !p.view) continue;
        const S = p.S;
        const grounded = S.vy === 0 && S.y >= stage.ground - 0.5;
        if (!grounded) continue;
        const dx = cursor.x - S.x;
        const near = Math.abs(dx) < p.halfWidth() * 3 + 60 && Math.abs(cursor.y - (S.y - p.height / 2)) < p.height * 1.6;

        if (this.mode === 'chase' && onStage) {
          const gap = p.role === 'main' ? p.halfWidth() * 1.6 : p.halfWidth() * 4;   // 커서 옆 어디에 설지
          const target = cursor.x - Math.sign(dx || 1) * gap;
          if (S.state === 'rush' && p.rushWhy === 'chase') { p.goalX = clamp(target, stage.workLeft + p.halfWidth(), stage.workRight - p.halfWidth()); continue; }
          if (CALM_FOR_CURSOR.indexOf(S.state) >= 0 && Math.abs(dx) > gap + p.halfWidth() * 3) {
            p.rushTo(target, 'idle', 6, 'chase');
            continue;
          }
        }
        // 빠르게 다가올 때만 도망간다 — 천천히 다가가면 잡을 수 있어야 메뉴를 열어 모드를 끌 수 있다
        if (this.mode === 'flee' && onStage && near && this.speed > 40 && CALM_FOR_CURSOR.indexOf(S.state) >= 0) {
          const dir = -Math.sign(dx || 1);
          let goal = clamp(S.x + dir * 380, stage.workLeft + p.halfWidth(), stage.workRight - p.halfWidth());
          // 벽에 몰렸으면 커서 밑으로 빠져나가 반대편으로
          if (Math.abs(goal - S.x) < 80) goal = S.x - dir * 520;
          p.rushTo(goal, 'idle', 3, 'flee');
          continue;
        }
        // 쳐다보기 — 가만히 있을 때만, 너무 가까우면(바로 위) 그대로
        if (['idle', 'idle2', 'sit'].indexOf(S.state) >= 0 && onStage && Math.abs(dx) < 420 && Math.abs(dx) > p.halfWidth() * 0.5) {
          S.facing = dx > 0 ? 1 : -1;
        }
      }
    },
  };

  // ════════════════════════════════════════════════════════════
  //  놓친 알림
  // ════════════════════════════════════════════════════════════
  /**
   * 알림 카드(Claude · 기한 · 빌드)는 말풍선이 사라져도 여기 남는다.
   * 안 읽은 게 있으면 주인공 머리 위에 빨간 배지(🔔 N) + 트레이 아이콘에 빨간 점 (main.js setTrayAlert).
   * 읽음: 그 카드 말풍선을 누르거나, 배지를 눌러 목록을 열면 전부.
   */
  const INBOX_MAX = 30;
  const LEVEL_ICON = { done: '✓', permission: '!', waiting: '…', fail: '✕', due: '⏰', build: '⚙', info: '·' };

  const inbox = {
    items: [],         // { id, at, card, sid, read }
    el: null,
    rect: null,

    add(msg) {
      // 손이 필요한 것만 안 읽음으로 센다 — 끝남 · 정보는 목록에만 (Claude 를 여럿 돌리면 끝남이 금방 수십 개가 된다)
      const level = msg.card && msg.card.level;
      const quiet = level === 'done' || level === 'info';
      const it = { id: 'a' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5), at: Date.now(), card: msg.card, sid: msg.sid || '', update: !!msg.update, read: quiet };
      msg.inboxId = it.id;
      this.items.unshift(it);
      if (this.items.length > INBOX_MAX) this.items.length = INBOX_MAX;
      this.sync();
    },

    /** 그 세션이 다시 움직였으면(시작 · 끝남 · 오류) 앞서 쌓인 허락 · 입력 대기는 해결된 것으로 */
    resolve(sid) {
      let n = 0;
      for (const x of this.items) {
        if (!x.read && x.sid === sid && x.card && (x.card.level === 'permission' || x.card.level === 'waiting')) { x.read = true; n++; }
      }
      if (n) this.sync();
    },

    unread() {
      return this.items.filter((x) => !x.read).length;
    },

    read(id) {
      for (const x of this.items) if (!id || x.id === id) x.read = true;
      this.sync();
    },

    sync() {
      const n = this.unread();
      if (!this.el) {
        this.el = document.createElement('div');
        this.el.className = 'inbox-badge';
        this.el.title = '놓친 알림 — 눌러서 보기';
        document.body.appendChild(this.el);
      }
      if (n > (this.lastN || 0)) {                      // 늘었으면 다시 깜빡인다 (네 번)
        this.el.style.animation = 'none';
        void this.el.offsetWidth;
        this.el.style.animation = '';
      }
      this.lastN = n;
      this.el.hidden = !n;
      this.el.textContent = '🔔 ' + n;
      window.petAPI.inboxCount(n);
    },

    /** 주인공 머리 위에 붙인다 (매 프레임) */
    place() {
      const p = pets[0];
      if (!this.el || this.el.hidden || !p || !p.view) { this.rect = null; return; }
      const x = p.S.x + p.halfWidth() * 0.6;
      const y = p.S.y - p.height - 6;
      this.el.style.transform = 'translate3d(' + Math.round(x) + 'px,' + Math.round(y) + 'px,0)';
      this.rect = { x, y, w: this.el.offsetWidth, h: this.el.offsetHeight };
    },

    /** 배지를 누르면 — 목록 메뉴 (누르면 그 터미널로), 열면 전부 읽음 */
    open() {
      const p = pets[0];
      const hm = (t) => { const d = new Date(t); return String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0'); };
      const items = this.items.slice(0, 12).map((x) => ({
        label: hm(x.at) + '  ' + (LEVEL_ICON[x.card.level] || '·') + ' ' +
          [x.card.source, x.card.project].filter(Boolean).join(' · ') + ' — ' + x.card.title + (x.sid ? '  ↗' : ''),
        value: 'inbox:' + x.id,
        checked: false,
      }));
      menuPet = p;
      menu.build([
        { title: '최근 알림 (↗ 누르면 그 터미널로)', items },
        { items: [{ label: '목록 비우기', value: 'inbox:clear', danger: true }] },
      ]);
      menu.show(p.S.x, p.S.y - p.height * 0.55, stage);
      this.read();
      syncInteractive(true);
    },
  };

  // ════════════════════════════════════════════════════════════
  //  할 일 recap
  // ════════════════════════════════════════════════════════════
  /**
   * 메인이 정각마다(설정 recap.every) 남은 할 일을 보내 준다 (main.js sendRecap). 주인공이 말한다.
   * 앞 한 줄은 캐릭터 말투, 목록은 담백하게 — 5개까지, 나머지는 "+N개 더".
   * 할 일이 하나도 적혀 있지 않으면 정각 recap 은 조용히 넘긴다 (조르지 않는다).
   *
   * 대사는 매니페스트의 recap 으로 덮어쓸 수 있다:
   *   "recap": { "some": ["정각이야. 남은 거 {n}개:"], "now": ["지금 남은 거:"], "none": ["다 했네! 오늘 {d}개"], "empty": [...] }
   * some 은 정각, now 는 "지금 정리해줘"로 불렀을 때.
   * urgent / over 는 목록 끝의 재촉 한마디 — {t} 글, {t는} 글+은/는, {left} 남은(지난) 시간.
   */
  const RECAP_LINES = {
    some: ['정각이야. 남은 거 {n}개:', '시간 됐어. 아직 남은 거:', '잊지 않았지? 남은 거 {n}개:'],
    now: ['지금 남은 거 {n}개:', '정리해 보면, 남은 건:'],
    none: ['할 일 다 끝냈네! 오늘 {d}개 했어.', '남은 거 없어. 좀 쉬어도 돼.'],
    empty: ['적어 둔 할 일이 없어. 메뉴에서 추가할 수 있어.'],
    // 목록 끝에 붙는 재촉 한마디 — 가장 급한 일 하나. {t는} 은 글 + 은/는, {left} 는 남은 시간
    urgent: ['{t는} {left} 안에 처리해야 해. 부지런히 해!', '{t}, {left} 남았어. 서두르자!'],
    over: ['{t는} 벌써 기한이 지났어. 얼른 하자!', '{t}, 늦었어… 지금이라도 해.'],
  };
  const RECAP_SHOW = 5;
  const URGENT_WITHIN = 4 * 3600e3;    // 이 안에 기한인 일이 있으면 재촉한다

  /** 받침에 맞춘 은/는 (한글이 아니면 '는') */
  function topic(word) {
    const c = word.charCodeAt(word.length - 1);
    if (c < 0xac00 || c > 0xd7a3) return word + '는';
    return word + ((c - 0xac00) % 28 ? '은' : '는');
  }

  /** 남은 시간 → "40분" · "2시간" · "2시간 반" */
  function leftText(ms) {
    const min = Math.max(1, Math.round(ms / 60e3));
    if (min < 60) return min + '분';
    const h = Math.floor(min / 60), m = min % 60;
    return h + '시간' + (m >= 30 ? ' 반' : '');
  }

  const recap = {
    line(p, kind, vars) {
      const own = p.character && p.character.recap && p.character.recap[kind];
      const pool = own && own.length ? own : RECAP_LINES[kind];
      let t = pool[Math.floor(Math.random() * pool.length)];
      for (const [k, v] of Object.entries(vars || {})) t = t.split('{' + k + '}').join(v);
      return t;
    },

    on(r) {
      const p = pets[0];
      if (!p || !p.view) return;
      const n = r.open.length;
      // 오늘 적어 둔 게 없으면 정각엔 조르지 않는다 (직접 부르면 말한다)
      if (!n && !r.todayAll && r.reason === 'scheduled') return;
      let text;
      if (!n && !r.todayAll) text = this.line(p, 'empty');
      else if (!n) text = this.line(p, 'none', { d: r.doneToday || 0 });
      else {
        // 기한 지난 것 → 기한 가까운 것 → 기한 없는 것, 밀린 날짜 것은 날짜를 붙인다
        const at = (x) => (x.due ? new Date(x.due.replace(' ', 'T') + (x.due.length > 10 ? ':00' : 'T23:59:00')).getTime() : Infinity);
        const list = r.open.slice().sort((a, b) => at(a) - at(b));
        const fmt = (x) => {
          let s = '· ' + x.text;
          if (x.late) s += ' (' + parseInt(x.date.slice(5, 7), 10) + '/' + parseInt(x.date.slice(8), 10) + ')';
          if (x.due && x.due.length > 10) {
            const left = at(x) - r.now;
            s += ' ~' + x.due.slice(11) + (left < 0 ? ' (지남)' : left < URGENT_WITHIN ? ' (' + leftText(left) + ' 남음)' : '');
          }
          return s;
        };
        text = this.line(p, r.reason === 'manual' ? 'now' : 'some', { n }) + '\n' +
          list.slice(0, RECAP_SHOW).map(fmt).join('\n') +
          (n > RECAP_SHOW ? '\n+' + (n - RECAP_SHOW) + '개 더' : '');
        // 가장 급한 일 하나를 캐릭터 말투로 재촉 — 기한 지난 것이 먼저, 없으면 4시간 안에 기한인 것
        const first = list[0];
        if (first && first.due) {
          const left = at(first) - r.now;
          const vars = { t: first.text, 't는': topic(first.text), left: leftText(Math.abs(left)) };
          if (left < 0) text += '\n' + this.line(p, 'over', vars);
          else if (left < URGENT_WITHIN) text += '\n' + this.line(p, 'urgent', vars);
        }
      }
      if (r.reason === 'manual' && r.backlogOpen) text += '\n(언젠가 할 일 ' + r.backlogOpen + '개)';
      console.log('[todo] recap 말함:', r.reason, n, '오늘', r.todayAll, '언젠가', r.backlogOpen);
      // 읽을 시간 — 말풍선 기본 상한(12초)보다 길게
      p.say({ text, mood: n ? 'normal' : 'happy', ms: Math.min(25000, 5000 + text.length * 110), quiet: true, recap: true });
      // 한가할 때만 살짝 반응 (끌려가는 중 · 대화 · 껴안기 중엔 말만)
      if (!drag && !talk.active && !hug.busy(p) && ['idle', 'idle2', 'walk', 'sit', 'sleep'].indexOf(p.S.state) >= 0) {
        p.setState('pet', 1.6);
      }
    },

    /** Claude 알림이 오면 떠 있는 recap 은 양보한다 (말풍선은 한 줄로 기다리므로) */
    yieldTo(p) {
      const b = p.bubble;
      if (b.current && b.current.recap) {
        clearTimeout(b.timer);
        b.timer = null;
        b.next();
      }
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

    if (updateAvail) sections.push({ items: [{ label: '⬆ 업데이트 v' + updateAvail + '…', value: 'act:update' }] });

    sections.push({
      title: pets.length > 1 ? '캐릭터 (이 아이)' : '캐릭터',
      fold: 'char',
      items: roster.map((c) => ({ label: c.name, value: 'char:' + c.id, checked: c.id === p.id })),
    });

    // 함께 다니기 — 주인공 말고 한 명 더
    sections.push({
      title: '함께 다니기',
      fold: 'comp',
      items: [{ label: '혼자', value: 'comp:', checked: !comp }].concat(
        roster.filter((c) => c.id !== main.id)
          .map((c) => ({ label: c.name, value: 'comp:' + c.id, checked: !!comp && comp.id === c.id }))),
    });

    // 모니터가 둘 이상일 때만
    if (displays.length > 1) {
      sections.push({
        title: '모니터',
        fold: 'disp',
        items: displays.map((d) => ({ label: d.label, value: 'disp:' + d.id, checked: d.current }))
          .concat([{ label: '지금 마우스가 있는 모니터로', value: 'disp:cursor' }]),
      });
    }

    sections.push({
      title: '크기',
      fold: 'size',
      items: [
        { label: '작게', value: 'size:0.6', checked: sizeScale === 0.6 },
        { label: '보통', value: 'size:1', checked: sizeScale === 1 },
        { label: '크게', value: 'size:1.45', checked: sizeScale === 1.45 },
      ],
    });

    const acts = [{ label: '쓰다듬기', value: 'act:pet' }];
    if (p.view && p.view.has(p.animFor('special'))) acts.push({ label: '특별 동작', value: 'act:special' });
    if (hug.pair() && !hug.phase) acts.push({ label: '껴안기', value: 'act:hug' });
    if (talk.candidates().length && !talk.active) acts.push({ label: '둘이 얘기하기', value: 'act:talk2' });
    acts.push({ label: '말 시키기', value: 'act:talk' });
    acts.push({ label: '가운데로 부르기', value: 'act:recall' });
    sections.push({ title: '동작', items: acts });

    // 분위기 — 원작처럼 대사가 있는 캐릭터가 하나라도 있을 때만
    if (pets.some((q) => q.character && (q.character.linesDark || q.character.dialoguesDark))) {
      sections.push({
        title: '분위기',
        fold: 'tone',
        items: [
          { label: '가볍게', value: 'tone:light', checked: tone !== 'dark' },
          { label: '원작처럼', value: 'tone:dark', checked: tone === 'dark' },
        ],
      });
    }

    const modes = modesOf(p.character);
    if (modes.length) {
      sections.push({
        title: '무장',
        fold: 'mode',
        items: [{ label: '맨손', value: 'mode:', checked: !p.mode }]
          .concat(modes.map((m) => ({ label: MODE_LABEL[m] || m, value: 'mode:' + m, checked: p.mode === m }))),
      });
    }

    sections.push({
      items: [{ label: '혼잣말', value: 'act:chat', checked: chatOn }, { label: '새로 바뀐 것 보기', value: 'act:whatsnew' }],
    });

    // 할 일 — todo.md (메모장 · Claude Code 로 고쳐도 된다)
    const open = todoState.items.filter((x) => !x.done).length;
    const tItems = [
      { label: '할 일 추가…', value: 'todo:add' },
      { label: '지금 정리해줘', value: 'todo:recap' },
      { label: 'todo.md 열기', value: 'todo:open' },
      { label: '메모 붙이기…', value: 'todo:note' },
    ];
    if (!window.PetNotes.todoShown) tItems.push({ label: '할 일 카드 보이기', value: 'todo:card' });
    tItems.push({ label: '메모 · 카드 숨기기', value: 'todo:hide', checked: window.PetNotes.hidden });
    if (todoState.items.some((x) => x.done)) tItems.push({ label: '끝낸 것 지우기', value: 'todo:clear' });
    sections.push({ title: '할 일' + (todoState.items.length ? ' · ' + open + '개 남음' : ''), items: tItems });
    const every = (todoState.recap && todoState.recap.every) || 0;
    sections.push({
      title: '정각 알림 (평일 근무 시간)',
      fold: 'recap',
      items: [[0, '끄기'], [30, '30분마다'], [60, '1시간마다'], [120, '2시간마다']]
        .map(([m, label]) => ({ label, value: 'recap:' + m, checked: every === m })),
    });

    // Claude Code — 훅이 걸려 있으면 끝났을 때 · 허락이 필요할 때 알려 준다
    const cs = claudeState || {};
    const cItems = [];
    if (cs.available === false) {
      // 윈도우가 아니면 Claude Code 연결은 없고 알림 설정만
    } else if (cs.connected) {
      cItems.push({ label: '알림 말하기', value: 'claude:speak', checked: cs.speak });
      cItems.push({ label: '연결 끊기', value: 'claude:off', danger: true });
    } else {
      cItems.push({ label: cs.legacy ? '알림 연결하기 (예전 훅 바꾸기)' : '알림 연결하기', value: 'claude:on' });
    }
    cItems.push({ label: (cs.available === false ? '시스템 알림' : '윈도우 알림') + ' (허락 · 오류 · 기한 · 빌드 실패)', value: 'toast:' + (cs.toast ? 'off' : 'on'), checked: !!cs.toast });
    if (inbox.items.length) cItems.push({ label: '최근 알림 보기' + (inbox.unread() ? ' (' + inbox.unread() + ')' : ''), value: 'act:inbox' });
    sections.push({ title: cs.available === false ? '알림' : 'Claude Code' + (cs.connected ? ' · 연결됨' : ''), fold: cs.connected ? 'claude' : '', items: cItems });
    // 세션 현황 — 누르면 그 터미널 창으로 (↗ 는 창을 찾아 둔 세션)
    if (cs.connected && claudeSessions.length) {
      sections.push({ title: 'Claude 세션 (눌러서 그 창으로)', items: claude.menuItems(claudeSessions) });
    }

    sections.push({
      title: '커서',
      fold: 'cursor',
      items: [
        { label: '신경 안 쓰기', value: 'cursor:none', checked: cursorPlay.mode === 'none' },
        { label: '쫓아오기', value: 'cursor:chase', checked: cursorPlay.mode === 'chase' },
        { label: '도망가기', value: 'cursor:flee', checked: cursorPlay.mode === 'flee' },
      ],
    });

    if (autoStart && autoStart.available) {
      sections.push({ items: [{ label: '윈도우 시작할 때 실행', value: 'auto:toggle', checked: autoStart.on }] });
    }

    sections.push({
      title: '리마인더',
      fold: 'remind',
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
    } else if (kind === 'tone') {
      tone = arg === 'dark' ? 'dark' : 'light';
      window.petAPI.setTone(tone);
      p.say({ text: tone === 'dark' ? '……' : '휴.', ms: 1400, quiet: true });
    } else if (kind === 'disp') {
      window.petAPI.setDisplay(arg === 'cursor' ? 'cursor' : Number(arg));   // 메인이 옮기고 새로고침한다
    } else if (kind === 'size') {
      window.petAPI.setSize(parseFloat(arg));   // 메인이 창을 새로고침한다
    } else if (kind === 'remind') {
      const min = parseInt(arg, 10);
      const text = min + '분 지났어. 쉬는 게 어때?';
      reminders = await window.petAPI.addReminder({ text, at: Date.now() + min * 60000 });
      p.say({ text: min + '분 뒤에 알려줄게', mood: 'happy', ms: 2500 });
    } else if (kind === 'claude') {
      if (arg === 'on') {
        claudeState = await window.petAPI.claudeConnect();
        if (claudeState.error) p.say({ text: '연결 못 했어… ' + claudeState.error, mood: 'alert', ms: 8000 });
        else p.say({ text: 'Claude 랑 연결했어. 일 끝나면 알려줄게', mood: 'happy', ms: 4000 });
      } else if (arg === 'off') {
        claudeState = await window.petAPI.claudeDisconnect();
        p.say({ text: claudeState.error ? '끊지 못했어… ' + claudeState.error : 'Claude 알림 뗐어', ms: 3000 });
      } else if (arg === 'speak') {
        claudeState = await window.petAPI.claudeSetSpeak(!claudeState.speak);
        p.say({ text: claudeState.speak ? 'Claude 소식 다시 전할게' : 'Claude 소식은 잠깐 조용히 있을게', ms: 2600 });
      }
    } else if (kind === 'todo') {
      if (arg === 'add') todoState = await window.petAPI.todoAdd(window.PetNotes.addDefaults());
      else if (arg === 'recap') window.petAPI.recapNow();
      else if (arg === 'open') window.petAPI.todoOpen();
      else if (arg === 'note') window.PetNotes.setData(await window.petAPI.notesAdd(window.PetNotes.spotNear(p.S.x)));
      else if (arg === 'card') window.PetNotes.setData(await window.petAPI.notesSetTodoCard({ shown: true }));
      else if (arg === 'hide') window.PetNotes.setData(await window.petAPI.notesSetHidden(!window.PetNotes.hidden));
      else if (arg === 'clear') { todoState = await window.petAPI.todoClearDone(); p.say({ text: '끝낸 건 치웠어', ms: 2000, quiet: true }); }
    } else if (kind === 'recap') {
      todoState = await window.petAPI.recapSetEvery(parseInt(arg, 10));
      const m = parseInt(arg, 10);
      p.say({ text: m ? (m >= 60 ? m / 60 + '시간' : m + '분') + '마다 할 일 짚어 줄게' : '정각 알림 껐어', ms: 2400, quiet: true });
    } else if (kind === 'inbox') {
      if (arg === 'clear') { inbox.items = []; inbox.sync(); }
      else {
        const it = inbox.items.find((x) => x.id === arg);
        console.log('[inbox] 목록 항목 누름:', it ? it.card.level + ' ' + (it.sid ? it.sid.slice(0, 8) : '(sid 없음)') : '(없음)');
        if (it && it.update) window.petAPI.updatePrompt();
        else if (it && it.sid) claude.focus(it.sid, p);
      }
    } else if (kind === 'toast') {
      const on = await window.petAPI.toastSet(arg === 'on');
      p.say({ text: on ? '급한 건 윈도우 알림으로도 띄울게' : '윈도우 알림은 끌게', ms: 2400, quiet: true });
    } else if (kind === 'csess') {
      claude.focus(arg, p);
    } else if (kind === 'cursor') {
      cursorPlay.mode = arg;
      window.petAPI.setCursorMode(arg);
      const said = { none: '이제 커서는 신경 안 쓸게', chase: '어디 가? 같이 가!', flee: '가까이 오지 마!' };
      p.say({ text: said[arg] || '', ms: 2200, quiet: true });
    } else if (kind === 'auto') {
      autoStart = await window.petAPI.setAutoStart(!autoStart.on);
      p.say({ text: autoStart.on ? '컴퓨터 켜면 나도 나올게' : '이제 알아서 안 나올게', ms: 2600 });
    } else if (kind === 'unremind') {
      reminders = await window.petAPI.removeReminder(arg);
      p.say({ text: '알림 취소했어', ms: 2000 });
    } else if (kind === 'act') {
      if (arg === 'pet') { p.setState('pet', 2.2); p.chatter.react('petted'); }
      else if (arg === 'talk2') { talk.cooldown = 0; talk.tick(0); }
      else if (arg === 'special') p.setState('special', 3);
      else if (arg === 'hug') { const pr = hug.pair(); if (pr) hug.start(pr[0], pr[1]); }
      else if (arg === 'talk') p.chatter.prod();
      else if (arg === 'update') window.petAPI.updatePrompt();
      else if (arg === 'whatsnew') window.petAPI.whatsNew();
      else if (arg === 'inbox') setTimeout(() => inbox.open(), 0);   // 이 메뉴가 닫힌 뒤에 연다
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
  // seen: 좌표를 한 번이라도 받았는지 (왼쪽 모니터에 있으면 x 가 음수라서 -1 로는 구분이 안 된다)
  const cursor = { x: -1, y: -1, seen: false };

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
    // 메뉴가 열려 있으면 화면 전체가 클릭을 받는다 — 빈 곳을 누르면 메뉴가 닫힌다 (PetMenu 의 mousedown).
    // 클릭 통과 상태로 두면 바탕화면 클릭이 앱까지 오지 않아서 메뉴를 닫을 방법이 없다.
    // 윈도우 팝업 메뉴처럼 그 클릭 한 번은 메뉴를 닫는 데 쓰이고 아래 창으로 가지 않는다.
    if (menu && menu.open) return true;
    if (bubbleAt(px, py)) return true;
    if (inRect(inbox.rect, px, py)) return true;
    if (window.PetNotes && window.PetNotes.hit(px, py)) return true;
    return !!petAt(px, py);
  }

  function syncInteractive(force) {
    const want = drag ? true : hitTest(cursor.x, cursor.y);
    if (want !== hover || force) {
      if (want && !hover && !drag) {
        const what = menu && menu.open ? '메뉴' : inRect(inbox.rect, cursor.x, cursor.y) ? '배지' : bubbleAt(cursor.x, cursor.y) ? '말풍선' :
          window.PetNotes && window.PetNotes.hit(cursor.x, cursor.y) ? '카드' : '캐릭터';
        if (what !== '캐릭터') console.log('[mouse] 클릭 받기 시작 —', what, Math.round(cursor.x) + ',' + Math.round(cursor.y));
      }
      hover = want;
      window.petAPI.setInteractive(want);
    }
    // 잡는 손 모양은 캐릭터 위에서만 (메뉴가 열려 화면 전체가 클릭을 받을 때도 빈 곳은 보통 커서)
    const grab = drag || (want && !!petAt(cursor.x, cursor.y));
    document.body.style.cursor = drag ? 'grabbing' : grab ? 'grab' : 'default';
  }

  /**
   * 메뉴가 열린 채 커서가 이 모니터를 떠나면 닫는다 — 다른 모니터 클릭은 이 창에 안 와서 닫을 수가 없다.
   * 잠깐 스쳐 나간 건 봐준다 (1초).
   */
  let offScreenSince = 0;
  function closeMenuIfCursorLeft() {
    if (!menu || !menu.open) { offScreenSince = 0; return; }
    const off = cursor.x < 0 || cursor.y < 0 || cursor.x > stage.width || cursor.y > stage.height;
    if (!off) { offScreenSince = 0; return; }
    if (!offScreenSince) offScreenSince = performance.now();
    else if (performance.now() - offScreenSince > 1000) { menu.close(); offScreenSince = 0; }
  }

  // 메인이 알려 주는 커서 좌표 — forward mousemove 가 끊겨도 클릭 전환이 되게 한다
  window.petAPI.onCursor((p) => {
    if (drag) return;              // 드래그 중엔 실제 mousemove 가 더 정확하다
    cursor.x = p.x;
    cursor.seen = true;
    cursor.y = p.y;
    syncInteractive(false);
    closeMenuIfCursorLeft();
  });

  window.addEventListener('mousemove', (e) => {
    cursor.x = e.clientX;
    cursor.seen = true;
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
      if (!drag.said && drag.moved > 12) { drag.said = true; drag.pet.chatter.react('picked', 0.5); }
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
    if (inRect(inbox.rect, e.clientX, e.clientY)) { console.log('[inbox] 배지 누름'); inbox.open(); return; }
    const bp = bubbleAt(e.clientX, e.clientY);
    if (bp) {
      // Claude 세션 말풍선이면 그 터미널로 간다
      const sid = bp.bubble.current && bp.bubble.current.sid;
      const isUpdate = !!(bp.bubble.current && bp.bubble.current.update);   // 새 버전 카드면 업데이트 확인 창
      console.log('[bubble] 누름:', bp.bubble.current && bp.bubble.current.card ? bp.bubble.current.card.level : '대화', sid ? 'sid ' + sid.slice(0, 8) : '');
      if (bp.bubble.current && bp.bubble.current.inboxId) inbox.read(bp.bubble.current.inboxId);
      bp.bubble.dismiss();
      if (sid) claude.focus(sid, bp);
      else if (isUpdate) window.petAPI.updatePrompt();
      return;
    }
    const p = petAt(e.clientX, e.clientY);
    if (!p) return;
    if (menu && menu.open) menu.close();
    e.preventDefault();
    const S = p.S;
    const now = performance.now();
    drag = { pet: p, prev: S.state, ox: S.x - e.clientX, oy: S.y - e.clientY, t0: now, lt: now, lx: e.clientX, ly: e.clientY, moved: 0 };
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
    const prev = drag.prev;
    drag = null;
    if (tapped) {
      // 짧게 클릭하면 메뉴를 연다 (캐릭터 교체·크기·리마인더가 여기 모여 있다)
      // 누르는 순간 drag 상태가 됐으니 되돌려야 한다. 안 그러면 잡힌 자세로 굳는다.
      // 메뉴가 열려 있는 동안은 제자리에 세워 두고, 닫히면 다시 움직인다 (menu.onClose).
      S.vx = 0; S.vy = 0;
      S.y = Math.min(S.y, stage.ground);
      p.setState(S.y >= stage.ground - 0.5 ? 'idle' : 'fall', 1e6);
      if (prev === 'sleep') p.chatter.react('woken', 0.9);
      menuPet = p;
      // 열 때마다 목록을 다시 읽는다 — 실행 중에 넣은 캐릭터도 바로 보이게
      Promise.all([
        window.petAPI.listCharacters(), window.petAPI.listDisplays(),
        window.petAPI.claudeStatus(), window.petAPI.getAutoStart(), window.petAPI.claudeSessions(),
      ]).then(([list, ds, cs, as, ss]) => {
        roster = list;
        displays = ds;
        claudeState = cs;       // settings.json 을 손으로 고쳤을 수도 있어서 열 때마다 읽는다
        autoStart = as;
        claudeSessions = ss;
        buildMenu(p);
        menu.show(S.x, S.y - p.height * 0.55, stage);
        syncInteractive(true);
      });
    } else {
      S.vx = clamp(S.vx, -THROW_MAX, THROW_MAX);
      S.vy = clamp(S.vy, -THROW_MAX, THROW_MAX);
      p.setState('fall');
      // 세게 던졌을 때만 비명 (살짝 내려놓은 건 아니다)
      const speed = Math.hypot(S.vx, S.vy);
      p.thrown = speed > 700;
      p.hardThrow = speed > 1500;
      // 원작처럼: 사마리는 세게 던지면 가끔 공중에서 붉은 호로 빠져나간다
      if (speed > 1200 && dark.canTeleport(p) && Math.random() < 0.35) dark.vanish(p);
      else if (p.thrown) p.chatter.react('thrown', 0.85);
    }
    syncInteractive(true);
  });

  // ════════════════════════════════════════════════════════════
  //  메인 루프
  // ════════════════════════════════════════════════════════════
  window.addEventListener('error', (e) => {
    console.error('렌더 오류:', e.message, e.filename + ':' + e.lineno);
  });

  // ── 프레임 속도 — 지금 하는 일에 맞춰 ─────────────────────
  /**
   * 늘 60fps 로 그리면 가만히 있어도 CPU · GPU 를 꽤 쓴다 (2026-10-01 측정: 한 코어의 20%, 대부분 GPU · 렌더러).
   * 스프라이트는 초당 6~14장만 바뀌므로 움직임이 빠를 때만 촘촘히 그린다:
   *   끌기 · 떨어짐 · 달리기 · 벽 타기 · 미끄러짐 40 / 걷기 30 / 서 있기 · 앉기 12 / 모두 잠 6
   *   (2026-10-01 프레임별 CPU 측정 — GPU 끔 기준 한 코어의 8fps 3.6% · 12fps 4.4% · 20~40fps 9~12% 로 비슷하다가
   *    60fps 에서 25%+ 로 뛴다 → 60 은 쓰지 않고 빠른 동작도 40 까지)
   *   파츠 · Spine 캐릭터는 부드러운 동작이라 최소 30
   * 창이 모니터 전체 크기라 한 프레임마다 화면 전체를 다시 합성한다 → 프레임 수가 곧 CPU 다
   * 마우스를 누르거나 움직이면 바로 깨운다 (wake) — 잡을 때 굼뜨지 않게.
   */
  const FAST_STATES = ['drag', 'fall', 'climb', 'run', 'approach', 'rush', 'vanish'];
  const MID_STATES = ['walk', 'nightmare'];
  const FIXED_FPS = Number((/[?&]fps=(\d+)/.exec(location.search) || [])[1]) || 0;   // 측정용 (DESKPET_FPS)
  function wantFps() {
    if (FIXED_FPS) return FIXED_FPS;
    if (drag) return 40;
    let fps = 6;
    let allAsleep = pets.length > 0;
    for (const p of pets) {
      const S = p.S;
      if (FAST_STATES.indexOf(S.state) >= 0) return 40;
      if (S.vy !== 0 || S.y < stage.ground - 0.5) return 40;                        // 공중
      if (Math.abs(S.vx) > 5 && MID_STATES.indexOf(S.state) < 0) return 40;         // 던진 뒤 미끄러짐
      if (MID_STATES.indexOf(S.state) >= 0) fps = Math.max(fps, 30);
      if (p.view && window.SpriteView && !(p.view instanceof window.SpriteView)) fps = Math.max(fps, 30);
      if (S.state !== 'sleep') allAsleep = false;
    }
    return allAsleep ? fps : Math.max(fps, 12);
  }

  let frameTimer = null;
  function scheduleFrame() {
    const fps = wantFps();
    if (fps >= 60) requestAnimationFrame(frame);           // 지금은 40 이 최고라 늘 타이머 — 화면 주사율에 묶이지 않는다
    else frameTimer = setTimeout(() => { frameTimer = null; frame(performance.now()); }, 1000 / fps);
  }
  /** 느린 박자로 쉬는 중이면 바로 한 프레임 — 마우스 · 외부 알림 */
  function wakeFrames() {
    if (!frameTimer) return;
    clearTimeout(frameTimer);
    frameTimer = null;
    requestAnimationFrame(frame);
  }
  window.addEventListener('mousedown', wakeFrames, true);
  window.addEventListener('mousemove', wakeFrames, true);

  let last = performance.now();
  function frame(now) {
    // 애니메이션 시간에도 쓰는 값이라 느린 박자(최대 1/6초)는 그대로 둔다. 너무 긴 멈춤만 자른다
    const dt = Math.min(0.2, (now - last) / 1000);
    last = now;
    try {
      for (const p of pets) p.update(dt);
      hug.tick(dt);
      cursorPlay.tick(dt);
      inbox.place();
      talk.tick(dt);
      dark.tick(dt);
      for (const p of pets) p.render(dt);
      // 커서는 가만히 있고 캐릭터가 그 밑으로 걸어 들어올 수도 있다. mousemove 때만 판정하면
      // 그동안 클릭이 바탕화면으로 새어 나간다 (크게 설정일수록 빨라서 더 잘 생긴다).
      // 값이 바뀔 때만 IPC를 보내므로 매 프레임 불러도 된다.
      if (!drag && cursor.x >= 0) syncInteractive(false);
      closeMenuIfCursorLeft();      // 커서가 멈춰 있으면 좌표가 안 오므로 여기서도 본다
      if (hitboxEl && pets[0] && pets[0].view) {
        const b = pets[0].hitBox();
        hitboxEl.style.transform = `translate3d(${b.x}px,${b.y}px,0)`;
        hitboxEl.style.width = b.w + 'px';
        hitboxEl.style.height = b.h + 'px';
      }
    } catch (err) {
      console.error('프레임 실패:', err && err.stack ? err.stack : err);
    }
    scheduleFrame();
  }

  // ════════════════════════════════════════════════════════════
  //  부팅
  // ════════════════════════════════════════════════════════════
  function applyStage(s) {
    stage = s;
    window.PetNotes.setStage(s);
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
    sizeScale = cfg.sizeScale || 1;
    modeByChar = cfg.modes || {};
    tone = cfg.tone === 'dark' ? 'dark' : 'light';
    cursorPlay.mode = cfg.cursorMode || 'none';

    stage = await window.petAPI.getStage();
    window.PetNotes.init(stage);
    window.PetNotes.setData(await window.petAPI.notesGet());
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
    window.petAPI.onSay((msg) => {                     // 외부 알림은 주인공이 말한다
      if (!pets[0]) return;
      if (msg.source) {                                 // 출처가 있으면 알림 카드 (빌드 · 기한)
        msg.card = { source: msg.source, project: msg.project || '', level: msg.level || 'info', title: msg.text, line: msg.line || '', at: Date.now() };
        msg.ms = msg.ms || 10000;
        inbox.add(msg);
      }
      pets[0].say(msg);
      wakeFrames();
    });
    window.petAPI.onClaude((ev) => { claude.on(ev); wakeFrames(); });
    window.petAPI.onUpdate((u) => {
      updateAvail = u.version;
      if (!pets[0]) return;
      const msg = { text: '새 버전 v' + u.version, mood: 'happy', ms: 15000, quiet: true, update: true,
        card: { source: 'DeskPet', level: 'update', title: '새 버전 v' + u.version + ' — 눌러서 업데이트', line: '지금 v' + u.current, at: Date.now() } };
      inbox.add(msg);
      pets[0].say(msg);
    });
    window.petAPI.onUpdateProgress((pct) => {
      const b = pets[0] && pets[0].bubble;
      const t = b && b.current && b.current.card && b.current.card.level === 'update' && b.el.querySelector('.ac-title');
      if (t) t.textContent = '받는 중… ' + pct + '%';
    });
    window.petAPI.onTodo((st) => { todoState = st; window.PetNotes.setTodo(st); });
    window.petAPI.onRecap((r) => recap.on(r));
    todoState = await window.petAPI.todoGet();
    window.PetNotes.setTodo(todoState);
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
    wakeFrames();
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
    } else if (cmd === 'nightmare' || cmd === 'down' || cmd === 'teleport' || cmd === 'bloodcast') {
      // 원작처럼 연출 바로 보기 (--start=nightmare 등). 분위기를 저장하지 않고 잠시 바꾼다
      tone = 'dark';
      placeOnGround(p);
      if (cmd === 'nightmare') { S.dir = 1; p.setState('nightmare', 8); p.chatter.react('nightmare', 1); }
      else if (cmd === 'down') { p.setState('down', 3); p.chatter.react('down', 1); }
      else if (cmd === 'teleport') dark.vanish(p);
      else p.setState('bloodcast', 1.8);
    } else if (cmd === 'talk') {
      // 둘의 대화 바로 보기 (--start=talk) — 상대가 없으면 첫 대화의 상대를 불러온다
      const d = (p.character.dialogues || [])[0];
      if (!talk.candidates().length && d) await setCompanion(d.with, false);
      for (const q of pets) { q.S.y = stage.ground; q.S.vy = 0; q.setState('idle', 1e6); }
      talk.cooldown = 0;
      talk.tick(0);
    } else if (cmd.indexOf('claude:') === 0) {
      // Claude 반응 바로 보기 (--start=claude:done | fail | permission | waiting)
      placeOnGround(p);
      p.setState('idle', 2);
      claude.on({ kind: cmd.slice(7), project: 'test', sec: 42, busy: 0 });
    } else if (cmd.indexOf('notes:hidden:') === 0) {
      window.PetNotes.setHidden(cmd.slice(13) === '1');
    } else if (cmd === 'inbox') {
      inbox.open();
    } else if (cmd === 'recap') {
      window.petAPI.recapNow();          // 정각 recap 바로 보기 (--start=recap)
    } else if (cmd === 'todo:add') {
      todoState = await window.petAPI.todoAdd();
    } else if (cmd.indexOf('cursor:') === 0) {
      // 커서 놀이 바로 보기 (--start=cursor:chase | flee) — 저장하지 않는다
      cursorPlay.mode = cmd.slice(7);
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
  window.__debug = { hug, talk, dark, claude, recap, cursorPlay, cursor, setCompanion };   // 녹화 · 테스트 스크립트용
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
