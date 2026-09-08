/**
 * PNG가 프리멀티플라이드 알파인지 판별한다 (의존성 없음).
 *
 *   node tools/check-pma.js [캐릭터폴더...]
 *
 * 왜 필요한가:
 * 프리멀티플라이드 텍스처는 모든 픽셀이 R,G,B ≤ A 를 만족한다. 투명한 부분의
 * 색이 0에 가깝다는 뜻이다. 반대로 스트레이트 알파 텍스처는 투명한 곳에도
 * 원래 색(보통 흰색)이 그대로 남아 있다.
 *
 * 이게 중요한 이유는 밉맵 때문이다. 스트레이트 알파 텍스처로 밉맵을 만들면
 * 투명한 흰색이 이웃 픽셀과 평균되면서 불투명한 부분으로 번진다 — 캐릭터
 * 외곽에 하얀 테가 생기는 원인이다. 업로드할 때 미리 곱해두면 해결된다.
 */
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

function paeth(a, b, c) {
  const p = a + b - c;
  const pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
  return pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
}

/** RGBA8 PNG를 디코드해서 픽셀 버퍼를 돌려준다 */
function decodePng(buf) {
  if (buf.readUInt32BE(0) !== 0x89504e47) throw new Error('PNG 아님');
  let p = 8;
  let width = 0, height = 0, depth = 0, color = 0;
  const idat = [];

  while (p < buf.length) {
    const len = buf.readUInt32BE(p);
    const type = buf.toString('ascii', p + 4, p + 8);
    const data = buf.subarray(p + 8, p + 8 + len);
    if (type === 'IHDR') {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      depth = data[8];
      color = data[9];
    } else if (type === 'IDAT') {
      idat.push(data);
    } else if (type === 'IEND') break;
    p += 12 + len;
  }

  if (depth !== 8 || color !== 6) {
    throw new Error(`RGBA8이 아님 (depth=${depth} colorType=${color})`);
  }

  const raw = zlib.inflateSync(Buffer.concat(idat));
  const bpp = 4;
  const stride = width * bpp;
  const out = Buffer.alloc(height * stride);

  let rp = 0;
  for (let y = 0; y < height; y++) {
    const filter = raw[rp++];
    const line = raw.subarray(rp, rp + stride);
    rp += stride;
    const cur = out.subarray(y * stride, (y + 1) * stride);
    const prev = y > 0 ? out.subarray((y - 1) * stride, y * stride) : null;

    for (let x = 0; x < stride; x++) {
      const a = x >= bpp ? cur[x - bpp] : 0;
      const b = prev ? prev[x] : 0;
      const c = prev && x >= bpp ? prev[x - bpp] : 0;
      let v = line[x];
      if (filter === 1) v += a;
      else if (filter === 2) v += b;
      else if (filter === 3) v += (a + b) >> 1;
      else if (filter === 4) v += paeth(a, b, c);
      cur[x] = v & 0xff;
    }
  }
  return { width, height, data: out };
}

/** 프리멀티플라이드 여부 판정 */
function analyze(file) {
  const img = decodePng(fs.readFileSync(file));
  const d = img.data;
  let violations = 0;      // R,G,B 가 A 보다 뚜렷하게 큰 픽셀
  let semi = 0;            // 반투명 픽셀 수
  let worst = 0;

  for (let i = 0; i < d.length; i += 4) {
    const a = d[i + 3];
    if (a === 255) continue;
    semi++;
    const m = Math.max(d[i], d[i + 1], d[i + 2]);
    if (m > a + 8) {
      violations++;
      if (m - a > worst) worst = m - a;
    }
  }

  const ratio = semi ? violations / semi : 0;
  return {
    size: img.width + '×' + img.height,
    semi, violations, worst,
    ratio,
    premultiplied: ratio < 0.02,
  };
}

const dirs = process.argv.slice(2);
const targets = dirs.length
  ? dirs
  : fs.readdirSync(path.join(__dirname, '..', 'characters'))
      .map((d) => path.join(__dirname, '..', 'characters', d));

for (const dir of targets) {
  let png;
  try {
    png = fs.readdirSync(dir).find((f) => f.endsWith('.png'));
  } catch { continue; }
  if (!png) continue;
  try {
    const r = analyze(path.join(dir, png));
    console.log(
      (r.premultiplied ? '  프리멀티플라이드 ' : '❗스트레이트 알파   ') +
      path.basename(dir).padEnd(16) +
      r.size.padEnd(10) +
      '위반 ' + r.violations + '/' + r.semi +
      ' (' + (r.ratio * 100).toFixed(1) + '%, 최대차 ' + r.worst + ')'
    );
  } catch (e) {
    console.log('  ?                ' + path.basename(dir).padEnd(16) + e.message);
  }
}
