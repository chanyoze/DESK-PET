#!/usr/bin/env node
/**
 * 맥 빌드
 * -------------------------------------------------------------
 *   node tools/build-mac.js [프리셋.json] [--bundle=pokemon/herdier,...]
 *
 * 맥 앱은 맥에서만 빌드된다 → 보통 GitHub Actions 맥 러너(.github/workflows/mac.yml)에서 돈다.
 * 결과: dist/mac/DeskPet-mac-x.y.z.zip (애플 실리콘 · 인텔 둘 다 되는 universal)
 *
 * 두 가지로 만든다.
 *  - 기본: 그림 없는 앱. 프리셋의 autoInstall 로 쓰는 사람 맥에서 처음 켤 때 받아 온다
 *    (main.js autoInstallCharacters). 공개 릴리스에 올려도 된다.
 *  - --bundle: 레시피 캐릭터를 빌드하는 자리에서 받아 앱 안에 넣은 통파일. 기본 캐릭터는 빼고
 *    그 캐릭터만 들어간다. **그림이 들어가므로 공개 릴리스에 올리지 않는다** (지인에게 직접 전달)
 *
 * 코드 서명 인증서가 없어서 ad-hoc 서명만 한다 → 받는 사람이 처음 한 번
 *   xattr -cr /Applications/DeskPet.app
 * 을 해야 "손상된 앱" 경고 없이 열린다.
 */
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const builder = require('electron-builder');
const { importRecipe } = require('../src/pmd');

const ROOT = path.join(__dirname, '..');
const pkg = require(path.join(ROOT, 'package.json'));
const args = process.argv.slice(2);
const presetPath = args.find((a) => !a.startsWith('--')) || path.join(__dirname, 'presets', 'herdier.json');
const bundle = ((args.find((a) => a.startsWith('--bundle=')) || '').slice(9)).split(',').map((s) => s.trim()).filter(Boolean);

async function main() {
  const preset = JSON.parse(fs.readFileSync(presetPath, 'utf8'));
  fs.writeFileSync(path.join(ROOT, 'preset.json'), JSON.stringify(preset, null, 2));
  console.log('[mac] 기본 설정:', JSON.stringify(preset));

  // 통파일: 레시피 캐릭터를 지금 받아서 characters/ 에 넣는다 (characters/* 는 gitignore)
  const bundledIds = [];
  for (const rel of bundle) {
    const recipe = JSON.parse(fs.readFileSync(path.join(__dirname, 'recipes', rel + '.json'), 'utf8'));
    await importRecipe(recipe, path.join(ROOT, 'characters', recipe.id), { log: (m) => console.log('[mac] ' + m) });
    bundledIds.push(recipe.id);
    console.log('[mac] 앱에 넣음:', recipe.id);
  }

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
      // 통파일이면 넣은 캐릭터만, 아니면 기본 캐릭터 + 첫 실행에 받을 레시피
      ...(bundledIds.length
        ? bundledIds.map((id) => `characters/${id}/**/*`)
        : ['characters/default/**/*', 'tools/recipes/pokemon/**/*']),
    ],
    directories: { ...pkg.build.directories, output: 'dist/mac' },
    mac: {
      target: [{ target: 'zip', arch: ['universal'] }],
      category: 'public.app-category.entertainment',
      identity: '-',                 // ad-hoc 서명 (애플 실리콘은 서명이 아예 없으면 안 열린다)
      hardenedRuntime: false,
      gatekeeperAssess: false,
      ...(icon ? { icon } : {}),
      artifactName: bundledIds.length ? 'DeskPet-mac-' + bundledIds.join('-') + '-${version}.${ext}' : 'DeskPet-mac-${version}.${ext}',
    },
  };

  // publish: 'never' — CI 에서는 electron-builder 가 알아서 GitHub 에 올리려 든다. 릴리스는 워크플로가 올린다
  const files = await builder.build({ targets: builder.Platform.MAC.createTarget(), config, publish: 'never' });
  console.log('[mac] 완료:', files.filter((f) => /\.zip$/.test(f)).join(', '));
}

main().catch((e) => { console.error('[mac] 빌드 실패:', e.message); process.exit(1); });
