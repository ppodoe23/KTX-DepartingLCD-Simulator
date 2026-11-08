// 정차역 안내 화면
// 실제 노선 경로(노선도 지도와 같은 좌표·곡선)를 확대해 깔고, 카메라가 캐릭터를 따라갑니다.
//  출발(depart): 정보 바가 접히고 링이 작은 캐릭터 원으로 줄어듦
//  도착(arrive): 캐릭터 원이 노선 경로를 따라 다음 역으로 이동(점선이 뒤따라 그려짐) → 도착하면 링이 피어남 → 정보 바 표시
import { anim, h, splitTime, fitWidth, EASE_OUT, EASE_IN, EASE_BACK } from './util.js';
import { buildRoutePath } from './routePath.js';

const NS = 'http://www.w3.org/2000/svg';
const R_OUT = 132, R_IN = 80, C = 135;
const RING_Y = 300;                                   // 링 중심의 화면 y
const SCREEN = { right: { x: 1085, y: RING_Y }, left: { x: 200, y: RING_Y } };
const TRAVEL_MS = 2000;                               // 캐릭터 이동 시간
const SPAN_PX = 820;                                  // 이전 역 ↔ 현재 역 직선거리를 화면에서 이 정도로 보이게 확대

// 링: 6분할. 중심을 지나는 직선 3개(폭 일정한 띠)로 잘라서 칸 사이가 곧은 선으로 나뉨
const SEGMENTS = 6, GAP_W = 7, GAP_OFFSET = 30; // 칸 수, 칸 사이 선 두께(px), 첫 선 각도(도) → 30·90·150°: 하나는 완전 수평
let uid = 0;
function ringSVG() {
  const id = 'rg' + uid++;
  let cuts = '';
  for (let i = 0; i < SEGMENTS / 2; i++) {
    const a = GAP_OFFSET + (i * 360) / SEGMENTS;
    cuts += `<rect x="${C - GAP_W / 2}" y="-10" width="${GAP_W}" height="290" fill="#000" transform="rotate(${a} ${C} ${C})"/>`;
  }
  const ring = `M${C},${C - R_OUT} a${R_OUT},${R_OUT} 0 1,0 0.01,0 Z M${C},${C - R_IN} a${R_IN},${R_IN} 0 1,1 -0.01,0 Z`;
  return `<svg class="ring" viewBox="0 0 270 270">
    <defs>
      <radialGradient id="${id}" cx="${C}" cy="${C}" r="${R_OUT}" gradientUnits="userSpaceOnUse">
        <stop offset="0.60" stop-color="#bdeafc"/>
        <stop offset="0.70" stop-color="#5cc4f3"/>
        <stop offset="0.86" stop-color="#2aa4ec"/>
        <stop offset="1"    stop-color="#1b8be0"/>
      </radialGradient>
      <mask id="${id}m" maskUnits="userSpaceOnUse" x="0" y="0" width="270" height="270">
        <rect width="270" height="270" fill="#fff"/>${cuts}
      </mask>
    </defs>
    <g class="segs" style="transform-origin:${C}px ${C}px">
      <path d="${ring}" fill="url(#${id})" fill-rule="evenodd" mask="url(#${id}m)"/>
    </g>
  </svg>`;
}

const PIN = `<svg class="pin" viewBox="0 0 20 28"><path d="M10 0C4.5 0 0 4.4 0 9.8 0 17 10 28 10 28s10-11 10-18.2C20 4.4 15.5 0 10 0z" fill="#e8413c"/><circle cx="10" cy="9.6" r="3.6" fill="#fff"/></svg>`;

// 이동하는 캐릭터 원: 파란 원 + 흰 테두리 + 열차 얼굴
const CHAR = `<svg viewBox="0 0 64 64">
  <defs><radialGradient id="chg" cx="40%" cy="35%" r="70%"><stop offset="0" stop-color="#4fb3f5"/><stop offset="1" stop-color="#1572cf"/></radialGradient></defs>
  <circle cx="32" cy="32" r="29" fill="url(#chg)" stroke="#fff" stroke-width="4"/>
  <path d="M13 37 C13 27 22 22 33 22 C43 22 50 27 52 33 C53 36 51 39 47 40 L17 41 C14.5 41 13 39.5 13 37Z" fill="#fff"/>
  <path d="M36 25.5 C42 25.5 46.5 28.5 48 32 L38 32 C36.5 32 35.5 31 35.5 29.5Z" fill="#1d5fb8"/>
  <circle cx="25" cy="33" r="2.4" fill="#1d5fb8"/>
  <path d="M15 43 L46 42" stroke="#9fd2f7" stroke-width="2" stroke-linecap="round"/>
</svg>`;

