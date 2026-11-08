// 출발 안내 3D 인트로 (역명판 + 출발 카드 → 선로 → 열차 플라이바이)
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { splitTime } from './util.js';
import { SIGUNGU } from './data/sigungu.js';

const W = 1280, H = 720;
const DECK_Y = 6;           // 고가 선로 높이
// 출발 화면은 전부 서울남산체. 굵기별로 B / EB 파일이 있으면 쓰고, 없으면 M으로 대체
const KR_TAIL = '"SeoulNamsan", "Noto Sans KR", "Noto Sans CJK KR", "Malgun Gothic", sans-serif';
const kr = (w) => (w >= 900 ? '"SeoulNamsanEB", "SeoulNamsanB", ' : w >= 700 ? '"SeoulNamsanB", ' : '') + KR_TAIL;

const ss = (x) => x * x * (3 - 2 * x);
const clamp01 = (x) => Math.min(1, Math.max(0, x));
const seg = (t, a, b) => clamp01((t - a) / (b - a));
const easeIn = (x) => x * x * x;
const easeOut = (x) => 1 - Math.pow(1 - x, 3);
const easeInOut = (x) => (x < .5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2);

// ── 7-세그먼트 숫자 (출발시간 표시) ─────────────────────────
const SEG = { 0: 'abcdef', 1: 'bc', 2: 'abdeg', 3: 'abcdg', 4: 'bcfg', 5: 'acdfg', 6: 'acdefg', 7: 'abc', 8: 'abcdefg', 9: 'abcdfg' };
function drawSegDigit(ctx, d, x, y, w, h, t) {
  const hh = h / 2;
  const bar = (x0, y0, len, horiz) => {
    const g = t * 0.5;
    ctx.beginPath();
    if (horiz) {
      ctx.moveTo(x0 + g, y0); ctx.lineTo(x0 + g * 2, y0 - g); ctx.lineTo(x0 + len - g * 2, y0 - g);
      ctx.lineTo(x0 + len - g, y0); ctx.lineTo(x0 + len - g * 2, y0 + g); ctx.lineTo(x0 + g * 2, y0 + g);
    } else {
      ctx.moveTo(x0, y0 + g); ctx.lineTo(x0 + g, y0 + g * 2); ctx.lineTo(x0 + g, y0 + len - g * 2);
      ctx.lineTo(x0, y0 + len - g); ctx.lineTo(x0 - g, y0 + len - g * 2); ctx.lineTo(x0 - g, y0 + g * 2);
    }
    ctx.closePath(); ctx.fill();
  };
  const on = SEG[d] || '';
  if (on.includes('a')) bar(x, y, w, true);
  if (on.includes('b')) bar(x + w, y, hh, false);
  if (on.includes('c')) bar(x + w, y + hh, hh, false);
  if (on.includes('d')) bar(x, y + h, w, true);
  if (on.includes('e')) bar(x, y + hh, hh, false);
  if (on.includes('f')) bar(x, y, hh, false);
  if (on.includes('g')) bar(x, y + hh, w, true);
}

function rr(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
}

// ── 출발 카드 캔버스 ─────────────────────────────────────
function drawCard(ctx, cfg, timeReveal, arrowOn = true, bodyReveal = 1) {
  const cw = 1024, ch = 640;
  ctx.clearRect(0, 0, cw, ch);
  // 회색 머리 부분 먼저, 그다음 흰 본문이 아래로 펼쳐짐 (bodyReveal 0 → 1)
  ctx.save();
  ctx.beginPath(); ctx.rect(0, 0, cw, 104 + (ch - 104) * bodyReveal); ctx.clip();
  rr(ctx, 4, 4, cw - 8, ch - 8, 26);
  ctx.fillStyle = 'rgba(255,255,255,0.93)'; ctx.fill();
  ctx.save(); ctx.clip();
  const hg = ctx.createLinearGradient(0, 0, 0, 104);
  hg.addColorStop(0, '#8b99be'); hg.addColorStop(1, '#7584ab');
  ctx.fillStyle = hg; ctx.fillRect(0, 0, cw, 104);
  ctx.restore();

  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = '#ffa53c'; ctx.font = `900 50px ${kr(900)}`; ctx.fillText('출발', 48, 72);
  ctx.fillStyle = '#ffb760'; ctx.font = `700 32px ${kr(700)}`; ctx.fillText('Departure', 160, 70);

  ctx.fillStyle = '#4c4c4c'; ctx.font = `500 26px ${kr(500)}`;
  ctx.fillText('행선지', 52, 214);
  ctx.fillText('출발시간', 52, 470);

  ctx.textAlign = 'center';
  // 긴 역명은 가로 폭에 맞춰 글자 크기 축소
  const fit = (txt, x, y, maxW, weight, size) => {
    ctx.font = `${weight} ${size}px ${kr(weight)}`;
    const w = ctx.measureText(txt).width;
    if (w > maxW) ctx.font = `${weight} ${Math.floor(size * maxW / w)}px ${kr(weight)}`;
    ctx.fillText(txt, x, y);
  };
  ctx.fillStyle = '#1b1b1b'; fit(cfg.origin.ko, 330, 258, 300, 700, 100);
  ctx.fillStyle = '#4a4a4a'; fit(cfg.origin.en, 330, 304, 320, 400, 28);
  ctx.fillStyle = '#a9b6c9'; fit(cfg.destination.ko, 700, 258, 300, 500, 100);
  ctx.fillStyle = '#bcc7d6'; fit(cfg.destination.en, 700, 304, 320, 400, 28);
  ctx.textAlign = 'left';
  // 출발역 → 도착역 사이 화살표 (노란색 ↔ 회색 깜빡임)
  ctx.fillStyle = arrowOn ? '#f5b324' : '#b9c0c9';
  ctx.beginPath(); ctx.moveTo(500, 208); ctx.lineTo(516, 222); ctx.lineTo(500, 236); ctx.closePath(); ctx.fill();

  if (timeReveal > 0) {
    const t = splitTime(cfg.departure);
    ctx.save();
    ctx.beginPath(); ctx.rect(0, 380, cw, 180 * timeReveal); ctx.clip();
    ctx.fillStyle = '#262626';
    if (cfg.departureTimeStyle === 'segment') {
      ctx.setTransform(1, 0, -0.17, 1, 0.17 * 466, 0); // 약 10° 기울어진 디지털 숫자 (y=466 기준선 고정)
      const [hs, ms] = t.time.split(':');
      const dw = 84, dh = 142, gap = 30, th = 19;
      let x = 760 - (hs.length + 2) * (dw + gap) - 30;
      for (const c of hs) { drawSegDigit(ctx, +c, x, 396, dw, dh, th); x += dw + gap; }
      ctx.fillRect(x - 4, 428, 15, 15); ctx.fillRect(x - 4, 492, 15, 15); x += 34;
      for (const c of ms) { drawSegDigit(ctx, +c, x, 396, dw, dh, th); x += dw + gap; }
      ctx.setTransform(1, 0, 0, 1, 0, 0);
    } else {
      ctx.textAlign = 'right';
      ctx.font = `500 172px ${kr(500)}`;
      ctx.fillText(t.time, 768, 538);
      ctx.textAlign = 'left';
    }
    ctx.fillStyle = '#2b2b2b';
    ctx.font = `700 30px ${kr(700)}`; ctx.fillText(t.en, 790, 484);
    ctx.font = `500 26px ${kr(500)}`; ctx.fillText(t.ko, 790, 520);
    ctx.restore();
  }
  ctx.restore();
}

