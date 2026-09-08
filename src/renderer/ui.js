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
      this.el.textContent = msg.text;
      this.el.dataset.mood = msg.mood || 'normal';
      this.el.hidden = false;

      // 글이 길수록 오래 띄운다 (읽을 시간)
      const ms = msg.ms || Math.min(12000, 2200 + msg.text.length * 90);
      this.until = performance.now() + ms;
      this.timer = setTimeout(() => this.next(), ms);
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

      // 메뉴 밖을 누르면 닫힌다
      window.addEventListener('mousedown', (e) => {
        if (this.open && !this.el.contains(e.target)) this.close();
      }, true);
    }

    /** sections: [{title, items:[{label, value, checked, danger}]}] */
    build(sections) {
      this.el.innerHTML = '';
      for (const sec of sections) {
        if (sec.title) {
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
          this.el.appendChild(b);
        }
        const hr = document.createElement('div');
        hr.className = 'menu-sep';
        this.el.appendChild(hr);
      }
      const last = this.el.lastChild;
      if (last && last.className === 'menu-sep') this.el.removeChild(last);
    }

    show(x, y, stage) {
      this.el.hidden = false;
      this.open = true;
      const w = this.el.offsetWidth;
      const h = this.el.offsetHeight;
      let left = Math.max(stage.workLeft + 6, Math.min(stage.workRight - w - 6, x - w / 2));
      let top = y - h - 10;
      if (top < stage.workTop + 6) top = y + 16;
      this.el.style.transform = 'translate3d(' + left.toFixed(0) + 'px,' + top.toFixed(0) + 'px,0)';
      this._rect = { x: left, y: top, w, h };
    }

    close() {
      this.el.hidden = true;
      this.open = false;
      this._rect = null;
    }

    get rect() {
      return this.open ? this._rect : null;
    }
  }

  window.PetUI = { Bubble, PetMenu };
})();
