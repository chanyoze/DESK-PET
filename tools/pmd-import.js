#!/usr/bin/env node
/**
 * 불가사의 던전 스타일 스프라이트(PMDCollab SpriteCollab)로 DeskPet 캐릭터 만들기 — 명령줄
 * -------------------------------------------------------------
 *   node tools/pmd-import.js <레시피.json> [--src=로컬 폴더] [--out=폴더]
 *
 *   예) node tools/pmd-import.js tools/recipes/pokemon/herdier.json
 *
 * 실제 일은 src/pmd.js 가 한다 (앱의 첫 실행 자동 설치와 같은 코드).
 * 결과는 기본으로 %APPDATA%/deskpet/characters/<id>.
 *
 * 스프라이트 라이선스는 CC BY-NC 4.0 (비상업 · 크레딧 표시). 캐릭터 폴더에 CREDITS.txt 를 같이 둔다.
 * 포켓몬 자체는 닌텐도 · 게임프리크 · 포켓몬 컴퍼니 IP — 개인용으로만 쓰고 배포하지 않는다.
 */
const fs = require('fs');
const path = require('path');
const { importRecipe } = require('../src/pmd');

const args = process.argv.slice(2);
const recipePath = args.find((a) => !a.startsWith('--'));
if (!recipePath) {
  console.error('사용법: node tools/pmd-import.js <레시피.json> [--src=폴더] [--out=폴더]');
  process.exit(1);
}
const opt = (k) => (args.find((a) => a.startsWith('--' + k + '=')) || '').slice(k.length + 3);
const recipe = JSON.parse(fs.readFileSync(recipePath, 'utf8'));

const appData = process.env.APPDATA ||
  (process.platform === 'darwin' ? path.join(require('os').homedir(), 'Library', 'Application Support')
    : path.join(require('os').homedir(), '.config'));
const outDir = opt('out') || path.join(appData, 'deskpet', 'characters', recipe.id);

importRecipe(recipe, outDir, { src: opt('src') || null, log: (m) => console.log('[pmd] ' + m) })
  .then((m) => console.log('[pmd] 완료:', m.name, '→', outDir))
  .catch((e) => { console.error('[pmd] ' + (e.stack || e.message)); process.exit(1); });