// 사용자 캐릭터 이미지 → 원 안에 머리 부분만 넣은 SVG (흰 배경은 자동으로 투명 처리)
async function characterSVG(c) {
  const img = new Image();
  img.src = c.image;
  await img.decode();
  const W = img.naturalWidth, H = img.naturalHeight;
  const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
  const ctx = cv.getContext('2d');
  const flip = c.flipX !== false;                       // 기본: 좌우 반전 (얼굴이 진행 방향 오른쪽을 보도록)
  if (flip) { ctx.translate(W, 0); ctx.scale(-1, 1); }
  ctx.drawImage(img, 0, 0);
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  if (c.removeWhiteBg !== false) {
    // 가장자리에서 이어진 흰색만 지움 (캐릭터 안쪽 흰색은 유지)
    const id = ctx.getImageData(0, 0, W, H), px = id.data;
    const white = (i) => px[i] > 235 && px[i + 1] > 235 && px[i + 2] > 235 && px[i + 3] > 0;
    const seen = new Uint8Array(W * H), stack = [];
    for (let x = 0; x < W; x++) stack.push(x, (H - 1) * W + x);
    for (let y = 0; y < H; y++) stack.push(y * W, y * W + W - 1);
    while (stack.length) {
      const p = stack.pop();
      if (seen[p]) continue; seen[p] = 1;
      if (!white(p * 4)) continue;
      px[p * 4 + 3] = 0;
      const x = p % W, y = (p / W) | 0;
      if (x > 0) stack.push(p - 1); if (x < W - 1) stack.push(p + 1);
      if (y > 0) stack.push(p - W); if (y < H - 1) stack.push(p + W);
    }
    ctx.putImageData(id, 0, 0);
  }
  const url = cv.toDataURL('image/png');
  const k = 50 / (c.size || Math.min(W, H));          // 머리 크기 → 원 안 지름 50
  const cx = flip ? W - (c.centerX ?? W / 2) : (c.centerX ?? W / 2);
  const x = 32 - cx * k, y = 32 - (c.centerY ?? H / 2) * k;
  // 흰 바탕 원 + 머리 + 두꺼운 파란 테두리 (실제 화면 모양)
  return `<svg viewBox="0 0 64 64">
    <defs>
      <radialGradient id="chg2" cx="45%" cy="40%" r="60%"><stop offset="0" stop-color="#ffffff"/><stop offset=".8" stop-color="#f2f9ff"/><stop offset="1" stop-color="#d9eefc"/></radialGradient>
      <clipPath id="chclip"><circle cx="32" cy="32" r="26.5"/></clipPath>
    </defs>
    <circle cx="32" cy="32" r="29" fill="url(#chg2)"/>
    <image href="${url}" x="${x}" y="${y}" width="${W * k}" height="${H * k}" clip-path="url(#chclip)"/>
    <circle cx="32" cy="32" r="27.6" fill="none" stroke="#1f80d8" stroke-width="5.2"/>
    <circle cx="32" cy="32" r="30.6" fill="none" stroke="rgba(255,255,255,.85)" stroke-width="1.4"/>
  </svg>`;
}

function buildRing(province) {
  const outer = h('div', 'balloon');
  outer.style.transformOrigin = '50% 50%';
  outer.innerHTML = ringSVG();
  const core = h('div', 'core', `${PIN}<span>${province}</span>`);
  outer.appendChild(core);
  return { outer, core, segs: outer.querySelector('.segs'), pin: core.querySelector('.pin'), prov: core.querySelector('span') };
}

const ease = (x) => (x < .5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2);
const frame = () => new Promise((r) => requestAnimationFrame(r));

export class StopGuide {
  constructor(layer, cfg) {
    this.layer = layer;
    this.cfg = cfg;
    this.charSVG = CHAR;
    const c = cfg.character;
    this.ready = c?.image
      ? characterSVG(c).then((svg) => { this.charSVG = svg; }).catch((e) => console.warn('[KTX LCD] 캐릭터 이미지 로드 실패 → 기본 아이콘 사용', e))
      : Promise.resolve();
    this.reset();
  }

