#!/usr/bin/env node
/**
 * RPG Maker MV 게임에서 캐릭터 시트를 뽑아 DeskPet 캐릭터 폴더를 만든다.
 * -------------------------------------------------------------
 *   node tools/rpgmv-extract.js <게임 폴더> <레시피.json> [--out=폴더]
 *
 *   예) node tools/rpgmv-extract.js "C:/Program Files (x86)/Steam/steamapps/common/Fear & Hunger 2 Termina" tools/recipes/termina/marina.json
 *
 * 레시피에는 "어느 파일의 어느 칸을 어떤 동작에 쓸지"만 들어 있다. 그림은 들어 있지 않고,
 * 자기 PC에 설치된 게임에서 그때그때 꺼낸다. 결과물은 기본으로
 * %APPDATA%/deskpet/characters/<id> 에 쓰이며 저장소·배포 파일에는 들어가지 않는다.
 *
 * MV 이미지 암호화(.rpgmvp / .png_):
 *   16바이트 가짜 헤더 + (원본 PNG 앞 16바이트를 키로 XOR) + 나머지 원본 그대로.
 *   키는 data/System.json 의 encryptionKey (16진수 32자리).
 */
const fs = require('fs');
const path = require('path');

const PNG_SIG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

function die(msg) {
  console.error('[extract] ' + msg);
  process.exit(1);
}

/** 게임 루트 — MV 배포판은 www/ 아래에 있는 경우가 많다 */
function findWww(gameDir) {
  for (const d of [path.join(gameDir, 'www'), gameDir]) {
    if (fs.existsSync(path.join(d, 'data', 'System.json'))) return d;
  }
  return null;
}

function readKey(www) {
  const sys = JSON.parse(fs.readFileSync(path.join(www, 'data', 'System.json'), 'utf8'));
  if (!sys.hasEncryptedImages) return null;
  if (!/^[0-9a-f]{32}$/i.test(sys.encryptionKey || '')) die('System.json 에서 암호화 키를 찾지 못했다');
  return Buffer.from(sys.encryptionKey, 'hex');
}

/** img/ 기준 경로(확장자 없음)의 이미지를 원본 PNG 바이트로 돌려준다 */
function readImage(www, key, rel) {
  const base = path.join(www, 'img', rel);
  if (fs.existsSync(base + '.png')) return fs.readFileSync(base + '.png');
  const enc = [base + '.rpgmvp', base + '.png_'].find((p) => fs.existsSync(p));
  if (!enc) die('이미지가 없다: img/' + rel);
  if (!key) die('암호화된 이미지인데 게임이 암호화를 쓰지 않는다고 한다: ' + rel);

  const buf = fs.readFileSync(enc).subarray(16);
  for (let i = 0; i < 16; i++) buf[i] ^= key[i];
  if (!buf.subarray(0, 8).equals(PNG_SIG)) die('복호화 결과가 PNG가 아니다 (키가 다른가?): ' + rel);
  return buf;
}

function main() {
  const args = process.argv.slice(2);
  const pos = args.filter((a) => !a.startsWith('--'));
  const outArg = (args.find((a) => a.startsWith('--out=')) || '').slice(6);
  if (pos.length < 2) die('사용법: node tools/rpgmv-extract.js <게임 폴더> <레시피.json> [--out=폴더]');

  const [gameDir, recipePath] = pos;
  const www = findWww(gameDir);
  if (!www) die('RPG Maker MV 게임 폴더가 아니다 (data/System.json 없음): ' + gameDir);

  const recipe = JSON.parse(fs.readFileSync(recipePath, 'utf8'));
  const key = readKey(www);

  const appData = process.env.APPDATA || path.join(require('os').homedir(), '.config');
  const outDir = outArg || path.join(appData, 'deskpet', 'characters', recipe.id);
  fs.mkdirSync(outDir, { recursive: true });

  // 레시피의 sheets 는 { 이름: { from: "characters/%occultist", frame: [w,h] } }
  // 매니페스트에는 from 대신 저장한 파일 이름을 적는다.
  const manifest = { ...recipe.manifest, sheets: {} };
  for (const [name, def] of Object.entries(recipe.sheets)) {
    const file = name + '.png';
    fs.writeFileSync(path.join(outDir, file), readImage(www, key, def.from));
    manifest.sheets[name] = { file, frame: def.frame };
    console.log('[extract]', def.from, '→', file);
  }
  fs.writeFileSync(path.join(outDir, 'character.json'), JSON.stringify(manifest, null, 2));
  console.log('[extract] 완료:', manifest.name, '→', outDir);
}

main();
