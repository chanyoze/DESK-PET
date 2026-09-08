# 명일방주 에셋 추출 가능성 조사

**2026-09-08 조사. 결론: ✅ 추출 가능. 기지 SD는 Spine 3.8.99.**

이 문서는 데스크톱 마스코트에 쓸 SD 캐릭터 소스로 명일방주 에셋이 실현 가능한지
조사한 기록이다. 조사 목적이며, 에셋은 이 저장소에 **절대 포함하지 않는다.**

---

## 조사 대상

2026-08-13 출시된 **공식 Windows PC 클라이언트** (한국 서버).
에뮬레이터·APK·OBB가 필요 없고 파일이 로컬 디스크에 그대로 있다.

```
C:\YostarGames\Arknights_KR\                     24.15 GB
└─ Arknights_Data\
   ├─ PersistentData\   20.6 GB   10,856 파일   (다운로드된 콘텐츠)
   ├─ StreamingAssets\   2.29 GB   2,702 파일   (동봉 콘텐츠)
   ├─ Plugins\           0.36 GB
   └─ ...
```

`.ab`(Unity AssetBundle) 파일 **13,389개**.

### 번들 구성

```
Bundles/
├─ chararts/     436   오퍼레이터 전신 일러스트 (텍스처 큼, 15MB급)
├─ charpack/     440   전투 유닛 프리팹 (작음, 20~30KB)
├─ skinpack/     391   스킨
├─ battle/       ...   전투 관련
├─ building/     526   기지
├─ refs/arts/     27   적(enemy) 아트
├─ avg/         1642   스토리 컷신
└─ ...
```

---

## 확인된 것

### ✅ DRM·컨테이너 암호화 없음

번들 헤더가 표준 `UnityFS`다.

```
55 6e 69 74 79 46 53 00  ...  32 30 32 31 2e 33 2e 33 39 66 31 00
U  n  i  t  y  F  S  \0       2  0  2  1  .  3  .  3  9  f  1  \0
```

- 시그니처: `UnityFS` (평문)
- 포맷 버전: 8
- Unity: **2021.3.39f1**
- 커스텀 래퍼·XOR·헤더 변조 없음

### ✅ 디렉터리(blocksInfo)는 표준 LZ4HC — 완전히 읽힘

`tools/ab-probe.js`(의존성 0, 순수 Node)로 헤더와 내부 파일 목록까지
문제없이 파싱된다.

```
$ node tools/ab-probe.js .../charpack/char_002_amiya.ab
Unity       : 2021.3.39f1 (포맷 v8)
blocksInfo  : LZ4HC
블록 수     : 1 / 내부 파일 수: 1
내부 파일   :
  - CAB-27c9fafc580d4bc767aaf82b8496f97a (67.0 KB)
```

큰 번들은 `.resS`(텍스처 스트림)도 정상적으로 목록에 나온다.

### ❌ 데이터 블록은 압축 타입 4 — LZ4가 아님

여기서 막혔다.

```
flags=0x0004  →  압축 타입 4
```

샘플 40개 번들(charpack / refs·arts / chararts / building)의 **데이터 블록
2,227개가 전부 타입 4**였다. 예외 없음.

Unity 열거형에서 4는 LZHAM이지만, Unity가 실제로 LZHAM을 쓰는 경우는 거의 없다.
명일방주 전용 코덱이거나 표식일 가능성이 높다.

데이터 시작 오프셋이 틀린 게 아닌 것도 확인했다 — 파일 크기(21,390) 빼기
압축 블록 크기(21,246)가 정확히 144이고, 오프셋 120~176을 전부 LZ4로 시도해도
유효한 스트림이 나오지 않는다.

---

## ⚠️ 조사 중 저지른 실수 (기록용)

처음 만든 LZ4 디코더가 **경계 검사 없이 조용히 쓰레기를 뱉었다.** 예외를 안 던지니
"압축 해제 성공률 100%"처럼 보였고, 그 쓰레기 안에서 우연히 나온 바이트열을
`skel`·`atlas`·`SkeletonData`·`Relax`·`Sit` 로 잘못 읽어서 **"Spine 데이터 발견"이라고
잘못 판단했다.**