  reset() {
    this.layer.innerHTML = '';
    this.rp = this.cfg.routeAll ? buildRoutePath(this.cfg.routeAll) : null;
    this.svg = document.createElementNS(NS, 'svg');
    this.svg.setAttribute('class', 'sg-paths');
    this.line = document.createElementNS(NS, 'path');
    this.line.setAttribute('class', 'sg-dots');
    this.svg.appendChild(this.line);
    this.char = h('div', 'sg-char', this.charSVG);
    this.char.style.opacity = '0';
    this.ringLayer = h('div', 'sg-rings');
    this.layer.append(this.svg, this.ringLayer, this.char);
    this.view = null;        // { cx, cy: 화면 기준이 되는 경로상 점, ax, ay: 그 점이 놓일 화면 위치, z: 확대율 }
    this.drawnD = 0;         // 점선이 그려진 거리
  }

  toScreen(p, v = this.view) { return { x: (p.x - v.cx) * v.z + v.ax, y: (p.y - v.cy) * v.z + v.ay }; }

  drawLine() {
    if (!this.rp || !this.view || this.drawnD <= 0) { this.line.setAttribute('d', ''); return; }
    const pts = this.rp.slice(0, this.drawnD).map((p) => this.toScreen(p));
    this.line.setAttribute('d', 'M' + pts.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join('L'));
  }

  placeChar(p) {
    this.char.style.left = p.x - 36 + 'px';
    this.char.style.top = p.y - 36 + 'px';
  }

  // idx: 정차역 순번(0부터). 노선 전체(출발역 포함)에서는 idx+1 번째 역
  async arrive(stop, side, idx) {
    const S = SCREEN[side];
    if (!this.rp) { this.placeChar(S); return this.bloom(stop, side, S); }
    const i = idx + 1;
    const A = this.rp.stationXY[i - 1], B = this.rp.stationXY[i];
    const chord = Math.hypot(B.x - A.x, B.y - A.y) || 1;
    const z1 = Math.min(400, Math.max(2, SPAN_PX / chord));
    const v1 = { cx: B.x, cy: B.y, ax: S.x, ay: S.y, z: z1 };
    // 출발 화면 상태: 직전 역 화면 그대로 / 첫 정차역이면 출발역이 v1 기준으로 보이는 위치에서 시작
    const v0 = this.view ? { ...this.view } : { cx: A.x, cy: A.y, ...(() => { const o = this.toScreen(A, v1); return { ax: o.x, ay: o.y }; })(), z: z1 };
    const d0 = this.rp.stationD[i - 1], d1 = this.rp.stationD[i];

    this.char.style.opacity = '1';
    const t0 = performance.now();
    for (;;) {
      const k = Math.min(1, (performance.now() - t0) / TRAVEL_MS);
      const e = ease(k);
      const P = this.rp.pointAt(d0 + (d1 - d0) * e);
      this.view = {
        cx: P.x, cy: P.y,
        ax: v0.ax + (S.x - v0.ax) * e, ay: v0.ay + (S.y - v0.ay) * e,
        z: v0.z * Math.pow(z1 / v0.z, e),
      };
      this.drawnD = d0 + (d1 - d0) * e;
      this.drawLine();
      this.placeChar({ x: this.view.ax, y: this.view.ay });
      if (k >= 1) break;
      await frame();
    }
    this.view = v1; this.drawnD = d1; this.drawLine();
    return this.bloom(stop, side, S);
  }

