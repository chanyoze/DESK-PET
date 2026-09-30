/**
 * 스프라이트 시트 렌더러 (Canvas 2D)
 * -------------------------------------------------------------
 * RPG Maker 같은 2D 게임의 캐릭터 시트를 칸 단위로 잘라 넘긴다.
 * 뼈대가 없으니 동작은 "어느 시트의 몇 번째 칸을 어떤 순서로"가 전부다.
 *
 * 매니페스트:
 *   sheets: { 이름: { file, frame: [칸너비, 칸높이] } }
 *   clips:  { 이름: { sheet, fps, frames: [[열,행], ...] } }
 *           좌우가 다른 그림이면 frames 대신 left / right 를 준다 (뒤집지 않는다).
 *           frames 만 있으면 정면 그림으로 보고 방향과 무관하게 그린다.
 *           bob: 1 이면 가만히 있는 동작에 숨쉬기를 얹는다 (한 장짜리 대기용).
 *           once: true 면 한 번만 재생하고 마지막 칸에서 멈춘다 (변신 같은 연출).
 *           mirror: true 면 frames(정면) 클립도 왼쪽을 볼 때 좌우를 뒤집는다 (껴안기처럼
 *           두 사람이 한 칸에 있는 그림을 둘의 위치에 맞출 때).
 *
 * 발 위치는 칸마다 알파를 훑어서 찾는다. 게임마다 칸 안의 여백이 제각각이라
 * 사람이 맞추면 동작이 바뀔 때마다 캐릭터가 위아래로 튄다.
 *
 * 칸은 불러올 때 하나씩 자기 캔버스로 잘라 두고 거기서 그린다. 게임 시트는 칸이 빽빽해서
 *  - 시트에서 바로 축소해 그리면 이웃 칸(특히 위 칸의 발 · 그림자)이 번져 들어와 머리 위에 선이 생기고
 *  - 위 칸 그림자가 아예 칸 맨 윗줄로 1~3px 넘어와 있기도 하다 → 잘라 둘 때 지운다 (trimTopStray)
 */
