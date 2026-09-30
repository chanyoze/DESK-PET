/**
 * 캐릭터 UI — 말풍선과 좌클릭 메뉴
 * -------------------------------------------------------------
 * 투명 창이라 평소에는 클릭이 통과한다. 이 요소들이 떠 있는 동안에는
 * 그 영역도 마우스를 받아야 하므로, pet.js 의 히트 테스트가 참고할 수 있게
 * 화면상의 사각형(rects)을 노출한다.
 */
(function () {
  'use strict';

  // ── 말풍선 ──────────────────────────────────────────────────
  class Bubble {
    constructor() {
      this.el = document.createElement('div');
      this.el.className = 'bubble';
      this.el.hidden = true;
      document.body.appendChild(this.el);
      this.queue = [];
      this.timer = null;
      this.until = 0;
    }

    /** @param msg {text, mood, ms} */
    say(msg) {
      this.queue.push(msg);
      if (!this.timer) this.next();
    }

    next() {
      const msg = this.queue.shift();
      if (!msg) {
        this.el.hidden = true;
        this.timer = null;
        this.current = null;
        return;
      }
      this.current = msg;
      if (msg.card) this.renderCard(msg.card);
      else {
        this.el.className = 'bubble';
        this.el.textContent = msg.text;
      }
      this.el.dataset.mood = msg.mood || 'normal';
      this.el.dataset.link = msg.sid ? '1' : '';     // Claude 세션 말풍선 — 누르면 그 터미널로
      this.el.hidden = false;

      // 글이 길수록 오래 띄운다 (읽을 시간)
      const ms = msg.ms || Math.min(12000, 2200 + msg.text.length * 90);
      this.until = performance.now() + ms;
      this.timer = setTimeout(() => this.next(), ms);
    }

    /**
     * 알림 카드 — 대화 말풍선과 구분되는 모양.
     * card = { source, project, level: done|permission|waiting|fail|due|build|info, title, line, at }
     * 윗줄 "Claude · 프로젝트 · 15:42", 가운데 사실(작업 끝남 · 허락 필요 …), 아래 작은 글씨로 캐릭터 한마디.
     */
    renderCard(card) {
      this.el.className = 'bubble alert-card';
      this.el.dataset.level = card.level || 'info';
      this.el.textContent = '';
      const d = new Date(card.at || Date.now());
      const hm = String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
      const add = (cls, text) => {
        if (!text) return;
        const e = document.createElement('div');
        e.className = cls;
        e.textContent = text;
        this.el.appendChild(e);
      };
      add('ac-head', [card.source, card.project, hm].filter(Boolean).join(' · '));
      add('ac-title', card.title);
      add('ac-line', card.line);
    }

    dismiss() {
      clearTimeout(this.timer);
      this.timer = null;
      this.queue.length = 0;
      this.el.hidden = true;
      this.current = null;
    }

    /** 캐릭터 머리 위에 붙인다. 화면 밖으로 나가지 않게 가둔다. */
    place(x, headY, stage) {
      if (this.el.hidden) return;
      const w = this.el.offsetWidth;
      const h = this.el.offsetHeight;
      let left = x - w / 2;
      left = Math.max(stage.workLeft + 6, Math.min(stage.workRight - w - 6, left));
      let top = headY - h - 14;
      if (top < stage.workTop + 6) top = headY + 18;   // 위가 좁으면 아래로
      this.el.style.transform = 'translate3d(' + left.toFixed(0) + 'px,' + top.toFixed(0) + 'px,0)';
      this._rect = { x: left, y: top, w, h };
    }

    get rect() {
      return this.el.hidden ? null : this._rect;
    }
  }

  // ── 좌클릭 메뉴 ─────────────────────────────────────────────
  class PetMenu {
    constructor() {
      this.el = document.createElement('div');
      this.el.className = 'menu';
      this.el.hidden = true;
      document.body.appendChild(this.el);
      this.open = false;
      this.onAction = () => {};
      this.onClose = () => {};

      // 메뉴 밖을 누르면 닫힌다
      window.addEventListener('mousedown', (e) => {
        if (this.open && !this.el.contains(e.target)) this.close();
      }, true);
    }

    /**
     * sections: [{title, fold, items:[{label, value, checked, danger}]}]
     * fold 가 있으면 접는 섹션 — 제목을 누르면 펼치고 접는다. 접혀 있을 땐 제목 옆에 지금 값(체크된 항목)을 보여 준다.
     * 펼침 상태는 fold 키로 기억한다 (메뉴를 다시 열어도 유지).
     */
    build(sections) {
      this.el.innerHTML = '';
      for (const sec of sections) {
        let box = this.el;
        if (sec.fold) {
          const open = !!PetMenu.unfolded[sec.fold];
          const cur = sec.items.filter((it) => it.checked).map((it) => it.label).join(', ');
          const h = document.createElement('button');
          h.className = 'menu-title menu-fold' + (open ? ' open' : '');
          h.textContent = (open ? '▾ ' : '▸ ') + sec.title + (!open && cur ? ' · ' + cur : '');
          box = document.createElement('div');
          box.hidden = !open;
          h.addEventListener('click', (e) => {
            e.stopPropagation();
            const now = box.hidden;
            PetMenu.unfolded[sec.fold] = now;
            box.hidden = !now;
            h.classList.toggle('open', now);
            h.textContent = (now ? '▾ ' : '▸ ') + sec.title + (!now && cur ? ' · ' + cur : '');
            this.reposition();
          });
          this.el.appendChild(h);
          this.el.appendChild(box);
        } else if (sec.title) {
          const h = document.createElement('div');
          h.className = 'menu-title';
          h.textContent = sec.title;
          this.el.appendChild(h);
        }
        for (const it of sec.items) {
          const b = document.createElement('button');
          b.className = 'menu-item' + (it.checked ? ' checked' : '') + (it.danger ? ' danger' : '');
          b.textContent = it.label;
          b.addEventListener('click', (e) => {
            e.stopPropagation();
            this.close();
            this.onAction(it.value);
          });
          box.appendChild(b);
        }
        const hr = document.createElement('div');
        hr.className = 'menu-sep';
        this.el.appendChild(hr);
      }
      const last = this.el.lastChild;
      if (last && last.className === 'menu-sep') this.el.removeChild(last);
    }

    show(x, y, stage) {
      this._at = { x, y, stage };
      this.el.hidden = false;
      this.open = true;
      this.reposition();
    }

    /** 캐릭터 위에 띄운다. 위에 자리가 없으면 아래로, 아래도 모자라면 화면 안에 가둔다 (길면 스크롤) */
    reposition() {
      if (!this._at) return;
      const { x, y, stage } = this._at;
      const w = this.el.offsetWidth;
      const h = this.el.offsetHeight;
      let left = Math.max(stage.workLeft + 6, Math.min(stage.workRight - w - 6, x - w / 2));
      let top = y - h - 10;
      if (top < stage.workTop + 6) top = y + 16;
      if (top + h > stage.ground - 6) top = Math.max(stage.workTop + 6, stage.ground - 6 - h);
      this.el.style.transform = 'translate3d(' + left.toFixed(0) + 'px,' + top.toFixed(0) + 'px,0)';
      this._rect = { x: left, y: top, w, h };
    }

    close() {
      const was = this.open;
      this.el.hidden = true;
      this.open = false;
      this._rect = null;
      if (was) this.onClose();
    }

    get rect() {
      return this.open ? this._rect : null;
    }
  }

  /** 펼쳐 둔 접는 섹션 (fold 키 → true). 메뉴를 다시 열어도 유지된다 */
  PetMenu.unfolded = {};

  window.PetUI = { Bubble, PetMenu };
})();