  // 도착: 캐릭터 원 → 링으로 피어남 + 정보 바 표시
  async bloom(stop, side, W) {
    const cfg = this.cfg;
    const t = splitTime(stop.time || stop.arrive);
    const pillX = side === 'right' ? 115 : 400;

    const ring = buildRing(stop.province);
    ring.outer.style.left = W.x - 135 + 'px';
    ring.outer.style.top = W.y - 135 + 'px';
    this.ringLayer.appendChild(ring.outer);

    const root = h('div', 'sg');
    const route = h('div', 'route', `From ${cfg.origin.en} to ${cfg.destination.en}`);
    route.style.left = pillX + 'px';
    const pName = h('div', 'pill pill-name');
    pName.style.left = pillX + 'px';
    const wrap = h('div', 'name-wrap');
    const name = h('div', 'name', `${stop.ko}역${stop.sub ? `<small>(${stop.sub})</small>` : ''}`);
    const roman = h('div', 'roman', `(${stop.en.toUpperCase()}${stop.subEn ? `(${stop.subEn.toUpperCase()})` : ''})`);
    wrap.append(name, roman);
    pName.appendChild(wrap);
    const pArr = h('div', 'pill pill-arr');
    pArr.style.left = pillX + 'px';
    const lab = h('div', 'arr-label', '<b>도착</b><small>Arrival</small>');
    const arrow = h('div', 'arr-arrow');
    const ampm = h('div', 'arr-ampm',
      `<b>${t.ko}</b><small><span class="${t.pm ? 'off' : ''}">AM</span><span class="${t.pm ? '' : 'off'}">PM</span></small>`);
    const time = h('div', 'arr-time', t.time);
    pArr.append(lab, arrow, ampm, time);
    root.append(route, pName, pArr);
    this.layer.appendChild(root);
    fitWidth(name, 700);

    const origin = side === 'right' ? '100% 50%' : '0% 50%';
    pName.style.transformOrigin = pArr.style.transformOrigin = origin;
    for (const el of [route, wrap, roman, lab, arrow, ampm, time]) el.style.opacity = '0';
    pName.style.transform = pArr.style.transform = 'scaleX(0)';
    ring.core.style.transform = 'scale(0)';
    ring.pin.style.opacity = ring.prov.style.opacity = '0';
    ring.pin.style.transformOrigin = '50% 100%';

    const jobs = [];
    // 캐릭터 원이 커지며 링으로 바뀜 (한 바퀴 핑)
    jobs.push(anim(this.char, [{ transform: 'scale(1)', opacity: 1 }, { transform: 'scale(1.6)', opacity: 0 }], { duration: 350 }));
    jobs.push(anim(ring.outer, [{ transform: 'scale(.22)', opacity: 0 }, { transform: 'scale(.22)', opacity: 1, offset: .05 }, { transform: 'scale(1)', opacity: 1 }], { duration: 700, easing: EASE_BACK }));
    jobs.push(anim(ring.segs, [{ transform: 'rotate(-360deg)' }, { transform: 'rotate(0deg)' }], { duration: 1000, easing: 'cubic-bezier(.2,.7,.25,1)' }));
    jobs.push(anim(ring.core, [{ transform: 'scale(0)' }, { transform: 'scale(1)' }], { duration: 550, delay: 350, easing: EASE_BACK }));
    // 위치 아이콘: 위에서 떨어져 통통 튀며 안착
    jobs.push(anim(ring.pin, [
      { opacity: 0, transform: 'translateY(-26px)' },
      { opacity: 1, transform: 'translateY(0)', offset: .35, easing: 'cubic-bezier(.3,0,.6,1)' },
      { transform: 'translateY(-9px)', offset: .55, easing: 'cubic-bezier(.3,0,.6,1)' },
      { transform: 'translateY(0)', offset: .72, easing: 'cubic-bezier(.3,0,.6,1)' },
      { transform: 'translateY(-3px)', offset: .86 },
      { opacity: 1, transform: 'translateY(0)' },
    ], { duration: 750, delay: 750, easing: 'linear' }));
    jobs.push(anim(ring.prov, [{ opacity: 0 }, { opacity: 1 }], { duration: 400, delay: 850 }));

    // 정보 바
    jobs.push(anim(pName, [{ transform: 'scaleX(0)' }, { transform: 'scaleX(1)' }], { duration: 520, delay: 300, easing: EASE_OUT }));
    jobs.push(anim(pArr, [{ transform: 'scaleX(0)' }, { transform: 'scaleX(1)' }], { duration: 520, delay: 390, easing: EASE_OUT }));
    jobs.push(anim(route, [{ opacity: 1, clipPath: 'inset(0 50% 0 50%)' }, { opacity: 1, clipPath: 'inset(0 0 0 0)' }], { duration: 700, delay: 550 }));
    jobs.push(anim(wrap, [{ opacity: 1, transform: 'translateY(-115%)' }, { opacity: 1, transform: 'none' }], { duration: 560, delay: 720, easing: EASE_OUT }));
    jobs.push(anim(roman, [{ opacity: 0 }, { opacity: 1 }], { duration: 400, delay: 1050 }));
    jobs.push(anim(lab, [{ opacity: 0, transform: 'translateX(-30px)' }, { opacity: 1, transform: 'none' }], { duration: 450, delay: 800 }));
    jobs.push(anim(arrow, [{ opacity: 0 }, { opacity: 1 }], { duration: 300, delay: 1000 }));
    jobs.push(anim(ampm, [{ opacity: 1, transform: 'translateY(-160px)' }, { opacity: 1, transform: 'none' }], { duration: 520, delay: 980, easing: EASE_OUT }));
    jobs.push(anim(time, [{ opacity: 1, transform: 'translateY(-160px)' }, { opacity: 1, transform: 'none' }], { duration: 560, delay: 1130, easing: EASE_OUT }));
    await Promise.all(jobs);
    this.char.getAnimations().forEach((a) => a.cancel());
    this.char.style.opacity = '0';

    // 대기 중: 위치 아이콘이 주기적으로 위아래로 통통 점프
    const pinAnim = ring.pin.animate([
      { transform: 'translateY(0)', easing: 'cubic-bezier(.2,.6,.4,1)' },
      { transform: 'translateY(-14px)', offset: .16, easing: 'cubic-bezier(.6,0,.8,.4)' },
      { transform: 'translateY(0) scale(1.08, .9)', offset: .30, easing: 'cubic-bezier(.2,.6,.4,1)' },
      { transform: 'translateY(-5px)', offset: .40, easing: 'cubic-bezier(.6,0,.8,.4)' },
      { transform: 'translateY(0)', offset: .50 },
      { transform: 'translateY(0)' },
    ], { duration: 1600, iterations: Infinity });

    return { side, root, route, pName, pArr, wrap, lab, arrow, ampm, time, ring, pinAnim, W };
  }

