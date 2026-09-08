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
  };

  function timeBucket(d) {
    const h = d.getHours();
    if (h >= 5 && h < 11) return 'morning';
    if (h >= 11 && h < 17) return 'afternoon';
    if (h >= 17 && h < 23) return 'evening';
    return 'night';
  }

  const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

  class Chatter {
    /**
     * @param opts.say  말풍선을 띄우는 함수
     * @param opts.getState 지금 상태를 돌려주는 함수
     * @param opts.enabled 켜짐 여부를 돌려주는 함수
     */
    constructor(opts) {
      this.say = opts.say;
      this.getState = opts.getState;
      this.enabled = opts.enabled || (() => true);
      this.lines = null;          // 캐릭터별 대사 (있으면)
      this.startedAt = Date.now();
      this.lastAt = Date.now();
      this.timeGreeted = null;    // 시간대별 인사는 하루 한 번씩
      this.timer = null;
    }

    setCharacter(character) {
      this.lines = (character && character.lines) || null;
    }

    pool(key) {
      const custom = this.lines && this.lines[key];
      const base = LINES[key] || [];
      return custom && custom.length ? custom : base;
    }

    start() {
      const tick = () => {
        this.timer = setTimeout(tick, 20000 + Math.random() * 40000);  // 20~60초마다 판단
        if (!this.enabled()) return;

        const state = this.getState();
        if (state === 'drag' || state === 'fall' || state === 'climb') return;

        const now = new Date();
        const bucket = timeBucket(now);

        // 시간대가 바뀌면 인사부터 (하루 한 번)
        const key = bucket + '@' + now.toDateString();
        if (this.timeGreeted !== key) {
          this.timeGreeted = key;
          this.lastAt = Date.now();
          return this.say({ text: pick(this.pool(bucket)), mood: 'normal' });
        }

        // 너무 자주 떠들지 않게 최소 간격
        if (Date.now() - this.lastAt < 90000) return;
        if (Math.random() > 0.45) return;

        // 오래 켜뒀으면 가끔 그 얘기
        const hours = (Date.now() - this.startedAt) / 3600000;
        if (hours > 3 && Math.random() < 0.25) {
          this.lastAt = Date.now();
          return this.say({ text: pick(this.pool('longRun')), mood: 'normal' });
        }

        const byState = { idle: 'idle', idle2: 'idle', walk: 'walk', sit: 'sit', sleep: 'sleep' };
        const pool = this.pool(byState[state] || 'idle');
        if (!pool.length) return;
        this.lastAt = Date.now();
        this.say({ text: pick(pool), mood: 'normal' });
      };
      this.timer = setTimeout(tick, 25000);
    }

    stop() {
      clearTimeout(this.timer);
      this.timer = null;
    }

    /** 사용자가 직접 부른 경우 (메뉴의 '말 시키기') */
    prod() {
      const state = this.getState();
      const byState = { idle: 'idle', idle2: 'idle', walk: 'walk', sit: 'sit', sleep: 'sleep' };
      this.lastAt = Date.now();
      this.say({ text: pick(this.pool(byState[state] || 'idle')), mood: 'normal' });
    }
  }

  window.Chatter = Chatter;
})();
