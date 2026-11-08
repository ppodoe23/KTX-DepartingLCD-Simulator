// 역간 소요시간 계산: data/travelTimes.js 노선표를 그래프로 만들어 최단 경로 합산
import { LINES, DWELL, PASS_SAVE } from './data/travelTimes.js';
import { STATIONS } from './data/stations.js';

// 이름 정규화: '역' 떼기, 띄어쓰기·괄호 무시 (예: '김천 (구미)' = '김천구미')
const ALIAS = { 인천공항1터미널: '인천국제공항1터미널', 인천공항2터미널: '인천국제공항2터미널' };
export const norm = (n) => { const k = String(n || '').trim().replace(/역$/, '').replace(/[\s()]/g, ''); return ALIAS[k] || k; };

const graph = new Map();
const link = (a, b, m) => {
  if (!graph.has(a)) graph.set(a, []);
  graph.get(a).push([b, m]);
};
for (const [, seq] of LINES) {
  for (let i = 0; i + 2 < seq.length; i += 2) {
    const a = norm(seq[i]), m = +seq[i + 1], b = norm(seq[i + 2]);
    link(a, b, m); link(b, a, m);
  }
}

function shortest(a, b) {
  if (!graph.has(a) || !graph.has(b)) return null;
  const dist = new Map([[a, 0]]), hops = new Map([[a, 0]]), prev = new Map(), done = new Set();
  for (;;) {
    let u = null, best = Infinity;
    for (const [k, d] of dist) if (!done.has(k) && d < best) { best = d; u = k; }
    if (u == null) return null;
    if (u === b) {
      const nodes = [b];
      while (nodes[0] !== a) nodes.unshift(prev.get(nodes[0]));
      return { mins: best, hops: hops.get(u), nodes };
    }
    done.add(u);
    for (const [v, m] of graph.get(u) || []) {
      const nd = best + m;
      if (nd < (dist.get(v) ?? Infinity)) { dist.set(v, nd); hops.set(v, hops.get(u) + 1); prev.set(v, u); }
    }
  }
}

function coords(e) {
  if (e.lat != null && e.lon != null) return [e.lat, e.lon];
  const db = STATIONS[String(e.name || '').trim().replace(/역$/, '')];
  return db ? [db.lat, db.lon] : null;
}

// 두 역 사이 주행시간(분). 노선표에 경로가 없으면 직선거리로 추정
export function travelMinutes(from, to) {
  const p = shortest(norm(from.name), norm(to.name));
  if (p) return Math.max(2, Math.round(p.mins - PASS_SAVE * Math.max(0, p.hops - 1)));
  const A = coords(from), B = coords(to);
  if (!A || !B) return 10;
  const R = 6371, r = Math.PI / 180;
  const dLat = (B[0] - A[0]) * r, dLon = (B[1] - A[1]) * r;
  const km = 2 * R * Math.asin(Math.sqrt(Math.sin(dLat / 2) ** 2 + Math.cos(A[0] * r) * Math.cos(B[0] * r) * Math.sin(dLon / 2) ** 2));
  console.warn(`[KTX LCD] '${from.name} → ${to.name}' 구간이 소요시간 표에 없어 거리로 추정했어요 (${km.toFixed(0)}km). js/data/travelTimes.js에 추가하면 정확해집니다.`);
  return Math.max(3, Math.round((km / 150) * 60 * 1.25 + 3));
}

// 두 역 사이 실제 노선상 중간역들의 좌표 [[위도, 경도], ...] (노선도 선을 실제 경로대로 그리기용)
const COORD = new Map(Object.entries(STATIONS).map(([k, v]) => [norm(k), v]));
export function viaBetween(fromName, toName) {
  const p = shortest(norm(fromName), norm(toName));
  if (!p) return [];
  const A = COORD.get(norm(fromName)), B = COORD.get(norm(toName));
  let pts = p.nodes.slice(1, -1).map((n) => COORD.get(n)).filter((c) => c && c.lat != null);
  if (A && B) {
    // 출발→도착 방향으로 앞으로 나아가는 점만 (되돌아가거나 크게 옆으로 빠지는 점은 선이 꼬이므로 제외)
    const dx = B.lon - A.lon, dy = B.lat - A.lat, L2 = dx * dx + dy * dy || 1e-9;
    let last = 0;
    pts = pts.filter((c) => {
      const t = ((c.lon - A.lon) * dx + (c.lat - A.lat) * dy) / L2;
      const off = Math.abs((c.lon - A.lon) * dy - (c.lat - A.lat) * dx) / Math.sqrt(L2);
      if (t <= last || t >= 1 || off > Math.sqrt(L2) * 0.6) return false;
      last = t; return true;
    });
  }
  return pts.map((c) => [c.lat, c.lon]);
}

export { DWELL };
