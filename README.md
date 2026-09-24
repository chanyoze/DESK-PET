# DeskPet

바탕화면을 돌아다니는 데스크톱 마스코트. Windows 10/11.

작업 표시줄을 걸어다니고, 앉고, 자고, 가끔 말을 건다. 드래그해서 던질 수도 있다.
빌드가 끝났다거나 할 때 **말풍선으로 알려주는 도우미** 역할도 한다.

## 다운로드

### **[→ chanyoze.github.io/DESK-PET](https://chanyoze.github.io/DESK-PET/)**

또는 [Releases에서 바로 받기](../../releases/latest)

`DeskPet-x.y.z.exe` 하나만 받으면 된다. **설치 필요 없다** — 받아서 그냥 실행.

> 처음 실행하면 Windows SmartScreen이 경고를 띄운다. 코드 서명 인증서가 없어서 그렇다.
> **추가 정보 → 실행**을 누르면 된다.

### 조작

| | |
|---|---|
| 캐릭터 **좌클릭** | 메뉴 (캐릭터 · 크기 · 쓰다듬기 · 리마인더 · 종료) |
| 캐릭터 **드래그** | 집어서 던지기 |
| 말풍선 클릭 | 넘기기 |
| 트레이 아이콘 **우클릭** | 같은 메뉴 |

끄려면 메뉴 → **종료**.

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

## 지금 되는 것 (v0.5)

- 화면 전체를 덮는 **투명 · 프레임 없는 · 항상 위** 오버레이 창
- **클릭 통과** — 커서가 캐릭터 위에 있을 때만 마우스를 받고, 나머지는 아래 창으로 통과
- 클릭해도 작업 중인 창의 **포커스를 뺏지 않음** (`focusable: false`)
- 작업 표시줄 윗변을 바닥선으로 잡고 그 위를 **걸어다님**
- **벽 타기** — 매니페스트에 `climbChance` 를 주면 켜진다 (기본 꺼짐)
- 행동 상태머신: `idle` / `walk` / `sit` / `sleep` / `climb` / `drag` / `fall` / `pet`
- **드래그해서 던지기** — 속도가 실려서 날아가고, 바닥에서 통통 튀고, 벽에서 반사
- **클릭하면 메뉴** — 캐릭터 교체 · 크기 · 쓰다듬기 · 리마인더가 여기 모여 있다
- **말풍선** — 외부 알림과 리마인더를 캐릭터가 말한다
- 설정(캐릭터 · 크기 · 리마인더)이 재시작 후에도 유지된다
- **혼잣말** — 상태·시간대에 맞춰 가끔 말을 건다 (메뉴에서 끌 수 있음)
- 자면 `zzz` 가 떠오름 (자체 파츠 캐릭터)
- 트레이 메뉴: 캐릭터 / 크기 / 가운데로 불러오기 / 깨우기 / 다음 캐릭터 / 종료 (열 때마다 최신 목록)
- 해상도·작업 표시줄 변경 시 바닥선 자동 재계산
- 중복 실행 방지

## 구조

```
src/
  main.js                  Electron 메인 — 창 생성, 클릭 통과 토글, 트레이, 캐릭터 로드, 리마인더
  settings.js              설정 저장 (userData/settings.json)
  notify-server.js         127.0.0.1 전용 알림 서버 — 외부에서 말 시키기
  preload.js               contextBridge (petAPI)
  renderer/
    index.html
    style.css              배경은 반드시 transparent
    pet.js                 상태머신 · 물리 · 마우스 · 렌더 루프 (뷰 종류를 모른다)
    character.js           자체 파츠 리그 — 파츠 정의 · 포즈 · IK · 그리기
    ui.js                  말풍선 · 좌클릭 메뉴
    chatter.js             혼잣말 (상태·시간대별 대사)
    renderers/
      parts-view.js        파츠 리그 뷰 (Canvas 2D)
      spine-view.js        Spine 3.8 뷰 (WebGL)
      sprite-view.js       스프라이트 시트 뷰 (Canvas 2D)
characters/
  default/                 자체 제작 캐릭터 — 저장소에 들어가는 유일한 캐릭터
site/                      GitHub Pages 다운로드 페이지 (파츠 리그 데모 포함)
tools/
  say.js                   알림 서버에 말 보내기 (앱이 꺼져 있으면 조용히 무시)
  fetch-spine.js           Spine 3.8 런타임 받기
  rpgmv-extract.js         RPG Maker MV 게임에서 캐릭터 시트 뽑기 (레시피: tools/recipes/)
  gen-icon.js              의존성 없는 PNG 인코더 (트레이 아이콘 생성)
  ak-scan.js · ab-probe.js · check-pma.js   에셋 조사용 개발 도구
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

### Claude Code 완료 알림

`~/.claude/settings.json` 에 훅을 걸면 클로드가 작업을 마칠 때 캐릭터가 알려준다.

```json
{
  "hooks": {
    "Stop": [
      { "hooks": [{ "type": "command",
        "command": "node \"C:/study/deskpet/tools/say.js\" \"작업 끝났어! 확인해봐\" happy" }] }
    ],
    "Notification": [
      { "hooks": [{ "type": "command",
        "command": "node \"C:/study/deskpet/tools/say.js\" \"뭔가 물어보고 있어\" alert" }] }
    ]
  }
}
```

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
{ "character": "mudrock", "sizeScale": 1, "reminders": [], "notifyPort": 45678 }
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
npx electron . --character=kaltsit    # 특정 캐릭터로 실행
npx electron . --shot=out.png,5000    # 창 내용만 PNG로 저장하고 종료
npx electron . --hitbox               # 클릭 판정 영역을 화면에 표시
```

`--shot` 은 화면 캡처가 아니라 **창 내용만** 찍는다. 다른 창(전체화면 게임 등)에
가려져도 우리가 그린 것만 정확히 확인할 수 있다.

렌더러 콘솔은 항상 터미널로 넘어온다. 투명 창이라 오류를 눈으로 볼 수 없기 때문이다.

## 로드맵

[docs/ROADMAP.md](docs/ROADMAP.md) 참고.

## 라이선스

MIT (코드). 기본 캐릭터의 디자인은 자체 제작물이다.

저장소에 포함되지 않는 것: Spine 런타임(Esoteric Software 라이선스),
사용자가 직접 준비하는 캐릭터 에셋.