  // 표시 중간에 링 한 바퀴 더 회전 (등장 때와 같은 '핑' 회전)
  spin(ps) {
    return anim(ps.ring.segs, [{ transform: 'rotate(-360deg)' }, { transform: 'rotate(0deg)' }],
      { duration: 1000, easing: 'cubic-bezier(.2,.7,.25,1)', fill: 'none' });
  }

  // 출발: 정보 바 접힘 + 링이 캐릭터 원으로 줄어듦
  async depart(ps) {
    const { root, route, pName, pArr, wrap, lab, arrow, ampm, time, ring, W } = ps;
    const fadeOut = (el, delay = 0) => anim(el, [{ opacity: 1 }, { opacity: 0 }], { duration: 260, delay });
    const jobs = [fadeOut(wrap), fadeOut(lab), fadeOut(arrow), fadeOut(ampm), fadeOut(time), fadeOut(route, 60)];
    jobs.push(anim(pName, [{ transform: 'scaleX(1)' }, { transform: 'scaleX(0)' }], { duration: 420, delay: 180, easing: EASE_IN }));
    jobs.push(anim(pArr, [{ transform: 'scaleX(1)' }, { transform: 'scaleX(0)' }], { duration: 420, delay: 240, easing: EASE_IN }));
    ps.pinAnim.cancel();
    jobs.push(anim(ring.core, [{ transform: 'scale(1)' }, { transform: 'scale(0)' }], { duration: 300, delay: 250, easing: EASE_IN }));
    jobs.push(anim(ring.segs, [{ transform: 'rotate(0deg)' }, { transform: 'rotate(240deg)' }], { duration: 600, delay: 300, easing: EASE_IN }));
    jobs.push(anim(ring.outer, [{ transform: 'scale(1)', opacity: 1 }, { transform: 'scale(.22)', opacity: 1, offset: .85 }, { transform: 'scale(.22)', opacity: 0 }], { duration: 600, delay: 300, easing: EASE_IN }));
    // 링 자리에 캐릭터 원 등장
    this.placeChar(W);
    jobs.push(anim(this.char, [{ transform: 'scale(.4)', opacity: 0 }, { transform: 'scale(1)', opacity: 1 }], { duration: 300, delay: 780, easing: EASE_BACK }));
    await Promise.all(jobs);
    this.char.getAnimations().forEach((a) => a.cancel());
    this.char.style.opacity = '1';
    root.remove();
    ring.outer.remove();
  }

  clear() { this.reset(); }
}
