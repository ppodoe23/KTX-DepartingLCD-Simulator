## 파일 구성

```
index.html
css/style.css      화면 디자인 (1280x720 기준, 창 크기에 맞춰 자동 확대·축소)
js/config.js       ← 주로 고칠 파일
js/main.js         전체 시퀀스, 시계, 안전 안내
js/settings.js     사이트 노선 설정창
js/travel.js       역간 소요시간 계산 (소요시간표 최단 경로 합산)
js/data/travelTimes.js  노선별 역간 소요시간표 ← 직접 고칠 수 있음
js/route.js        노선 설정 → 역 정보 (DB 조회, 도 이름 판별)
js/routeMap.js     노선도 지도 화면
js/routePath.js    노선 경로 곡선 (지도·정차역 화면 공용)
js/data/stations.js  역 DB (영문·한자·좌표)
js/data/koreaMap.js  한반도 시도 경계 지도 데이터 (Natural Earth 1:10m)
js/data/sigungu.js   시군구 경계 (통계청 2013) — 출발 화면에서 출발역 시군구가 3D로 솟아오르는 데 사용
fonts/             서울남산체
js/intro3d.js      three.js 3D 인트로 (역명판, 출발 카드, 고가 선로, 열차)
js/stopGuide.js    정차역 안내 화면과 풍선 링 애니메이션
js/util.js
models/            glb 넣는 곳
```
