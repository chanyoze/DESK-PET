/**
 * Spine 렌더러 (WebGL)
 * -------------------------------------------------------------
 * spine-ts 3.8 런타임으로 .skel/.atlas/.png 를 그린다.
 *
 * 왜 WebGL인가: spine-ts의 Canvas 백엔드는 메시 어태치먼트를 지원하지 않는다.
 * 게임에서 뽑은 스켈레톤은 옷자락·머리카락에 메시를 쓰므로 Canvas로는 깨진다.
 *
 * 왜 3.8인가: Spine은 런타임과 에디터의 메이저.마이너 버전이 일치해야 한다.
 * 대상 스켈레톤이 3.8.99라서 3.8 브랜치 런타임이 필요하다 (4.x는 로드 실패).
 *
 * 에셋은 IPC로 받은 base64/텍스트를 직접 쓴다. file:// XHR이 막혀 있어
 * spine의 AssetManager를 쓸 수 없기 때문이다.
 */
(function () {
  'use strict';

  function base64ToBytes(b64) {
    const bin = atob(b64);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  }

  function loadImage(dataUrl) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error('텍스처 로드 실패'));
      img.src = dataUrl;
    });
  }

  class SpineView {
    constructor() {
      this.el = null;
      this.ready = false;
      this.animations = [];
      this._current = null;
    }

    async init(character) {
      if (typeof spine === 'undefined') {
        throw new Error('spine-ts 런타임이 없다. npm run fetch-spine 을 먼저 실행할 것');
      }

      const canvas = document.createElement('canvas');
      canvas.id = 'pet';
      this.el = canvas;
      document.body.appendChild(canvas);

      // 투명 창 위에 그리므로 alpha 필수. 프리멀티플라이는 스파인 쪽에서 맞춘다.
      // Unity가 구운 아틀라스는 대개 프리멀티플라이드 알파다. 아니면 외곽에 검은 테가 생긴다.
      this.pma = character.premultipliedAlpha !== false;
      const opts = {
        alpha: true,
        premultipliedAlpha: this.pma,
        antialias: true,
        preserveDrawingBuffer: false,
      };
      // WebGL2를 먼저 시도한다. 아틀라스가 624×624(2의 거듭제곱이 아님)라서
      // WebGL1에서는 밉맵을 만들 수 없다. 밉맵이 없으면 축소할 때 심하게 깨진다.
      const gl = canvas.getContext('webgl2', opts) || canvas.getContext('webgl', opts);
      if (!gl) throw new Error('WebGL 컨텍스트를 만들 수 없다');
      this.gl = gl;
      this.isGL2 = typeof WebGL2RenderingContext !== 'undefined' && gl instanceof WebGL2RenderingContext;

      // 텍스처 준비 — 축소 품질을 위해 밉맵을 생성한다.
      //
      // 게임에서 뽑은 아틀라스는 스트레이트 알파다(투명한 곳에도 흰색이 남아 있다).
      // 그대로 밉맵을 만들면 그 흰색이 이웃과 평균되어 캐릭터 외곽으로 번진다.
      // 업로드 시점에 알파를 미리 곱해 두면 밉맵도 블렌딩도 전부 맞아떨어진다.
      // (tools/check-pma.js 로 어느 쪽인지 확인할 수 있다)
      const useMipMaps = this.isGL2;
      const premultiplyOnUpload = character.premultipliedSource !== true;
      if (premultiplyOnUpload) gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);
      const textures = {};
      for (const [name, dataUrl] of Object.entries(character.files.textures || {})) {
        const img = await loadImage(dataUrl);
        textures[name] = new spine.webgl.GLTexture(gl, img, useMipMaps);
      }
      if (premultiplyOnUpload) gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
      const firstTexture = Object.values(textures)[0];

      // 아틀라스 — 텍스처를 이름으로 찾아 준다
      const atlas = new spine.TextureAtlas(character.files.atlas, (p) => textures[p] || firstTexture);

      // 아틀라스 파일의 'filter: Linear,Linear'가 위 설정을 덮어쓰므로 여기서 되돌린다.
      // 축소(minification)에는 삼중선형 + 이방성 필터가 필요하다.
      const aniso =
        gl.getExtension('EXT_texture_filter_anisotropic') ||
        gl.getExtension('WEBKIT_EXT_texture_filter_anisotropic');
      for (const tex of Object.values(textures)) {
        if (useMipMaps) {
          tex.setFilters(spine.TextureFilter.MipMapLinearLinear, spine.TextureFilter.Linear);
        }
        if (aniso) {
          tex.bind();
          const max = gl.getParameter(aniso.MAX_TEXTURE_MAX_ANISOTROPY_EXT);
          gl.texParameterf(gl.TEXTURE_2D, aniso.TEXTURE_MAX_ANISOTROPY_EXT, Math.min(8, max));
        }
      }
      console.log(
        '[spine] ' + (this.isGL2 ? 'WebGL2' : 'WebGL1') +
        ' / 밉맵 ' + (useMipMaps ? 'O' : 'X') +
        ' / 이방성 ' + (aniso ? 'O' : 'X')
      );

      const atlasLoader = new spine.AtlasAttachmentLoader(atlas);

      // 스켈레톤은 바이너리(.skel)와 JSON 두 형식이 섞여 있다. 첫 글자로 판별한다.
      const bytes = base64ToBytes(character.files.skeleton);
      const isJson = bytes[0] === 0x7b; // '{'
      let skeletonData;
      if (isJson) {
        const json = new spine.SkeletonJson(atlasLoader);
        json.scale = 1;
        skeletonData = json.readSkeletonData(new TextDecoder('utf-8').decode(bytes));
      } else {
        const binary = new spine.SkeletonBinary(atlasLoader);
        binary.scale = 1;
        skeletonData = binary.readSkeletonData(bytes);
      }
      console.log('[spine] 형식:', isJson ? 'JSON' : '바이너리');

      this.skeleton = new spine.Skeleton(skeletonData);
      this.skeletonData = skeletonData;

      // JSON 스켈레톤은 width/height가 없을 수 있다. 셋업 포즈에서 직접 잰다.
      if (!(skeletonData.width > 0) || !(skeletonData.height > 0)) {
        this.skeleton.setToSetupPose();
        this.skeleton.updateWorldTransform();
        const off = new spine.Vector2();
        const size = new spine.Vector2();
        this.skeleton.getBounds(off, size, []);
        skeletonData.x = off.x;
        skeletonData.y = off.y;
        skeletonData.width = size.x;
        skeletonData.height = size.y;
        console.log(
          '[spine] 바운즈를 셋업 포즈에서 계산: ' +
          Math.round(size.x) + '×' + Math.round(size.y)
        );
      }
      const stateData = new spine.AnimationStateData(skeletonData);
      stateData.defaultMix = 0.18;   // 동작 전환을 부드럽게 (파츠 리그엔 없던 것)
      this.state = new spine.AnimationState(stateData);

      this.animations = skeletonData.animations.map((a) => a.name);
      console.log('[spine] 스켈레톤 로드됨:', character.name);
      console.log('[spine] 크기:', Math.round(skeletonData.width) + '×' + Math.round(skeletonData.height));
      console.log('[spine] 애니메이션:', this.animations.join(', '));

      // 렌더링 파이프라인
      this.shader = spine.webgl.Shader.newTwoColoredTextured(gl);
      this.batcher = new spine.webgl.PolygonBatcher(gl);
      this.mvp = new spine.webgl.Matrix4();
      this.renderer = new spine.webgl.SkeletonRenderer(gl);
      this.renderer.premultipliedAlpha = this.pma;

      // 캐릭터가 화면에서 차지할 크기 → 스케일 계산
      const targetH = character.height || 150;
      this.scale = targetH / (skeletonData.height || targetH);

      // 셋업 포즈 바운즈는 (x, y)가 좌하단이고 원점(발밑)이 그 안 어디든 올 수 있다.
      // 원점을 캔버스 어디에 놓을지 바운즈에서 직접 계산한다.
      const d = skeletonData;
      const pad = 14;
      this.cssW = Math.ceil(d.width * this.scale + pad * 2);
      this.cssH = Math.ceil(d.height * this.scale + pad * 2);
      this.originX = -d.x * this.scale + pad;
      this.originY = (d.y + d.height) * this.scale + pad;
      console.log(
        '[spine] 바운즈 x=' + Math.round(d.x) + ' y=' + Math.round(d.y) +
        ' → 캔버스 ' + this.cssW + '×' + this.cssH +
        ' 원점(' + Math.round(this.originX) + ',' + Math.round(this.originY) + ')'
      );

      this.ssaa = character.supersample || 2;   // 표시 크기의 몇 배로 그릴지
      this.resize();
      this.ready = true;
      return this;
    }

    dispose() {
      // WebGL 컨텍스트는 브라우저당 개수 제한이 있다. 교체 시 반드시 반납한다.
      try {
        const lose = this.gl && this.gl.getExtension("WEBGL_lose_context");
        if (lose) lose.loseContext();
      } catch (e) { /* 무시 */ }
      if (this.el && this.el.parentNode) this.el.parentNode.removeChild(this.el);
      this.el = null;
    }

    resize() {
      // 슈퍼샘플링: 표시 크기보다 크게 그린 뒤 브라우저가 줄이게 한다.
      // 텍스처 축소 배율이 완만해져서 디테일이 훨씬 살아난다.
      const dpr = (window.devicePixelRatio || 1) * this.ssaa;
      this.dpr = dpr;
      this.el.width = Math.round(this.cssW * dpr);
      this.el.height = Math.round(this.cssH * dpr);
      this.el.style.width = this.cssW + 'px';
      this.el.style.height = this.cssH + 'px';
    }

    /** 우리 상태 이름 → 스켈레톤의 실제 애니메이션 이름 */
    resolve(name) {
      if (!name) return null;
      if (this.animations.indexOf(name) >= 0) return name;
      // 대소문자 무시 + 접미사(WS 등) 허용
      const lower = name.toLowerCase();
      return (
        this.animations.find((a) => a.toLowerCase() === lower) ||
        this.animations.find((a) => a.toLowerCase().startsWith(lower)) ||
        null
      );
    }

    /** 이 스켈레톤이 해당 동작을 실제로 가지고 있나 */
    has(name) {
      return !!this.resolve(name);
    }

    play(animName, loop) {
      const resolved = this.resolve(animName);
      if (!resolved || resolved === this._current) return;
      this._current = resolved;
      this.state.setAnimation(0, resolved, loop !== false);
    }

    /** @param facing 1=오른쪽 -1=왼쪽 */
    draw(dt, facing) {
      const gl = this.gl;
      this.state.update(dt);
      this.state.apply(this.skeleton);

      this.skeleton.x = 0;
      this.skeleton.y = 0;
      this.skeleton.scaleX = this.scale * (facing < 0 ? -1 : 1);
      this.skeleton.scaleY = this.scale;
      this.skeleton.updateWorldTransform();

      gl.viewport(0, 0, this.el.width, this.el.height);
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.enable(gl.BLEND);

      // 원점이 캔버스 안 발바닥 위치에 오도록 직교 투영을 옮긴다
      this.mvp.ortho2d(-this.originX, -(this.cssH - this.originY), this.cssW, this.cssH);

      this.shader.bind();
      this.shader.setUniformi(spine.webgl.Shader.SAMPLER, 0);
      this.shader.setUniform4x4f(spine.webgl.Shader.MVP_MATRIX, this.mvp.values);
      this.batcher.begin(this.shader);
      this.renderer.draw(this.batcher, this.skeleton);
      this.batcher.end();
      this.shader.unbind();
    }
  }

  window.SpineView = SpineView;
})();
