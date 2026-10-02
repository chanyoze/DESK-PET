/**
 * 캐릭터 꾸러미(.deskpet) — 캐릭터 폴더 하나를 파일 하나로 묶고 푼다
 * -------------------------------------------------------------
 * 지인에게 만든 캐릭터를 건네는 용도. electron 을 부르지 않는다 (node 로 시험 가능).
 *
 * 형식: gzip( JSON { format: 'deskpet-character', version: 1, id, name, from, createdAt, files: { 상대경로: base64 } } )
 *
 * 받은 파일은 남이 만든 것이라 믿지 않는다 —
 *  - 그림 · 설정 파일만 (확장자 목록), 실행할 수 있는 건 없다
 *  - 경로는 폴더 안쪽만 (절대 경로 · .. 금지), 파일 수 · 크기 상한
 *  - character.json 은 sprite · spine 렌더러만 (parts 는 앱 코드에 묶여 있어 받을 일이 없다)
 */
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const FORMAT = 'deskpet-character';
const ALLOWED = /\.(json|png|jpe?g|webp|skel|atlas|txt)$/i;
const MAX_FILES = 300;
const MAX_TOTAL = 120 * 1024 * 1024;          // 풀었을 때 120MB

/** 폴더 안의 파일 목록 (하위 폴더까지, 상대 경로는 / 로) */
function walk(dir, base = dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, base, out);
    else if (ALLOWED.test(e.name)) out.push(path.relative(base, p).split(path.sep).join('/'));
  }
  return out;
}

/** 캐릭터 폴더 → .deskpet 내용(Buffer) */
function pack(dir, opts = {}) {
  const manifest = JSON.parse(fs.readFileSync(path.join(dir, 'character.json'), 'utf8'));
  const files = {};
  let total = 0;
  for (const rel of walk(dir)) {
    const buf = fs.readFileSync(path.join(dir, rel));
    total += buf.length;
    if (total > MAX_TOTAL) throw new Error('캐릭터가 너무 커요 (120MB 넘음)');
    files[rel] = buf.toString('base64');
  }
  if (Object.keys(files).length > MAX_FILES) throw new Error('파일이 너무 많아요');
  const doc = {
    format: FORMAT, version: 1,
    id: opts.id || path.basename(dir),
    name: manifest.name || path.basename(dir),
    from: (opts.from || '').trim().slice(0, 40) || null,
    createdAt: new Date().toISOString(),
    files,
  };
  return zlib.gzipSync(Buffer.from(JSON.stringify(doc), 'utf8'), { level: 9 });
}

const safeRel = (rel) => typeof rel === 'string' && rel.length < 200 && !rel.includes('\\') && !rel.startsWith('/') &&
  !/^[a-zA-Z]:/.test(rel) && rel.split('/').every((s) => s && s !== '.' && s !== '..') && ALLOWED.test(rel);

/**
 * .deskpet 내용 → { id, name, from, manifest, files: { 상대경로: Buffer } } — 검사만, 쓰지는 않는다
 * @throws 형식이 아니거나 위험한 내용이면
 */
function unpack(buf) {
  let doc;
  try {
    doc = JSON.parse(zlib.gunzipSync(buf, { maxOutputLength: MAX_TOTAL * 1.5 }).toString('utf8'));
  } catch {
    throw new Error('DeskPet 캐릭터 파일(.deskpet)이 아니에요');
  }
  if (!doc || doc.format !== FORMAT) throw new Error('DeskPet 캐릭터 파일(.deskpet)이 아니에요');
  if (doc.version > 1) throw new Error('더 새 버전 앱에서 만든 파일이에요 — 앱을 업데이트해 주세요');
  const entries = Object.entries(doc.files || {});
  if (!entries.length || entries.length > MAX_FILES) throw new Error('파일 구성이 이상해요');
  const files = {};
  let total = 0;
  for (const [rel, b64] of entries) {
    if (!safeRel(rel) || typeof b64 !== 'string') throw new Error('허용하지 않는 파일이 들어 있어요: ' + String(rel).slice(0, 60));
    files[rel] = Buffer.from(b64, 'base64');
    total += files[rel].length;
  }
  if (total > MAX_TOTAL) throw new Error('캐릭터가 너무 커요');
  if (!files['character.json']) throw new Error('character.json 이 없어요');
  let manifest;
  try { manifest = JSON.parse(files['character.json'].toString('utf8')); } catch { throw new Error('character.json 을 읽을 수 없어요'); }
  if (!['sprite', 'spine'].includes(manifest.renderer)) throw new Error('이 앱에서 쓸 수 없는 캐릭터 종류예요');
  // 매니페스트가 가리키는 그림이 꾸러미 안에 있는지
  const need = manifest.renderer === 'sprite'
    ? Object.values(manifest.sheets || {}).map((s) => s && s.file)
    : [manifest.skeleton, manifest.atlas];
  for (const f of need) if (!f || !files[f]) throw new Error('그림 파일이 빠져 있어요: ' + (f || '(이름 없음)'));
  const id = String(doc.id || '').toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'shared-' + Date.now().toString(36);
  return { id, name: String(manifest.name || doc.name || id).slice(0, 40), from: doc.from ? String(doc.from).slice(0, 40) : null, manifest, files };
}

/** 풀어 둔 꾸러미를 캐릭터 폴더로 쓴다 (.part 에 쓰고 옮긴다) */
function install(pkg, dir) {
  const tmp = dir + '.part';
  fs.rmSync(tmp, { recursive: true, force: true });
  for (const [rel, buf] of Object.entries(pkg.files)) {
    const p = path.join(tmp, ...rel.split('/'));
    if (!p.startsWith(tmp + path.sep)) throw new Error('경로가 이상해요');
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.writeFileSync(p, buf);
  }
  // 받은 표시 — 목록에 "○○ 님에게 받음"
  const m = { ...pkg.manifest, sharedBy: pkg.from || true };
  delete m.hidden;
  fs.writeFileSync(path.join(tmp, 'character.json'), JSON.stringify(m, null, 2));
  fs.rmSync(dir, { recursive: true, force: true });
  fs.renameSync(tmp, dir);
}

module.exports = { pack, unpack, install, FORMAT };
