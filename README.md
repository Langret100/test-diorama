# Sooah Room Diorama (Static)

정적 배포용(HTML+JS+assets) 3D 디오라마 페이지입니다.

## Run locally
- 간단한 로컬 서버로 실행하세요 (상대경로/텍스처 로딩 때문에 file://는 권장하지 않음).
  - Python: `python -m http.server 8000`
  - Node: `npx serve` (또는 `npx http-server`)

브라우저에서 `http://localhost:8000/` 접속.

## 자주 발생하는 실수 (재발 방지 체크리스트)

### 1) 카메라가 너무 멀리/가까이 보이거나, 화면이 거의 비어 보이는 문제
- 이 프로젝트는 **모델(Room_Portfolio.glb) 스케일 기준으로 카메라 시작 위치가 고정**되어 있습니다.
  - **GLB를 임의로 스케일링하면** 카메라가 상대적으로 멀어져서 방이 아주 작게 보입니다.
- `OrbitControls.maxDistance`가 너무 작으면, 카메라가 클램프되어 **방 내부/백페이스로 들어가** 화면이 비어 보일 수 있습니다.
  - 카메라/모델 스케일을 바꾼다면 `minDistance / maxDistance`도 함께 조정하세요.

### 2) 텍스처가 이상하게(색이 어둡거나/번들거리는 느낌) 보이는 문제
- 이 씬의 “벽/바닥/가구 텍스처 세트”는 **ShaderMaterial**로 적용됩니다.
- ShaderMaterial은 기본 머티리얼처럼 자동으로 색공간 보정이 들어가지 않을 수 있어서,
  **원본 구현과 동일하게 fragment shader에서 gamma 보정(`pow(color, 1.0/2.2)`)**을 적용합니다.
  - 이 줄을 빼면 텍스처가 “이상하게” 보이는 경우가 많습니다.

### 3) 텍스처 경로가 안 맞아서 전부 흰색/검정으로 뜨는 문제
- 아래 폴더 구조와 파일명이 코드와 정확히 일치해야 합니다.
  - `assets/textures/room/day/*_texture_set_day.webp`

### 4) Draco 디코더 로드 오류
- `DRACOLoader.setDecoderPath('...')` 경로에 `draco_decoder.js/.wasm`가 있어야 합니다.
- 오타(예: 변수명)로 DRACO 설정이 끊기면 GLB 로딩이 실패합니다.

### 5) 모바일 콘솔 오류 / 줌-제스처가 이상한 문제
- 3D 버튼(ABOUT/WORK/CONTACT)은 `config/actions.json`에서 `#about` 같은 해시로 매핑됩니다.
  - 이 해시를 열 때 `openModal()`이 없으면 `openModal is not defined` 오류가 납니다.
  - 그래서 `main.js`에 **항상** `openModal()` / `closeModal()` / `modalPages`를 정의해두었습니다.
- 모바일/트랙패드에서 줌이 부자연스럽거나 페이지가 스크롤되는 경우:
  - `styles.css`의 `#c { touch-action: none; }`가 꼭 필요합니다.
  - `main.js`에서 `renderer.domElement.style.touchAction = 'none'` + `wheel` 기본동작 차단으로 브라우저 제스처 하이재킹을 막습니다.

## 커스텀 제거 대상
요청에 따라 아래 오브젝트만 숨김 처리되어 있습니다.
- `Name_Letter_1..8` (및 hover/raycaster 변형)
- `Name_Platform_Third` (L 판)
- `Kirby_Third_Hover_Raycaster` (방 하단 커비)
- 창문 창틀 위 네모 장식: GLB 내 이름이 없어, **윈도우/letters 영역(z≈-4.2)** 근처의 작은 ‘플라크’ 메쉬를 자동 탐지해 숨깁니다 (코드: `hideWindowFrameDeco`).

## 인터랙션(호버/클릭) 구조 (샘플 방식)
- 모델의 `*Raycaster*` 메쉬를 **직접 클릭 대상으로 쓰지 않고**,
  그 메쉬의 바운딩박스를 기반으로 **투명 히트박스(BoxGeometry)**를 만들어 raycast에 사용합니다.
- 이렇게 해야 “히트박스만 반응하고 실제 오브젝트는 안 움직이는” 문제가 안 생깁니다.
- GLB에서 일부 오브젝트가 scale=0으로 들어오는 경우가 있어(인트로 애니 잔재),
  `Raycaster` 오브젝트는 등록 시 scale을 (1,1,1)로 보정합니다.

### 디버그 팁
- **Alt + Click** : 현재 클릭된 오브젝트의 `name` + bbox(size/center)를 콘솔에 출력합니다.
  (창틀 네모 장식이 잘못 숨겨졌다면, 이걸로 정확한 대상 찾은 뒤 이름 기반으로 처리하도록 쉽게 바꿀 수 있습니다.)

## 동적 이미지(모니터/액자/포스터) 교체
- Enter 이후 **4초마다** 3장 중 랜덤으로 교체됩니다.
- 나중에 이미지 교체는 파일만 갈아끼우면 됩니다.
  - 모니터: `assets/monitor/monitor1.png`, `monitor2.png`, `monitor3.png`
  - 액자: `assets/dynamic/frame_1.png`, `frame_2.png`, `frame_3.png`
  - 포스터: `assets/dynamic/poster_1.png`, `poster_2.png`, `poster_3.png`

## Credits
- Andrew Woan의 작품을 참고/활용하였습니다.
- 출처: https://github.com/andrewwoan/sooahkimsfolio
