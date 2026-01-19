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
  - `assets/textures/room/night/*_texture_set_night.webp`

### 4) Draco 디코더 로드 오류
- `DRACOLoader.setDecoderPath('...')` 경로에 `draco_decoder.js/.wasm`가 있어야 합니다.
- 오타(예: 변수명)로 DRACO 설정이 끊기면 GLB 로딩이 실패합니다.

## 커스텀 제거 대상
요청에 따라 아래 오브젝트만 숨김 처리되어 있습니다.
- `Name_Letter_1..8` (및 hover/raycaster 변형)
- `Name_Platform_Third` (L 판)

## Credits
- Andrew Woan의 작품을 참고/활용하였습니다.
- 출처: https://github.com/andrewwoan/sooahkimsfolio