// ── 역명판 캔버스 (기본 도형 / textMeshName 지정 시 사용) ─────
function drawSign(cfg) {
  const c = document.createElement('canvas'); c.width = 512; c.height = 832;
  const ctx = c.getContext('2d');
  const blueH = 500;
  const g = ctx.createLinearGradient(0, 0, 0, blueH);
  g.addColorStop(0, '#2a7de0'); g.addColorStop(1, '#165fc4');
  ctx.fillStyle = g; ctx.fillRect(0, 0, 512, blueH);
  ctx.fillStyle = '#25324a'; ctx.fillRect(0, blueH, 512, 832 - blueH);
  ctx.fillStyle = '#fff'; ctx.textAlign = 'center';
  const ko = cfg.origin.ko.split('');
  ctx.font = `700 120px ${kr(700)}`;
  if (ko.length === 2) { ctx.fillText(ko[0], 140, 200); ctx.fillText(ko[1], 380, 200); }
  else {
    const w = ctx.measureText(cfg.origin.ko).width;
    if (w > 420) ctx.font = `700 ${Math.floor(120 * 420 / w)}px ${kr(700)}`;
    ctx.fillText(cfg.origin.ko, 256, 200);
  }
  ctx.fillRect(56, 248, 400, 5);
  // 영문 | 한자
  ctx.textAlign = 'left';
  ctx.font = `500 44px ${kr(500)}`;
  const enW = Math.min(ctx.measureText(cfg.origin.en).width, 300);
  ctx.fillText(cfg.origin.en, 60, 318, 300);
  if (cfg.origin.hanja) {
    const hx = 60 + enW + 22;
    ctx.fillRect(hx, 280, 4, 50);
    ctx.font = `500 40px ${kr(500)}`; ctx.fillText(cfg.origin.hanja, hx + 18, 318, 452 - hx - 18);
  }
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 8;
  return tex;
}

// ── 출발역이 있는 시군구 3D 지도 ─────────────────────────────
// 바닥에 주변 시군구 경계선을 깔고, 출발역 시군구를 입체로 솟아오르게 합니다.
const REGION_H = 1.4;          // 솟아오른 지역 두께
const REGION_SIZE = 40;        // 출발역 시군구의 가로/세로 중 긴 쪽 크기
function inRing(x, y, ring) {  // ring: [[x,y], ...]
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i], [xj, yj] = ring[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}
function buildRegion(scene, origin) {
  const lat0 = origin.lat, lon0 = origin.lon;
  if (lat0 == null) return null;
  const KX = 111320 * Math.cos((lat0 * Math.PI) / 180), KZ = 110540;
  const toM = (lon, lat) => [(lon - lon0) * KX, -(lat - lat0) * KZ];   // 미터 (북쪽 = -z)
  const regions = SIGUNGU.map((g) => ({ n: g.n, rings: g.r.map((f) => { const r = []; for (let i = 0; i < f.length; i += 2) r.push(toM(f[i], f[i + 1])); return r; }) }));
  // 출발역이 들어 있는 시군구 (없으면 가장 가까운 곳)
  let home = null, ring = null;
  for (const g of regions) for (const r of g.rings) if (inRing(0, 0, r)) { home = g; ring = r; }
  if (!home) {
    let bd = Infinity;
    for (const g of regions) for (const r of g.rings) for (const [x, z] of r) { const d = x * x + z * z; if (d < bd) { bd = d; home = g; ring = r; } }
  }
  // 크기 맞추기
  const xs = ring.map((p) => p[0]), zs = ring.map((p) => p[1]);
  const w = Math.max(...xs) - Math.min(...xs), d = Math.max(...zs) - Math.min(...zs);
  const k = REGION_SIZE / Math.max(w, d);
  const cx = (Math.max(...xs) + Math.min(...xs)) / 2;
  // 앞쪽(카메라 쪽) 가장자리가 역명판 바로 앞(z = 1.7)에 오도록: x≈0 에서 지역 안쪽인 가장 큰 z
  let front = null;
  const zmax = Math.max(...zs), zmin = Math.min(...zs);
  for (let z = zmax; z > zmin; z -= (zmax - zmin) / 400) if (inRing(cx, z, ring)) { front = z; break; }
  if (front == null) front = zmax;
  const T = (p) => [(p[0] - cx) * k, (p[1] - front) * k + 1.7];
  const local = ring.map(T);
  console.info(`[KTX LCD] 출발 화면 지도: ${home.n}`);

  // 바닥 경계선 (주변 시군구)
  const reach = 260 / k;
  const segs = [];
  for (const g of regions) for (const r of g.rings) {
    if (!r.some(([x, z]) => Math.abs(x - cx) < reach && Math.abs(z - front) < reach)) continue;
    for (let i = 0; i < r.length; i++) {
      const a = T(r[i]), b2 = T(r[(i + 1) % r.length]);
      segs.push(a[0], -REGION_H + 0.02, a[1], b2[0], -REGION_H + 0.02, b2[1]);
    }
  }
  const lg = new THREE.BufferGeometry();
  lg.setAttribute('position', new THREE.Float32BufferAttribute(segs, 3));
  const lines = new THREE.LineSegments(lg, new THREE.LineBasicMaterial({ color: 0x9aa7b8, transparent: true, opacity: 0 }));
  scene.add(lines);

  // 솟아오르는 지역 (윗면 흰색, 옆면 연한 파랑)
  const shape = new THREE.Shape(local.map(([x, z]) => new THREE.Vector2(x, -z)));
  const geo = new THREE.ExtrudeGeometry(shape, { depth: 1, bevelEnabled: false, curveSegments: 1 });
  const slab = new THREE.Mesh(geo, [
    new THREE.MeshLambertMaterial({ color: 0xffffff }),
    new THREE.MeshLambertMaterial({ color: 0xb3d4f0 }),
  ]);
  slab.rotation.x = -Math.PI / 2;
  slab.position.y = -REGION_H;
  slab.scale.z = 0.001;
  scene.add(slab);
  return { slab, lines, contains: (x, z) => inRing(x, z, local) };
}

