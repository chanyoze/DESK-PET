# Fear & Hunger 2: Termina 캐릭터 조사

**2026-09-24 조사. 결론: ✅ 쓸 수 있다. 단, Spine이 아니라 스프라이트 시트 → `sprite` 렌더러를 새로 만들었다.**

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

### 마리나 (`tools/recipes/termina/marina.json`)

| 상태 | 시트 | 칸 |
|---|---|---|
| idle / idle2 | `%occultist` | 정면 / 정면 대각 |
| walk | `%occultist` | 1행(왼쪽)·2행(오른쪽), 0-1-2-1 |
| sit | `sleeping1` | (6,0) 다리 뻗고 앉기 |
| sleep | `sleeping1` | (1,1) 무릎 안고 잠 — (0,1)은 흐려지는 중, (2,1)은 석상이라 피한다 |
| pet | `$special_poses8` | (1,1)(2,1) 웅크리기 |
| fall · drag | `$falling1` | 2행, 팔 들고 버둥 |
| special | `$getting_up2` | 0행, 주저앉았다 일어나기 |

### 사마리 (`tools/recipes/termina/samarie.json`)

사마리는 파티원이 아니라 NPC다. `data/Map*.json` 에서 이름에 `samarie` 가 들어간
이벤트들이 쓰는 이미지를 모아서 찾았다.

| 상태 | 시트 | 칸 |
|---|---|---|
| idle / walk | `%apprentice` 인덱스 0 | 윗줄 왼쪽 블록만 사마리 (나머지는 마리나 사본) |
| idle2 | `$dolls1` | 3행, 두 손 모으기 |
| sit / sleep | `$characters7` | 0행 / 2행, 무릎 안고 앉기 |
| pet | `$characters7` | 3행, 얼굴 가리기 |
| fall · drag | `%apprentice` | 정면 0·2열을 빠르게 (전용 그림 없음) |

## 피한 것

테르미나는 같은 포즈에 피·절단·석화·기생 변형이 섞여 있다 (`_crab`, `_blood`,
`$special_poses15` 의 피 묻은 마리나 등). 레시피를 짤 때 칸을 **직접 눈으로 보고** 골랐다.

## 쓰는 법

```bash
node tools/rpgmv-extract.js "C:/Program Files (x86)/Steam/steamapps/common/Fear & Hunger 2 Termina" tools/recipes/termina/marina.json
node tools/rpgmv-extract.js "<같은 경로>" tools/recipes/termina/samarie.json
```

`%APPDATA%/deskpet/characters/termina-<이름>/` 에 시트와 `character.json` 이 생긴다.
앱 메뉴를 열면 바로 목록에 뜬다.
