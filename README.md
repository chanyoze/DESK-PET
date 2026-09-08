# DeskPet

바탕화면을 돌아다니는 데스크톱 마스코트. Electron 기반, Windows 11 대상.

Steam의 *Little LUMI Model* 같은 데스크톱 컴패니언을 직접 만들어 보는 프로젝트다.
캐릭터·아트는 전부 자체 제작하며, 다른 작품의 에셋은 쓰지 않는다.

## 실행

```bash
npm install
npm start        # 실행
npm run dev      # 개발자 도구를 띄운 채 실행
npm run icon     # 트레이 아이콘 PNG 재생성
```

종료는 트레이 아이콘 우클릭 → **종료**.

## 지금 되는 것 (v0.1 / Step 1)

- 화면 전체를 덮는 **투명 · 프레임 없는 · 항상 위** 오버레이 창
- **클릭 통과** — 커서가 캐릭터 위에 있을 때만 마우스를 받고, 나머지는 아래 창으로 통과
- 클릭해도 작업 중인 창의 **포커스를 뺏지 않음** (`focusable: false`)
- 작업 표시줄 윗변을 바닥선으로 잡고 그 위를 **걸어다님**
- 행동 상태머신: `idle` / `walk` / `sit` / `sleep` / `drag` / `fall` / `pet`
- **드래그해서 던지기** — 속도가 실려서 날아가고, 바닥에서 통통 튀고, 벽에서 반사
- **쓰다듬기** — 짧게 클릭하면 눈 감고 웃으며 하트가 뜬다
- 자면 `zzz` 가 떠오름
- 트레이 메뉴: 가운데로 불러오기 / 깨우기 / 개발자 도구 / 종료
- 해상도·작업 표시줄 변경 시 바닥선 자동 재계산
- 중복 실행 방지

## 구조

```
src/
  main.js                  Electron 메인 — 창 생성, 클릭 통과 토글, 트레이, 무대 계산
  preload.js               contextBridge (petAPI)
  renderer/
    index.html
    style.css              배경은 반드시 transparent
    character.js           캐릭터 리그 — 파츠 정의 · 포즈 · 그리기
    pet.js                 상태머신 · 물리 · 마우스 · 렌더 루프
tools/
  gen-icon.js              의존성 없는 PNG 인코더 (트레이 아이콘 생성)
assets/
  tray.png                 생성물
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

## 로드맵

[docs/ROADMAP.md](docs/ROADMAP.md) 참고.

## 라이선스

MIT. 캐릭터 디자인과 아트는 자체 제작물이다.
