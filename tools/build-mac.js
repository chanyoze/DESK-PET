#!/usr/bin/env node
/**
 * 맥 빌드 — 그림 없는 앱 + 첫 실행 자동 설치 설정
 * -------------------------------------------------------------
 *   node tools/build-mac.js [프리셋.json]        (기본 tools/presets/herdier.json)
 *
 * 맥 앱은 맥에서만 빌드된다 → 보통 GitHub Actions 맥 러너(.github/workflows/mac.yml)에서 돈다.
 * 결과: dist/mac/DeskPet-mac-x.y.z.zip (애플 실리콘 · 인텔 둘 다 되는 universal)
 *
 * 포켓몬 그림은 넣지 않는다. 프리셋의 autoInstall 로 쓰는 사람 맥에서 처음 켤 때 받아 온다
 * (main.js autoInstallCharacters). 그래서 이 zip 은 공개 릴리스에 올려도 된다.
 *
 * 코드 서명 인증서가 없어서 ad-hoc 서명만 한다 → 받는 사람이 처음 한 번
 *   xattr -cr /Applications/DeskPet.app
 * 을 해야 "손상된 앱" 경고 없이 열린다.
 */
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const builder = require('electron-builder');

const ROOT = path.join(__dirname, '..');
const pkg = require(path.join(ROOT, 'package.json'));
const presetPath = process.argv[2] || path.join(__dirname, 'presets', 'herdier.json');
const preset = JSON.parse(fs.readFileSync(presetPath, 'utf8'));
fs.writeFileSync(path.join(ROOT, 'preset.json'), JSON.stringify(preset, null, 2));
console.log('[mac] 기본 설정:', JSON.stringify(preset));

// 맥 아이콘은 512px 이상이어야 한다 — 256px 원본을 sips 로 키운다 (맥에서만)
let icon;
if (process.platform === 'darwin') {
  icon = path.join(ROOT, 'dist', '.tools', 'icon-512.png');
  fs.mkdirSync(path.dirname(icon), { recursive: true });
  execFileSync('sips', ['-z', '512', '512', path.join(ROOT, 'assets', 'icon.png'), '--out', icon], { stdio: 'ignore' });
}

const config = {
  ...pkg.build,
  files: [
    '!**/*',
    'src/**/*',
    'assets/icon.png',
    'assets/tray.png',
    'package.json',
    'preset.json',
    'characters/default/**/*',
    'tools/recipes/pokemon/**/*',
  ],
  directories: { ...pkg.build.directories, output: 'dist/mac' },
  mac: {
    target: [{ target: 'zip', arch: ['universal'] }],
    category: 'public.app-category.entertainment',
    identity: '-',                 // ad-hoc 서명 (애플 실리콘은 서명이 아예 없으면 안 열린다)
    hardenedRuntime: false,
    gatekeeperAssess: false,
    ...(icon ? { icon } : {}),
    artifactName: 'DeskPet-mac-${version}.${ext}',
  },
};

builder.build({ targets: builder.Platform.MAC.createTarget(), config })
  .then((files) => console.log('[mac] 완료:', files.filter((f) => /\.zip$/.test(f)).join(', ')))
  .catch((e) => { console.error('[mac] 빌드 실패:', e.message); process.exit(1); });