// ── glb 역명판에 역 이름 글씨 얹기 ─────────────────────────
// 모델 안에서 '파란 판' 메쉬를 자동으로 찾아, 그 앞면에 글씨만 있는 투명 판을 붙입니다.
function signTextTexture(cfg, aspect) {
  const cw = 1024, ch = Math.max(64, Math.round(cw / aspect));
  const c = document.createElement('canvas'); c.width = cw; c.height = ch;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#fff';
  const ko = cfg.origin.ko;
  // 한글 역명 (2글자면 양쪽으로 벌림)
  let size = Math.min(ch * 0.3, cw * 0.36);
  ctx.font = `700 ${size}px ${kr(700)}`; ctx.textBaseline = 'alphabetic';
  const baseY = ch * 0.4;
  if (ko.length === 2) {
    ctx.textAlign = 'center';
    ctx.fillText(ko[0], cw * 0.27, baseY); ctx.fillText(ko[1], cw * 0.74, baseY);
  } else {
    ctx.textAlign = 'center';
    const w = ctx.measureText(ko).width;
    if (w > cw * 0.84) { size *= (cw * 0.84) / w; ctx.font = `700 ${size}px ${kr(700)}`; }
    ctx.fillText(ko, cw / 2, baseY);
  }
  // 밑줄
  const lineY = ch * 0.5, lw = Math.max(3, ch * 0.012);
  ctx.fillRect(cw * 0.1, lineY, cw * 0.8, lw);
  // 영문 | 한자
  const small = Math.min(ch * 0.095, cw * 0.09);
  ctx.textAlign = 'left';
  ctx.font = `500 ${small}px ${kr(500)}`;
  const y2 = ch * 0.64;
  const enW = Math.min(ctx.measureText(cfg.origin.en).width, cw * 0.55);
  ctx.fillText(cfg.origin.en, cw * 0.12, y2, cw * 0.55);
  if (cfg.origin.hanja) {
    const hx = cw * 0.12 + enW + small * 0.45;
    ctx.fillRect(hx, y2 - small * 0.85, Math.max(3, small * 0.08), small * 1.05);
    ctx.font = `500 ${small * 0.9}px ${kr(500)}`;
    ctx.fillText(cfg.origin.hanja, hx + small * 0.4, y2, cw * 0.9 - hx);
  }
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 8;
  return tex;
}

function addSignText(g, cfg) {
  g.updateMatrixWorld(true);
  const cands = [];
  g.traverse((o) => {
    if (!o.isMesh || !isShown(o)) return;
    const m = Array.isArray(o.material) ? o.material[0] : o.material;
    const col = m?.color;
    if (!col) return;
    const hsl = {}; col.getHSL(hsl);
    const blue = hsl.h > 0.53 && hsl.h < 0.72 && hsl.s > 0.3 && hsl.l > 0.15;
    const b = new THREE.Box3().setFromObject(o, true), sz = b.getSize(new THREE.Vector3());
    cands.push({ o, b, sz, blue, area: sz.x * sz.y });
  });
  const blues = cands.filter((c) => c.blue);
  const pick = (blues.length ? blues : cands).sort((a, b) => b.area - a.area)[0];
  if (!pick) return;
  const { b, sz } = pick;
  // 판이 옆으로 서 있으면(정면이 X축) 회전 보정이 필요하다는 뜻
  if (sz.z > sz.x * 1.5) console.warn('[KTX LCD] 역명판: 판 정면이 카메라를 보고 있지 않은 것 같아요. config의 stationSign.rotationY를 90 또는 -90으로 바꿔 보세요.');
  const w = sz.x, hgt = sz.y;
  const tex = signTextTexture(cfg, w / hgt);
  const plane = new THREE.Mesh(new THREE.PlaneGeometry(w * 0.96, hgt * 0.96),
    new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false }));
  plane.position.set((b.min.x + b.max.x) / 2, (b.min.y + b.max.y) / 2, b.max.z + Math.max(0.005, sz.z * 0.02));
  plane.renderOrder = 2;
  g.add(plane);
  console.info(`[KTX LCD] 역명판: '${pick.o.name || '(이름없음)'}' 판에 역 이름 글씨를 붙였습니다 (${w.toFixed(2)} × ${hgt.toFixed(2)}m)`);
}

