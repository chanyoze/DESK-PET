#!/usr/bin/env node
/**
 * 불가사의 던전 스타일 스프라이트(PMDCollab SpriteCollab)로 DeskPet 캐릭터 만들기
 * -------------------------------------------------------------
 *   node tools/pmd-import.js <레시피.json> [--src=로컬 폴더] [--out=폴더]
 *
 *   예) node tools/pmd-import.js tools/recipes/pokemon/herdier.json
 *
 * SpriteCollab 은 포켓몬마다 동작별 시트(Walk-Anim.png …)와 AnimData.xml(칸 크기 · 프레임
 * 시간)을 준다. 레시피에는 "펫 상태 → 어느 동작의 몇 번째 방향 줄"만 적고, 칸 좌표 · 프레임
 * 시간 · 키는 이 도구가 채운다. 결과는 기본으로 %APPDATA%/deskpet/characters/<id>.
 *
 * 방향 줄(row): 0 아래 · 1 오른쪽 아래 · 2 오른쪽 · 3 오른쪽 위 · 4 위 · 5 왼쪽 위 · 6 왼쪽 · 7 왼쪽 아래
 * 프레임 시간은 1/60초 단위 → ms 로 바꿔 frameMs 에 넣는다 (sprite-view.js).
 *
 * 스프라이트 라이선스는 CC BY-NC 4.0 (비상업 · 크레딧 표시). 캐릭터 폴더에 CREDITS.txt 를 같이 둔다.
 * 포켓몬 자체는 닌텐도 · 게임프리크 · 포켓몬 컴퍼니 IP — 개인용으로만 쓰고 배포하지 않는다.
 */
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const RAW = 'https://raw.githubusercontent.com/PMDCollab/SpriteCollab/master';

function die(msg) {
  console.error('[pmd] ' + msg);
  process.exit(1);
}

/** 로컬 폴더가 있으면 거기서, 없으면 GitHub 에서 받는다 */
async function get(src, rel) {
  if (src) {
    const p = path.join(src, rel.split('/').pop());
    if (!fs.existsSync(p)) die('로컬에 없다: ' + p);
    return fs.readFileSync(p);
  }
  const res = await fetch(RAW + '/' + rel);
  if (!res.ok) die('받기 실패 (' + res.status + '): ' + rel);
  return Buffer.from(await res.arrayBuffer());
}

function parseAnimData(xml) {
  const anims = {};
  for (const m of xml.matchAll(/<Anim>([\s\S]*?)<\/Anim>/g)) {
    const body = m[1];
    const tag = (t) => (body.match(new RegExp('<' + t + '>([^<]*)</' + t + '>')) || [])[1];
    const name = tag('Name');
    if (tag('CopyOf')) { anims[name] = { copyOf: tag('CopyOf') }; continue; }
    anims[name] = {
      fw: +tag('FrameWidth'),
      fh: +tag('FrameHeight'),
      ticks: [...body.matchAll(/<Duration>(\d+)<\/Duration>/g)].map((x) => +x[1]),
    };
  }
  return anims;
}

/** 최소 PNG 디코더 (8비트 RGBA · 인터레이스 없음) — 대기 칸의 실제 그림 높이를 재는 데만 쓴다 */
function decodePng(buf) {
  let p = 8, w, h, ct, pal = null, trns = null;
  const idat = [];
  while (p < buf.length) {
    const len = buf.readUInt32BE(p), type = buf.toString('ascii', p + 4, p + 8), d = buf.subarray(p + 8, p + 8 + len);
    if (type === 'IHDR') { w = d.readUInt32BE(0); h = d.readUInt32BE(4); ct = d[9]; if (d[8] !== 8 || d[12]) return null; }
    else if (type === 'PLTE') pal = d;
    else if (type === 'tRNS') trns = d;
    else if (type === 'IDAT') idat.push(d);
    else if (type === 'IEND') break;
    p += 12 + len;
  }
  const bpp = { 6: 4, 2: 3, 3: 1, 0: 1, 4: 2 }[ct];
  if (!bpp) return null;
  const raw = zlib.inflateSync(Buffer.concat(idat)), stride = w * bpp, alpha = new Uint8Array(w * h);
  let prev = Buffer.alloc(stride);
  for (let y = 0; y < h; y++) {
    const f = raw[y * (stride + 1)], line = Buffer.from(raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1)));
    for (let i = 0; i < stride; i++) {
      const a = i >= bpp ? line[i - bpp] : 0, b = prev[i], c = i >= bpp ? prev[i - bpp] : 0;
      let v = line[i];
      if (f === 1) v += a; else if (f === 2) v += b; else if (f === 3) v += (a + b) >> 1;
      else if (f === 4) { const pp = a + b - c, pa = Math.abs(pp - a), pb = Math.abs(pp - b), pc = Math.abs(pp - c); v += pa <= pb && pa <= pc ? a : pb <= pc ? b : c; }
      line[i] = v & 255;
    }
    for (let x = 0; x < w; x++) {
      let al = 255;
      if (ct === 6) al = line[x * 4 + 3];
      else if (ct === 4) al = line[x * 2 + 1];
      else if (ct === 3) al = trns && line[x] < trns.length ? trns[line[x]] : 255;
      alpha[y * w + x] = al;
    }
    prev = line;
  }
  return { w, h, alpha };
}

