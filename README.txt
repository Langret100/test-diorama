Room Folio Diorama v7 (Three.js)

✅ 이번 버전에서 확인한 점(에셋 적용 체크)
- “구버전(HTML 박스만)”이 아니라, assets/models/**.glb 를 GLTFLoader로 실제 로드해 배치합니다.
- 좌상단 HUD의 Assets 상태가 "Kenney GLB ✓" 로 바뀌면 로딩 성공입니다.

실행 방법(로컬 서버)
1) 이 폴더에서 터미널 열기
2) 아래 중 하나 실행
   - Python(권장):
     python3 -m http.server 5173
     -> 브라우저에서 http://localhost:5173

   - Node:
     npx serve .

※ 브라우저의 ES Module(import map) / 텍스처 로딩 정책 때문에 file:// 로 직접 열면 실패할 수 있어요.

인터랙션
- 오브젝트에 마우스 올리면 더 크게 “말랑”하게 커지고, 클릭하면 더 크게 튕깁니다(스프링 오버슈트).
- 피아노: 키보드 A S D F G H J K (흰 건반 일부) + W E T Y U (검은 건반 일부) 또는 클릭
- 모니터: config/monitor.json 설정에 따라 이미지 자동 슬라이드 + 크로스페이드

링크/창 연결(토대)
- config/actions.json 을 수정하면, 각 오브젝트 클릭 시 동작을 바꿀 수 있습니다.
  - type: "link"  -> url을 채우면 새 탭 열기
  - type: "modal" -> title/body/url 표시
  - type: "section" -> 내부 섹션(현재는 모달로 토대만)

모니터 이미지 교체
- config/monitor.json의 images 배열이 현재 로드 목록입니다.
- assets/monitor/*.png 를 교체하거나, 파일을 추가한 뒤 monitor.json에 경로를 추가하세요.

저작권/라이선스
- 3D 모델: Kenney (CC0)
- 텍스처: Poly Haven (CC0) – wood_diff/plaster_diff 등
- 모니터 기본 이미지: Wikimedia Commons/OpenClipart 기반 CC0 이미지(earth/robot/testtube) + Public Domain/CC0 이미지(기타)로 구성한 합성 PNG