// ── glb 정규화 ─────────────────────────────────────────
// 모델 '본체'만으로 크기를 잽니다. 로블록스 Baseplate 같은 거대한 판, 멀리 떨어진 파트,
// 숨김 파트가 섞여 있으면 전체 박스가 커져서 모델이 작아지므로 자동으로 제외합니다.
function isShown(o) { for (let p = o; p; p = p.parent) if (!p.visible) return false; return true; }

function bodyBox(root, label, ignore = []) {
  root.updateMatrixWorld(true);
  const items = [];
  root.traverse((o) => {
    if (!o.isMesh || !isShown(o)) return;
    if (ignore.includes(o.name)) { o.visible = false; return; }
    const mats = Array.isArray(o.material) ? o.material : [o.material];
    if (mats.every((m) => m && m.transparent && m.opacity === 0)) return;
    const b = new THREE.Box3().setFromObject(o, true);
    if (b.isEmpty()) return;
    const sz = b.getSize(new THREE.Vector3());
    items.push({ o, b, c: b.getCenter(new THREE.Vector3()), d: sz.length(), sz });
  });
  if (!items.length) return new THREE.Box3().setFromObject(root, true);
  const med = (arr) => { const a = [...arr].sort((x, y) => x - y); return a[Math.floor(a.length / 2)]; };
  const removed = [];
  let keep = items;
  for (let pass = 0; pass < 3; pass++) {
  const before = keep.length;
  // 1) 바닥판: 납작하면서 나머지 파트 전체보다 훨씬 넓은 메쉬
  const isFlat = (i) => Math.min(i.sz.x, i.sz.y, i.sz.z) < Math.max(i.sz.x, i.sz.y, i.sz.z) * 0.02;
  const solid = keep.filter((i) => !isFlat(i));
  if (solid.length) {
    const ref = new THREE.Box3(); solid.forEach((i) => ref.union(i.b));
    const rs = ref.getSize(new THREE.Vector3()), refW = Math.max(rs.x, rs.z, 1e-6);
    keep = keep.filter((i) => {
      if (isFlat(i) && Math.max(i.sz.x, i.sz.z) > refW * 3) { removed.push(i); return false; }
      return true;
    });
  }
  // 2) 멀리 떨어진 파트: 중심에서의 거리가 중앙값의 6배를 넘는 메쉬
  if (keep.length >= 3) {
    const mc = new THREE.Vector3(med(keep.map((i) => i.c.x)), med(keep.map((i) => i.c.y)), med(keep.map((i) => i.c.z)));
    const md = med(keep.map((i) => i.d));
    const medDist = med(keep.map((i) => i.c.distanceTo(mc)));
    const lim = medDist * 6 + md * 1.5;
    keep = keep.filter((i) => {
      if (i.c.distanceTo(mc) > lim) { removed.push(i); return false; }
      return true;
    });
  }
  if (keep.length === before) break;
  }
  if (!keep.length) { keep = items; removed.length = 0; }
  for (const r of removed) r.o.visible = false; // 제외한 파트는 화면에서도 숨김
  const box = new THREE.Box3();
  for (const i of keep) box.union(i.b);
  const all = new THREE.Box3(); for (const i of items) all.union(i.b);
  const f = (v) => v.toArray().map((n) => +n.toFixed(2)).join(' × ');
  console.info(`[KTX LCD] ${label}: 메쉬 ${items.length}개, 전체 크기 ${f(all.getSize(new THREE.Vector3()))}, ` +
    `본체 크기 ${f(box.getSize(new THREE.Vector3()))}` +
    (removed.length ? `, 제외한 파트: ${removed.map((r) => r.o.name || '(이름없음)').join(', ')}` : ''));
  return box;
}

// 양 끝 3% 구간의 최고 높이를 비교해, 뒤(-X) 끝이 더 낮으면(=앞머리) true
function noseIsRear(root) {
  root.updateMatrixWorld(true);
  const box = new THREE.Box3();
  root.traverse((o) => { if (o.isMesh && isShown(o)) box.union(new THREE.Box3().setFromObject(o, true)); });
  const L = box.max.x - box.min.x;
  if (!(L > 0)) return false;
  const cut = L * 0.03, v = new THREE.Vector3();
  let frontMax = -Infinity, rearMax = -Infinity;
  root.traverse((o) => {
    if (!o.isMesh || !isShown(o)) return;
    const pos = o.geometry.attributes.position;
    const step = Math.max(1, Math.floor(pos.count / 20000));
    for (let i = 0; i < pos.count; i += step) {
      v.fromBufferAttribute(pos, i).applyMatrix4(o.matrixWorld);
      if (v.x > box.max.x - cut) frontMax = Math.max(frontMax, v.y);
      else if (v.x < box.min.x + cut) rearMax = Math.max(rearMax, v.y);
    }
  });
  const H = box.max.y - box.min.y;
  if (!isFinite(frontMax) || !isFinite(rearMax)) return false;
  return rearMax < frontMax - H * 0.1;
}

function normalize(model, { height, length, forwardAxis = 'auto', rotationY = 0, scale = 1, ignoreMeshes = [] }, label, isTrain = false) {
  const inner = new THREE.Group(); inner.add(model);
  let box = bodyBox(inner, label, ignoreMeshes);
  const size = box.getSize(new THREE.Vector3());
  let ax = forwardAxis;
  if (isTrain && ax === 'auto') ax = size.x >= size.z ? 'x' : 'z';
  const base = { x: 0, '-x': Math.PI, z: Math.PI / 2, '-z': -Math.PI / 2, auto: 0 }[ax] ?? 0;
  inner.rotation.y = base + THREE.MathUtils.degToRad(rotationY);
  // 앞뒤 자동 판별: 끝부분이 뾰족하게 낮아지는 쪽(앞머리)을 +X 앞으로
  if (isTrain && forwardAxis === 'auto' && noseIsRear(inner)) {
    inner.rotation.y += Math.PI;
    console.info(`[KTX LCD] ${label}: 앞머리 방향을 자동으로 뒤집었습니다 (반대면 forwardAxis를 직접 지정)`);
  }
  box = bodyBox(inner, label + ' (회전 후)', ignoreMeshes);
  const s2 = box.getSize(new THREE.Vector3());
  // 열차: length를 적으면 전체 길이 기준, 아니면 높이 기준 (객차 수와 상관없이 실제 비율 유지)
  const k = (length ? length / s2.x : height / s2.y) * scale;
  inner.scale.setScalar(k);
  inner.updateMatrixWorld(true);
  box = new THREE.Box3();
  inner.traverse((o) => { if (o.isMesh && isShown(o)) box.union(new THREE.Box3().setFromObject(o, true)); });
  const c = box.getCenter(new THREE.Vector3());
  inner.position.set(-c.x, -box.min.y, -c.z);
  const g = new THREE.Group(); g.add(inner);
  g.userData.length = (box.max.x - box.min.x);
  g.userData.height = (box.max.y - box.min.y);
  console.info(`[KTX LCD] ${label}: 화면 크기 길이 ${g.userData.length.toFixed(1)}m × 높이 ${g.userData.height.toFixed(1)}m (배율 ${k.toPrecision(3)})`);
  return g;
}

