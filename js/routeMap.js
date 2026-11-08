// 노선도 지도 화면 (출발 인트로 ↔ 정차역 안내 사이)
// 출발역에서 확대된 상태로 시작 → 전체 지도로 줌아웃하며 노선이 역 순서대로 그려짐 → 첫 정차역으로 줌인
import { NORTH_KOREA, PROVINCES, project } from './data/koreaMap.js';
import { buildRoutePath } from './routePath.js';
import { layout } from './layout.js';

const NS = 'http://www.w3.org/2000/svg';
const AR = 1280 / 720;   // 지도 구도 기준 비율 (view.h = 기준 상자 720px 높이에 담길 지도 범위)
const mk = (tag, attrs = {}, parent) => {
  const el = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
  parent?.appendChild(el);
  return el;
};
const clamp01 = (x) => Math.min(1, Math.max(0, x));
const seg = (t, a, b) => clamp01((t - a) / (b - a));
const ss = (x) => x * x * (3 - 2 * x);
const easeInOut = (x) => (x < .5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2);

export class RouteMap {
  constructor(section, cfg, route) {
    this.sec = section; this.cfg = cfg; this.route = route;
    section.innerHTML = '';
    const clouds = document.createElement('div'); clouds.className = 'map-clouds';
    section.appendChild(clouds);
    this.svg = mk('svg', { preserveAspectRatio: 'xMidYMid meet' }, section);
    const g = mk('g', {}, this.svg);
    mk('path', { d: NORTH_KOREA, class: 'nk' }, g);
    const originProv = route.origin.province;
    for (const p of PROVINCES) mk('path', { d: p.d, class: 'prov' + (p.name === originProv ? ' hl' : '') }, g);

    this.pts = route.all.map((s) => project(s.lat, s.lon));
    // 경로: 정차역 화면과 같은 곡선 (역 + 경유점 via)
    const rp = buildRoutePath(route.all);
    this.cum = rp.stationD;
    this.total = rp.total || 1;
    const d = 'M' + rp.samples.map((p) => `${p.x.toFixed(2)},${p.y.toFixed(2)}`).join('L');
    this.line = mk('path', { d, class: 'route', 'stroke-dasharray': this.total, 'stroke-dashoffset': this.total }, g);

    this.marks = route.all.map((s, i) => {
      const [x, y] = this.pts[i];
      const grp = mk('g', { class: 'stn', opacity: 0 }, g);
      const dot = mk('circle', { cx: x, cy: y, r: 4 }, grp);
      const lab = mk('text', { x, y, 'text-anchor': s.labelSide === 'right' ? 'start' : 'end' }, grp);
      lab.textContent = s.ko;
      return { grp, dot, lab, x, y, side: s.labelSide === 'right' ? 'right' : 'left' };
    });

    // 첫 정차역에 나타나는 작은 풍선 (정차역 안내로 넘어가기 직전)
    const p1s = this.pts[1] || this.pts[0];
    this.pop = mk('circle', { cx: p1s[0], cy: p1s[1], r: 0, class: 'pop', opacity: 0 }, g);

    // 카메라(뷰박스) 설정
    const xs = this.pts.map((p) => p[0]), ys = this.pts.map((p) => p[1]);
    const bb = { x0: Math.min(...xs), x1: Math.max(...xs), y0: Math.min(...ys), y1: Math.max(...ys) };
    const mode = cfg.map?.view || 'auto';
    const routeH = Math.max(bb.y1 - bb.y0, (bb.x1 - bb.x0) / AR);
    if (mode === 'korea' || (mode === 'auto' && routeH > 140)) {
      this.full = { cx: 300, cy: 260, h: 660 };   // 남한 전체 + 북한 일부 (영상 구도)
    } else {
      this.full = { cx: (bb.x0 + bb.x1) / 2, cy: (bb.y0 + bb.y1) / 2, h: Math.max(routeH * 2.2, 50) };
    }
    this.avoidLabelOverlap(route.all);
    this.start = { cx: this.pts[0][0], cy: this.pts[0][1] + 30, h: Math.min(260, this.full.h * 0.45) };
    const p1 = this.pts[1] || this.pts[0];
    this.end = { cx: p1[0], cy: p1[1], h: Math.min(110, this.full.h * 0.3) };
  }

