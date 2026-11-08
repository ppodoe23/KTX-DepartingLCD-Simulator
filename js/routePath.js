// 노선 경로(지도 좌표) — 노선도 지도와 정차역 안내 화면이 같은 경로를 씁니다.
// 역 좌표 + 역 사이 경유점(via)을 부드러운 곡선으로 잇고, 촘촘한 점 목록으로 만들어 둡니다.
import { project } from './data/koreaMap.js';

export function buildRoutePath(all) {
  // 제어점: 각 역 앞에 그 역의 via 경유점들을 넣음
  const pts = [], stationPt = [];
  all.forEach((s, i) => {
    if (i > 0) for (const [lat, lon] of s.via || []) pts.push(project(lat, lon));
    stationPt.push(pts.length);
    pts.push(project(s.lat, s.lon));
  });

  // Catmull-Rom 샘플링 (centripetal: 점 간격이 고르지 않아도 고리처럼 꼬이지 않음)
  const samples = [];
  const STEPS = 24;
  const sub = (a, b) => [a[0] - b[0], a[1] - b[1]];
  const add = (a, b) => [a[0] + b[0], a[1] + b[1]];
  const kt = (ti, a, b) => ti + Math.max(1e-4, Math.sqrt(Math.hypot(b[0] - a[0], b[1] - a[1])));
  const mix = (a, b, ta, tb, t) => (tb - ta < 1e-9 ? a : [a[0] + (b[0] - a[0]) * (t - ta) / (tb - ta), a[1] + (b[1] - a[1]) * (t - ta) / (tb - ta)]);
  for (let k = 0; k < pts.length - 1; k++) {
    const p1 = pts[k], p2 = pts[k + 1];
    const p0 = pts[k - 1] || sub(p1, sub(p2, p1));      // 양 끝은 반대쪽으로 연장한 가상의 점
    const p3 = pts[k + 2] || add(p2, sub(p2, p1));
    const t0 = 0, t1 = kt(t0, p0, p1), t2 = kt(t1, p1, p2), t3 = kt(t2, p2, p3);
    for (let j = 0; j < STEPS; j++) {
      const t = t1 + (t2 - t1) * (j / STEPS);
      const A1 = mix(p0, p1, t0, t1, t), A2 = mix(p1, p2, t1, t2, t), A3 = mix(p2, p3, t2, t3, t);
      const B1 = mix(A1, A2, t0, t2, t), B2 = mix(A2, A3, t1, t3, t);
      const P = mix(B1, B2, t1, t2, t);
      samples.push({ x: P[0], y: P[1], k });
    }
  }
  const last = pts[pts.length - 1];
  samples.push({ x: last[0], y: last[1], k: pts.length - 1 });

  // 누적 거리
  let d = 0;
  samples.forEach((p, i) => { if (i) d += Math.hypot(p.x - samples[i - 1].x, p.y - samples[i - 1].y); p.d = d; });
  const stationD = stationPt.map((pi) => (pi === pts.length - 1 ? d : samples[pi * STEPS].d));

  // 거리 d 위치의 점
  const pointAt = (dist) => {
    if (dist <= 0) return { x: samples[0].x, y: samples[0].y };
    if (dist >= d) return { x: last[0], y: last[1] };
    let lo = 0, hi = samples.length - 1;
    while (hi - lo > 1) { const m = (lo + hi) >> 1; if (samples[m].d < dist) lo = m; else hi = m; }
    const a = samples[lo], b = samples[hi], u = (dist - a.d) / (b.d - a.d || 1);
    return { x: a.x + (b.x - a.x) * u, y: a.y + (b.y - a.y) * u };
  };

  // 거리 구간 [d0, d1]의 점 목록
  const slice = (d0, d1) => {
    const out = [pointAt(d0)];
    for (const p of samples) if (p.d > d0 && p.d < d1) out.push(p);
    out.push(pointAt(d1));
    return out;
  };

  return { samples, stationD, total: d, pointAt, slice, stationXY: stationPt.map((pi) => ({ x: pts[pi][0], y: pts[pi][1] })) };
}
