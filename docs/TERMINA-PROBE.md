# Fear & Hunger 2: Termina 캐릭터 조사

**2026-09-24 조사. 결론: ✅ 쓸 수 있다. Spine이 아니라 스프라이트 시트라 `sprite` 렌더러를 새로 만들었다. 사마리는 모드 그림까지 쓴다.**

데스크톱 마스코트 캐릭터 소스로 테르미나 SD를 쓸 수 있는지 조사한 기록이다.
에셋은 이 저장소에 **절대 포함하지 않는다.** 저장소에는 "어느 파일의 어느 칸"을 적은
레시피만 있고, 그림은 각자 설치한 게임에서 꺼낸다.

---

## 게임 구조

| | |
|---|---|
| 엔진 | **RPG Maker MV 1.6** (`www/js/rpg_core.js`), NW.js |
| 이미지 | `www/img/**` 전부 암호화 (`.rpgmvp` / `.png_`, 둘은 같은 파일) |
| 스켈레톤 | 없음 — Spine·Live2D·DragonBones 흔적 0건. 전부 통짜 프레임 |
| 맵 캐릭터 | `img/characters` 732장, **칸 하나 80×110** (MV 기본 48×48 아님) |

### 암호화

MV 표준 방식이라 풀기 쉽다.

```
[가짜 헤더 16바이트] [원본 PNG 앞 16바이트 XOR 키] [나머지 원본 그대로]
```

키는 `www/data/System.json` 의 `encryptionKey` (16진수 32자리).
`tools/rpgmv-extract.js` 가 이걸 읽어 바로 푼다. 첫 8바이트가 PNG 시그니처인지로 검증한다.

> 이미지 뷰어로 보면 칸 주위에 검은 상자가 보이는데, **투명 픽셀의 RGB 값**이 보이는 것일 뿐
> 알파는 깨끗하다. 분홍 배경에 합성해서 확인했다.

### 시트 규칙

| 파일명 | 구조 |
|---|---|
| `$이름` | 캐릭터 1명. 3열 × 4행 (행: 아래·왼쪽·오른쪽·위) |
| `%이름` | VE_DiagonalMovement 규약. 960×880 = 12열 × 8행. 윗줄 블록: [보행][보행 대각][기어가기][기어가기 대각], 아랫줄은 변형 |
| 접두어 없음 | 8명짜리 시트. 테르미나는 이걸 **포즈 모음**으로 많이 쓴다 (열 = 변형, 행 = 캐릭터) |
| `!이름` | 오브젝트·이펙트 |

칸 크기가 다른 시트도 있다 — `$getting_up*` 은 129×119, 일부 `$` 시트는 96×132.

## 동작 매핑

게임 에셋에는 "대기 모션"이 없다 (RPG Maker는 서 있을 때 한 장). 그래서 렌더러가
발을 붙인 채 세로로 살짝 늘였다 줄이는 **숨쉬기(`bob`)** 를 얹는다.

한 상태에 후보가 여럿이면 들어갈 때마다 랜덤으로 고른다 (`animations` 값이 배열).
무기는 걷다 멈출 때마다 바뀌면 어색해서 **무장 모드**로 뺐다 (메뉴 → 무장).

### 마리나 (`tools/recipes/termina/marina.json`)

| 상태 | 후보 | 시트 · 칸 |
|---|---|---|
| idle | 정면 | `%occultist` (1,0) |
| idle2 | 대각 / 포즈 ① / 포즈 ② | `%occultist` (4,0) · `occultist` 1열·4열 0~3행 |
| walk | 3프레임 | `%occultist` 1행(왼쪽)·2행(오른쪽) |
| run | 12프레임 | `run1` 5행·6행 |
| sit | 다리 뻗고 앉기 | `sleeping1` (6,0) |
| sleep | 무릎 안고 잠 / 누워 있기 / 엎드려 있기 | `sleeping1` (1,1) · `occultist` 9~11열 4행 · `%occultist2` 6~11열 0행 |
| pet | 웅크리기 | `$special_poses8` (1,1)(2,1) |
| fall · drag | 팔 들고 버둥 | `$falling1` 2행 |
| special | 주저앉았다 일어나기 / 변신 | `$getting_up2` 0행 · `$transform_marina1` 12칸 (한 번 재생) |

무장 모드:

