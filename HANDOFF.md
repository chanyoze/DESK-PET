# HANDOFF — 다음 세션에서 이어서 하기

**작성 2026-09-30 · 갱신 2026-09-30(집 PC 세션) · 버전 0.15.0**

집 PC ↔ 회사 PC 세션 사이 인수인계 문서다. 새 세션은 이 파일 → `README.md` → `docs/ROADMAP.md` 순으로 읽으면 된다.

---

## 1. 지금 상태 한 줄

마리나 · 사마리(Fear & Hunger 2: Termina)가 둘이 같이 돌아다니는 데스크톱 마스코트 + 개인 도구
(Claude Code 알림 · 할 일 · 스티커 메모 · 빌드 알림). 공개 릴리스는 v0.10.0(에셋 없음) 그대로,
**회사 PC 바탕화면엔 개인 빌드 `DeskPet-private-0.14.0.exe`** 가 떠 있다.

2026-09-30 회사 세션에서 한 일 (v0.11 → v0.14, 자세한 건 ROADMAP 각 버전):
- v0.11 Claude Code 알림 연결 버튼 · 자동 시작
- v0.12 Claude 세션 현황 · 그 창으로 가기 · 작업 중 졸기 · `deskpet.ps1`(빌드 · 톰캣 알림) · 커서 놀이 · 메뉴 접기
- 스프라이트 머리 위 1px 선 제거(렌더러) · 팔 잘린 칸 제외(레시피)
- v0.13 할 일 `%APPDATA%\deskpet\todo.md` (일자별 `## 날짜` · 분류 `### 이름` · `## 언젠가` · 기한 `(~15:00)`),
  정각 recap(재촉 한마디) · 기한 알림 · 할 일 카드 · 스티커 메모 · 카드 크기 조절 · 분류 직접 등록
- v0.14 알림 카드(대화 말풍선과 구분) · 놓친 알림 배지 · 트레이 빨간 점 · 윈도우 토스트(허락 · 오류 · 기한 · 빌드 실패만)

## 2. 다음에 할 일

### 2-1. 집 PC에서 먼저 — ✅ 1~3 완료 (2026-09-30 집 PC 세션)

> 집 PC 설치본 캐릭터에 claude · recap · clips.run · clips.walk_pistol(마리나) 반영 완료,
> `DeskPet-private-0.14.0.exe` 빌드 후 바탕화면에서 실행 중 (exe 안 캐릭터에 claude 7묶음 · recap 확인).
> **남은 것: 4번(알림 연결하기 버튼 — 사용자)**, 바탕화면의 옛 `DeskPet-private-0.10.0.exe` 는 지워도 된다.

1. `git pull` → `npm install`
2. 집 PC 설치본 `%APPDATA%\deskpet\characters\termina-*\character.json` 에 레시피의
   `manifest.claude` · `manifest.recap` · `manifest.clips.run` · `manifest.clips.walk_pistol` 을 그대로 옮긴다
   (레시피에만 반영된 것 — Claude 대사, recap 대사, 팔 잘린 칸 제외). 다른 키는 건드리지 말 것.
   JSON 은 파싱해서 고치고 역슬래시가 든 내용은 셸 heredoc 말고 편집 도구로 (3절 주의)
3. `npm run dist:private` → 새 exe 로 바꿔 켜기 (머리 위 1px 선 · 알림 카드 등은 코드라 exe 만 새로 만들면 된다)
   - exe 교체할 때 보안 프로그램이 파일을 잠깐 잡고 있을 수 있다 → 앱을 끈 뒤 복사를 재시도
4. exe 메뉴 → Claude Code → **알림 연결하기** (집 PC 의 예전 `say.js` 훅이 새 방식으로 바뀐다. 누르는 건 사용자 몫)
5. todo.md · notes.json 은 PC 마다 따로다 (회사 할 일이 저장소에 안 올라가게 일부러) — 집은 빈 목록에서 시작

### 2-1b. 하데리어 (지인용 포켓몬) — v0.15 완료 (2026-09-30 집 PC)