// ── 열차를 객차 단위로 나누기 (곡선에서 객차마다 따로 꺾이도록) ──────────
// normalize() 결과(길이 방향 +X, 중앙 정렬)를 받아 객차별 그룹으로 재구성합니다.
//  1) 객차 사이 틈(빈 구간)을 찾아 자동 분리
//  2) 틈이 없으면 carLength(m) 간격으로 분리
function articulate(g, opts = {}) {
  g.position.set(0, 0, 0); g.rotation.set(0, 0, 0); g.updateMatrixWorld(true);
  const meshes = [];
  g.traverse((o) => { if (o.isMesh && isShown(o)) meshes.push(o); });
  const items = meshes.map((o) => {
    const b = new THREE.Box3().setFromObject(o, true);
    return { o, x0: b.min.x, x1: b.max.x, cx: (b.min.x + b.max.x) / 2 };
  });
  const minX = Math.min(...items.map((i) => i.x0)), maxX = Math.max(...items.map((i) => i.x1));
  const L = maxX - minX;
  const H = g.userData.height || 4;

  let ranges = [];
  if (opts.carCount > 0) {
    const w = L / opts.carCount;
    for (let i = 0; i < opts.carCount; i++) ranges.push([minX + i * w, minX + (i + 1) * w]);
  } else {
    // 틈 찾기: 메쉬 구간을 겹치는 것끼리 합침
    const sorted = [...items].sort((a, b) => a.x0 - b.x0);
    for (const it of sorted) {
      const r = ranges[ranges.length - 1];
      if (r && it.x0 <= r[1] + 0.03) r[1] = Math.max(r[1], it.x1);
      else ranges.push([it.x0, it.x1]);
    }
    // 연결기처럼 짧은 조각은 옆 객차에 붙임
    const minCar = H * 1.5;
    for (let i = 0; i < ranges.length; i++) {
      if (ranges.length > 1 && ranges[i][1] - ranges[i][0] < minCar) {
        const j = i === 0 ? 1 : i - 1;
        ranges[j] = [Math.min(ranges[i][0], ranges[j][0]), Math.max(ranges[i][1], ranges[j][1])];
        ranges.splice(i, 1); i = -1;
      }
    }
    const carLen = opts.carLength || H * 5;      // KTX 객차 약 19~23m ≈ 높이의 5배
    if (ranges.length < 2 && L > carLen * 1.5) {  // 틈이 없으면 일정 간격으로
      const n = Math.round(L / carLen), w = L / n;
      ranges = [];
      for (let i = 0; i < n; i++) ranges.push([minX + i * w, minX + (i + 1) * w]);
    }
  }

  const root = new THREE.Group();
  const cars = ranges.map(([a, b]) => {
    const pivot = new THREE.Group();
    pivot.position.set((a + b) / 2, 0, 0);
    root.add(pivot);
    return { obj: pivot, cx: (a + b) / 2, half: (b - a) / 2 };
  });
  root.updateMatrixWorld(true);
  let spanning = 0;
  for (const it of items) {
    let k = cars.findIndex((c) => it.cx >= c.cx - c.half - 1e-6 && it.cx <= c.cx + c.half + 1e-6);
    if (k < 0) k = cars.reduce((best, c, i) => (Math.abs(c.cx - it.cx) < Math.abs(cars[best].cx - it.cx) ? i : best), 0);
    if (it.x1 - it.x0 > cars[k].half * 3) spanning++;
    cars[k].obj.attach(it.o);
  }
  console.info(`[KTX LCD] 열차: 객차 ${cars.length}량으로 분리 (${cars.map((c) => (c.half * 2).toFixed(1) + 'm').join(', ')})`);
  if (spanning) console.warn(`[KTX LCD] 열차: 여러 객차에 걸친 큰 메쉬 ${spanning}개 — 곡선에서 어색하면 config의 carCount를 지정해 보세요.`);
  root.userData = { cars, maxX, length: L };
  return root;
}

function loadGLB(url) {
  return new Promise((res) => {
    if (!url) return res(null);
    // 용량을 줄인(Draco / Meshopt 압축) glb도 읽을 수 있게
    const loader = new GLTFLoader();
    const draco = new DRACOLoader();
    draco.setDecoderPath('https://cdn.jsdelivr.net/npm/three@0.170.0/examples/jsm/libs/draco/gltf/');
    loader.setDRACOLoader(draco);
    loader.setMeshoptDecoder(MeshoptDecoder);
    loader.load(url, (g) => res(g.scene), undefined, (e) => {
      console.warn(`[KTX LCD] ${url} 로드 실패 → 기본 도형 사용`, e?.message || e);
      res(null);
    });
  });
}

