// config.route → 화면에서 쓰는 역 정보로 변환 (역 DB 조회 + 도 이름 자동 판별)
import { STATIONS } from './data/stations.js';
import { PROVINCES, project } from './data/koreaMap.js';
import { viaBetween } from './travel.js';

let provinceSvg = null;
function provinceAt(lat, lon) {
  if (lat == null || lon == null) return '';
  if (!provinceSvg) {
    const NS = 'http://www.w3.org/2000/svg';
    provinceSvg = document.createElementNS(NS, 'svg');
    provinceSvg.style.cssText = 'position:absolute;width:0;height:0;overflow:hidden';
    for (const p of PROVINCES) {
      const el = document.createElementNS(NS, 'path');
      el.setAttribute('d', p.d); el.dataset.name = p.name; provinceSvg.appendChild(el);
    }
    document.body.appendChild(provinceSvg);
  }
  const [x, y] = project(lat, lon);
  const pt = new DOMPoint(x, y);
  for (const el of provinceSvg.children) if (el.isPointInFill(pt)) return el.dataset.name;
  // 해안선 단순화로 살짝 바다에 찍힌 경우: 가장 가까운 도
  let best = '', bd = Infinity;
  for (const el of provinceSvg.children) {
    const b = el.getBBox(); const cx = b.x + b.width / 2, cy = b.y + b.height / 2;
    const inside = x >= b.x - 3 && x <= b.x + b.width + 3 && y >= b.y - 3 && y <= b.y + b.height + 3;
    const d = Math.hypot(cx - x, cy - y) * (inside ? 0.5 : 1);
    if (d < bd) { bd = d; best = el.dataset.name; }
  }
  return best;
}

function resolve(entry, timeKey) {
  const e = typeof entry === 'string' ? { name: entry } : entry;
  const ko = e.name.replace(/역$/, '');
  const db = STATIONS[ko] || {};
  if (!STATIONS[ko] && (e.lat == null || !e.en)) console.warn(`[KTX LCD] '${ko}' 역 정보가 없습니다. config에 en / lat / lon 을 적어 주세요.`);
  const s = {
    ko,
    en: e.en ?? db.en ?? ko,
    hanja: e.hanja ?? db.hanja ?? '',
    sub: e.sub ?? db.sub ?? '',
    subEn: e.subEn ?? db.subEn ?? '',
    lat: e.lat ?? db.lat,
    lon: e.lon ?? db.lon,
    labelSide: e.labelSide || 'auto',
    via: e.via || [],             // 이전 역 → 이 역 사이 경유점 [[위도, 경도], ...]
    time: e[timeKey],
  };
  s.province = e.province ?? db.province ?? '';
  return s;
}

export function resolveRoute(route) {
  const origin = resolve(route.origin, 'depart');
  const stops = (route.stops || []).map((s) => resolve(s, 'arrive'));
  const destination = resolve(route.destination, 'arrive');
  const all = [origin, ...stops, destination];
  // 좌표가 없는 역은 앞뒤 역 사이로 보간
  all.forEach((s, i) => {
    if (s.lat != null) return;
    const prev = all.slice(0, i).reverse().find((x) => x.lat != null);
    const next = all.slice(i + 1).find((x) => x.lat != null);
    const a = prev || next, b = next || prev;
    if (a) { s.lat = (a.lat + b.lat) / 2; s.lon = (a.lon + b.lon) / 2; s.guessed = true; }
  });
  all.forEach((s) => { if (!s.province) s.province = provinceAt(s.lat, s.lon); });
  // via를 직접 안 적은 구간은 소요시간표의 실제 노선 경로(중간역 좌표)를 따라가게
  for (let i = 1; i < all.length; i++) if (!all[i].via.length) all[i].via = viaBetween(all[i - 1].ko, all[i].ko);
  return { origin, stops, destination, all, guide: [...stops, destination] };
}