- `node tools/pmd-import.js tools/recipes/pokemon/herdier.json` → `%APPDATA%\deskpet\characters\pokemon-herdier`
  (PMDCollab 에서 받아 온다 — 인터넷 필요. 회사 PC에서도 같은 명령으로 만들 수 있다)
- 동작 10개 화면 확인 완료. 매핑은 도감 아티팩트(9절)대로, 사용자 확인 받음
- **지인 전달용 통파일 (2026-10-01)**: 집 PC 바탕화면 `DeskPet-mac-pokemon-herdier-0.15.0.zip` — 하데리어만 들어 있고
  목록에도 하데리어만 (`onlyCharacters`), 인터넷 없이 바로 나온다. GitHub 아티팩트는 받은 뒤 지웠다. 릴리스에는 없다
- 맥 빌드(그림 없는 판): 릴리스 `mac-v0.15.0` 의 `DeskPet-mac-0.15.0.zip` (universal, ad-hoc 서명)
  - 그림 없음 (확인함). 처음 켤 때 `autoInstall` 로 PMDCollab 에서 하데리어를 받는다 (`src/pmd.js`, main.js `autoInstallCharacters`)
  - 지인이 할 일: zip 풀기 → 응용 프로그램 폴더로 → 터미널에서 한 번 `xattr -cr /Applications/DeskPet.app` → 실행
  - 다시 빌드: Actions 탭 "Build macOS app" 또는 `gh workflow run mac.yml` (`tools/build-mac.js`, 프리셋 `tools/presets/herdier.json`)
  - 맥에서는 윈도우 전용 기능을 건너뛴다: Claude 훅(ps1) · 그 터미널로 · `deskpet.ps1` · AppUserModelId.
    메뉴의 Claude Code 섹션은 "알림"(시스템 알림 · 최근 알림)만 나온다. Dock 숨김 · 모든 Spaces 에 보이기 · 메뉴바 아이콘 18pt
  - **맥에서 실제로 켜 본 적 없음** — 지인 피드백 필요 (바닥선이 Dock 위에 맞는지, 클릭 통과, 메뉴바 아이콘, 첫 실행 설치)
  - 지인이 Claude Code 를 쓰면: 맥용 훅(sh + curl) · 그 터미널로(osascript) 가 다음 할 일

### 2-2. 사용자에게 여쭤 둔 것 (답 대기)
- **맥북 대응** — exe 는 윈도우 전용. 맥에서 쓰려면 ① 맥용 훅(sh + curl) ② "그 터미널로" (osascript)
  ③ `deskpet.ps1` 대신 셸 스크립트 ④ Dock 기준 바닥선 확인 ⑤ 맥에서 빌드.
  → ④ ⑤ 와 기본 대응은 2-1b 에서 진행함. ①~③ 은 지인이 Claude Code 를 쓰는지 답을 받은 뒤

### 2-3. 아직 눈으로 확인 못 한 것 (실제 마우스 · 실제 화면)
- 말풍선(알림 카드) 누르면 Windows Terminal 이 앞으로 오는지, 트레이 빨간 점, 윈도우 토스트 모양
- 자동 시작(재부팅 후), 정각 recap 이 실제 정각에 뜨는지, 카드 드래그 · 크기 조절을 실제 마우스로

### 2-4. 그다음 후보 (우선순위 미정)
- **화면 공유 · 전체화면 앱일 때 자동 숨기기** (지금은 메뉴 · 트레이 "메모 · 카드 숨기기" 로 수동)
  - 후보: `SHQueryUserNotificationState` (koffi 필요) 또는 PowerShell 자식 프로세스로 같은 API 를 2초마다
- 할 일: 캐릭터가 카드로 걸어가 읽어 주기, Claude 작업 로그를 메모로, 밀린 일 오늘로 옮기기
- 칸을 뺀 달리기가 어색하면 남은 칸 수에 맞춰 fps 낮추기
- 방해 금지 시간, 창 제목 표시줄 위 걷기 (ROADMAP Step 3), 파티원 추가(레비 등)

## 3. 회사 PC에서 개발할 때 주의

