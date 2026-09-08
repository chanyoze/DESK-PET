/**
 * 에셋번들 일괄 스캔 — 어느 번들 계열에 Spine 데이터가 들어있는지 찾는다.
 * 읽기 전용. 추출하지 않고 "무엇이 어디 있는지"만 조사한다.
 *
 *   node tools/ak-scan.js <게임 Data 폴더> [샘플개수]
 */
const fs = require('fs');
const path = require('path');
const { probe, inflate } = require('./ab-probe.js');

const ROOT = process.argv[2];
const SAMPLE = parseInt(process.argv[3] || '4', 10);
if (!ROOT) {
  console.log('사용법: node tools/ak-scan.js <게임 Data 폴더> [샘플개수]');
  process.exit(1);
}

// 찾을 흔적들
const MARKERS = [
  'skel', 'atlas', 'Spine', 'SkeletonData', 'AnimationState',
  'Idle', 'Move', 'Sit', 'Interact', 'Relax', 'Sleep', 'Die', 'Attack',
  '.png', 'Texture2D', 'TextAsset',
];

function walkDirs(dir, depth, acc) {
  if (depth < 0) return acc;
  let ents;
  try { ents = fs.readdirSync(dir, { withFileTypes: true }); } catch { return acc; }
  const abs = ents.filter((e) => e.isFile() && e.name.endsWith('.ab'));
  if (abs.length) acc.push({ dir, files: abs.map((e) => path.join(dir, e.name)) });
  for (const e of ents) if (e.isDirectory()) walkDirs(path.join(dir, e.name), depth - 1, acc);
  return acc;
}

/** 버퍼 안에서 마커가 몇 번 나오는지 (대소문자 구분) */
function count(buf, needle) {
  const n = Buffer.from(needle, 'latin1');
  let c = 0, i = 0;
  while ((i = buf.indexOf(n, i)) !== -1) { c++; i += n.length; }
  return c;
}

const groups = walkDirs(ROOT, 5, []);
console.log(`.ab 를 가진 폴더 ${groups.length}개 발견\n`);

const results = [];
for (const g of groups) {
  const sample = g.files.slice(0, SAMPLE);
  const hits = {};
  let ok = 0, fail = 0, bytes = 0;

  for (const f of sample) {
    let meta;
    try { meta = probe(f); } catch { fail++; continue; }
    if (meta.error) { fail++; continue; }
    let data;
    try { data = inflate(meta); } catch { fail++; continue; }
    ok++;
    bytes += data.length;
    for (const m of MARKERS) {
      const c = count(data, m);
      if (c) hits[m] = (hits[m] || 0) + c;
    }
  }

  const score = (hits.skel || 0) + (hits.atlas || 0) + (hits.Spine || 0) * 2;
  results.push({
    dir: path.relative(ROOT, g.dir) || '.',
    total: g.files.length, ok, fail,
    kb: Math.round(bytes / 1024),
    hits, score,
  });
}

results.sort((a, b) => b.score - a.score || b.total - a.total);

console.log('=== Spine 흔적이 있는 폴더 (점수순) ===');
for (const r of results) {
  if (!r.score) continue;
  const h = Object.entries(r.hits)
    .sort((a, b) => b[1] - a[1])
    .map(([k, v]) => `${k}×${v}`)
    .join(' ');
  console.log(`\n[${r.score}] ${r.dir}`);
  console.log(`    번들 ${r.total}개 (샘플 ${r.ok}개 해제 성공, ${r.fail}개 실패, ${r.kb}KB)`);
  console.log(`    ${h}`);
}

const none = results.filter((r) => !r.score);
console.log(`\n=== 흔적 없는 폴더 ${none.length}개 (상위 10) ===`);
for (const r of none.slice(0, 10)) {
  console.log(`  ${r.dir}  (번들 ${r.total}, 해제 ${r.ok}/${r.ok + r.fail})`);
}

const totalOk = results.reduce((s, r) => s + r.ok, 0);
const totalFail = results.reduce((s, r) => s + r.fail, 0);
console.log(`\n압축 해제 성공률: ${totalOk}/${totalOk + totalFail}`);
