# 시험딸깍

문항의 요소·매개요소·조건·구할 것을 구조로 입력하면 시험지 문체의 발문, 조건 상자, 그래프, 정답, 단계별 풀이, 검증 결과를 만든다.
풀이 엔진이 다루지 못하는 문항은 BeAT에 보낼 해설 요청문을 만든다.

## 실행
빌드가 필요 없다. 폴더를 웹 서버로 열거나 `index.html`을 브라우저로 연다.
수식 표시(MathJax)는 인터넷 연결이 필요하다.

    python3 -m http.server 8000   # http://localhost:8000

## 실행 파일(exe) 만들기 (Windows)
Node.js가 필요하다. Electron으로 감싸며, MathJax와 나눔명조 글꼴을 `vendor/`에 넣어 인터넷 없이도 수식과 명조체가 보인다.

    npm install          # 처음 한 번
    npm start            # 창으로 바로 실행해 보기
    npm run dist         # dist/시험딸깍-1.0.0-x64.exe (설치 없이 실행되는 단일 exe)
    npm run dist:setup   # 설치 프로그램(Setup exe)으로 만들기

VS Code 터미널에서 `npm start`가 창 없이 끝나면 `ELECTRON_RUN_AS_NODE` 환경 변수를 지우고 실행한다.

## 폴더 구조
    index.html            화면 뼈대와 스크립트 순서
    css/base.css          글꼴(G마켓 산스, 바탕), 색, 공통 조작 요소
    css/layout.css        시작 화면, 상단 막대, 좌·우 사이드바, 창
    css/sheet.css         시험지, 조건 상자, 풀이, 검증
    fonts/                G마켓 산스 Medium
    js/engine/numbers.js  분수·이차 무리수 정확 계산
    js/engine/poly.js     다항식, 표기(LaTeX/평문), 식 파서, 조사
    js/engine/solver.js   조건 → 경우 나누기 → 연립 풀이 → 답 → 검증 → 그래프 모델
    js/engine/question.js 발문·조건 상자·구조 설명문 생성
    js/engine/index.js    공개 API (MH.Engine)
    js/data/examples.js   예제 문항 (테스트 기대값 포함)
    js/ui/core.js         화면 공통 상수·도우미
    js/ui/model.js        문항 상태, 매개요소 감지, 계산 호출
    js/ui/sidebar.js      왼쪽 구조 목록과 속성 편집
    js/ui/graph.js        그래프 SVG, PNG 내보내기
    js/ui/views.js        시험지·풀이·검증·BeAT·동형 문항·구조 화면
    js/ui/aitext.js       BeAT 해설 붙여넣기(수식 → LaTeX)와 수식 표시
    js/ui/io.js           시작 화면, 문항 정보 창, 저장·불러오기
    js/ui/main.js         이벤트 연결과 시작
    tests/engine.test.js  엔진 테스트: `node tests/engine.test.js`
    assets/icon.png       앱 아이콘(exe·창·favicon)
    electron/main.js      데스크톱 창(Electron) 진입점
    electron/copy-vendor.js  MathJax·나눔명조를 vendor/로 복사
    package.json          exe 빌드 설정(electron-builder)

## 새 요소 종류를 넣을 때
1. `js/ui/core.js`의 `ELEMENT_KINDS`에 종류를 추가한다.
2. `js/ui/sidebar.js`의 편집기에 속성 칸을 만든다.
3. `js/engine/solver.js`의 `setup`에서 요소를 해석하고, 조건(`condOptions`)과 구할 것(`targetOptions`)을 추가한다.
4. `js/engine/question.js`에 발문 문구를 추가하고 `js/data/examples.js`에 예제와 기대값을 넣어 테스트한다.
