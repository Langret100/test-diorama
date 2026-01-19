# Room Diorama (three.js)

스크린샷 느낌(파스텔 톤, 미니 디오라마 룸)을 three.js로 간단히 구현한 데모입니다.

## 실행 방법 (로컬 서버)
브라우저 보안 정책(CORS) 때문에 `file://`로 바로 열면 `import`(ESM)와 FBX 로더/에셋 로딩이 막힐 수 있어요. **로컬 서버로 실행**해야 정상 동작합니다.

### 1) Python (가장 간단)
```bash
cd room-folio-diorama-v4
python -m http.server 5173
```
브라우저에서 `http://localhost:5173` 열기

### 2) Node (선택)
```bash
cd room-folio-diorama-v4
npx serve
```
또는
```bash
cd room-folio-diorama-v4
npx http-server -p 5173
```

### 3) VS Code Live Server
VS Code 확장 **Live Server** 설치 → `index.html` 우클릭 → *Open with Live Server*

## 조작
- 드래그: 회전
- 휠: 줌
- 더블클릭: 기본 시점으로 리셋

## 파일 구성
- `index.html` : 엔트리
- `src/main.js` : three.js 씬/로딩
- `src/style.css` : UI/배경
- `assets/models` : Kenney FBX 모델 일부

## 라이선스
자세한 출처/라이선스는 `ATTRIBUTION.md` 참고.
