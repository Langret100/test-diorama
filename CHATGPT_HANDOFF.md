# Diorama Portfolio Handoff

이 프로젝트는 **Node/Vite 없이** GitHub Pages에 그대로 올릴 수 있는 **순수 정적(HTML+JS+assets)** Three.js 디오라마 포트폴리오입니다.

## 목표
- 레퍼런스(sooahs-room-folio 분위기)처럼 **파스텔/소프트**한 룸 디오라마
- 오브젝트 클릭/호버 반응(말랑한 스케일)
- 오브젝트 클릭 시 링크/패널 열기
- 모니터: 이미지 슬라이드쇼(페이드)
- 피아노: 키 클릭 시 연주(신스)
- 의자: 아주 천천히 좌우 스웨이
- **천장 제거**

## 배포
- GitHub Pages: repo 루트에 파일을 그대로 두고 Pages를 `main/(root)`로 설정
- 로컬 테스트: `python -m http.server 8080` 후 `http://localhost:8080`

## 파일 구조
- `index.html` : UI + 캔버스 컨테이너
- `main.js` : three.js 씬/로딩/인터랙션 로직
- `styles.css` : 파스텔 UI 스타일
- `assets/models/Room_Portfolio.glb` : 룸 모델(GLB, Draco 압축)
- `assets/draco/gltf/*` : Draco 디코더(정적 포함)
- `assets/monitor/*` : 모니터 슬라이드 이미지
- `config/scene.json` : 씬 옵션(천장 제거, 반응 강도 등)
- `config/actions.json` : 오브젝트 이름→행동(링크/패널) 매핑(토대)
- `config/monitor.json` : 모니터 이미지 목록

## 최근 이슈 & 원인
- **GLB는 로드되는데 화면에 아무것도 안 보이는 현상**
  - GLB 안에 `Plane.002`처럼 **매우 큰 메쉬(outlier)**가 포함되어 있어,
  - 바운딩박스 기반 카메라 프레이밍이 과하게 멀어지면서 실제 방이 아주 작아져 보이지 않았음.

## 해결(현재 버전 반영)
- 카메라 프레이밍 시 **outlier 메쉬를 제외한 core bounds**로 프레이밍
- outlier 후보(너무 크고 얇은 plane)는 기본적으로 숨김 처리(필요 시 옵션화 가능)

## 다음 작업 TODO
- 룸 컨셉/색감/라이팅을 레퍼런스에 더 가깝게(톤매핑/그림자/블룸 파라미터 튜닝)
- 오브젝트 이름 리스트 자동 덤프→`actions.json` 자동 생성
- 실제 콘텐츠(Work/About/Contact) UI/모달/외부 링크 연결 고도화
- 피아노 스케일/음색 튜닝(원하면 샘플 기반으로 교체)