- **게임이 없어서 캐릭터를 새로 뽑을 수 없다.** 저장소에는 게임 그림이 없다 (`characters/*` gitignore).
  - 코드만 고치는 작업은 기본 캐릭터(파란 고양이)로 확인해도 된다
  - 마리나 · 사마리로 확인하려면 집 PC의 `%APPDATA%\deskpet\characters\termina-marina`, `termina-samarie`
    폴더를 회사 PC의 같은 경로에 복사하면 된다 (개인 용도로만)
- 회사 PC에 설치된 건 `DeskPet-private-0.10.0.exe` (포터블). 설정은 `%APPDATA%\deskpet\settings.json`.
  **개발 버전(`npm start`)과 exe는 같은 설정 폴더를 쓰고 중복 실행이 막혀 있다** → 하나를 끄고 다른 걸 켤 것
- 개인 빌드를 다시 만들려면 캐릭터가 `%APPDATA%\deskpet\characters` 에 있어야 한다 → `npm run dist:private`
- 회사 PC에도 이제 Node(v24)가 있다. 다만 훅은 Node 없이 PowerShell 로 돈다
- Claude 세션 목록은 앱 메모리에만 있다 — 앱을 다시 켜면 비고, 이미 떠 있던 세션은 다음 훅부터 다시 잡힌다
  (시작 시각을 몰라서 첫 Stop 은 "끝났어" 로 말한다)
- 회사 PC 보안 프로그램이 폴더에 숨김+시스템 미끼 파일(`locales\ZULRFF.DOCX`, 같은 이름 두 번)을 끼워 넣어
  포터블 빌드의 7za 가 "Duplicate filename on disk" 로 멈췄다 → `dist:private` 가 윈도우에서 `tools/7za-skip-hidden.cs` 를
  csc 로 컴파일해 그런 파일을 압축에서 뺀다 (지우지는 않는다). 공개 빌드(`npm run dist`)엔 아직 안 붙였다
- 셸 heredoc 안의 `\\` 는 `\` 로 줄어든다 (2026-09-30 README 경로가 깨졌던 원인). 역슬래시가 든 내용은 편집 도구로 쓸 것
- 회사 PC의 exe 는 **관리자 권한으로 떠 있을 수 있어서** 셸에서 끌 수 없다 (액세스 거부). 사용자에게 메뉴 → 종료를 부탁할 것.
  exe 를 끄지 않고 개발 버전을 시험하려면 하네스에서 `app.setPath('userData', 임시폴더)` 후 main 을 require 하고,
  `USERPROFILE` 을 임시 폴더로 바꿔 `~/.claude/settings.json` 도 격리한다 (포트는 설정에서 45679 등으로)

## 4. 절대 하지 말 것

- 게임 · 모드 그림(`characters/termina-*`, 개인 빌드 exe, 움짤)을 **커밋 · 릴리스 · 공유하지 않기**
  - `preset.json`, `dist/` 도 gitignore. 커밋 전에 `git diff --cached --name-only` 로 png 없는지 확인
- 셸 명령 안에 백틱(`)이 들어간 긴 문자열을 넣지 않기 — 2026-09-30에 README 편집 명령이 백틱 때문에
  `npm run dist:private` 를 실제로 실행해 버린 사고가 있었다. 파일 편집은 편집 도구로
- 테스트 스크립트로 **화면 빈 곳을 실제 클릭하지 않기** — 다른 창을 누를 수 있다

## 5. 작업 규칙 (사용자 선호)

- 사용자 대상 설명은 한국어
- 커밋 메시지: `YYYY-MM-DD / 이찬호 / 한 줄 요약` — **AI 표기(Co-Authored-By 등) 넣지 않음**
- 작업 단위마다 문서(README · ROADMAP) 갱신 → 커밋 → 푸시 → 원격 반영 확인
- 파괴적 작업이 아니면 묻지 말고 진행, 끝나면 남은 할 일을 TODO로 정리

## 6. 구조 요약