/** 한 칸의 실제 그림 높이 (알파 40 이상) */
function figureHeight(img, x0, y0, fw, fh) {
  let top = fh, bottom = -1;
  for (let y = 0; y < fh; y++) for (let x = 0; x < fw; x++) {
    if (img.alpha[(y0 + y) * img.w + x0 + x] < 40) continue;
    if (y < top) top = y;
    if (y > bottom) bottom = y;
  }
  return bottom < 0 ? fh : bottom + 1 - top;
}

async function main() {
  const args = process.argv.slice(2);
  const recipePath = args.find((a) => !a.startsWith('--'));
  if (!recipePath) die('사용법: node tools/pmd-import.js <레시피.json> [--src=폴더] [--out=폴더]');
  const opt = (k) => (args.find((a) => a.startsWith('--' + k + '=')) || '').slice(k.length + 3);
  const recipe = JSON.parse(fs.readFileSync(recipePath, 'utf8'));
  const src = opt('src');
  const dex = String(recipe.dex).padStart(4, '0');
  const base = 'sprite/' + dex + (recipe.form ? '/' + recipe.form : '');

  const appData = process.env.APPDATA || path.join(require('os').homedir(), '.config');
  const outDir = opt('out') || path.join(appData, 'deskpet', 'characters', recipe.id);
  fs.mkdirSync(outDir, { recursive: true });

  const anims = parseAnimData((await get(src, base + '/AnimData.xml')).toString('utf8'));
  const resolve = (name) => {
    let n = name;
    for (let i = 0; i < 5 && anims[n] && anims[n].copyOf; i++) n = anims[n].copyOf;
    if (!anims[n]) die('AnimData 에 없는 동작: ' + name);
    return n;
  };

  // 쓰는 동작의 시트만 받는다
  const sheets = {}, images = {};
  for (const c of Object.values(recipe.clips)) {
    const name = resolve(c.anim);
    if (sheets[name]) continue;
    const png = await get(src, base + '/' + name + '-Anim.png');
    fs.writeFileSync(path.join(outDir, name + '.png'), png);
    images[name] = png;
    sheets[name] = { file: name + '.png', frame: [anims[name].fw, anims[name].fh] };
    console.log('[pmd]', name, anims[name].fw + '×' + anims[name].fh, anims[name].ticks.length + '프레임');
  }

  // 레시피의 줄 번호 → 칸 목록 + 프레임 시간
  const clips = {};
  for (const [key, c] of Object.entries(recipe.clips)) {
    const name = resolve(c.anim);
    const a = anims[name];
    const speed = c.speed || 1;
    const rowFrames = (row) => a.ticks.map((_, col) => [col, row]);
    const clip = { sheet: name, frameMs: a.ticks.map((t) => Math.round((t * 1000) / 60 / speed)) };
    if (c.left != null || c.right != null) {
      clip.left = rowFrames(c.left != null ? c.left : c.right);
      clip.right = rowFrames(c.right != null ? c.right : c.left);
    } else {
      clip.frames = rowFrames(c.row || 0);
    }
    for (const k of ['once', 'bob', 'mirror']) if (c[k] != null) clip[k] = c[k];
    clips[key] = clip;
  }

  // 키: 대기 칸의 실제 그림 높이 × scale (도트가 고르게 커지도록 정수 배율 권장)
  const manifest = { ...recipe.manifest, renderer: 'sprite', smoothing: false, sheets, clips };
  if (!manifest.height) {
    const idle = recipe.clips.idle;
    const name = resolve(idle.anim), a = anims[name];
    const img = decodePng(images[name]);
    const row = idle.right != null ? idle.right : idle.row || 0;
    const fig = img ? figureHeight(img, 0, row * a.fh, a.fw, a.fh) : a.fh;
    manifest.height = Math.round(fig * (recipe.scale || 3));
    console.log('[pmd] 대기 그림 높이', fig + 'px × ' + (recipe.scale || 3) + ' → 키', manifest.height);
  }
  fs.writeFileSync(path.join(outDir, 'character.json'), JSON.stringify(manifest, null, 2));

  // 크레딧 (CC BY-NC — 크레딧 표시 조건)
  if (recipe.credits) {
    fs.writeFileSync(path.join(outDir, 'CREDITS.txt'),
      recipe.credits.join('\n') + '\n\nSource: ' + RAW.replace('raw.githubusercontent.com', 'github.com').replace('/master', '/tree/master') + '/' + base +
      '\nLicense: CC BY-NC 4.0 (non-commercial, attribution)\n');
  }
  console.log('[pmd] 완료:', manifest.name, '→', outDir);
}

main().catch((e) => die(e.stack || e.message));
