/**
 * 트레이 아이콘 PNG 생성기 (의존성 없음, 순수 Node)
 * 나중에 진짜 캐릭터 아트가 생기면 이 스크립트 대신 실제 PNG를 넣으면 된다.
 *   node tools/gen-icon.js
 */
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const SIZE = parseInt(process.argv[2] || "32", 10);

const TABLE = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c;
  }
  return t;
})();

function crc32(buf) {
  let c = -1;
  for (let i = 0; i < buf.length; i++) c = TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

/** 원 커버리지(안티에일리어싱용) 0..1 */
function disc(x, y, cx, cy, r) {
  const d = Math.hypot(x + 0.5 - cx, y + 0.5 - cy);
  return Math.max(0, Math.min(1, r + 0.5 - d));
}

function build() {
  const raw = Buffer.alloc(SIZE * (SIZE * 4 + 1));
  let p = 0;
  for (let y = 0; y < SIZE; y++) {
    raw[p++] = 0; // filter: none
    for (let x = 0; x < SIZE; x++) {
      const bodyA = disc(x, y, 16, 17, 12.5);
      const eyeL = disc(x, y, 11.5, 15, 2.4);
      const eyeR = disc(x, y, 20.5, 15, 2.4);
      const eye = Math.max(eyeL, eyeR);

      // 몸통색 위에 눈을 합성
      let r = 0x6c, g = 0x8c, b = 0xff;
      if (eye > 0) {
        r = Math.round(r * (1 - eye) + 0x1a * eye);
        g = Math.round(g * (1 - eye) + 0x20 * eye);
        b = Math.round(b * (1 - eye) + 0x33 * eye);
      }
      raw[p++] = r;
      raw[p++] = g;
      raw[p++] = b;
      raw[p++] = Math.round(bodyA * 255);
    }
  }

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(SIZE, 0);
  ihdr.writeUInt32BE(SIZE, 4);
  ihdr[8] = 8;  // bit depth
  ihdr[9] = 6;  // color type: RGBA
  ihdr[10] = 0; // compression
  ihdr[11] = 0; // filter
  ihdr[12] = 0; // interlace

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

const out = path.join(__dirname, '..', 'assets', process.argv[3] || 'tray.png');
fs.writeFileSync(out, build());
console.log('생성됨:', out);
