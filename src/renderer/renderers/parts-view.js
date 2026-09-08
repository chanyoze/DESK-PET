/**
 * 파츠 렌더러 (Canvas 2D)
 * -------------------------------------------------------------
 * character.js 의 파츠 리그를 SpineView 와 같은 인터페이스로 감싼다.
 * 덕분에 pet.js 는 어떤 렌더러가 붙었는지 몰라도 된다.
 */
(function () {
  'use strict';

  class PartsView {
    constructor() {
      this.el = null;
      this.ready = false;
      this.animations = window.Character.STATES.slice();
      this._current = 'idle';
      this._t = 0;
    }

    async init(character) {
      const M = window.Character.METRICS;
      const targetH = character.height || 141;
      this.scale = targetH / M.height;

      const unitW = M.width + M.padSide * 2;
      const unitH = M.height + M.padTop + M.padBottom;
      this.cssW = unitW * this.scale;
      this.cssH = unitH * this.scale;
      this.originX = this.cssW / 2;
      this.originY = (M.padTop + M.height) * this.scale;

      const canvas = document.createElement('canvas');
      canvas.id = 'pet';
      this.el = canvas;
      this.ctx = canvas.getContext('2d');
      document.body.appendChild(canvas);

      this.resize();
      this.ready = true;
      console.log('[parts] 리그 로드됨:', character.name, '동작:', this.animations.join(', '));
      return this;
    }

    dispose() {
      if (this.el && this.el.parentNode) this.el.parentNode.removeChild(this.el);
      this.el = null;
    }

    resize() {
      const dpr = window.devicePixelRatio || 1;
      this.dpr = dpr;
      this.el.width = Math.round(this.cssW * dpr);
      this.el.height = Math.round(this.cssH * dpr);
      this.el.style.width = this.cssW + 'px';
      this.el.style.height = this.cssH + 'px';
    }

    resolve(name) {
      return this.animations.indexOf(name) >= 0 ? name : null;
    }

    play(animName) {
      const resolved = this.resolve(animName) || 'idle';
      if (resolved === this._current) return;
      this._current = resolved;
      this._t = 0;
    }

    draw(dt, facing, opts) {
      this._t += dt;
      const ctx = this.ctx;
      const s = this.scale;

      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, this.el.width, this.el.height);
      ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
      ctx.translate(this.originX, this.originY);
      ctx.scale(s, s);

      // 발밑 그림자 (공중에 뜰수록 작고 옅게)
      const air = Math.max(0, Math.min(1, (opts && opts.airHeight ? opts.airHeight : 0) / 260));
      const k = 1 - air * 0.7;
      ctx.save();
      ctx.globalAlpha = 0.2 * k;
      ctx.fillStyle = '#0b1226';
      ctx.beginPath();
      ctx.ellipse(0, 1.5, 15 * k, 3.8 * k, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();

      window.Character.draw(ctx, this._current, this._t, facing);
    }
  }

  window.PartsView = PartsView;
})();
