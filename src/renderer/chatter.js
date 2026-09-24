/**
 * 혼잣말 — 가만히 두면 가끔 말을 건다.
 * -------------------------------------------------------------
 * 캐릭터마다 대사를 따로 줄 수도 있다 (매니페스트의 lines).
 * 없으면 여기 기본 대사를 쓴다.
 *
 * 상태와 시간대를 보고 어울리는 것만 고른다. 걷는 중에 "졸려"라고 하면
 * 어색하니까.
 */
(function () {
  'use strict';

  const LINES = {
    idle: [
      '음...',
      '뭐 하고 있어?',
      '심심한데',
      '오늘 할 일은 다 했어?',
      '나 여기 있는 거 알지',
      '잠깐 쉬어가도 괜찮아',
      '커피 한 잔 어때',
      '어깨 좀 펴봐',
      '눈 좀 깜빡여',
      '물 마셨어?',
    ],
    walk: [
      '산책 중',
      '뚜벅뚜벅',
      '여기 끝까지 가볼까',
      '운동 부족인가',
      '어디 가지',
    ],
    sit: [
      '아 편하다',
      '조금만 쉴게',
      '여기 자리 좋네',
      '다리 아파',
    ],
    sleep: [
      'zzz...',
      '조금만 더...',
      '깨우지 마',
    ],
    morning: [
      '좋은 아침!',
      '오늘도 힘내자',
      '아침 먹었어?',
    ],
    afternoon: [
      '점심은 먹었어?',
      '오후엔 좀 나른하지',
      '조금 나른한 시간대네',
    ],
    evening: [
      '오늘 고생했어',
      '슬슬 마무리할까',
      '저녁 뭐 먹지',
    ],
    night: [
      '아직 안 자?',
      '너무 늦었어, 이제 자자',
      '내일도 있잖아',
      '눈 아프지 않아?',
    ],
    longRun: [
      '나 계속 여기 있었어',
      '오래 켜뒀네',
      '아직도 작업 중이야?',
    ],
    // ── 반응 (react) ──
    picked: ['어어?', '잠깐, 어디 가?', '내려줘!'],
    thrown: ['으아악', '너무해!', '날아간다~'],
    landed: ['아야...', '휴, 살았다', '다음엔 살살 해줘'],
    petted: ['헤헤', '기분 좋다', '더 해줘'],
    woken: ['으음... 왜?', '방금 좋은 꿈 꿨는데', '졸려...'],
    run: ['후다닥', '늦겠다!', '헉헉'],
    together: ['같이 있으니까 좋다', '심심하진 않네'],
  };

  function timeBucket(d) {
    const h = d.getHours();
    if (h >= 5 && h < 11) return 'morning';
    if (h >= 11 && h < 17) return 'afternoon';
    if (h >= 17 && h < 23) return 'evening';
    return 'night';
  }

  /** 상태 → 대사 묶음 이름 */
  const BY_STATE = {
    idle: 'idle', idle2: 'idle', walk: 'walk', run: 'run', approach: 'run',
    sit: 'sit', sleep: 'sleep', pet: 'idle', special: 'idle',
  };

  class Chatter {
    /**
     * @param opts.say  말풍선을 띄우는 함수
     * @param opts.getState 지금 상태를 돌려주는 함수
     * @param opts.enabled 켜짐 여부를 돌려주는 함수
     * @param opts.getMode 무장 모드 ('' = 맨손)
     * @param opts.hasPartner 같이 다니는 상대가 있는지
     */
    constructor(opts) {
      this.say = opts.say;
      this.getState = opts.getState;
      this.enabled = opts.enabled || (() => true);
      this.getMode = opts.getMode || (() => '');
      this.hasPartner = opts.hasPartner || (() => false);
      this.getTone = opts.getTone || (() => 'light');
      this.darkLines = null;      // 원작처럼 분위기용 대사 (있으면)
      this.lines = null;          // 캐릭터별 대사 (있으면)
      this.startedAt = Date.now();
      this.lastAt = Date.now();
      this.reactAt = 0;           // 반응 대사 마지막 시각
      this.timeGreeted = null;    // 시간대별 인사는 하루 한 번씩
      this.timer = null;
      this.bags = {};             // 묶음별로 섞어 둔 순서 — 한 바퀴 돌기 전엔 같은 말을 안 한다
      this.lastLine = '';
    }

    setCharacter(character) {
      this.lines = (character && character.lines) || null;
      this.darkLines = (character && character.linesDark) || null;
      this.bags = {};
    }

    pool(key) {
      const custom = this.lines && this.lines[key];
      const base = LINES[key] || [];
      return custom && custom.length ? custom : base;
    }

    /**
     * 묶음에서 하나 꺼낸다. 섞은 순서대로 꺼내고 다 쓰면 다시 섞는다.
     * 다시 섞을 때 방금 한 말이 맨 앞에 오지 않게 한다.
     */
    draw(key) {
      // 원작처럼이면 어두운 대사를 절반쯤 섞는다 (평소 대사가 없는 묶음은 어두운 쪽만)
      const dark = this.getTone() === 'dark' && this.darkLines && this.darkLines[key];
      const base = this.pool(key);
      const useDark = !!(dark && dark.length) && (!base.length || Math.random() < 0.5);
      const pool = useDark ? dark : base;
      if (!pool.length) return null;
      const bagKey = (useDark ? 'dark:' : '') + key;
      let bag = this.bags[bagKey];
      if (!bag || !bag.length || bag.src !== pool) {
        bag = pool.slice();
        for (let i = bag.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          [bag[i], bag[j]] = [bag[j], bag[i]];
        }
        if (bag.length > 1 && bag[bag.length - 1] === this.lastLine) bag.unshift(bag.pop());
        bag.src = pool;
        this.bags[bagKey] = bag;
      }
      const line = bag.pop();
      this.lastLine = line;
      return line;
    }

    /** 이 묶음에 쓸 대사가 있는지 (지금 분위기 기준) */
    has(key) {
      if (this.pool(key).length) return true;
      const dark = this.getTone() === 'dark' && this.darkLines && this.darkLines[key];
      return !!(dark && dark.length);
    }

    /** 지금 상황에 맞는 묶음 이름 */
    contextKey() {
      const state = this.getState();
      const mode = this.getMode();
      // 무기를 들고 있으면 절반은 무기 얘기
      if (mode && this.has('armed:' + mode) && Math.random() < 0.5) return 'armed:' + mode;
      // 같이 있으면 가끔 상대 얘기 (잘 때는 빼고)
      if (state !== 'sleep' && this.hasPartner() && this.has('together') && Math.random() < 0.3) return 'together';
      return BY_STATE[state] || 'idle';
    }

    start() {
      const tick = () => {
        this.timer = setTimeout(tick, 20000 + Math.random() * 40000);  // 20~60초마다 판단
        if (!this.enabled()) return;

        const state = this.getState();
        if (['drag', 'fall', 'climb', 'hug', 'hugged', 'down', 'recover', 'nightmare', 'bloodcast', 'vanish'].indexOf(state) >= 0) return;

        const now = new Date();
        const bucket = timeBucket(now);

        // 시간대가 바뀌면 인사부터 (하루 한 번). 자는 중이면 깨고 나서
        const key = bucket + '@' + now.toDateString();
        if (this.timeGreeted !== key && state !== 'sleep') {
          this.timeGreeted = key;
          return this.speak(bucket);
        }

        // 너무 자주 떠들지 않게 최소 간격
        if (Date.now() - this.lastAt < 90000) return;
        if (Math.random() > 0.45) return;

        // 오래 켜뒀으면 가끔 그 얘기
        const hours = (Date.now() - this.startedAt) / 3600000;
        if (hours > 3 && Math.random() < 0.25) return this.speak('longRun');

        this.speak(this.contextKey());
      };
      this.timer = setTimeout(tick, 25000);
    }

    speak(key, mood) {
      const line = this.draw(key);
      if (!line) return false;
      this.lastAt = Date.now();
      this.say({ text: line, mood: mood || 'normal', quiet: true });
      return true;
    }

    /**
     * 사건에 대한 반응 (집어 들기·던지기·쓰다듬기 등).
     * 혼잣말 간격과 별개로. 집어 들기→던지기→착지처럼 이어지는 반응은 말풍선이
     * 순서대로 줄을 서므로, 연타만 막을 만큼(1.2초)만 간격을 둔다.
     */
    react(key, chance) {
      if (!this.enabled()) return false;
      if (Math.random() > (chance == null ? 1 : chance)) return false;
      if (Date.now() - this.reactAt < 1200) return false;
      const line = this.draw(key);
      if (!line) return false;
      this.reactAt = Date.now();
      this.lastAt = Date.now();
      this.say({ text: line, mood: 'normal', quiet: true, ms: Math.min(4000, 1600 + line.length * 80) });
      return true;
    }

    stop() {
      clearTimeout(this.timer);
      this.timer = null;
    }

    /** 사용자가 직접 부른 경우 (메뉴의 '말 시키기') */
    prod() {
      this.speak(this.contextKey());
    }
  }

  window.Chatter = Chatter;
})();