| 모드 | 서 있기 | 걷기 | 앉기 |
|---|---|---|---|
| 칼 | `%occultist2` (1,4) | `%occultist2` 5·6행 | `occultist2` 9~11열 0행 |
| 산탄총 | `%occultist3` (1,0) | `%occultist4` 1·2행 12프레임 / `%occultist3` 1·2행 3프레임 | 평소 |
| 권총 | `%occultist3` (1,4) | `%occultist4` 5·6행 12프레임 / `%occultist3` 5·6행 3프레임 | 평소 |

`%occultist3` 은 3프레임 걷기(+대각), `%occultist4` 는 같은 걷기를 12프레임으로 부드럽게 그린 판이다.

### 사마리 (`tools/recipes/termina/samarie.json`)

사마리는 파티원이 아니라 NPC다. 원본 게임에서 사마리 전용 그림은 걷기(`%apprentice` 인덱스 0)와
장면 컷 몇 장뿐이다. `data/Map*.json` 에서 이름에 `samarie` 가 들어간 이벤트들이 쓰는 이미지를
모아서 찾았다.

**Playable Non-Playables – PRHVL NIGHTS** 모드
([nexusmods 49](https://www.nexusmods.com/fearandhunger2termina/mods/49))가 사마리를 플레이어블로
만들면서 **마리나의 동작 세트를 사마리로 다시 그렸다.** 칸 배치가 마리나와 같아서 좌표를 그대로
옮기면 된다. 모드 파일도 원본과 같은 키로 암호화되어 있다. 몇 칸에는 모드 제작자의 낙서가 들어 있다.

| 상태 | 후보 | 시트 · 칸 | 출처 |
|---|---|---|---|
| idle / walk | 정면 / 3프레임 | `%apprentice` 0~2열 | 모드 (원본과 같은 칸) |
| idle2 | 두 손 모으기 / 포즈 ① / 포즈 ② | `$dolls1` 3행 · `apprentice` 1열·4열 | 원본 · 모드 |
| run | **꾸부정하게 달리기** 12프레임 | `run6` 5행·6행 | 모드 |
| sit | 무릎 안고 앉기 / 상자 들기 | `$characters7` 0행 · `apprentice` 6~8열 5행 | 원본 · 모드 |
| sleep | 무릎 안고 잠 / 누워 있기 / 엎드려 있기 | `$characters7` 2행 · `apprentice` 9~11열 4행 · `%apprentice2` 6~11열 0행 | 원본 · 모드 |
| pet | 얼굴 가리기 / 고뇌 | `$characters7` 3행 · `$scenes1` (1,1) | 원본 |
| fall · drag | 팔 들고 버둥 | `$falling3` 2행 | 모드 |
| special | 주저앉았다 일어나기 / 변신 | `$getting_up9` 0행 · `$transform_Samarie1` 12칸 | 모드 |

모드판 `%apprentice` 는 원본 파일을 **덮어쓴다** (원본은 오른쪽 블록이 마리나 사본, 모드는 사마리
기어가기). 그래서 추출 도구는 모드 시트를 원본 폴더가 아니라 `--mod` 폴더에서 읽는다.

아직 안 넣은 것: `$Samarie_duppel` 2행 (사마리가 마리나에게 붙어 있는 장면) — 둘을 같이 띄우는
기능이 생기면 둘이 가까이 있을 때 쓸 예정.

## 피한 것

테르미나는 같은 포즈에 피·절단·석화·기생 변형이 섞여 있다 (`_crab`, `_blood`,
`$special_poses15` 의 피 묻은 마리나 등). 레시피를 짤 때 칸을 **직접 눈으로 보고** 골랐다.
변신만은 요청에 따라 넣었다 (검은 그림자로 변하는 연출, 피는 없다).

## 쓰는 법

```bash
node tools/rpgmv-extract.js "C:/Program Files (x86)/Steam/steamapps/common/Fear & Hunger 2 Termina" tools/recipes/termina/marina.json
node tools/rpgmv-extract.js "<같은 경로>" tools/recipes/termina/samarie.json --mod="<모드 www 폴더>"
```

`%APPDATA%/deskpet/characters/termina-<이름>/` 에 시트와 `character.json` 이 생긴다.
앱 메뉴를 열면 바로 목록에 뜬다.

동작 하나만 확인하려면:

```bash
npx electron . --character=termina-marina --start=clip:transform     # 클립 하나를 계속 재생
npx electron . --character=termina-marina --start=mode:shotgun       # 무장 모드로 걷기
```
