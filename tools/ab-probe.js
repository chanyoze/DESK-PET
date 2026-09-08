/**
 * Unity AssetBundle(UnityFS) 읽기 전용 검사기 — 의존성 없음
 * -------------------------------------------------------------
 * 번들 안에 어떤 파일이 들어있는지, 어떤 에셋 이름이 보이는지만 확인한다.
 * 추출/변환은 하지 않는다. 어떤 형식인지 파악하는 용도.
 *
 *   node tools/ab-probe.js <파일.ab> [--strings] [--dump <경로>]
 *
 * UnityFS 포맷은 공개 문서화되어 있고, 블록 압축은 LZ4/LZMA를 쓴다.
 * 여기서는 LZ4(가장 흔한 경우)만 직접 푼다.
 */
const fs = require('fs');
const path = require('path');

// ── LZ4 블록 디코더 (포맷이 단순해서 의존성 없이 구현 가능) ──
function lz4Decode(src, destSize) {
  const dst = Buffer.alloc(destSize);
  let ip = 0, op = 0;

  // 중요: 잘못된 입력을 조용히 넘기면 '쓰레기 출력'이 성공처럼 보인다.
  // 반드시 검증하고, 이상하면 예외를 던진다.
  while (ip < src.length) {
    const token = src[ip++];

    // 리터럴
    let litLen = token >> 4;
    if (litLen === 15) {
      let b;
      do { b = src[ip++]; litLen += b; } while (b === 255 && ip < src.length);
    }
    if (ip + litLen > src.length) throw new Error('LZ4: 리터럴이 입력을 넘어감');
    if (op + litLen > destSize) throw new Error('LZ4: 리터럴이 출력을 넘어감');
    src.copy(dst, op, ip, ip + litLen);
    ip += litLen;
    op += litLen;

    // 마지막 시퀀스는 리터럴만 있고 매치가 없다
    if (ip >= src.length) break;

    // 매치 (앞서 쓴 출력에서 복사)
    const offset = src[ip] | (src[ip + 1] << 8);
    ip += 2;
    if (offset === 0 || offset > op) throw new Error(`LZ4: 잘못된 오프셋 ${offset} (op=${op})`);
    let matchLen = token & 15;
    if (matchLen === 15) {
      let b;
      do { b = src[ip++]; matchLen += b; } while (b === 255 && ip < src.length);
    }
    matchLen += 4;
    if (op + matchLen > destSize) throw new Error('LZ4: 매치가 출력을 넘어감');

    let mp = op - offset;
    for (let i = 0; i < matchLen; i++) dst[op++] = dst[mp++];  // 겹침 복사 허용
  }
  if (op !== destSize) throw new Error(`LZ4: 크기 불일치 ${op} != ${destSize}`);
  return dst;
}

// ── 바이트 리더 ─────────────────────────────────────────────
class Reader {
  constructor(buf) { this.b = buf; this.p = 0; }
  u8() { return this.b[this.p++]; }
  u16be() { const v = this.b.readUInt16BE(this.p); this.p += 2; return v; }
  u32be() { const v = this.b.readUInt32BE(this.p); this.p += 4; return v; }
  u32le() { const v = this.b.readUInt32LE(this.p); this.p += 4; return v; }
  i64be() { const v = this.b.readBigInt64BE(this.p); this.p += 8; return Number(v); }
  cstr() {
    const s = this.p;
    while (this.b[this.p] !== 0) this.p++;
    const v = this.b.toString('utf8', s, this.p);
    this.p++;
    return v;
  }
  align(n) { const r = this.p % n; if (r) this.p += n - r; }
  bytes(n) { const v = this.b.subarray(this.p, this.p + n); this.p += n; return v; }
}

const COMPRESSION = { 0: 'none', 1: 'LZMA', 2: 'LZ4', 3: 'LZ4HC', 4: 'LZHAM' };

