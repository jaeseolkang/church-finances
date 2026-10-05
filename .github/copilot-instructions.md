# 교회회계 PWA — Copilot 작업 지침

## 프로젝트 개요
- 교회회계 PWA. `index.html` + `app.js`(단일 대형 파일) + `service-worker.js` 캐시 버전 관리
- GitHub Pages로 배포, 다수 교회 저장소가 같은 오리진(jaeseolkang.github.io)을 공유

## ⚠️ 배포 필수 절차 — 앱 수정 시 반드시 수행
서비스워커가 캐시 우선(cache-first) 전략이라 `CACHE_NAME`을 올리지 않으면 유저는 영원히 구버전만 받는다.
**앱의 동작/화면에 영향을 주는 코드를 수정했다면, 작업 완료 시 반드시 아래 3가지를 동시에 갱신한다:**

1. `service-worker.js`
   - 1행 헤더 주석: 날짜 + 버전 + 변경 요약
   - `CACHE_NAME`의 버전 올리기 (예: `v4113` → `v4114`). `CACHE_PREFIX` 부분은 절대 건드리지 않음
2. `app.js`
   - 1행 헤더 주석: 날짜 + 버전 + 변경 요약
   - `APP_VERSION` 상수 갱신 (예: `'v4.113 (cache v4113)'` → `'v4.114 (cache v4114)'`)
3. `index.html`
   - 1행 헤더 주석: 날짜 + 버전 + 변경 요약

- 단순 리팩터링·주석 수정 등 사용자에게 보이는 변화가 없는 경우에도 안전을 위해 버전을 올리는 것을 기본으로 한다.
- 버전 올리기는 사용자가 push하기 전, 같은 작업 커밋에 포함한다.

## 절대 하지 말 것
- 헌금 일괄 입력(bulkOfferSheet)의 표시 셀(`div.bulk-cell`)을 `<input>`으로 되돌리지 말 것 — iOS WebKit 캐럿 위치 버그의 원인
- iOS 대응으로 body를 visualViewport 픽셀 고정하지 말 것 — 터치 영역 밀림 발생
- `service-worker.js`의 `CACHE_PREFIX`(scope 포함 로직) 변경 금지 — 같은 오리진의 다른 교회 저장소 캐시를 지우는 사고 방지용

## iOS 터치 관련 주의
- 16px 미만 input은 iOS 자동 확대 유발 → fixed 요소 터치 판정 어긋남
- `-webkit-tap-highlight-color:transparent` / `-webkit-touch-callout:none` 전역 적용 유지