// ── 기본 도형 (glb 없을 때) ───────────────────────────────
function fallbackSign(cfg, height) {
  const g = new THREE.Group();
  const k = height / 3.2;
  const dark = new THREE.MeshStandardMaterial({ color: 0x1f2a3d, roughness: .6 });
  const pole = new THREE.Mesh(new THREE.BoxGeometry(.16, 3.2, .16), dark);
  pole.position.set(-.86, 1.6, 0); g.add(pole);
  const cap = new THREE.Mesh(new THREE.BoxGeometry(.2, .08, .2), new THREE.MeshStandardMaterial({ color: 0xe6edf5 }));
  cap.position.set(-.86, 3.22, 0); g.add(cap);
  const face = new THREE.MeshStandardMaterial({ map: drawSign(cfg), roughness: .5 });
  const side = new THREE.MeshStandardMaterial({ color: 0x1a4fa8 });
  const panel = new THREE.Mesh(new THREE.BoxGeometry(1.6, 2.6, .1), [side, side, side, side, face, dark]);
  panel.position.set(0, 1.62, 0); g.add(panel);
  const plinth = new THREE.Mesh(new THREE.BoxGeometry(2.1, .12, .7), new THREE.MeshStandardMaterial({ color: 0xf3f8fc }));
  plinth.position.set(0, .06, 0); g.add(plinth);
  g.scale.setScalar(k);
  return g;
}

function fallbackTrain(L) {
  const g = new THREE.Group();
  const white = new THREE.MeshStandardMaterial({ color: 0xf6f8fb, roughness: .35, metalness: .1 });
  const blue = new THREE.MeshStandardMaterial({ color: 0x1d7fd8, roughness: .4 });
  const glass = new THREE.MeshStandardMaterial({ color: 0x1b2433, roughness: .2, metalness: .3 });
  const bodyL = L - 5;
  const body = new THREE.Mesh(new THREE.BoxGeometry(bodyL, 3.4, 3.0), white);
  body.position.set(-2.5, 2.1, 0); g.add(body);
  const nose = new THREE.Mesh(new THREE.SphereGeometry(1, 32, 16, 0, Math.PI * 2, 0, Math.PI / 2), white);
  nose.scale.set(1.5, 5, 1.5); nose.rotation.z = -Math.PI / 2;
  nose.position.set(bodyL / 2 - 2.5, 1.5, 0); g.add(nose);
  const stripe = new THREE.Mesh(new THREE.BoxGeometry(bodyL, .28, 3.04), blue);
  stripe.position.set(-2.5, 1.0, 0); g.add(stripe);
  const win = new THREE.Mesh(new THREE.BoxGeometry(bodyL - 2, .55, 3.04), glass);
  win.position.set(-3, 2.55, 0); g.add(win);
  const skirt = new THREE.Mesh(new THREE.BoxGeometry(L, .5, 2.6), new THREE.MeshStandardMaterial({ color: 0x3a4250 }));
  skirt.position.set(0, .3, 0); g.add(skirt);
  return g;
}