| 파일 | 역할 |
|---|---|
| `src/main.js` | 창 · 트레이 · 모니터 선택 · 캐릭터 로드 · 리마인더 · **커서 폴링(초당 20번)** · IPC |
| `src/renderer/pet.js` | `Pet` 클래스(한 마리 = 상태 · 물리 · 뷰 · 말풍선 · 혼잣말), 껴안기(`hug`), 둘의 대화(`talk`), 원작처럼 연출(`dark`), 메뉴 |
| `src/renderer/chatter.js` | 혼잣말 · 반응 대사 (셔플 백, 분위기별 대사 섞기) |
| `src/renderer/renderers/sprite-view.js` | 스프라이트 시트 렌더러 (`once` · `mirror` · `bob`) |
| `src/notify-server.js` | 127.0.0.1:45678 알림 서버 (`/say`, `/claude`, `/ping`) |
| `src/claude-hooks.js` | `~/.claude/settings.json` 훅 넣고 빼기 + 훅 스크립트(ps1) 내용. electron 없이 node 로 시험 가능 |
| `src/settings.js` | 설정 저장. 빌드에 `preset.json` 이 있으면 기본값으로 씀 |
| `tools/rpgmv-extract.js` | RPG Maker MV 게임 · 모드에서 레시피대로 캐릭터 추출 (`--mod=`) |
| `tools/build-private.js` | 개인 빌드 (`npm run dist:private`) |
| `tools/recipes/termina/*.json` | 마리나 · 사마리 레시피 (칸 좌표 · 동작 · 대사 · 대화, 그림 없음) |
| `docs/TERMINA-CHARACTERS.md` | 로어 노트 · 대사 규칙 · 분위기 두 가지 · 쓰지 않는 소재 |

## 7. 최근에 고친 버그 (재발하면 여기부터)

- **주 모니터가 아닌 곳에서 캐릭터가 안 눌림** — `setIgnoreMouseEvents` 의 `forward` mousemove 가
  비주 모니터 · 창 이동 후에 끊긴다. 메인이 `screen.getCursorScreenPoint()` 를 폴링해서 `pet:cursor`
  로 넘기는 방식으로 해결 (`bb71957`). **실제 마우스로 누르는 확인은 사용자 몫으로 남아 있다**
  (프로그램으로 흉내 낸 클릭은 창에 도착하지 않아서 검증 불가였다)
- 새로고침(모니터 이동 · 크기 변경) 시 클릭 통과 초기화 — 안 하면 그 모니터 클릭을 앱이 먹는다
- 메뉴를 열면 캐릭터가 drag 상태로 굳던 문제 — 메뉴 동안 idle, `menu.onClose` 에서 재개

## 8. 개발 · 확인에 쓰는 것

```bash
npm start                                   # 개발 실행
npx electron . --start=hug | talk | teleport | nightmare | state:sit | clip:transform | mode:knife
npx electron . --start=claude:done | fail | permission | waiting
npx electron . --shot=out.png,3000          # 창 내용만 PNG로 저장하고 종료
npx electron . --trace                      # 상태 로그
npm run dist                                # 공개 빌드 (에셋 없음)
npm run dist:private                        # 개인 빌드 (에셋 포함, 배포 금지)
```

- 렌더러 디버그: `window.__pets`, `window.__debug = { hug, talk, dark, setCompanion }`
- 실제 앱을 띄워 조작하는 테스트는 별도 폴더에 `package.json` + `main.js` 를 두고
  `require('<repo>/src/main.js')` 한 뒤 `executeJavaScript` · `sendInputEvent` 로 조작하는 방식을 썼다

## 9. 그 밖의 자료

- 다운로드 페이지: https://chanyoze.github.io/DESK-PET/ (v0.10.0), 릴리스: GitHub Releases v0.10.0
- 스프라이트 도감(개인 참고용 아티팩트): https://claude.ai/artifact/NvSctn7aVcFmP3nd5xQugR — 공유 설정이
  "링크 있는 누구나"였던 적이 있으니 비공개인지 확인
- 하데리어 스프라이트 도감(아티팩트, 비공개): https://claude.ai/artifact/8RhALVocEQtmiZJPYbgF6n
- 커뮤니티용 움짤: 집 PC 바탕화면 `DeskPet-GIF/` (게임 그림 포함, 저장소에 없음)
- 명일방주 캐릭터는 집 PC에서 `"hidden": true` 로 숨겨 둠 (로컬 파일)
