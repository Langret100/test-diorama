# Sooah Room – Static Three.js Diorama (handoff)

이 폴더는 **완전 정적(HTML + JS + assets)** 으로 GitHub Pages에 올려서 바로 보이도록 만든 버전입니다.

## 1) 실행 / 배포
- 로컬: 폴더에서 간단 서버만 띄우면 됩니다.
  - Python: `python -m http.server 8000`
  - 접속: `http://localhost:8000`
- GitHub Pages: 저장소 루트에 이 폴더 내용을 그대로 업로드 → Pages 설정 후 접속.

> **중요**: 더블클릭(file://)로 열면 브라우저가 모듈/리소스 로드를 막아서 제대로 안 뜹니다. 반드시 로컬 서버 또는 Pages로 여세요.

## 2) 현재 구현된 UX
- 첫 진입 시 **핑크–블루 그라데이션 오버레이 + "Enter" 버튼**
  - 버튼은 로딩 완료 여부와 상관없이 누를 수 있고
  - 로딩이 길면 오버레이가 천천히 풀리도록 (속도 자동 보정) 처리했습니다.
- OrbitControls는 **각도 제한**(360도 회전 방지) + damping 적용.
- 클릭 가능한 오브젝트는 **말랑한 스케일 반응(hover/click)** 적용.
- 피아노 키 클릭 시 **간단한 신스 사운드** 재생 (Enter 클릭이 오디오 언락 역할).
- 모니터(Screen)는 **슬라이드쇼 텍스처**가 자동으로 전환됩니다.

## 3) 오브젝트 링크 매핑
- `config/actions.json` 에서 **오브젝트 이름 → 링크(URL)** 를 바꿉니다.
  - 기본값은 `#my-work`, `#about`, `#contact` (원하시면 페이지/섹션으로 교체)

## 4) 모니터 슬라이드쇼
- `config/monitor.json` 에서 이미지/속도 변경
- 이미지 파일은 `assets/monitor/monitor1.png` ...

## 5) 제거/숨김 처리한 것
- 커비 오브젝트 숨김: 이름에 `Kirby` 포함
- 창틀 장식(이름 글자) 숨김:
  - `Name_Letter_1_Third_Raycaster_Hover` ~ `Name_Letter_8_Third_Raycaster_Hover`
  - `Name_Platform_Third`

## 6) 텍스처(아틀라스) 적용 방식
- 메쉬 이름에 `_First / _Second / _Third / _Fourth` 가 포함되어 있으면 해당 아틀라스 텍스처를 매칭합니다.
- 파일:
  - `assets/textures/first_texture_set_day.webp`
  - `assets/textures/second_texture_set_day.webp`
  - `assets/textures/third_texture_set_day.webp`
  - `assets/textures/fourth_texture_set_day.webp`

## 7) 다음 작업 포인트
- 색감/조명은 `config/scene.json` 와 `main.js` 상단의 lighting 값으로 더 쉽게 튜닝 가능.
- 말랑 반응(hover/click)은 `main.js`의 `HOVER_SCALE` / `PRESS_SQUASH` 등 상수로 조절.
- "WORK/ABOUT/CONTACT" 클릭 시 실제 섹션 UI(모달, 스크롤, 별도 페이지)로 확장 가능.

## Credits
- Andrew Woan의 작품을 참고/ 활용하였습니다.
- 출처: https://github.com/andrewwoan/sooahkimsfolio
