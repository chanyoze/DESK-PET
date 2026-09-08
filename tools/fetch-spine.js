/**
 * spine-ts 3.8 WebGL 런타임을 내려받는다.
 *
 * 저장소에 포함하지 않는 이유: Spine 런타임은 재배포에 라이선스가 필요하다.
 * 코드는 공개하고 런타임은 각자 받는 방식(에뮬레이터가 ROM을 안 넣는 것과 같다).
 *
 *   npm run fetch-spine
 *
 * 3.8 브랜치인 이유: Spine은 런타임과 에디터의 메이저.마이너가 일치해야 한다.
 * 명일방주 스켈레톤이 3.8.99라서 4.x 런타임으로는 로드되지 않는다.
 */
const fs = require('fs');
const path = require('path');
const https = require('https');

const URL = 'https://raw.githubusercontent.com/EsotericSoftware/spine-runtimes/3.8/spine-ts/build/spine-webgl.js';
const OUT_DIR = path.join(__dirname, '..', 'vendor', 'spine');
const OUT = path.join(OUT_DIR, 'spine-webgl.js');

function get(url, redirects = 5) {
  return new Promise((resolve, reject) => {
    https.get(url, { headers: { 'user-agent': 'deskpet' } }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        if (!redirects) return reject(new Error('리다이렉트가 너무 많다'));
        res.resume();
        return resolve(get(res.headers.location, redirects - 1));
      }
      if (res.statusCode !== 200) {
        res.resume();
        return reject(new Error('HTTP ' + res.statusCode));
      }
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => resolve(Buffer.concat(chunks)));
    }).on('error', reject);
  });
}

(async () => {
  if (fs.existsSync(OUT)) {
    console.log('이미 있음:', OUT);
    return;
  }
  console.log('내려받는 중:', URL);
  const body = await get(URL);
  fs.mkdirSync(OUT_DIR, { recursive: true });
  fs.writeFileSync(OUT, body);
  console.log('저장됨:', OUT, '(' + Math.round(body.length / 1024) + ' KB)');
  console.log('\nSpine 런타임은 Esoteric Software의 라이선스를 따른다.');
  console.log('배포하려면 Spine 라이선스가 필요하다: https://esotericsoftware.com/spine-runtimes-license');
})().catch((e) => {
  console.error('실패:', e.message);
  process.exit(1);
});