// ── 선로 리본 지오메트리 ────────────────────────────────────
function ribbon(curve, n, a, b, ya, yb, mat) {
  const pos = [], idx = [];
  const up = new THREE.Vector3(0, 1, 0);
  for (let i = 0; i <= n; i++) {
    const u = i / n;
    const p = curve.getPointAt(u), t = curve.getTangentAt(u);
    const side = new THREE.Vector3().crossVectors(t, up).normalize();
    const A = p.clone().addScaledVector(side, a); A.y = ya;
    const B = p.clone().addScaledVector(side, b); B.y = yb;
    pos.push(A.x, A.y, A.z, B.x, B.y, B.z);
    if (i < n) { const k = i * 2; idx.push(k, k + 1, k + 2, k + 1, k + 3, k + 2); }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setIndex(idx); geo.computeVertexNormals();
  return new THREE.Mesh(geo, mat);
}

export class Intro3D {
  constructor(canvas, cfg) {
    this.canvas = canvas; this.cfg = cfg;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    this.renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
    this.renderer.setSize(W, H, false);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(40, W / H, 0.1, 2000);
    this.ready = this.build();
  }

  async build() {
    const { scene, cfg } = this;
    // 하늘
    const sky = document.createElement('canvas'); sky.width = 4; sky.height = 512;
    const sg = sky.getContext('2d').createLinearGradient(0, 0, 0, 512);
    sg.addColorStop(0, '#5cc3ec'); sg.addColorStop(.35, '#a3def5'); sg.addColorStop(.6, '#e4f6fd'); sg.addColorStop(1, '#f6fcff');
    const sctx = sky.getContext('2d'); sctx.fillStyle = sg; sctx.fillRect(0, 0, 4, 512);
    const skyTex = new THREE.CanvasTexture(sky); skyTex.colorSpace = THREE.SRGBColorSpace;
    scene.background = skyTex;
    scene.fog = new THREE.Fog(0xeaf7fd, 60, 420);

    // 금속 재질 glb(로블록스 내보내기 등)도 검게 나오지 않도록 환경맵
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    scene.environmentIntensity = 0.8;
    scene.add(new THREE.HemisphereLight(0xe2f4ff, 0xffffff, 1.8));
    const sun = new THREE.DirectionalLight(0xffffff, 1.6); sun.position.set(6, 12, 9); scene.add(sun);

    const ground = new THREE.Mesh(new THREE.PlaneGeometry(3000, 3000), new THREE.MeshLambertMaterial({ color: 0xe9eff8 }));
    ground.rotation.x = -Math.PI / 2; ground.position.y = -REGION_H; scene.add(ground);

    // 출발역 시군구 3D 지도 (바닥 경계선 + 솟아오르는 지역)
    this.region = buildRegion(scene, cfg.origin);

    // 출발 카드
    const cc = document.createElement('canvas'); cc.width = 1024; cc.height = 640;
    this.cardCtx = cc.getContext('2d');
    await Promise.all(['SeoulNamsan', 'SeoulNamsanB', 'SeoulNamsanEB'].map((f) =>
      document.fonts.load(`100px "${f}"`, '출발역').catch(() => {})));
    drawCard(this.cardCtx, cfg, 0);
    this.cardTex = new THREE.CanvasTexture(cc); this.cardTex.colorSpace = THREE.SRGBColorSpace; this.cardTex.anisotropy = 8;
    this.card = new THREE.Mesh(new THREE.PlaneGeometry(4.1, 2.5625),
      new THREE.MeshBasicMaterial({ map: this.cardTex, transparent: true, depthWrite: false }));
    this.M = cfg.intro?.signSide === 'right' ? -1 : 1; // 역명판 왼쪽(1) / 오른쪽(-1)
    this.card.position.set(2.0 * this.M, 2.05, 0.6);
    scene.add(this.card);

    // 선로 (고가교)
    const pts = [[-260, -320], [-120, -200], [-20, -90], [30, 20], [50, 140], [40, 280]].map(([x, z]) => new THREE.Vector3(x + 500, DECK_Y, z));
    this.curve = new THREE.CatmullRomCurve3(pts, false, 'centripetal');
    this.curveLen = this.curve.getLength();
    const N = 600;
    const deckMat = new THREE.MeshStandardMaterial({ color: 0xf7fbfe, roughness: .8, side: THREE.DoubleSide });
    const blueMat = new THREE.MeshStandardMaterial({ color: 0x1f8fe6, roughness: .5, side: THREE.DoubleSide });
    const railMat = new THREE.MeshStandardMaterial({ color: 0x3b4352, roughness: .4, metalness: .5, side: THREE.DoubleSide });
    scene.add(ribbon(this.curve, N, -3.2, 3.2, DECK_Y, DECK_Y, deckMat));
    for (const s of [-1, 1]) {
      scene.add(ribbon(this.curve, N, 3.2 * s, 3.2 * s, DECK_Y, DECK_Y - 1.4, deckMat));       // 측벽
      scene.add(ribbon(this.curve, N, 3.25 * s, 3.25 * s, DECK_Y - .15, DECK_Y - .45, blueMat)); // 파란 라인
      scene.add(ribbon(this.curve, N, 2.7 * s, 3.2 * s, DECK_Y + .02, DECK_Y + .02, blueMat));
      scene.add(ribbon(this.curve, N, .75 * s - .04, .75 * s + .04, DECK_Y + .22, DECK_Y + .22, railMat)); // 레일
    }
    // 침목
    const sleeperN = Math.floor(this.curveLen / .7);
    const sleepers = new THREE.InstancedMesh(new THREE.BoxGeometry(.24, .14, 2.4), railMat, sleeperN);
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), X = new THREE.Vector3(1, 0, 0);
    for (let i = 0; i < sleeperN; i++) {
      const u = i / sleeperN, p = this.curve.getPointAt(u), t = this.curve.getTangentAt(u);
      q.setFromUnitVectors(X, new THREE.Vector3(t.x, 0, t.z).normalize());
      m4.compose(new THREE.Vector3(p.x, DECK_Y + .1, p.z), q, new THREE.Vector3(1, 1, 1));
      sleepers.setMatrixAt(i, m4);
    }
    scene.add(sleepers);
    // 교각
    const pierGeo = new THREE.CylinderGeometry(1.1, 1.3, DECK_Y - 1.4 + REGION_H, 16);
    for (let d = 10; d < this.curveLen; d += 32) {
      const p = this.curve.getPointAt(d / this.curveLen);
      const pier = new THREE.Mesh(pierGeo, deckMat); pier.position.set(p.x, (DECK_Y - 1.4 - REGION_H) / 2, p.z); scene.add(pier);
    }
    // 전차선 기둥 (영상 속 흰 기둥)
    const mastGeo = new THREE.BoxGeometry(.35, 7, .35);
    const armGeo = new THREE.BoxGeometry(.18, .18, 4.4);
    for (let d = 25; d < this.curveLen; d += 55) {
      const u = d / this.curveLen, p = this.curve.getPointAt(u), t = this.curve.getTangentAt(u);
      const side = new THREE.Vector3().crossVectors(t, new THREE.Vector3(0, 1, 0)).normalize();
      const mast = new THREE.Mesh(mastGeo, deckMat);
      mast.position.copy(p).addScaledVector(side, -3.6); mast.position.y = DECK_Y + 3.5;
      mast.rotation.y = Math.atan2(t.x, t.z); scene.add(mast);
      const arm = new THREE.Mesh(armGeo, deckMat);
      arm.position.copy(p).addScaledVector(side, -1.6); arm.position.y = DECK_Y + 6.6;
      arm.rotation.y = Math.atan2(side.x, side.z); scene.add(arm);
    }

    // 모델 로드
    const mc = cfg.models;
    const [signRaw, trainRaw] = await Promise.all([loadGLB(mc.stationSign.url), loadGLB(mc.train.url)]);
    if (signRaw) {
      if (mc.stationSign.textMeshName) {
        const tex = drawSign(cfg); tex.flipY = false;
        signRaw.traverse((o) => { if (o.isMesh && o.name === mc.stationSign.textMeshName) o.material = new THREE.MeshStandardMaterial({ map: tex }); });
      }
      this.sign = normalize(signRaw, mc.stationSign, '역명판');
      // 글씨 자동 붙이기 (textMeshName을 지정했거나 textMode: 'none'이면 생략)
      if (!mc.stationSign.textMeshName && mc.stationSign.textMode !== 'none') addSignText(this.sign, cfg);
    } else this.sign = fallbackSign(cfg, mc.stationSign.height);
    this.sign.position.set(-3.35 * this.M, .35, 0.3);
    scene.add(this.sign);

    const trainBody = trainRaw
      ? normalize(trainRaw, mc.train, '열차', true)
      : fallbackTrain(mc.train.length || 22);
    if (!trainRaw) { trainBody.userData.height = 3.9; }
    // 인트로 첫 장면에 서 있는 열차 (역명판 뒤, 직선 그대로)
    this.parked = trainBody.clone(true);
    this.train = articulate(trainBody, { carCount: mc.train.carCount, carLength: mc.train.carLength });
    this.trainLen = this.train.userData.length || 22;
    scene.add(this.train);
    const px = (-5 - this.trainLen / 2) * this.M, pz = -11;
    this.parked.position.set(px, this.region && !this.region.contains(px, pz) ? -REGION_H : 0, pz);
    scene.add(this.parked);
  }

  // 곡선 위 거리 d(m)의 점 + 옆방향
  at(d, lateral = 0, dy = 0) {
    const u = clamp01(d / this.curveLen);
    const p = this.curve.getPointAt(u), t = this.curve.getTangentAt(u);
    const side = new THREE.Vector3().crossVectors(t, new THREE.Vector3(0, 1, 0)).normalize();
    return p.addScaledVector(side, lateral).add(new THREE.Vector3(0, dy, 0));
  }

  // 곡선 위 거리 d의 선로 중심점
  railPoint(d) {
    const p = this.curve.getPointAt(clamp01(d / this.curveLen));
    return new THREE.Vector3(p.x, 0, p.z);
  }

  // 열차 앞머리가 선로 거리 front(m)에 오도록 객차마다 배치
  placeTrain(front) {
    const { cars, maxX } = this.train.userData;
    const y = DECK_Y + .22 + (this.cfg.models.train.yOffset || 0);
    const X = new THREE.Vector3(1, 0, 0);
    for (const c of cars) {
      const d = front - (maxX - c.cx);              // 객차 중심의 선로 거리
      const h = c.half * 0.72;                       // 앞뒤 대차 위치
      const a = this.railPoint(d + h), b = this.railPoint(d - h);
      const dir = a.clone().sub(b);
      if (dir.lengthSq() < 1e-8) { const t = this.curve.getTangentAt(clamp01(d / this.curveLen)); dir.set(t.x, 0, t.z); }
      c.obj.position.set((a.x + b.x) / 2, y, (a.z + b.z) / 2);
      c.obj.quaternion.setFromUnitVectors(X, dir.normalize());
    }
    this.train.visible = true;
  }

  // t: 초 단위 장면 시간
  update(t) {
    const cam = this.camera, M = this.M, V = (x, y, z) => new THREE.Vector3(x * M, y, z);
    const lerpV = (a, b, k) => a.clone().lerp(b, k);
    let pos, tgt;
    this.train.visible = false;
    this.card.visible = this.sign.visible = t < 8.3;
    this.parked.visible = false;   // 출발 화면에는 서 있는 열차 없음 (영상 기준)

    // 1) 바닥 지도 경계선이 나타남 → 2) 출발역 시군구가 솟아오르며 역명판도 함께 올라옴
    if (this.region) {
      this.region.lines.material.opacity = Math.min(1, t / 0.5) * (1 - seg(t, 2.6, 3.4) * 0.6);
      this.region.slab.scale.z = Math.max(0.001, REGION_H * easeOut(seg(t, 0.5, 1.7)));
    }
    const top = -REGION_H + REGION_H * easeOut(seg(t, 0.5, 1.7));
    this.sign.position.y = top;
    // 3) 출발 카드: 회색 머리 먼저 → 잠시 멈춤 → 흰 본문이 아래로 펼쳐짐
    this.card.position.x = 2.0 * this.M;
    this.card.material.opacity = easeOut(seg(t, 0.95, 1.2));
    const body = easeOut(seg(t, 1.7, 2.5));
    const arrowOn = Math.floor(t / 0.5) % 2 === 0;      // 0.5초 간격으로 깜빡임
    const key = body.toFixed(3) + '|' + arrowOn;
    if (key !== this._lastCardKey) { drawCard(this.cardCtx, this.cfg, 1, arrowOn, body); this.cardTex.needsUpdate = true; this._lastCardKey = key; }

    const D = this.curveLen;
    if (t < 1.9) {                               // A0: 위에서 내려다본 지도 → 내려오며 정면으로
      const k = easeInOut(seg(t, 0.2, 1.9));
      pos = lerpV(V(0, 26, 30), V(.6, 2.9, 11.2), k);
      tgt = lerpV(V(0, -REGION_H, -6), V(.5, 1.5, 0), k);
    } else if (t < 7.0) {                        // A: 역명판 + 출발 카드
      const k = ss(seg(t, 1.9, 7));
      pos = lerpV(V(.6, 2.9, 11.2), V(.3, 2.5, 9.8), k);
      tgt = lerpV(V(.5, 1.5, 0), V(.4, 1.4, 0), k);
    } else if (t < 8.3) {                        // B: 카드 옆으로 휙
      const k = easeIn(seg(t, 7.0, 8.3));
      pos = lerpV(V(.3, 2.5, 9.8), V(6.6, 3.1, 2.2), k);
      tgt = lerpV(V(.4, 1.4, 0), V(.8, 3.0, 0.4), k);
    } else if (t < 9.3) {                        // C1: 위에서 본 곡선 선로
      const k = ss(seg(t, 8.3, 9.3));
      const dc = D * 0.55 + k * 12;
      pos = this.at(dc - 8, 9, 13);
      tgt = this.at(dc + 10, 0, 0);
      this.placeTrain(D * 0.3 + (t - 8.3) * 60);
    } else if (t < 10.5) {                       // C2: 선로 따라 다가오는 열차
      const k = seg(t, 9.3, 10.5);
      const dc = D * 0.72;
      pos = this.at(dc + k * 3, 5.2, 2.6);
      tgt = this.at(dc - 70, -1, 1.2);
      this.placeTrain(dc - 150 + 125 * Math.pow(k, 1.5));
    } else {                                     // C3: 열차 옆을 훑으며 앞머리까지
      const k = seg(t, 10.5, 12.4);
      const dc = D * 0.6 + k * 30;
      pos = this.at(dc, 5.6, 2.4);
      tgt = this.at(dc + 9, 0.5, 1.6);
      const span = Math.min(this.trainLen, 60);
      // 처음엔 열차 옆면(중간쯤)이 보이고, 끝에 앞머리가 카메라 앞에 옴
      this.placeTrain(D * 0.6 + 6 - span * 0.6 + (30 + 3 + span * 0.6) * easeOut(k));
    }
    cam.position.copy(pos); cam.lookAt(tgt);
    this.renderer.render(this.scene, cam);
  }

  render(t) { this.update(t); }
}