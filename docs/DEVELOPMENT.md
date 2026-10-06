# DeskPet — 개발 문서

쓰는 법은 [README](../README.md). 여기는 만들고 · 고치고 · 빌드하고 · 배포하는 쪽 이야기다.

- [개발자용 실행](#개발자용-실행) · [개발용 옵션](#개발용-옵션) · [구조](#구조)
- [캐릭터 만들기 (BYOA)](#캐릭터--코드는-공개-에셋은-각자-byoa) · [포켓몬](#포켓몬-불가사의-던전-스타일-스프라이트) · [애니메이션 활용](#애니메이션-활용)
- [배포 — 업데이트 · 맥 빌드 · 개인 빌드](#배포)
- [외부에서 말 시키기 (HTTP)](#외부에서-말-시키기) · [Claude Code 훅 동작 방식](#claude-code-훅-동작-방식)
- [가볍게 — 측정](#가볍게--측정)

## 개발자용 실행

```bash
npm install
npm start            # 실행
npm run dev          # 개발자 도구를 띄운 채
npm run fetch-spine  # Spine 런타임 받기
npm run dist         # 포터블 exe 빌드 → dist/
npm run icon         # 트레이 아이콘 재생성
```

## 개발용 옵션

```bash
npx electron . --dev                  # 개발자 도구
npx electron . --trace                # 상태값(위치·속도·상태)을 터미널에 출력
npx electron . --start=climb          # 실행하자마자 벽 타기
npx electron . --start=climbhold      # 벽 타기를 제자리에 고정 (자세 확인용)
npx electron . --start=state:sit      # 특정 상태를 바닥에서 계속 재생
npx electron . --start=clip:transform # 클립 하나를 계속 재생 (sprite 레시피 확인용)
npx electron . --start=mode:knife     # 무장 모드로 계속 걷기
npx electron . --start=hug            # 껴안기 바로 보기 (짝이 없으면 저장하지 않고 불러온다)
npx electron . --start=talk           # 둘의 대화 바로 보기
npx electron . --start=nightmare      # 원작처럼 연출 바로 보기 (nightmare · down · bloodcast · teleport)
npx electron . --start=claude:done    # Claude 반응 바로 보기 (done · fail · permission · waiting)
npx electron . --start=recap          # 할 일 recap 바로 보기 (--start=todo:add 는 입력 창)
node tools/measure.js                 # 무게 재기 — 메모리(프로세스별) · CPU% (--exe 경로 면 exe · 풀린 크기도), 결과 dist/measure/
npx electron . --start=cursor:chase   # 커서 놀이 바로 보기 (chase · flee, 저장 안 함)
npx electron . --character=kaltsit    # 특정 캐릭터로 실행
npx electron . --shot=out.png,5000    # 창 내용만 PNG로 저장하고 종료
npx electron . --hitbox               # 클릭 판정 영역을 화면에 표시
```

`--shot` 은 화면 캡처가 아니라 **창 내용만** 찍는다. 다른 창(전체화면 게임 등)에
가려져도 우리가 그린 것만 정확히 확인할 수 있다.

렌더러 콘솔은 항상 터미널로 넘어온다. 투명 창이라 오류를 눈으로 볼 수 없기 때문이다.

## 구조

```
src/
  main.js                  Electron 메인 — 창 · 트레이 · 모니터 · 캐릭터 로드 · 리마인더 · Claude 이벤트 · 할 일 · 알림 · 업데이트
  settings.js              설정 저장 (userData/settings.json)
  notify-server.js         127.0.0.1 전용 알림 서버 — 외부에서 말 시키기 (/say, /claude, /claude-window)
  claude-hooks.js          ~/.claude/settings.json 에 우리 훅 넣고 빼기 + 훅 스크립트 (electron 없이 시험 가능)
  ps-scripts.js            userData 에 쓰는 PowerShell 스크립트 — 창 앞으로 가져오기 · deskpet.ps1 명령줄 도구
  notes-store.js           todo.md(일자별 · 분류 · 언젠가 · 반복 · 기한 · 설명) 읽고 쓰기 · 반복 만들기 · 한꺼번에 옮기기 · notes.json (electron 없이 시험 가능)
  editor-window.js         글 입력 창 (투명 창은 글자를 못 받아서 따로 띄운다) — preload-editor.js
  settings-window.js       설정 창 (renderer/settings.html · preload-settings.js) — main.js 의 prefs:get / prefs:set
  ask.js                   물어보기 — 이 PC 의 Claude Code 를 claude -p 로 실행해 답 받기 (electron 없이 시험 가능)
  char-package.js          캐릭터 꾸러미(.deskpet) 묶기 · 검사 · 풀기 (electron 없이 시험 가능)
  maker-window.js          내 그림으로 캐릭터 만들기 창 (renderer/maker.html · preload-maker.js) — main.js 의 maker:* · chars:*
  palette-window.js        도구 팔레트 창 — 빠른 메모 · 클립보드 기록 · 바로가기 (renderer/palette.html · preload-palette.js)
  clipboard-history.js     클립보드 기록 (메모리에만, 📌 고정만 clipboard-pins.json) — Electron 44 는 클립보드가 Promise
  shortcuts-store.js       바로가기 목록 shortcuts.json — 주소 · 경로 · 명령 종류 판별
  updater.js               GitHub Releases 확인 · 받기 · sha256 확인 · 바꿔 끼우기 (윈도우 포터블 · 맥 .app)
  pmd.js                   불가사의 던전 스프라이트(SpriteCollab) 가져오기 — 레시피 → 캐릭터 폴더
  preload.js               contextBridge (petAPI)
  renderer/
    index.html
    style.css              배경은 반드시 transparent
    pet.js                 상태머신 · 물리 · 마우스 · 렌더 루프 · 메뉴 · Claude 반응 · recap · 놓친 알림 · 커서 놀이
    notes.js               화면 카드 — 할 일 카드(날짜별) · 스티커 메모 (끌기 · 크기 · 접기)
    editor.html            입력 창 화면 (할 일: 날짜 · 언젠가 · 반복 · 분류 · 기한 / 메모: 색)
    settings.html          설정 창 화면 — 캐릭터 · 할 일 알림 · 알림 · 도구(단축키) · 성능 · 일반
    palette.html           도구 팔레트 화면 (탭 셋)
    maker.html             캐릭터 만들기 — GIF 풀기(ImageDecoder) · 배경 지우기 · 자르기 · 좌우 뒤집은 줄 · 시트 만들기 · 미리보기
    character.js           자체 파츠 리그 — 파츠 정의 · 포즈 · IK · 그리기
    ui.js                  말풍선(대화 · 알림 카드) · 좌클릭 메뉴(접는 섹션)
    chatter.js             혼잣말 (상태·시간대별 대사)
    renderers/
      parts-view.js        파츠 리그 뷰 (Canvas 2D)
      spine-view.js        Spine 3.8 뷰 (WebGL)
      sprite-view.js       스프라이트 시트 뷰 (Canvas 2D) — 칸을 하나씩 잘라 두고 그린다 (번짐 · 위 칸 점 제거)
characters/
  default/                 자체 제작 캐릭터 — 저장소에 들어가는 유일한 캐릭터
site/                      GitHub Pages 다운로드 페이지 (파츠 리그 데모 포함)
tools/
  say.js                   알림 서버에 말 보내기 (앱이 꺼져 있으면 조용히 무시)
  fetch-spine.js           Spine 3.8 런타임 받기
  rpgmv-extract.js         RPG Maker MV 게임에서 캐릭터 시트 뽑기 (레시피: tools/recipes/)
  pmd-import.js            불가사의 던전 스프라이트 가져오기 (레시피: tools/recipes/pokemon/)
  build-private.js         개인 빌드 (뽑아 둔 캐릭터를 exe 에) — 7za-skip-hidden.cs 로 보안 프로그램 미끼 파일 제외
  build-mac.js             맥 빌드 (GitHub Actions 맥 러너에서) — 그림 없는 앱 / --bundle 통파일
  presets/                 맥 빌드 기본 설정 (하데리어 · 통파일)
  measure.js               무게 재기 — 메모리 · CPU% (아래 "가볍게 — 측정")
  gen-icon.js              의존성 없는 PNG 인코더 (트레이 아이콘 생성)
  ak-scan.js · ab-probe.js · check-pma.js   에셋 조사용 개발 도구
.github/workflows/
  release.yml              버전 올려 푸시 → 윈도우 exe(v버전) · 맥 zip(mac-v버전) 릴리스 (업데이트 배포)
  mac.yml                  맥 빌드 (손으로 돌리거나 release.yml 이 부른다, 통파일은 1일 아티팩트만)
  pages.yml                다운로드 페이지
assets/
  icon.png · tray.png      생성물
```

### 왜 파츠 분리 방식인가

상용 데스크톱 펫은 보통 손그림 수백 장을 프레임으로 넘긴다 (LUMI는 64가지 행동 / 122장).
개인 프로젝트에서 그 물량은 현실적이지 않고, AI로 프레임을 한 장씩 생성하면
프레임마다 캐릭터가 미묘하게 달라져서 애니메이션이 떨린다.

그래서 몸을 **파츠 6개**(머리 · 몸통 · 팔 2 · 다리 2)로 쪼개고, 관절 각도를
`sin` 함수로 굴려서 동작을 만든다. 그림 물량이 122장 → 6장으로 줄고,
일관성 문제가 구조적으로 사라진다.

`character.js`의 `DRAW` 객체가 파츠별 그리기를 담당한다. 지금은 캔버스 도형으로
그리지만, 나중에 실제 아트가 생기면 이 함수들만 `drawImage`로 바꾸면 된다.
애니메이션(`ANIMS`)과 구동부(`pet.js`)는 손댈 필요가 없다.

### IK — 왜 필요한가

팔다리는 상완/전완, 허벅지/정강이의 **2단 관절**이다. 덕분에 `ANIMS`가
관절 각도 대신 **손발의 목표점**을 줄 수 있고, 각도는 `ik2()`가 역산한다.

```js
ik: { armFront: { x: 12, y: -44, bend: -1 } }   // "손을 여기에 놓아라"
```

데스크톱 펫의 핵심 동작은 이 방식이 아니면 만들 수 없다. 창 모서리를
기어오르려면 창 높이가 매번 다르고, 던져졌을 때 버둥거리려면 속도가
매번 다르다. 미리 찍어둔 프레임으로는 대응이 안 된다.

`ik2()`는 코사인 법칙 닫힌 해라 반복 계산이 없다.

### 뼈 방향 규칙

모든 뼈는 로컬 **+y(아래)** 를 향하고, 각도 θ가 그 방향을 회전시킨다.

```
끝점 방향 = (-sin θ, cos θ)      방향 (dx,dy)를 향하려면  θ = atan2(-dx, dy)
```

파츠 이미지를 만들 때도 이 규칙을 따라야 한다 — **관절이 원점, 파츠는 아래로 뻗게.**

### 그리는 순서 덮어쓰기

머리가 큰 치비 비율이라 팔을 위로 뻗으면 머리에 가려진다. 그래서 동작이
`pose.order`로 그리는 순서를 바꿀 수 있다. 벽 타기는 벽 쪽 팔을 머리 위에 그린다.

### 좌표계

- 캐릭터 로컬: **발바닥 가운데가 원점**, 위쪽이 `-y`, 키는 64유닛
- 화면: Electron이 주는 DIP 기준. 창을 주 모니터 `bounds`에 딱 맞춰 띄우므로
  창 로컬 좌표 = 화면 좌표 - `bounds` 원점
- 바닥선 `ground` = `workArea.y + workArea.height` (= 작업 표시줄 윗변)

### 클릭 통과 처리

창은 기본적으로 `setIgnoreMouseEvents(true, { forward: true })` 상태다.
`forward: true` 덕분에 클릭은 통과시키면서 `mousemove`는 계속 받을 수 있고,
렌더러가 매 이동마다 히트 테스트를 해서 캐릭터 위일 때만 IPC로
`setIgnoreMouseEvents(false)`를 요청한다. 캐릭터를 벗어나면 즉시 되돌린다.

다만 `forward` 는 주 모니터가 아닌 곳이나 창을 옮긴 뒤에 `mousemove` 가 끊긴다. 그래서
메인이 `screen.getCursorScreenPoint()` 로 커서 위치를 초당 20번 읽어 렌더러에 따로 넘기고,
렌더러는 매 프레임 판정을 다시 한다. 창이 새로고침될 때는 클릭 통과 상태로 되돌린다.

## 캐릭터 — 코드는 공개, 에셋은 각자 (BYOA)

`characters/<이름>/character.json` 하나가 캐릭터 하나다. 렌더러가 세 종류다.

| renderer | 무엇 | 에셋 |
|---|---|---|
| `parts` | 자체 파츠 리그 (코드로 그림) | 필요 없음 — 저장소에 포함 |
| `spine` | Spine 2D 스켈레톤 | `.skel` + `.atlas` + `.png` — **각자 준비** |
| `sprite` | 2D 스프라이트 시트 (RPG Maker 등) | 시트 `.png` — **각자 준비** |

```json
{
  "name": "이름",
  "renderer": "spine",
  "skeleton": "foo.skel",
  "atlas": "foo.atlas",
  "height": 150,
  "walkSpeed": 46,
  "animations": { "idle": "Relax", "walk": "Move", "sit": "Sit", "sleep": "Sleep" }
}
```

`animations`는 이 앱의 상태 이름을 스켈레톤이 실제로 가진 애니메이션 이름에 연결한다.
없는 상태는 `Default`로 떨어진다.

스켈레톤은 **바이너리(.skel)와 JSON 두 형식**을 모두 읽는다. 첫 바이트가 `{` 이면 JSON으로
판별한다. JSON 쪽은 크기 정보가 없을 수 있어서, 그럴 땐 셋업 포즈에서 바운즈를 직접 잰다.

`characters/` 는 `default/`(자체 제작) 만 빼고 전부 gitignore 되고, 빌드 산출물에도
들어가지 않는다. **남의 저작물은 저장소에도 배포 파일에도 들어오지 않는다.**
에뮬레이터가 ROM을 포함하지 않는 것과 같은 방식이다.

실행 중에는 두 곳을 모두 읽는다 — 앱에 동봉된 폴더와 `%APPDATA%/deskpet/characters`.
같은 이름이면 사용자 폴더가 이긴다.

### Spine 런타임

```bash
npm run fetch-spine     # vendor/spine/spine-webgl.js 를 받는다
```

저장소에 넣지 않는 이유는 Spine 런타임 재배포에 라이선스가 필요하기 때문이다.
**3.8 브랜치**를 받는다 — Spine은 런타임과 에디터의 메이저.마이너가 일치해야 하고,
4.x 런타임은 3.8 스켈레톤을 로드하지 못한다.

Canvas가 아니라 **WebGL** 백엔드를 쓴다. spine-ts의 Canvas 백엔드는 메시 어태치먼트를
지원하지 않아서, 옷자락·머리카락에 메시를 쓰는 스켈레톤이 깨진다.

### 스프라이트 시트 (`sprite`)

뼈대 없이 칸을 넘기는 2D 게임 캐릭터용이다. 동작은 "어느 시트의 몇 번째 칸을 어떤 순서로"가 전부다.

```json
{
  "name": "마리나",
  "renderer": "sprite",
  "height": 160,
  "sheets": { "walk": { "file": "walk.png", "frame": [80, 110] } },
  "clips": {
    "idle": { "sheet": "walk", "frames": [[1, 0]], "bob": 1 },
    "walk": { "sheet": "walk", "fps": 6,
              "left":  [[0, 1], [1, 1], [2, 1], [1, 1]],
              "right": [[0, 2], [1, 2], [2, 2], [1, 2]] }
  },
  "animations": { "idle": "idle", "walk": "walk" }
}
```

- 칸 좌표는 `[열, 행]`. 좌우 그림이 따로 있으면 `left`/`right`, 정면 그림이면 `frames`
- **발 위치는 알파를 훑어서 자동으로 잡는다** — 칸마다 여백이 달라도 동작이 바뀔 때 튀지 않는다
- `height` 는 대기 자세의 실제 그림 높이 기준 (Spine·파츠와 같은 뜻)
- 게임 에셋엔 대기 모션이 없어서 `bob` 으로 숨쉬기를 얹는다
- `idle` 클립은 필수
- `once: true` 클립은 한 번만 재생하고 마지막 칸에서 멈춘다 (변신 같은 연출)

`animations` 는 모든 렌더러 공통으로 두 가지를 더 받는다.

- **변형 풀** — 값이 배열이면 그 상태에 들어갈 때마다 하나를 랜덤으로 고른다
  (`"sleep": ["sleep", "lieback", "prone"]`)
- **무장 모드** — `"walk@knife"` 처럼 `@모드` 가 붙은 키가 있으면 메뉴에 **무장** 섹션이 생긴다.
  그 모드일 때는 그 키를, 없는 상태는 평소 동작을 쓴다. 캐릭터별로 저장된다
- `run` 이 있으면 걷기 대신 가끔 달린다 (`runSpeed`)

**모니터 고르기** — 모니터가 여럿이면 설정 창의 **모니터**에서 돌아다닐 모니터를
고른다. 왼쪽부터 번호가 붙고 모델 이름·해상도가 함께 나온다. "지금 마우스가 있는 모니터로"를 누르면
헷갈릴 일이 없다. 고른 모니터가 빠지면 주 모니터로 돌아간다.

**분위기** — 설정 창의 **분위기**에서 "가볍게 / 원작처럼". 매니페스트에 `linesDark` · `dialoguesDark` 가 있는
캐릭터만 달라진다. 원작처럼일 때 매니페스트 `animations` 의 `nightmare`(새벽에 드물게) · `down`(세게 던지면
가끔) · `bloodcast` + `teleport`(붉은 호 순간이동)가 쓰인다.

**캐릭터 숨기기** — `character.json` 에 `"hidden": true` 를 넣으면 지우지 않고 목록에서만 뺀다.

**대사** — `lines` 는 상태별 혼잣말 외에 반응(`picked` `thrown` `landed` `petted` `woken`),
`together`, `armed:<모드>` 를 받는다. `dialogues` 를 주면 둘이 같이 있을 때 대화를 주고받는다.
자세한 건 [TERMINA-CHARACTERS.md](TERMINA-CHARACTERS.md) 의 "대사 구조".

**둘이 같이 다니기** — 캐릭터 메뉴의 **함께 다니기**에서 동료를 한 명 고르면 둘이 같이 돌아다닌다.
클릭 · 드래그 · 메뉴는 커서 아래 있는 쪽에 적용된다.

**껴안기** — 매니페스트에 `hug` 를 주면 그 상대와 같이 있을 때 가끔 다가가서 껴안는다.

```json
"hug": { "with": "termina-marina", "clip": "hug",
         "lines": ["...따뜻해요"], "partnerLines": ["...갑자기 왜 이래"] }
```

`clip` 은 두 사람이 한 칸에 같이 그려진 그림이다 (이쪽이 왼쪽). 껴안는 동안 상대는 숨기고,
상대가 왼쪽에 있으면 `mirror: true` 클립을 좌우로 뒤집어 그린다.

**RPG Maker MV 게임에서 뽑기** — 레시피(칸 좌표만 적힌 JSON)를 주면 설치된 게임에서 시트를
풀어 `%APPDATA%/deskpet/characters` 에 캐릭터를 만든다. 레시피 시트에 `"mod": true` 가 붙어
있으면 `--mod` 로 준 모드 폴더에서 읽는다.

```bash
npm run extract-rpgmv -- "<게임 폴더>" tools/recipes/termina/marina.json
npm run extract-rpgmv -- "<게임 폴더>" tools/recipes/termina/samarie.json --mod="<모드 www 폴더>"
```

피어 앤 헝거 2: 테르미나의 마리나·사마리 레시피가 들어 있다. 조사 기록은
[TERMINA-PROBE.md](TERMINA-PROBE.md).

### 화질

게임에서 뽑은 아트는 대개 데스크톱 펫으로 쓰기엔 크게 그려져 있다. 작게 줄여 그리면
축소 앨리어싱이 생기므로 세 가지를 쓴다.

- **WebGL2 + 밉맵** — 아틀라스가 624×624처럼 2의 거듭제곱이 아니면 WebGL1에서는
  밉맵을 못 만든다. 밉맵 없이 축소하면 픽셀 하나가 텍셀 13×13 영역을 2×2로만
  샘플링해서 심하게 깨진다
- **이방성 필터링** (있으면 8x)
- **슈퍼샘플링** — `supersample` 배율만큼 크게 그린 뒤 브라우저가 줄인다 (기본 2)

그래도 원본 해상도가 상한이다. `height`를 원본이 감당하는 크기에 가깝게 잡을수록
선명하다. 설정 창의 **크기** 에서 바꿔 보고 정하면 된다.

## 내 그림으로 만들기 (maker)

쓰는 사람이 PNG · GIF 만으로 `sprite` 캐릭터를 만드는 창 (`maker-window.js` · `renderer/maker.html`). 그림 처리는 전부 창(렌더러)에서 하고
메인은 받은 시트 png 와 매니페스트를 `userData/characters/my-<시각36진수>/` 에 쓴다 (`.part` 에 쓰고 옮긴다).

- GIF · 움직이는 WEBP 는 `ImageDecoder` 로 프레임과 프레임 시간(`frameMs`)을 꺼낸다. 640px 넘게 크면 줄여서 읽는다, 동작당 80장까지
- 배경 지우기: 네 귀퉁이 중 가장 흔한 색을 기준으로 테두리에서부터 이어진 비슷한 색을 투명하게 (경계는 살짝 반투명)
- 한 동작의 모든 프레임을 감싸는 영역으로 같이 잘라서 프레임끼리 떨리지 않게. 칸 높이는 키 × 1.6 (최대 420px)
- 시트는 한 줄 8칸 격자. 바라보는 쪽이 왼쪽/오른쪽이면 아래 절반에 좌우 뒤집은 칸을 두고 `left` · `right` 목록으로 나눈다
- 없는 동작: 걷기 · 쓰다듬기는 대기 칸 + `hop: 1`(통통 튀기, sprite-view), 나머지는 `animations` 에서 대기로
- 매니페스트에 `maker: 1` · `makerOpts`(방향 · 배경 · 도트 · 속도 · 쓴 칸)를 남겨 **고치기** 때 시트를 칸으로 다시 잘라 불러온다
- 설정 창 캐릭터 목록 = `chars:admin` — 종류 bundled · downloaded(CREDITS.txt 있음) · made(`my-`) · user.
  숨기기는 `"hidden": true` (받은 것은 지우면 다시 받으므로 숨기기만), 지우기는 made 만, 나와 있는 캐릭터는 둘 다 막는다

## 캐릭터 꾸러미 (.deskpet)

`src/char-package.js` (electron 없음) — 캐릭터 폴더 ↔ 파일 하나. IPC `chars:export` · `chars:import` (설정 창).

- 형식: `gzip( JSON { format: 'deskpet-character', version: 1, id, name, from, createdAt, files: { 상대경로: base64 } } )`.
  zip 라이브러리 없이 node 기본 `zlib` 만 쓴다. png 는 이미 압축이라 크기는 원본과 비슷 (늪짱이 76KB → 60KB)
- 받을 때 검사 (`unpack`): 형식 · 버전, 파일은 json · png · jpg · webp · skel · atlas · txt 만, 경로는 폴더 안쪽만(절대 · `..` · 역슬래시 금지),
  300개 · 풀어서 120MB 상한, `character.json` 은 sprite · spine 만, 매니페스트가 가리키는 그림이 다 있어야
- 설치 (`install`): `.part` 에 쓰고 옮긴다, 매니페스트에 `sharedBy`(보낸 사람 또는 true) — 목록에 "받은 것 · ○○ 님", 지우기 허용
- 같은 id 가 있으면 덮어쓰기 · 따로 추가(내가 만든 형식 `my-` 면 새 `my-` id 라 고치기가 된다) · 취소
- 시험: 위험한 꾸러미 9종(경로 탈출 · 절대 경로 · exe · js · 그림 빠짐 · 다른 형식 · parts · 그냥 png · 미래 버전) 거절 확인

## 포켓몬 (불가사의 던전 스타일 스프라이트)

[PMDCollab SpriteCollab](https://github.com/PMDCollab/SpriteCollab) 의 팬 스프라이트로 포켓몬 캐릭터를 만든다.
동작마다 시트와 `AnimData.xml`(칸 크기 · 프레임 시간)이 있어서, 레시피엔 "펫 상태 → 동작 · 방향 줄"만 적으면 된다.

```bash
node tools/pmd-import.js tools/recipes/pokemon/herdier.json      # 하데리어 (#0507)
node tools/pmd-import.js tools/recipes/pokemon/marshtomp.json    # 늪짱이 (#0259)
node tools/pmd-import.js tools/recipes/pokemon/wingull.json      # 갈모매 (#0278)
# --out=<캐릭터 폴더 자체> 로 다른 곳에 (시험용)
```

- 맥 공개판 프리셋(`tools/presets/herdier.json`)의 `autoInstall` 에 셋 다 있다 — 지인 맥이 업데이트하면 처음 켤 때 받는다.
  `onlyCharacters` 는 **앱에 든** 캐릭터(기본 고양이)만 가리고, 사용자 폴더 캐릭터(받은 것 · 내가 만든 것)는 늘 보인다
- `autoInstall` · `onlyCharacters` 는 **빌드가 정하는 값**이라 settings.json 에 저장하지 않고 늘 지금 빌드의 preset.json 을 따른다
  (예전엔 저장돼서, 프리셋을 바꿔도 옛 통파일의 "하데리어만" 이 남았다 — `settings.js` BUILD_KEYS)

- 방향 줄: `0` 아래 · `1` 오른쪽 아래 · `2` 오른쪽 · `3` 오른쪽 위 · `4` 위 · `5` 왼쪽 위 · `6` 왼쪽 · `7` 왼쪽 아래
- 레시피 `clips` 의 `{ "anim": "Walk", "left": 6, "right": 2 }` 가 칸 목록 + `frameMs` 로 펼쳐진다. `speed` 로 빠르게
- 키는 대기 칸의 실제 그림 높이 × `scale`(기본 3). 도트는 `smoothing: false` 로 픽셀 그대로
- 다른 포켓몬은 `dex`(도감 번호)만 바꾼 레시피를 만들면 된다. 동작 이름은 [뷰어](https://sprites.pmdcollab.org/)에서 확인
- **라이선스**: 스프라이트는 CC BY-NC 4.0 (비상업 · 크레딧). 캐릭터 폴더에 `CREDITS.txt` 가 같이 생긴다.
  포켓몬은 닌텐도 · 게임프리크 · 포켓몬 컴퍼니 IP — 개인용으로만 쓰고 배포하지 않는다

## 애니메이션 활용

게임에서 뽑은 기지 SD는 동작이 **6개**뿐이다(스킨은 `Special` 이 붙어 7개).
없는 동작을 억지로 만들면 어색해지므로, 있는 것을 최대한 돌려 쓴다.

| 동작 | 쓰이는 곳 |
|---|---|
| `Relax` | 대기 |
| `Default` | 대기(둘째 종류) · 던져질 때 · 낙하 |
| `Move` | 걷기 |
| `Sit` | 앉기 |
| `Sleep` | 잠 (드물게, 깨면 쿨다운) |
| `Interact` | 쓰다듬기 · 캐릭터 교체 인사 · 알림 반응 |
| `Special` | 스킨 한정. 가끔 랜덤 + `mood=happy` 알림 |

새 동작이 필요한 기능(벽 타기 등)은 게임 에셋으로는 어색해진다. 자체 파츠 리그는
IK로 만들어낼 수 있으므로 그쪽에서만 켠다.

## 배포

버전은 굵직한 기능을 모아서만 올린다 — 올리면 쓰는 사람 모두에게 업데이트 알림이 간다.

### 업데이트 — 버전 올려 푸시하면 쓰는 사람에게 알림

**배포하는 쪽** — ① `src/whatsnew.json` 에 새 버전 요약을 몇 줄 적고 ② `package.json` 의 `version` 을 올려
main 에 푸시하면 끝이다 (`.github/workflows/release.yml`).

- `whatsnew.json` 의 요약은 세 군데에 같은 말로 나간다 — 릴리스 노트 맨 위 · 앱의 업데이트 확인 창 ·
  **업데이트 뒤 처음 켤 때 뜨는 "새로 바뀐 것" 창**. 커밋 제목이 아니라 쓰는 사람 말로 짧게

| | 만들어지는 것 | 릴리스 |
|---|---|---|
| 윈도우 | 그림 없는 포터블 exe `DeskPet-버전.exe` | `v버전` (최신), 노트는 지난 버전 이후 커밋 제목 |
| 맥 | `mac.yml` 을 불러 universal zip `DeskPet-mac-버전.zip` | `mac-v버전` (프리릴리스) |

그 버전 릴리스가 이미 있으면 건너뛴다. **`"version"` 값이 실제로 바뀐 푸시일 때만** 돈다 — `package.json` 의 다른 설정만 고친 커밋은
아무 일도 안 한다.

- 쓰는 쪽에서 무슨 일이 일어나는지는 [README 의 업데이트](../README.md#업데이트)
- 시험용: `DESKPET_UPDATE_FEED`(릴리스 목록 주소) · `DESKPET_USERDATA`(설정 폴더) 환경 변수, `--update-now`(확인 창 없이 바로 설치)
- **뒷정리** — 윈도우: 새 앱이 옛 exe 를 지운다 (`cleanupOld`). 받다 끊기면 `.part` 를 지운다. 맥: 바꿔 끼운 뒤 받은 zip · 푼 앱이 든 임시 폴더를 지운다.
  포터블 exe 가 실행할 때 푸는 `%TEMP%\<무작위>` (약 330MB) 는 정상 종료면 실행기가 지우지만, 강제 종료 · 전원 꺼짐이면 남는다 →
  앱이 켜지고 1분 뒤 지난 것을 지운다 (`cleanStalePortable` — 실행 중인 exe 는 쓰기로 못 열린다는 걸로 다른 DeskPet 이 쓰는 폴더는 건너뛴다)

### 맥 (macOS)

맥 앱은 맥에서만 빌드된다 → GitHub Actions 맥 러너가 만든다 (Actions 탭 "Build macOS app" 또는 `gh workflow run mac.yml`).

- 결과: 릴리스 `mac-v버전` 의 `DeskPet-mac-x.y.z.zip` — 애플 실리콘 · 인텔 둘 다 되는 universal
- **그림은 들어 있지 않다.** 프리셋(`tools/presets/*.json`)의 `autoInstall` 에 적힌 레시피 캐릭터를 처음 켤 때 받아 온다
- **통파일**(캐릭터를 앱 안에 넣은 것): `gh workflow run mac.yml -f preset=tools/presets/herdier-bundled.json -f bundle=pokemon/herdier`
  - 빌드하는 자리에서 레시피 캐릭터를 받아 넣는다. 프리셋의 `onlyCharacters` 로 그 캐릭터만 목록에 보인다
  - **그림이 들어가므로 릴리스에 올리지 않는다.** 1일짜리 아티팩트로만 남으니 `gh run download` 로 받은 뒤
    `gh api -X DELETE repos/<owner>/<repo>/actions/artifacts/<id>` 로 바로 지운다
- 코드 서명 인증서가 없어서 ad-hoc 서명만 한다 → 처음 한 번 터미널에서 `xattr -cr /Applications/DeskPet.app`
- 맥에서는 Dock 아이콘 없이 메뉴바에만 뜨고, 모든 데스크톱(Spaces)에 보인다
- Claude Code 알림 연결 · 그 터미널로 · `deskpet.ps1` 은 PowerShell 이라 아직 윈도우 전용

### 개인 빌드 (뽑아 둔 캐릭터를 exe에 넣기)

게임이 없는 다른 PC(예: 회사 PC)에서 쓰려면, 내 PC에서 뽑아 둔 캐릭터를 exe 안에 넣어 빌드한다.

```bash
npm run dist:private                     # %APPDATA%/deskpet/characters 의 termina-* 전부
npm run dist:private -- termina-marina   # 골라서
```

- 결과물은 `dist/private/DeskPet-private-x.y.z.exe` — 파일 하나, 설치 없음
- 지금 설정(주인공 · 동료 · 분위기 · 크기 · 무장)이 `preset.json` 으로 들어가서, 새 PC에서 처음 켜도 같은 상태로 시작한다
- **게임 에셋이 들어간 파일이다. 나만 쓰는 PC에 복사하는 용도로만 쓰고, 릴리스나 공유는 하지 않는다.**
  `characters/*` · `preset.json` · `dist/` 는 전부 gitignore 되어 있다
- **나만의 아이콘** — `%APPDATA%\deskpet\private-icon.png` (256px 이상 정사각 PNG)를 두면
  - 개인 빌드 exe 아이콘이 된다 (빌드할 때 넣는다)
  - 트레이 아이콘 · 윈도우 알림 아이콘도 된다 (실행 중에 읽으므로 업데이트로 공개판이 돼도 유지)
  - 게임 그림이 든 사진일 수 있어서 저장소가 아니라 사용자 폴더에 둔다. 바탕화면 아이콘이 안 바뀌어 보이면 윈도우 아이콘 캐시 탓 — F5

## 외부에서 말 시키기

앱은 `127.0.0.1:45678` 에만 바인딩된 작은 HTTP 서버를 연다. 빌드 스크립트든
에디터 훅이든, 뭐든 캐릭터에게 말을 시킬 수 있다.

```bash
npm run say -- "빌드 끝났어" happy
npm run say -- "테스트 실패" alert 8000

curl -X POST http://127.0.0.1:45678/say \
  -H "Content-Type: application/json; charset=utf-8" \
  -d '{"text":"배포 완료","mood":"happy"}'
```

`mood` 는 `normal` / `happy` / `alert` 이고 말풍선 색과 캐릭터 반응 동작이 달라진다.
앱이 꺼져 있으면 `tools/say.js` 는 **조용히 무시한다** — 훅에서 불려도 실패하지 않는다.

### 할 일 · 메모 받기 (/todo · /note)

다른 Claude 세션 · 스크립트가 할 일과 스티커 메모를 넣는 입구 (`main.js` `addFromOutside`, `deskpet.ps1 todo · note`).

```bash
curl -s -X POST http://127.0.0.1:45678/todo -H "Content-Type: application/json; charset=utf-8" \
  --data-binary '{"text":"제목\n설명 줄","date":"tomorrow","due":"15:00","category":"개인"}'
curl -s -X POST http://127.0.0.1:45678/note -H "Content-Type: application/json; charset=utf-8" --data-binary '{"text":"메모","color":"blue"}'
```

- todo: `text`(여러 줄이면 첫 줄 제목) · `detail` · `date`(today · tomorrow · 오늘 · 내일 · YYYY-MM-DD · MM-DD) · `backlog` · `category` ·
  `due`(HH:MM · MM-DD [HH:MM] · YYYY-MM-DD [HH:MM]) · `repeat`(매일 · 평일 · 주말 · 매주 월,수 · 매월 1일 [HH:MM]).
  응답 `{ ok, where, title }` — 잘못된 날짜 · 규칙은 `{ ok: false, error }` (400)
- note: `text` · `color`(yellow · pink · green · blue · gray)
- **JSON POST 만, `Origin` 헤더가 있으면 403** — 열어 둔 웹페이지가 `fetch('http://127.0.0.1:45678/todo')` 로 몰래 넣지 못하게.
  (브라우저가 다른 출처로 `application/json` 을 보내려면 먼저 OPTIONS 로 허락을 묻는데 우리는 답하지 않고, text/plain 은 거절한다)
- `deskpet.ps1 todo · note` 는 결과를 UTF-8 로 찍는다 (Git Bash · Claude Code 에서 한글이 안 깨지게). 앱이 꺼져 있으면 종료 코드 3
- 다른 세션이 알게 하려면 전역 `~/.claude/CLAUDE.md` 에 명령 예시와 "안 되면 todo.md 직접 수정" 을 적어 둔다 (프로젝트별 메모리는 그 폴더 세션에서만 보인다)

### 물어보기 (ask.js)

팔레트 "물어보기" 탭 → `claude -p --output-format json --tools "" --no-session-persistence --settings {"disableAllHooks":true}`, 질문은 stdin.

- 실행 파일은 `%APPDATA%\npm\node_modules\@anthropic-ai\claude-code\bin\claude.exe` → `~/.local/bin` → `where claude` 순으로 찾고
  셸 없이 실행한다 (`.cmd` 를 셸로 돌리면 따옴표 · 한글 처리가 꼬인다)
- `--bare` 는 훅까지 끄지만 API 키가 있어야 해서 안 쓴다. 훅은 `disableAllHooks` 로 꺼서 우리 앱이 이 실행을 "Claude 끝났어" 로 알리지 않는다
- 한 번에 하나, 3분 넘으면 그만둔다. 묻기는 바로 돌아오고, 답은 `pet:say`(source "Claude 물어보기", `ask: id`) 카드 →
  누르면 `palette.open('ask:<id>')` 로 그 답을 펼친다. 팔레트가 포커스가 없으면 윈도우 알림도
- 기록은 `ask-history.json` 최근 30개, 질문 · 답 내용은 로그에 남기지 않는다. 모델은 설정 `askModel` ('' · sonnet · haiku)

### Claude Code 훅 동작 방식

- 동작 방식: 훅 명령은 `powershell -File "%APPDATA%/deskpet/deskpet-claude-hook.ps1"` 한 줄이다.
  스크립트가 Claude Code 가 주는 JSON 을 **바이트 그대로** `127.0.0.1:45678/claude` 로 넘기고,
  무슨 말을 할지는 앱이 정한다
  - Node 가 없는 PC 에서도 된다 (윈도우 기본 PowerShell)
  - 명령줄에 한글이 없어서 CP949 로 깨질 일이 없다
  - 앱이 꺼져 있으면 1초 안에 조용히 끝난다 (연결부터 0.3초만 확인) — Claude Code 를 막지 않는다
- 다른 훅은 건드리지 않는다. 쓰기 전에 `settings.json.deskpet-bak` 으로 백업한다.
  명령에 `deskpet` 이 들어간 훅을 우리 것으로 보므로 예전 방식(`node .../deskpet/tools/say.js`)도 연결할 때 새 방식으로 바뀐다
- 캐릭터마다 대사를 바꾸려면 `character.json` 에
  `"claude": { "done": [...], "long": ["{m}분 걸렸어"], "sleepy": [...], "fail": [...], "permission": [...], "waiting": [...], "noWindow": [...] }`
  (마리나 · 사마리는 레시피에 들어 있다)

## 가볍게 — 측정

```bash
node tools/measure.js                    # dev — 메모리(프로세스별) · CPU% , 결과 dist/measure/
node tools/measure.js --exe <exe 경로>   # exe — exe 크기 · 풀린 크기도
DESKPET_FPS=12 node tools/measure.js     # 프레임 고정 (박자별 CPU 비교)
DESKPET_GPU=on node tools/measure.js     # GPU 켜고 / 끄고
```

- 창이 모니터 전체 크기라 한 프레임마다 화면 전체를 다시 합성한다 → **프레임 수가 곧 CPU** 다
- 박자는 상태에 따라 바뀐다 (`renderer/pet.js` 의 `FPS_TIERS`). 설정 창의 **움직임** 이 세 가지 중 하나를 고른다

| 움직임 | 가만히 | 걷기 | 빠른 동작 · 끌기 | 모두 잠 |
|---|---|---|---|---|
| 가볍게 | 8 | 20 | 30 | 4 |
| 보통 (기본) | 12 | 30 | 40 | 6 |
| 부드럽게 | 20 | 40 | 50 | 8 |

- 파츠 · Spine 캐릭터는 부드러운 동작이라 최소 30
- 1차 결과(둘이 가만히, GPU 끔): CPU 한 코어의 19.9% → 약 10%, 전용 메모리 253 → 135MB, exe 102 → 94.5MB. 자세한 표는 [ROADMAP](ROADMAP.md)