  // 전체 지도 구도 기준으로 역 이름이 다른 역/이름과 겹치면 반대쪽으로 옮김 (labelSide 직접 지정한 역은 제외)
  avoidLabelOverlap(stations) {
    const u = this.unit(this.full.h);
    const box = (m, side) => {
      const w = (m.lab.textContent.length * 15.5 + 4) * u, h = 16 * u;
      const x0 = side === 'right' ? m.x + 9 * u : m.x - 9 * u - w;
      return { x0, x1: x0 + w, y0: m.y - 9 * u, y1: m.y - 9 * u + h };
    };
    const hit = (a, b) => a.x0 < b.x1 && b.x0 < a.x1 && a.y0 < b.y1 && b.y0 < a.y1;
    const dotBox = (m) => ({ x0: m.x - 6 * u, x1: m.x + 6 * u, y0: m.y - 6 * u, y1: m.y + 6 * u });
    const placed = [];
    this.marks.forEach((m, i) => {
      const fixed = stations[i].labelSide !== 'auto';
      const sides = fixed ? [m.side] : ['left', 'right'];
      let best = sides[0], bestCost = Infinity;
      for (const side of sides) {
        const b = box(m, side);
        let cost = 0;
        this.marks.forEach((o, j) => { if (j !== i && hit(b, dotBox(o))) cost += 2; });
        for (const p of placed) if (hit(b, p)) cost += 1;
        if (cost < bestCost) { bestCost = cost; best = side; }
      }
      m.side = best;
      m.lab.setAttribute('text-anchor', best === 'right' ? 'start' : 'end');
      placed.push(box(m, best));
    });
  }

  // 빨간 점 등장 바운스: 0 → 크게 튀었다가 → 제자리 (age: 등장 후 초)
  static bounce(age) {
    if (age == null || age < 0) return 0;
    if (age > 1.2) return 1;
    return 1 - Math.exp(-6.5 * age) * Math.cos(age * 17);
  }

  // 화면 1px 당 지도 단위: 지도 범위(v.h, 16:9 기준)가 가운데 콘텐츠 상자에 들어가도록
  unit(h) {
    const b = layout.box;
    return Math.max(h / b.h, (h * AR) / b.w);
  }

  setView(v) {
    const u = this.unit(v.h), W = layout.W, H = layout.H;
    this.svg.setAttribute('width', W); this.svg.setAttribute('height', H);
    this.svg.setAttribute('viewBox', `${v.cx - (W * u) / 2} ${v.cy - (H * u) / 2} ${W * u} ${H * u}`);
    this.line.setAttribute('stroke-width', 2.8 * u);
    for (const m of this.marks) {
      m.dot.setAttribute('r', 5 * u * Math.max(0, RouteMap.bounce(m.age)));
      m.dot.setAttribute('stroke-width', 1.6 * u);
      m.lab.setAttribute('font-size', 15 * u);
      m.lab.setAttribute('stroke-width', 3.5 * u);
      m.lab.setAttribute('x', m.x + (m.side === 'right' ? 9 : -9) * u);
      m.lab.setAttribute('y', m.y + 5 * u);
    }
    this.view = v;
  }

  // 지도 좌표 → 화면 좌표
  toScreen([x, y]) {
    const v = this.view, u = this.unit(v.h);
    return { x: (x - v.cx) / u + layout.W / 2, y: (y - v.cy) / u + layout.H / 2 };
  }

  static lerpView(a, b, k) {
    return { cx: a.cx + (b.cx - a.cx) * k, cy: a.cy + (b.cy - a.cy) * k, h: a.h * Math.pow(b.h / a.h, k) };
  }

  // 화면 시간 t(초)에 맞춰 갱신. T = 전체 길이(초)
  update(t, T) {
    const zOut = easeInOut(seg(t, 0.3, 4.2));
    const zIn = easeInOut(seg(t, T - 2.2, T - 0.4));
    let v = RouteMap.lerpView(this.start, this.full, zOut);
    if (zIn > 0) v = RouteMap.lerpView(this.full, this.end, zIn);

    // 노선 그리기: 1.0초 ~ (T-3.6)초
    const k = ss(seg(t, 1.0, Math.max(2, T - 3.6)));
    const len = k * this.total;
    this.line.setAttribute('stroke-dashoffset', this.total - len);
    this.marks.forEach((m, i) => {
      const appear = this.cum[i] <= len + 0.01 && t >= 0.8;
      if (appear && m.t0 == null) m.t0 = t;
      if (!appear) m.t0 = null;
      m.age = m.t0 == null ? null : t - m.t0;
      m.grp.setAttribute('opacity', appear ? 1 : 0);
      m.lab.setAttribute('opacity', m.age == null ? 0 : Math.min(1, m.age / 0.3));
    });
    this.setView(v);
    this.updatePop(t, T);
  }

  updatePop(t, T) {
    const k = ss(seg(t, T - 1.7, T - 1.1));
    const u = this.unit(this.view.h);
    this.pop.setAttribute('opacity', k);
    this.pop.setAttribute('r', 16 * u * k);
    this.pop.setAttribute('stroke-width', 6 * u);
  }

  firstStopScreen() { return this.toScreen(this.pts[1] || this.pts[0]); }
}