디코더에 검증(오프셋 범위, 출력 크기 일치)을 넣자 즉시 예외가 났고, 실제로는
데이터 블록을 단 하나도 풀지 못했다는 게 드러났다.

**교훈: 디코더는 반드시 실패하게 만들어라.** 조용히 넘어가는 디코더는
없는 것보다 나쁘다 — 잘못된 결론을 확신하게 만든다.
`lz4Decode()`가 지금 엄격하게 검증하는 이유다.

---

## ✅ 해결 — ArknightsStudio로 열림

**ArknightsStudio v1.2.3** (`aelurum/AssetStudioMod`, 태그 `ak-v1.2.3`)로 전부 열렸다.
`ArknightsStudioCLI_net472_win32_64.zip` — .NET Framework 4.7.2는 Windows 내장이라
별도 런타임 설치가 필요 없다.

타입 4가 LZHAM이라는 추정도 맞았다. 다른 포크(`OwlHowlinMornSky/AssetStudio-Arknights`)에
**"Archive of Attempt to Support Legacy Lzham"** 이라는 릴리스가 있다.

### 기지 SD 캐릭터 위치

```
PersistentData/Bundles/chararts/char_003_kalts.ab
└─ dyn/building/vault/characters/       ← building = 기지
   ├─ build_char_003_kalts.skel    159 KB   Spine 바이너리
   ├─ build_char_003_kalts.atlas     8 KB   평문
   └─ build_char_003_kalts.png     311 KB   624×624 RGBA8888
```

같은 번들에 전투용 치비(`char_003_kalts.skel`)도 함께 들어있다.
`build_` 접두사가 기지용이다. 스킨 버전은 `skinpack/`에 있다.

### 규격

| 항목 | 값 |
|---|---|
| Spine 버전 | **3.8.99** (`.skel` 헤더에서 직접 확인) |
| 아틀라스 | 단일 페이지 624×624, RGBA8888 |
| 애니메이션 | `Default` `Interact` `Move` `Relax` `Sit` `Sleep` |

애니메이션 세트가 데스크톱 도우미에 필요한 것과 정확히 겹친다.
대기·이동·앉기·자기·상호작용이 다 있다. **단, 벽 타기 같은 건 당연히 없다.**

### 이 정보가 의미하는 것

- 런타임은 **spine-ts 3.8 브랜치**를 써야 한다. npm의 4.x는 로드 실패한다
- spine-ts Canvas 백엔드는 메시를 지원하지 않으므로 **WebGL 백엔드** 필요
- Spine 런타임 배포에는 라이선스가 필요 (개인 비배포면 해당 없음)

### 재현 방법

```bash
# ArknightsStudio CLI (프리빌드, .NET Framework 4.7.2 = Windows 내장)
#   https://github.com/aelurum/AssetStudioMod/releases/tag/ak-v1.2.3
#   ArknightsStudioCLI_net472_win32_64.zip

# 무엇이 들어있는지만 보기
ArknightsStudioCLI.exe <번들.ab> -m info

# 기지 SD 스켈레톤·아틀라스
ArknightsStudioCLI.exe <chararts/char_XXX.ab> -m export -t textAsset -o <출력>

# 아틀라스 텍스처
ArknightsStudioCLI.exe <chararts/char_XXX.ab> -m export -t tex2d --filter-by-name build -o <출력>
```

추출물은 **저장소 밖**(임시 폴더 또는 gitignore된 `characters/`)에만 둔다.

---

## 법적 선 (재확인)

- 개인 PC에서 혼자 쓰는 것: 저작권법 제30조(사적이용을 위한 복제) 범위
- **저장소·온라인 업로드·배포: 안 됨.** 에셋은 `characters/`(gitignore) 밖으로 나가지 않는다
- 게임 EULA는 별개 문제 (계약 위반 → 계정 제재 가능)

**이 저장소에는 조사 도구만 있고 에셋은 없다.**
