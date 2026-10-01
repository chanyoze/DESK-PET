# DeskPet

바탕화면을 돌아다니는 데스크톱 마스코트 + 개인 작업 도우미. **Windows 10/11 · macOS**.

작업 표시줄을 걸어다니고, 앉고, 자고, 가끔 말을 건다. 드래그해서 던질 수도 있다.
여기에 **Claude Code 알림 · 할 일(정각 recap) · 스티커 메모 · 빌드/서버 알림 · 자동 업데이트**를 붙였다.
기능 전체는 아래 [기능 한눈에](#기능-한눈에) 참고.

## 다운로드

### **[→ chanyoze.github.io/DESK-PET](https://chanyoze.github.io/DESK-PET/)**

또는 [Releases](../../releases) 에서 바로 받기

| | 파일 | 설치 |
|---|---|---|
| 윈도우 | `DeskPet-x.y.z.exe` (릴리스 `v버전`) | 없음 — 받아서 그냥 실행 |
| 맥 | `DeskPet-mac-x.y.z.zip` (프리릴리스 `mac-v버전`, 애플 실리콘 · 인텔) | 풀어서 응용 프로그램 폴더로 옮긴 뒤 터미널에서 한 번 `xattr -cr /Applications/DeskPet.app` |

> 윈도우는 처음 실행하면 SmartScreen 경고가 뜬다 (코드 서명 인증서가 없어서). **추가 정보 → 실행**.
>
> **한 번 받으면 그다음부터는 앱이 새 버전을 알려 준다** — "업데이트할까?" 에 예를 누르면 받아서 바꿔 끼우고 다시 켜진다.
> 캐릭터 · 설정 · 할 일은 그대로 남는다. 자세한 건 [업데이트](#업데이트--버전-올려-푸시하면-쓰는-사람에게-알림).

### 조작

| | |
|---|---|
| 캐릭터 **좌클릭** | 메뉴 (캐릭터 · 크기 · 동작 · 할 일 · Claude Code · 커서 놀이 · 자동 시작 · 종료) — 설정 묶음은 제목을 눌러 펼친다, 빈 곳을 누르면 닫힌다 |
| 캐릭터 **드래그** | 집어서 던지기 |
| 말풍선 클릭 | 넘기기 (알림 카드는 그 터미널로 · 업데이트 카드는 업데이트 창) |
| 머리 위 `🔔 N` 배지 | 놓친 알림 목록 |
| 할 일 카드 · 메모 | 머리줄 끌어 옮기기, 오른쪽 아래 모서리로 크기 조절, `✎` 수정 · `×` 지우기 |
| 트레이(맥은 메뉴바) 아이콘 | 같은 메뉴 + 할 일 추가 · 정리 · 메모 숨기기 · 업데이트 확인 |

끄려면 메뉴 → **종료**.

## 기능 한눈에

| 묶음 | 기능 | 자세히 |
|---|---|---|
| **캐릭터** | 투명 · 항상 위 · 클릭 통과 창에서 걷기 · 달리기 · 앉기 · 잠 · 벽 타기 · 던지기, 혼잣말(시간대 · 상태별), 반응 대사 | [애니메이션 활용](#애니메이션-활용) |
| | 그리는 방식 셋 — 자체 파츠 리그 · Spine 3.8 · 스프라이트 시트(RPG Maker · 불가사의 던전) | [캐릭터 — 코드는 공개, 에셋은 각자](#캐릭터--코드는-공개-에셋은-각자-byoa) |
| | 둘이 같이 다니기 · 껴안기 · 둘의 대화, 분위기(가볍게 / 원작처럼), 무장 모드 | |
| | 모니터 고르기, 크기 셋, 커서 쳐다보기 · 쫓아오기 · 도망가기 | [커서 놀이](#커서-놀이) |
| **Claude Code** | 메뉴 한 번으로 훅 연결 — 끝남 · 허락 필요(커서 쪽으로 달려옴) · 입력 대기 · 오류(쓰러짐) | [Claude Code 연동](#claude-code-연동) |
| | 세션 현황(작업 중 N분째 …), 알림을 누르면 그 터미널 창으로, 일하는 동안 앉아 기다리다 졸기 | |
| **알림** | 대화 말풍선과 구분되는 알림 카드(출처 · 시각 · 색 띠), 놓친 알림 배지 · 트레이 빨간 점, 윈도우 알림(급한 것만) | [알림 — 대화와 구분](#알림--대화와-구분) |
| **할 일** | `todo.md` 하나 — 일자별 · 분류(직접 등록) · 언젠가(백로그) · 기한 · 설명. 메모장 · Claude Code 로 고쳐도 된다 | [할 일 · 스티커 메모](#할-일--스티커-메모) |
| | 할 일 카드(날짜 넘기기 · 밀린 것 · 기한 칩 · 바로 수정/삭제), 정각 recap + 캐릭터 말투 재촉, 기한 10분 전 알림 | |
| **메모** | 화면에 붙는 스티커 메모 (색 다섯, 접기 · 크기 조절 · 숨기기) | |
| **빌드 · 서버** | `deskpet.ps1` — 명령 끝나면 성공/실패 + 걸린 시간, 톰캣 · 스프링 부트 기동 로그 감시 | [빌드 · 서버 알림](#빌드--서버-알림-deskpetps1) |
| | `/say` HTTP 로 무엇이든 캐릭터에게 말 시키기 | [외부에서 말 시키기](#외부에서-말-시키기) |
| **배포** | 버전 올려 푸시 → 윈도우 · 맥 릴리스 자동 → 앱이 알림 · 자동 교체 | [업데이트](#업데이트--버전-올려-푸시하면-쓰는-사람에게-알림) |
| | 개인 빌드(뽑아 둔 캐릭터를 넣은 exe), 맥 통파일(지인 전달용) | [개인 빌드](#개인-빌드-뽑아-둔-캐릭터를-exe에-넣기) · [맥](#맥-macos) |
| **기타** | 윈도우 시작 시 실행, 리마인더(5 · 25 · 60분), 설정 저장, 해상도 · 작업 표시줄 변화 대응, 중복 실행 방지 | [설정](#설정) |

> 윈도우 전용: Claude Code 훅 · 그 터미널로 가기 · `deskpet.ps1` (PowerShell 기반). 맥은 아직 이 셋이 없다.

## 캐릭터 추가하기

기본으로 자체 제작 캐릭터 하나가 들어 있다. 다른 캐릭터를 쓰려면
Spine 2D 스켈레톤(`.skel` + `.atlas` + `.png`)을 아래 폴더에 넣으면 된다.

```
%APPDATA%\deskpet\characters\<원하는이름>\
   character.json
   foo.skel
   foo.atlas
   foo.png
```

Spine 런타임도 한 번 받아야 한다 (라이선스 때문에 앱에 동봉하지 않는다).

```
%APPDATA%\deskpet\vendor\spine\spine-webgl.js
```

`https://raw.githubusercontent.com/EsotericSoftware/spine-runtimes/3.8/spine-ts/build/spine-webgl.js`
에서 받아 위 경로에 저장하면 된다. **3.8 브랜치여야 한다.**

**에셋은 각자 준비한다.** 이 저장소에도, 배포 파일에도 캐릭터 에셋은 들어있지 않다.

## 개발자용 실행

```bash
npm install
npm start            # 실행
npm run dev          # 개발자 도구를 띄운 채
npm run fetch-spine  # Spine 런타임 받기
npm run dist         # 포터블 exe 빌드 → dist/
npm run icon         # 트레이 아이콘 재생성
```

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

**모니터 고르기** — 모니터가 여럿이면 메뉴(캐릭터 클릭 또는 트레이)의 **모니터**에서 돌아다닐 모니터를
고른다. 왼쪽부터 번호가 붙고 모델 이름·해상도가 함께 나온다. "지금 마우스가 있는 모니터로"를 누르면
헷갈릴 일이 없다. 고른 모니터가 빠지면 주 모니터로 돌아간다.

**분위기** — 메뉴의 **분위기**에서 "가볍게 / 원작처럼". 매니페스트에 `linesDark` · `dialoguesDark` 가 있는
캐릭터만 달라진다. 원작처럼일 때 매니페스트 `animations` 의 `nightmare`(새벽에 드물게) · `down`(세게 던지면
가끔) · `bloodcast` + `teleport`(붉은 호 순간이동)가 쓰인다.

**캐릭터 숨기기** — `character.json` 에 `"hidden": true` 를 넣으면 지우지 않고 목록에서만 뺀다.

**대사** — `lines` 는 상태별 혼잣말 외에 반응(`picked` `thrown` `landed` `petted` `woken`),
`together`, `armed:<모드>` 를 받는다. `dialogues` 를 주면 둘이 같이 있을 때 대화를 주고받는다.
자세한 건 [docs/TERMINA-CHARACTERS.md](docs/TERMINA-CHARACTERS.md) 의 "대사 구조".

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
[docs/TERMINA-PROBE.md](docs/TERMINA-PROBE.md).

### 화질

게임에서 뽑은 아트는 대개 데스크톱 펫으로 쓰기엔 크게 그려져 있다. 작게 줄여 그리면
축소 앨리어싱이 생기므로 세 가지를 쓴다.

- **WebGL2 + 밉맵** — 아틀라스가 624×624처럼 2의 거듭제곱이 아니면 WebGL1에서는
  밉맵을 못 만든다. 밉맵 없이 축소하면 픽셀 하나가 텍셀 13×13 영역을 2×2로만
  샘플링해서 심하게 깨진다
- **이방성 필터링** (있으면 8x)
- **슈퍼샘플링** — `supersample` 배율만큼 크게 그린 뒤 브라우저가 줄인다 (기본 2)

그래도 원본 해상도가 상한이다. `height`를 원본이 감당하는 크기에 가깝게 잡을수록
선명하다. 트레이 → **크기** 에서 바꿔 보고 정하면 된다.

## 구조

```
src/
  main.js                  Electron 메인 — 창 · 트레이 · 모니터 · 캐릭터 로드 · 리마인더 · Claude 이벤트 · 할 일 · 알림 · 업데이트
  settings.js              설정 저장 (userData/settings.json)
  notify-server.js         127.0.0.1 전용 알림 서버 — 외부에서 말 시키기 (/say, /claude, /claude-window)
  claude-hooks.js          ~/.claude/settings.json 에 우리 훅 넣고 빼기 + 훅 스크립트 (electron 없이 시험 가능)
  ps-scripts.js            userData 에 쓰는 PowerShell 스크립트 — 창 앞으로 가져오기 · deskpet.ps1 명령줄 도구
  notes-store.js           todo.md(일자별 · 분류 · 언젠가 · 기한 · 설명) 읽고 쓰기 · notes.json (electron 없이 시험 가능)
  editor-window.js         글 입력 창 (투명 창은 글자를 못 받아서 따로 띄운다) — preload-editor.js
  updater.js               GitHub Releases 확인 · 받기 · sha256 확인 · 바꿔 끼우기 (윈도우 포터블 · 맥 .app)
  pmd.js                   불가사의 던전 스프라이트(SpriteCollab) 가져오기 — 레시피 → 캐릭터 폴더
  preload.js               contextBridge (petAPI)
  renderer/
    index.html
    style.css              배경은 반드시 transparent
    pet.js                 상태머신 · 물리 · 마우스 · 렌더 루프 · 메뉴 · Claude 반응 · recap · 놓친 알림 · 커서 놀이
    notes.js               화면 카드 — 할 일 카드(날짜별) · 스티커 메모 (끌기 · 크기 · 접기)
    editor.html            입력 창 화면 (할 일: 날짜 · 언젠가 · 분류 · 기한 / 메모: 색)
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

## 포켓몬 (불가사의 던전 스타일 스프라이트)

[PMDCollab SpriteCollab](https://github.com/PMDCollab/SpriteCollab) 의 팬 스프라이트로 포켓몬 캐릭터를 만든다.
동작마다 시트와 `AnimData.xml`(칸 크기 · 프레임 시간)이 있어서, 레시피엔 "펫 상태 → 동작 · 방향 줄"만 적으면 된다.

```bash
node tools/pmd-import.js tools/recipes/pokemon/herdier.json      # 하데리어 (#0507)
```

- 방향 줄: `0` 아래 · `1` 오른쪽 아래 · `2` 오른쪽 · `3` 오른쪽 위 · `4` 위 · `5` 왼쪽 위 · `6` 왼쪽 · `7` 왼쪽 아래
- 레시피 `clips` 의 `{ "anim": "Walk", "left": 6, "right": 2 }` 가 칸 목록 + `frameMs` 로 펼쳐진다. `speed` 로 빠르게
- 키는 대기 칸의 실제 그림 높이 × `scale`(기본 3). 도트는 `smoothing: false` 로 픽셀 그대로
- 다른 포켓몬은 `dex`(도감 번호)만 바꾼 레시피를 만들면 된다. 동작 이름은 [뷰어](https://sprites.pmdcollab.org/)에서 확인
- **라이선스**: 스프라이트는 CC BY-NC 4.0 (비상업 · 크레딧). 캐릭터 폴더에 `CREDITS.txt` 가 같이 생긴다.
  포켓몬은 닌텐도 · 게임프리크 · 포켓몬 컴퍼니 IP — 개인용으로만 쓰고 배포하지 않는다

## 맥 (macOS)

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

## 업데이트 — 버전 올려 푸시하면 쓰는 사람에게 알림

**배포하는 쪽** — ① `src/whatsnew.json` 에 새 버전 요약을 몇 줄 적고 ② `package.json` 의 `version` 을 올려
main 에 푸시하면 끝이다 (`.github/workflows/release.yml`).

- `whatsnew.json` 의 요약은 세 군데에 같은 말로 나간다 — 릴리스 노트 맨 위 · 앱의 업데이트 확인 창 ·
  **업데이트 뒤 처음 켤 때 뜨는 "새로 바뀐 것" 창**. 커밋 제목이 아니라 쓰는 사람 말로 짧게

| | 만들어지는 것 | 릴리스 |
|---|---|---|
| 윈도우 | 그림 없는 포터블 exe `DeskPet-버전.exe` | `v버전` (최신), 노트는 지난 버전 이후 커밋 제목 |
| 맥 | `mac.yml` 을 불러 universal zip `DeskPet-mac-버전.zip` | `mac-v버전` (프리릴리스) |

그 버전 릴리스가 이미 있으면 건너뛴다. **`"version"` 값이 실제로 바뀐 푸시일 때만** 돈다 — `package.json` 의 다른 설정만 고친 커밋은
아무 일도 안 한다. 버전은 굵직한 기능을 모아서만 올린다 (올리면 쓰는 사람 모두에게 업데이트 알림이 간다).

**쓰는 쪽** — 앱이 켤 때 1분 뒤 · 그 뒤 3시간마다 릴리스를 본다. 새 버전이 있으면

1. 알림 카드(청록 띠) + 윈도우 알림 — "새 버전 v0.16.0 — 눌러서 업데이트". 메뉴 맨 위 · 트레이에도 `⬆ 업데이트`
2. 누르면 확인 창 — **지금 업데이트 / 나중에 / 이 버전 건너뛰기** (릴리스 노트가 같이 보인다)
3. 지금 업데이트 → 받기 (카드에 % 표시) → **sha256 확인** (깨진 파일이면 설치 안 함) → 바꿔 끼우고 다시 켜진다
   - 윈도우 포터블: 새 exe 를 옛 exe 옆에 받고, 옛 앱이 꺼진 뒤 새 exe 가 뜨고, 옛 exe 는 지워진다.
     자동 시작이 켜져 있었으면 새 경로로 옮겨 건다
   - 맥: zip 을 풀어 지금 `.app` 자리에 바꿔 넣고 다시 연다 (못 바꾸는 자리면 Finder 로 새 앱을 보여 준다)
4. 새 앱이 "v0.15.0 → v0.16.0 업데이트했어" 라고 알려 주고, **"새로 바뀐 것" 창**에 그 사이 버전들의 요약을 보여 준다
   - 손으로 exe 를 바꿔 끼워도 같다 — 지난번 실행 버전(설정 `lastVersion`)보다 올라갔으면 처음 켤 때 한 번.
     처음 설치하면 띄우지 않는다. 메뉴 · 트레이 "새로 바뀐 것 보기" 로 다시 볼 수 있다

- **캐릭터 · 설정 · 할 일은 그대로다** — 전부 `%APPDATA%\deskpet` (맥 `~/Library/Application Support/deskpet`) 에 있고 앱만 바뀐다.
  개인 빌드(그림 들어간 exe)에서 업데이트해도 공개판으로 바뀌지만 캐릭터는 그 폴더에서 계속 읽는다
- 트레이 "업데이트 확인" 으로 바로 볼 수 있다
- 시험용: `DESKPET_UPDATE_FEED`(릴리스 목록 주소) · `DESKPET_USERDATA`(설정 폴더) 환경 변수, `--update-now`(확인 창 없이 바로 설치)

## 개인 빌드 (뽑아 둔 캐릭터를 exe에 넣기)

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

### Claude Code 연동

캐릭터 좌클릭 메뉴 → **Claude Code → 알림 연결하기** 한 번이면 끝이다.
`~/.claude/settings.json` 에 훅이 들어가고, 실행 중인 Claude Code 세션에도 바로 적용된다.

| Claude Code 에서 | 캐릭터 |
|---|---|
| 작업이 끝남 (20초 넘게 걸린 턴) | `[프로젝트] 끝났어` — 5분 넘으면 걸린 시간도 말한다 |
| 짧은 대답 (20초 미만) | 조용히 넘긴다 — 터미널을 보고 있을 테니까 |
| 허락이 필요함 (`permission_prompt`) | 커서 쪽으로 달려와서 알려 준다 |
| 입력을 기다림 (`idle_prompt` 등) | `네 대답 기다리고 있어` |
| 오류로 끊김 (`StopFailure`) | 쓰러졌다 일어난다 (쓰러지는 동작이 있는 캐릭터) |
| 일하는 중 | 주인공이 멀리 안 가고 앉아서 기다린다. 3분 넘으면 꾸벅꾸벅 졸다가, 끝나면 깨서 알려 준다 |

- **세션 현황** — 메뉴의 "Claude 세션" 에 떠 있는 세션이 최근 소식 순으로 나온다 (`DESK-PET · 작업 중 3분째`, `허락 기다림 30초 전` …)
- **그 창으로 가기** — Claude 말풍선(점선 밑줄)이나 세션 항목을 누르면 그 세션의 터미널 창이 앞으로 온다 (↗ 표시가 창을 찾아 둔 세션)
  - 세션마다 처음 한 번만, 훅이 자기 조상 프로세스를 따라 올라가 창(Windows Terminal · VS Code · 콘솔)을 찾아 둔다 (약 0.6초)
  - Windows Terminal 은 창 단위라 탭이 여러 개면 창만 앞으로 온다

- 메뉴의 **알림 말하기** 로 연결은 둔 채 말만 끌 수 있고, **연결 끊기** 는 우리 훅만 뺀다
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

### 빌드 · 서버 알림 (`deskpet.ps1`)

앱이 켜질 때 `%APPDATA%\deskpet\deskpet.ps1` 을 만들어 둔다. Node 없이 PowerShell 만으로 캐릭터에게 말을 시킨다.

```powershell
$pet = "$env:APPDATA\deskpet\deskpet.ps1"
& $pet say "점심 먹자" -Mood happy                      # 그냥 말 시키기 (normal | happy | alert | fail)
& $pet run "mvn -q package" -Name 빌드                  # 끝나면 성공/실패 + 걸린 시간. 종료 코드는 그대로 돌려준다
& $pet watch C:\tomcat\logs\catalina.out -Name 톰캣    # 기동 완료/실패 줄이 나오면 알려 주고 끝난다
```

- `watch` 기본값은 톰캣 · 스프링 부트 기동 메시지다. 다른 로그는 `-Ok 정규식` `-Fail 정규식` 으로 바꾼다
- 실패(`fail`)면 말풍선이 빨갛고 캐릭터가 쓰러진다 (쓰러지는 동작이 있는 캐릭터)
- `run` 의 명령은 따옴표로 한 덩어리로 넘긴다 (`-q` 같은 옵션을 PowerShell 이 가로채지 않게)

## 알림 — 대화와 구분

| | 대화 (혼잣말 · 반응 · recap) | 알림 카드 (Claude · 기한 · 빌드) |
|---|---|---|
| 모양 | 흰 둥근 말풍선 | 어두운 카드 + 왼쪽 색 띠, 윗줄 `Claude · 프로젝트 · 15:42`, 아래 작은 글씨로 캐릭터 한마디 |
| 색 띠 | — | 끝남 초록 · 허락 주황 · 입력 대기 노랑 · 오류 빨강 · 기한 파랑 |
| 누르면 | 넘기기 | 그 세션의 터미널로 (↗ 표시) |

- **놓친 알림** — 카드가 사라져도 남는다. 주인공 머리 위 빨간 배지 `🔔 N` + **트레이 아이콘 빨간 점**.
  배지를 누르면 최근 알림 목록 (누르면 그 터미널로), 열면 모두 읽음. 메뉴 Claude Code → "최근 알림 보기"
- **윈도우 알림 (토스트)** — 메인 모니터 오른쪽 아래, 알림 센터에 남는다. **급한 것만**: Claude 허락 요청 · 오류,
  할 일 기한, 빌드 실패. 작업 끝남은 말풍선만 (잦아서). 메뉴 Claude Code → "윈도우 알림" 으로 끄고 켠다
- 작업 표시줄 깜빡임은 안 된다 — 작업 표시줄 버튼이 없는 창이라서. 트레이 빨간 점이 그 역할
- 외부에서 카드로 띄우려면 `/say` 에 `source` (출처 이름) · `level` (done · fail · due · build · info) 를 같이 보낸다.
  `deskpet.ps1 run` · `watch` 는 알아서 카드로 보낸다

## 할 일 · 스티커 메모

### 할 일 — `%APPDATA%\deskpet\todo.md`

평범한 마크다운 체크리스트다. **어디서 고쳐도 된다** — 할 일 카드, 메뉴의 "할 일 추가…", 메모장 · VS Code,
그리고 **Claude Code 세션에서 "todo 에 ○○ 추가해줘" / "○○ 끝났다고 체크해줘"**. 앱은 파일이 바뀌면 바로 다시 읽는다.

```markdown
# 할 일

## 2026-09-30              ← 날짜 (일자별)
- [ ] 분류 없는 일
### 오전                    ← 분류 (이름 자유 — 오전 · 오후 · 3시 전까지 · 회의 …)
- [ ] 승인모듈 검토 (~11:00)  ← 기한: (~시각) · (~10-01) · (~10-01 15:00)
### 3시 전까지
- [ ] 톰캣 로그 확인
- [x] 문서 정리

## 2026-10-01
- [ ] 회의 자료

## 언젠가                   ← 기약 없는 백로그 ("백로그" 라고 써도 된다)
- [ ] 개발표준 다시 읽기
```

- **설명** — 항목 바로 아래 **두 칸 들여쓴 줄**은 그 항목의 설명이다. 입력 창에선 첫 줄이 할 일, 다음 줄부터 설명
  (여러 개를 한꺼번에 넣을 땐 "줄마다 따로" 체크). 카드엔 제목 아래 작은 글씨로
- **카드에서 바로 수정 · 삭제** — 줄에 마우스를 올리면 `✎` 수정 · `×` 지우기(두 번 눌러야), 글 더블클릭도 수정.
  체크는 체크박스로만 (글을 눌러 실수로 체크되지 않게)
- **분류는 직접 등록한다** — 입력 창의 분류 칸에 이름을 쓰고 `+ 등록` 하면 버튼으로 남는다 (마우스를 올려 `×` 로 빼기,
  이미 적힌 할 일은 그대로). 처음엔 예시로 오전 · 오후 · 3시 전까지 · 퇴근 전. 버튼에 없는 이름도 칸에 그냥 쓰면 된다
- **분류 이름에 시각이 있으면 그게 기한**이 된다 (항목에 따로 안 적었을 때): 오전 → 12:00, 오후 → 18:00, "3시 전까지" · "15시 전" → 15:00
- **기한 알림** — 시각이 있는 기한은 10분 전과 그 시각에 한 번씩 알려 준다 (근무 시간과 상관없이)
- 날짜 제목 없이 맨 위에 적힌 항목은 언젠가(백로그)로 본다 — 예전 평평한 목록도 그대로 읽힌다
- 앱이 고치는 건 항목 줄과, 넣을 때 필요한 날짜 · 분류 제목뿐이다. 다른 줄은 그대로 둔다
- **정각 recap** — 평일 9~18시, 정각마다 주인공이 남은 할 일을 말해 준다 (5개까지, 나머지는 "+N개 더").
  메뉴 **정각 알림** 에서 끄기 / 30분 / 1시간 / 2시간. "지금 정리해줘" 로 바로 부를 수도 있다
  - 할 일이 하나도 없으면 정각엔 조용히 넘긴다. 다 끝냈으면 오늘 끝낸 개수를 말한다
  - Claude 알림이 오면 떠 있던 recap 말풍선은 양보한다
- PC 마다 따로다 (동기화하지 않는다) — 회사 할 일이 공개 저장소에 올라가지 않게 일부러 userData 에 뒀다

### 화면 카드

- **할 일 카드** (오른쪽 위) — 기본은 **오늘**. `◀ ▶` 로 날짜를 넘기고 `언젠가` 로 백로그, 제목을 누르면 오늘로.
  오늘 보기 맨 위엔 지난 날짜에서 **밀린 것**. 분류별로 묶고, 기한 칩은 지나면 빨강 · 1시간 안이면 주황.
  체크박스로 바로 체크, `+` 로 추가 (입력 창에 날짜 · 언젠가 · 분류 · 기한 칸), `‒` 접기, `×` 닫기 (메뉴 "할 일 카드 보이기" 로 다시)
- **recap 대상** — 오늘 안 끝낸 일 + 밀린 일. 기한 지난 것 · 가까운 것부터 (`~15:00 (2시간 반 남음)` · `(지남)`).
  언젠가는 "지금 정리해줘" 때 개수만
- **재촉 한마디** — 목록 끝에 가장 급한 일 하나를 캐릭터 말투로: 4시간 안이면
  "톰캣 로그 확인은 2시간 반 안에 끝내야 해. 부지런히 해!", 지났으면 "…벌써 기한 지났어". 매니페스트 `recap.urgent` · `recap.over`
- 카드 · 메모는 **오른쪽 아래 모서리를 끌어 크기 조절** (저장된다)
- **스티커 메모** — 메뉴 "메모 붙이기…" → 입력 창에서 쓰고 색(노랑 · 분홍 · 초록 · 파랑 · 회색) 고르기.
  더블클릭 · `✎` 편집, `×` 두 번 눌러 지우기. `%APPDATA%\deskpet\notes.json`
- 머리줄을 끌어 옮긴다 (위치 저장). 캐릭터가 카드 위에 있으면 캐릭터가 먼저 잡힌다
- **메모 · 카드 숨기기** — 메뉴와 트레이 둘 다 있다 (화면 공유 · 회의 때)
- 글자는 투명 창이 못 받아서 작은 **입력 창**(Ctrl+Enter 저장, Esc 취소)을 캐릭터가 있는 모니터에 띄운다

## 커서 놀이

- 가만히 있을 때 커서가 가까이 오면 그쪽을 쳐다본다 (늘 켜짐)
- 메뉴 **커서** — 신경 안 쓰기 / **쫓아오기** (멀어지면 달려와서 옆에 선다, 동료는 조금 떨어져서) / **도망가기** (가까이 가면 달아난다, 벽에 몰리면 커서 밑으로 빠져나간다)
- 드래그 · 메뉴 · 껴안기 · 대화 중엔 쉰다

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

## 설정

`app.getPath('userData')/settings.json` 에 저장된다.

```json
{ "character": "mudrock", "companion": null, "display": null, "sizeScale": 1, "reminders": [], "notifyPort": 45678, "speakOnClaude": true }
```

**GPU** — `"gpu": "auto"`(기본)면 주인공 · 동료 중 Spine 캐릭터가 있을 때만 하드웨어 가속을 켠다. 스프라이트 · 파츠는
2D 캔버스라 끄는 편이 가볍다 (전용 메모리 약 −80MB). `"on"` · `"off"` 로 고정할 수 있고, 바꾸면 다시 켜야 적용된다.

**윈도우 시작할 때 실행** 은 메뉴에서 켠다 (exe 로 실행했을 때만 보인다). 포터블 exe 는 실행할 때마다
임시 폴더에 풀리므로 그 경로가 아니라 원래 exe 경로(`PORTABLE_EXECUTABLE_FILE`)를 등록한다.
exe 를 다른 곳으로 옮기면 한 번 껐다 다시 켤 것.

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

## 로드맵

[docs/ROADMAP.md](docs/ROADMAP.md) 참고.

**가볍게 만들기** — 1단계(Electron 안에서) 1차 완료: 가만히 둔 상태 CPU 한 코어의 **19.9% → 6.3%**, 전용 메모리 **253 → 135MB**,
exe **102 → 94.5MB** (프레임 조절 · GPU 끄기 · 스프라이트 원본 버리기 · 언어 파일 빼기, 측정은 `tools/measure.js`).
2단계는 Tauri(시스템 웹뷰)로 옮기는 것을 검토한다. 업데이트 기능이 있으니 바뀐 판은 쓰는 사람 모두에게 알림으로 간다.

## 라이선스

MIT (코드). 기본 캐릭터의 디자인은 자체 제작물이다.

저장소에 포함되지 않는 것: Spine 런타임(Esoteric Software 라이선스),
사용자가 직접 준비하는 캐릭터 에셋.