function probe(file) {
  const buf = fs.readFileSync(file);
  const r = new Reader(buf);

  const sig = r.cstr();
  if (sig !== 'UnityFS') {
    return { error: `UnityFS 아님 (signature="${sig}") — 커스텀 암호화일 수 있음` };
  }

  const version = r.u32be();
  const unityVersion = r.cstr();
  const unityRevision = r.cstr();
  const size = r.i64be();
  const compBlocksInfoSize = r.u32be();
  const uncompBlocksInfoSize = r.u32be();
  const flags = r.u32be();

  const compType = flags & 0x3f;
  const blocksInfoAtEnd = (flags & 0x80) !== 0;

  if (version >= 7) r.align(16);

  const infoPos = blocksInfoAtEnd ? buf.length - compBlocksInfoSize : r.p;
  const rawInfo = buf.subarray(infoPos, infoPos + compBlocksInfoSize);

  let info;
  if (compType === 0) info = rawInfo;
  else if (compType === 2 || compType === 3) info = lz4Decode(rawInfo, uncompBlocksInfoSize);
  else return { error: `blocksInfo 압축이 ${COMPRESSION[compType] || compType} — 이 도구는 LZ4만 지원` };

  // blocksInfo 파싱
  const ir = new Reader(info);
  ir.bytes(16);                       // uncompressedDataHash
  const blockCount = ir.u32be();
  const blocks = [];
  for (let i = 0; i < blockCount; i++) {
    blocks.push({ uncomp: ir.u32be(), comp: ir.u32be(), flags: ir.u16be() });
  }
  const nodeCount = ir.u32be();
  const nodes = [];
  for (let i = 0; i < nodeCount; i++) {
    nodes.push({ offset: ir.i64be(), size: ir.i64be(), flags: ir.u32be(), path: ir.cstr() });
  }

  // 데이터 시작 위치. flags & 0x200 이면 blocksInfo 뒤에도 16바이트 정렬이 붙는다.
  let dataStart = blocksInfoAtEnd ? r.p : infoPos + compBlocksInfoSize;
  if (flags & 0x200) dataStart = Math.ceil(dataStart / 16) * 16;

  return {
    version, unityVersion, unityRevision, size,
    blocksInfoCompression: COMPRESSION[compType] || compType,
    blockCount, nodeCount, blocks, nodes, dataStart, buf,
  };
}

/** 데이터 블록을 풀어서 하나의 버퍼로 (LZ4 블록만) */
function inflate(meta) {
  const parts = [];
  let p = meta.dataStart;
  for (const b of meta.blocks) {
    const raw = meta.buf.subarray(p, p + b.comp);
    const c = b.flags & 0x3f;
    if (c === 0) parts.push(raw);
    else if (c === 2 || c === 3) parts.push(lz4Decode(raw, b.uncomp));
    else throw new Error(`데이터 블록 압축 ${COMPRESSION[c] || c}(${c}) — 이 도구는 LZ4만 지원`);
    p += b.comp;
  }
  return Buffer.concat(parts);
}

/** 사람이 읽을 수 있는 문자열만 뽑아낸다 */
function strings(buf, min = 5) {
  const out = [];
  let cur = '';
  for (let i = 0; i < buf.length; i++) {
    const c = buf[i];
    if (c >= 0x20 && c < 0x7f) cur += String.fromCharCode(c);
    else { if (cur.length >= min) out.push(cur); cur = ''; }
  }
  if (cur.length >= min) out.push(cur);
  return out;
}

module.exports = { probe, inflate, strings, lz4Decode };

// ── CLI ─────────────────────────────────────────────────────
if (require.main !== module) return;
const args = process.argv.slice(2);
const file = args[0];
if (!file) {
  console.log('사용법: node tools/ab-probe.js <파일.ab> [--strings] [--dump <경로>]');
  process.exit(1);
}

const meta = probe(file);
if (meta.error) {
  console.log('❌', meta.error);
  process.exit(2);
}

console.log('파일        :', path.basename(file));
console.log('Unity       :', meta.unityRevision, '(포맷 v' + meta.version + ')');
console.log('blocksInfo  :', meta.blocksInfoCompression);
console.log('블록 수     :', meta.blockCount, '/ 내부 파일 수:', meta.nodeCount);
console.log('내부 파일   :');
for (const n of meta.nodes) {
  console.log('  -', n.path, '(' + (n.size / 1024).toFixed(1) + ' KB)');
}
console.log('블록 상세   :');
for (const b of meta.blocks) {
  console.log(
    '   flags=0x' + b.flags.toString(16).padStart(4, '0'),
    'comp=' + b.comp, 'uncomp=' + b.uncomp,
    '압축=' + (COMPRESSION[b.flags & 0x3f] || (b.flags & 0x3f))
  );
}

if (args.includes('--strings') || args.includes('--dump')) {
  let data;
  try {
    data = inflate(meta);
  } catch (e) {
    console.log('❌ 데이터 블록:', e.message);
    process.exit(3);
  }
  console.log('데이터 크기 :', (data.length / 1024).toFixed(1), 'KB');

  const di = args.indexOf('--dump');
  if (di >= 0 && args[di + 1]) {
    fs.writeFileSync(args[di + 1], data);
    console.log('저장됨      :', args[di + 1]);
  }

  if (args.includes('--strings')) {
    const ss = strings(data);
    console.log('문자열      :', ss.length, '개');
    // 스파인/텍스처 관련 힌트를 먼저 보여준다
    const hint = ss.filter((s) => /skel|atlas|spine|\.png|Texture|TextAsset|MonoBehaviour|_Anim|idle|Move|Sit/i.test(s));
    console.log('--- 관련 문자열 ---');
    for (const s of hint.slice(0, 40)) console.log('  ', s);
    console.log('--- 전체 앞부분 ---');
    for (const s of ss.slice(0, 30)) console.log('  ', s);
  }
}
