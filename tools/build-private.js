#!/usr/bin/env node
/**
 * 개인 전용 빌드 — 내가 뽑아 둔 캐릭터를 exe 안에 넣는다.
 * -------------------------------------------------------------
 *   npm run dist:private                       %APPDATA%/deskpet/characters 의 termina-* 전부
 *   npm run dist:private -- termina-marina     골라서
 *
 * 게임 에셋이 들어가므로 **나만 쓰는 PC에 복사하는 용도**다. GitHub 릴리스나 다른 사람에게
 * 주면 안 된다. 결과물은 dist/private/ (gitignore) 에 생긴다.
 *
 * 하는 일
 *  1. 고른 캐릭터를 %APPDATA% → characters/ 로 복사 (characters/* 는 gitignore)
 *  2. 지금 설정(주인공·동료·분위기·크기·무장)을 preset.json 으로 → 새 PC에서 처음 켜도 같은 상태
 *  3. 그 캐릭터들만 넣어서 포터블 exe 빌드 (기본 캐릭터·명일방주 등은 빼고)
 */
const fs = require('fs');
const path = require('path');
const builder = require('electron-builder');

const ROOT = path.join(__dirname, '..');
const pkg = require(path.join(ROOT, 'package.json'));
const APPDATA = process.env.APPDATA || path.join(require('os').homedir(), '.config');
const USER_DIR = path.join(APPDATA, 'deskpet');
const SRC_CHARS = path.join(USER_DIR, 'characters');

const wanted = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const ids = (wanted.length ? wanted : fs.readdirSync(SRC_CHARS).filter((n) => n.startsWith('termina-')))
  .filter((id) => fs.existsSync(path.join(SRC_CHARS, id, 'character.json')));
if (!ids.length) {
  console.error('[private] 넣을 캐릭터가 없다. 먼저 tools/rpgmv-extract.js 로 뽑을 것');
  process.exit(1);
}

// 1. 캐릭터 복사
for (const id of ids) {
  const dst = path.join(ROOT, 'characters', id);
  fs.rmSync(dst, { recursive: true, force: true });
  fs.cpSync(path.join(SRC_CHARS, id), dst, { recursive: true });
  console.log('[private] 캐릭터:', id);
}

// 2. 지금 설정을 기본값으로 (모니터 id 는 PC마다 달라서 뺀다)
let cur = {};
try { cur = JSON.parse(fs.readFileSync(path.join(USER_DIR, 'settings.json'), 'utf8')); } catch { /* 없으면 기본 */ }
const pick = (id) => (ids.includes(id) ? id : null);
const preset = {
  character: pick(cur.character) || ids[0],
  companion: pick(cur.companion),
  tone: cur.tone || 'light',
  sizeScale: cur.sizeScale || 1,
  modes: cur.modes || {},
};
if (preset.companion === preset.character) preset.companion = null;
fs.writeFileSync(path.join(ROOT, 'preset.json'), JSON.stringify(preset, null, 2));
console.log('[private] 기본 설정:', JSON.stringify(preset));

// 3. 빌드
const config = {
  ...pkg.build,
  files: [
    '!**/*',
    'src/**/*',
    'assets/icon.png',
    'assets/tray.png',
    'tools/say.js',
    'package.json',
    'preset.json',
    ...ids.map((id) => `characters/${id}/**/*`),
  ],
  directories: { ...pkg.build.directories, output: 'dist/private' },
  portable: { artifactName: 'DeskPet-private-${version}.exe' },
};

builder.build({ targets: builder.Platform.WINDOWS.createTarget('portable', builder.Arch.x64), config })
  .then((files) => {
    console.log('[private] 완료:', files.filter((f) => f.endsWith('.exe')).join(', '));
    console.log('[private] 이 파일은 나만 쓰는 PC에만 복사할 것 (배포 금지)');
  })
  .catch((e) => { console.error('[private] 빌드 실패:', e.message); process.exit(1); });