(function () {
  'use strict';

  const ALPHA_MIN = 40;          // 이보다 옅은 픽셀은 그림자·번짐으로 보고 무시

  function loadImage(src) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error('시트 로드 실패'));
      img.src = src;
    });
  }

  const STRAY_ROWS = 8;          // 칸 맨 위에서 이만큼 안에 있는 떨어진 점만 지운다

  /**
   * 칸 맨 위에 붙은 "떨어진 점"을 지운다 — 위 칸 그림(발 · 그림자)이 넘어온 것.
   * 맨 윗줄에 픽셀이 있고, 그 아래 STRAY_ROWS 줄 안에 완전히 빈 줄이 있으면 그 위를 비운다.
   * 머리카락처럼 그림에서 끊기지 않고 이어진 픽셀은 빈 줄이 없어서 건드리지 않는다.
   * @returns 지운 줄 수
   */
  function trimTopStray(pixels, w, h) {
    const rowEmpty = (y) => {
      for (let x = 0; x < w; x++) if (pixels[(y * w + x) * 4 + 3] > 0) return false;
      return true;
    };
    if (rowEmpty(0)) return 0;
    for (let y = 1; y < Math.min(STRAY_ROWS, h); y++) {
      if (!rowEmpty(y)) continue;
      pixels.fill(0, 0, y * w * 4);
      return y;
    }
    return 0;
  }

  /** 칸 안에서 실제로 그려진 영역 (알파 기준) */
  function opaqueBox(pixels, sheetW, x0, y0, w, h) {
    let top = h, bottom = -1, left = w, right = -1;
    for (let y = 0; y < h; y++) {
      const row = ((y0 + y) * sheetW + x0) * 4;
      for (let x = 0; x < w; x++) {
        if (pixels[row + x * 4 + 3] < ALPHA_MIN) continue;
        if (y < top) top = y;
        if (y > bottom) bottom = y;
        if (x < left) left = x;
        if (x > right) right = x;
      }
    }
    return bottom < 0 ? null : { top, bottom, left, right };
  }

  class SpriteView {
    constructor() {
      this.el = null;
      this.ready = false;
      this.animations = [];
      this._current = null;
      this._t = 0;
    }

    async init(character) {
      const sheetsDef = character.sheets || {};
      const clipsDef = character.clips || {};
      const textures = character.files.sheets || {};

      // 시트를 읽어 둔다 (칸은 쓰는 것만 아래에서 잘라 낸다)
      this.sheets = {};
      for (const [name, def] of Object.entries(sheetsDef)) {
        const img = await loadImage(textures[name]);
        this.sheets[name] = { img, fw: def.frame[0], fh: def.frame[1] };
      }
      this.frames = {};             // "시트|열|행" → { canvas, pixels }
      let trimmed = 0;
      const frameOf = (sheetName, sh, col, row) => {
        const key = sheetName + '|' + col + '|' + row;
        if (this.frames[key]) return this.frames[key];
        const c = document.createElement('canvas');
        c.width = sh.fw;
        c.height = sh.fh;
        const cx = c.getContext('2d', { willReadFrequently: true });
        cx.drawImage(sh.img, col * sh.fw, row * sh.fh, sh.fw, sh.fh, 0, 0, sh.fw, sh.fh);   // 1:1 이라 번지지 않는다
        const data = cx.getImageData(0, 0, sh.fw, sh.fh);
        if (trimTopStray(data.data, sh.fw, sh.fh)) {
          cx.putImageData(data, 0, 0);
          trimmed++;
        }
        return (this.frames[key] = { canvas: c, pixels: data.data });
      };

      // 동작마다 발 기준선(가장 아래 불투명 줄)을 잡는다.
      // 동작 안에서는 한 값으로 고정해야 프레임끼리 떨리지 않는다.
      this.clips = {};
      for (const [name, def] of Object.entries(clipsDef)) {
        const sh = this.sheets[def.sheet];
        if (!sh) {
          console.warn('[sprite] 없는 시트:', def.sheet, '(' + name + ')');
          continue;
        }
        const lists = def.frames ? { front: def.frames } : { left: def.left, right: def.right };
        let bottom = 0, top = sh.fh;
        for (const list of Object.values(lists)) {
          for (const [col, row] of list || []) {
            const b = opaqueBox(frameOf(def.sheet, sh, col, row).pixels, sh.fw, 0, 0, sh.fw, sh.fh);
            if (!b) continue;
            bottom = Math.max(bottom, b.bottom);
            top = Math.min(top, b.top);
          }
        }
        this.clips[name] = {
          sheet: sh,
          sheetName: def.sheet,
          fps: def.fps || 6,
          bob: def.bob || 0,
          once: !!def.once,
          mirror: !!def.mirror,
          lists,
          baseline: bottom + 1,
          figureH: bottom + 1 - top,
        };
      }
      this.animations = Object.keys(this.clips);
      if (!this.clips.idle) throw new Error('sprite 캐릭터에는 idle 클립이 꼭 있어야 한다');

      // 키는 대기 자세의 실제 그림 높이 기준 — Spine·파츠와 같은 뜻이 되게
      const targetH = character.height || 150;
      this.scale = targetH / this.clips.idle.figureH;

      // 캔버스는 가장 큰 칸이 들어가게 잡는다. 칸을 가로 가운데·발 기준으로 맞춰 그리므로
      // 위로는 가장 큰 기준선만큼, 아래로는 기준선 아래 여백만큼 필요하다.
      let maxW = 0, above = 0, below = 0;
      for (const c of Object.values(this.clips)) {
        maxW = Math.max(maxW, c.sheet.fw);
        above = Math.max(above, c.baseline);
        below = Math.max(below, c.sheet.fh - c.baseline);
      }
      const pad = 8;                          // 그림자 · 숨쉬기 여유
      this.cssW = Math.ceil(maxW * this.scale + pad * 2);
      this.cssH = Math.ceil((above + below) * this.scale * 1.04 + pad * 2);
      this.originX = this.cssW / 2;
      this.originY = Math.ceil(above * this.scale * 1.04 + pad);
      this.smooth = character.smoothing !== false;

      const canvas = document.createElement('canvas');
      canvas.id = 'pet';
      this.el = canvas;
      this.ctx = canvas.getContext('2d');
      document.body.appendChild(canvas);

      this.resize();
      this.ready = true;
      console.log('[sprite] 로드됨:', character.name, '배율', this.scale.toFixed(2), '칸', Object.keys(this.frames).length +
        ' (위쪽 떨어진 점 지움 ' + trimmed + ')', '동작:', this.animations.join(', '));
      return this;
    }

    dispose() {
      if (this.el && this.el.parentNode) this.el.parentNode.removeChild(this.el);
      this.el = null;
      this.sheets = null;
      this.frames = null;
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
      if (!name) return null;
      if (this.clips[name]) return name;
      const lower = name.toLowerCase();
      return this.animations.find((a) => a.toLowerCase() === lower) || null;
    }

    has(name) {
      return !!this.resolve(name);
    }

    play(animName) {
      const resolved = this.resolve(animName) || 'idle';
      if (resolved === this._current) return;
      this._current = resolved;
      this._t = 0;
    }

    /** @param facing 1=오른쪽 -1=왼쪽 */
    draw(dt, facing, opts) {
      this._t += dt;
      const clip = this.clips[this._current || 'idle'];
      const list = clip.lists.front || (facing < 0 ? clip.lists.left : clip.lists.right) ||
        clip.lists.left || clip.lists.right;
      const step = Math.floor(this._t * clip.fps);
      const [col, row] = list[clip.once ? Math.min(step, list.length - 1) : step % list.length];
      const sh = clip.sheet;

      const ctx = this.ctx;
      const s = this.scale;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, this.el.width, this.el.height);
      ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
      ctx.translate(this.originX, this.originY);

      // 발밑 그림자 (공중에 뜰수록 작고 옅게)
      const air = Math.max(0, Math.min(1, (opts && opts.airHeight ? opts.airHeight : 0) / 260));
      const k = 1 - air * 0.7;
      ctx.save();
      ctx.globalAlpha = 0.22 * k;
      ctx.fillStyle = '#0b0b0b';
      ctx.beginPath();
      ctx.ellipse(0, 0, sh.fw * 0.28 * s * k, 4 * s * k, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();

      // 숨쉬기 — 발은 붙인 채 세로로만 살짝
      const breathe = clip.bob ? 1 + Math.sin(this._t * 2.4) * 0.012 * clip.bob : 1;

      ctx.imageSmoothingEnabled = this.smooth;
      ctx.imageSmoothingQuality = 'high';
      ctx.scale(clip.mirror && facing < 0 ? -s : s, s * breathe);
      // 잘라 둔 칸에서 그린다 — 시트에서 바로 그리면 축소할 때 이웃 칸이 번져 들어온다
      const frame = this.frames[clip.sheetName + '|' + col + '|' + row];
      ctx.drawImage(frame.canvas, 0, 0, sh.fw, sh.fh, -sh.fw / 2, -clip.baseline, sh.fw, sh.fh);
    }
  }

  window.SpriteView = SpriteView;
})();
