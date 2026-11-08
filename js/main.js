import cfg from './config.js';
import { anim, sleep, h } from './util.js';
import { StopGuide } from './stopGuide.js';
import { resolveRoute } from './route.js';
import { layout, computeLayout } from './layout.js';
import { RouteMap } from './routeMap.js';
import { loadSettings, initSettings, autoTimes } from './settings.js';

const $ = (s) => document.querySelector(s);
const stage = $('#stage');

// ── 화면 맞춤 (1280x720 → 창 크기) ─────────────────────────
// ── 반응형: 스테이지를 창에 꽉 채우고, 안내 내용은 가운데 상자에 ─────────
let lastMode = null;
function fit() {
  const L = computeLayout();
  stage.style.width = L.W + 'px';
  stage.style.height = L.H + 'px';
  stage.style.transform = `scale(${L.s})`;
  for (const el of document.querySelectorAll('.content-box')) {
    Object.assign(el.style, { left: L.box.x + 'px', top: L.box.y + 'px', width: L.box.w + 'px', height: L.box.h + 'px', right: 'auto', bottom: 'auto' });
  }
  document.body.classList.toggle('portrait', L.mode === 'port');
  dispatchEvent(new CustomEvent('stage-resize'));
  // 가로 ↔ 세로가 바뀌면 정차역 화면 배치가 달라지므로 처음부터 다시
  if (lastMode && lastMode !== L.mode) location.reload();
  lastMode = L.mode;
}
addEventListener('resize', fit); fit();

// ── 좌상단 시계 ───────────────────────────────────────────
const DAYS = ['일', '월', '화', '수', '목', '금', '토'];
const clockStart = Date.now();
const clockBase = cfg.clock?.mode === 'fixed' ? new Date(cfg.clock.value).getTime() : null;
function tickClock() {
  const d = clockBase ? new Date(clockBase + (Date.now() - clockStart)) : new Date();
  let hr = d.getHours(); const ap = hr >= 12 ? 'PM' : 'AM'; hr = hr % 12 || 12;
  $('#clock .d').textContent = `${d.getMonth() + 1}월 ${d.getDate()}일(${DAYS[d.getDay()]})`;
  $('#clock .t').textContent = `${String(hr).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')} ${ap}`;
}
tickClock(); setInterval(tickClock, 1000);

// ── 노선 정보 정리 (역 DB 조회, 도 이름 자동 판별) ─────────────
// 사이트 설정창에서 지정한 노선이 있으면 그것을, 없으면 config.js 노선을 사용
// 시각: 기본은 현재 시각 기준 자동 생성, 설정창에서 '직접 입력'을 켜면 입력한 시각 사용
const settings = loadSettings(cfg);
const autoMode = settings.times.mode !== 'manual';
const routeInput = autoMode ? autoTimes(settings.route, settings.times) : settings.route;
initSettings(routeInput, settings.times, settings.defaults);
const route = resolveRoute(routeInput);
cfg.origin = route.origin;
cfg.destination = route.destination;
cfg.departure = route.origin.time;
cfg.stops = route.guide;
cfg.routeAll = route.all;   // 정차역 화면의 이동 경로(지도 좌표)
console.info('[KTX LCD] 노선', route.all.map((s) => `${s.ko}(${s.province})`).join(' → '));

// ── 스케치 선 (인트로 첫 1.5초) ─────────────────────────────
function sketch() {
  const svg = $('#sketch'); svg.innerHTML = '';
  const paths = [
    'M180,720 C260,560 300,420 420,330 S640,180 700,0',
    'M560,720 C600,600 700,520 760,430 S900,260 1280,240',
    'M0,380 C160,360 260,300 360,200',
    'M900,720 C930,640 1020,560 1100,520 S1220,430 1280,420',
    'M720,0 C760,120 820,160 940,190',
  ];
  const els = paths.map((d) => { const p = document.createElementNS('http://www.w3.org/2000/svg', 'path'); p.setAttribute('d', d); svg.appendChild(p); return p; });
  svg.style.opacity = 1;
  els.forEach((p, i) => {
    const L = p.getTotalLength(); p.style.strokeDasharray = L;
    p.animate([{ strokeDashoffset: L }, { strokeDashoffset: 0 }], { duration: 1100, delay: i * 120, fill: 'forwards', easing: 'ease-out' });
  });
}

// ── 장면: 3D 인트로 ───────────────────────────────────────
let intro = null;
async function getIntro() {
  if (!intro) {
    try {
      const { Intro3D } = await import('./intro3d.js');
      intro = new Intro3D($('#gl'), cfg);
      await intro.ready;
    } catch (e) {
      console.error('[KTX LCD] 3D 인트로 초기화 실패:', e);
      intro = 'failed';
    }
  }
  return intro === 'failed' ? null : intro;
}

async function playIntro() {
  const it = await getIntro();
  stage.style.background = '#fff';
  if (!it) { await sleep(800); return; }
  const gl = $('#gl');
  gl.style.opacity = 0;
  const T = cfg.timing.intro / 1000;
  // 디버그: ?freeze=7.5 → 인트로 7.5초 장면에서 정지
  const fz = parseFloat(new URLSearchParams(location.search).get('freeze'));
  if (!isNaN(fz)) {
    gl.style.opacity = 1; $('#sketch').style.opacity = 0;
    const draw = () => { it.render(fz); requestAnimationFrame(draw); };
    draw(); return new Promise(() => {});
  }
  const t0 = performance.now();
  await new Promise((done) => {
    const loop = () => {
      const t = (performance.now() - t0) / 1000;
      it.render(Math.min(t, T));
      gl.style.opacity = Math.min(1, t / 0.25);
      $('#sketch').style.opacity = 0;
      $('#flash').style.opacity = Math.max(0, (t - (T - 0.5)) / 0.4);
      if (t < T) requestAnimationFrame(loop); else done();
    };
    requestAnimationFrame(loop);
  });
}

// ── 장면: 정차역 안내 ─────────────────────────────────────
const guide = new StopGuide($('#stopLayer'), cfg);
async function playStops(fromPoint) {
  const sky = $('#sky'), tag = $('#tag'), flash = $('#flash');
  sky.style.opacity = 1; $('#gl').style.opacity = 0;
  tag.style.opacity = 1;
  if (!fromPoint) anim(flash, [{ opacity: 1 }, { opacity: 0 }], { duration: 600 });
  const stops = cfg.stops;
  await guide.ready;
  guide.reset();
  let cur = null;
  for (let i = 0; i < stops.length; i++) {
    const side = i % 2 === 0 ? 'right' : 'left';
    if (cur) await guide.depart(cur);                 // 링 → 캐릭터 원
    cur = await guide.arrive(stops[i], side, i);      // 노선 경로 따라 이동 → 링 피어남
    const hold = Math.max(1000, cfg.timing.stop - 4000);
    await sleep(hold / 2);
    guide.spin(cur);                                   // 중간에 링 한 바퀴 더
    await sleep(hold / 2);
  }
  // 마지막 정차역 → 어두워짐
  const dim = $('#dim');
  await anim(dim, [{ opacity: 0 }, { opacity: .55, offset: .4 }, { opacity: 1 }], { duration: cfg.timing.dim, easing: 'linear' });
  guide.clear(); sky.style.opacity = 0; tag.style.opacity = 0;
}

// ── 장면: 노선도 지도 ─────────────────────────────────────
async function playMap() {
  if (!cfg.map?.enabled || !route.all.every((s) => s.lat != null)) return null;
  const sec = $('#routeMap'), sky = $('#sky'), tag = $('#tag'), flash = $('#flash');
  const map = new RouteMap(sec, cfg, route);
  const T = cfg.timing.map / 1000;
  sec.style.opacity = 1; $('#gl').style.opacity = 0;
  tag.style.opacity = 1; sky.style.opacity = 0;
  map.update(0, T);
  anim(flash, [{ opacity: 1 }, { opacity: 0 }], { duration: 700 });
  const fz = parseFloat(new URLSearchParams(location.search).get('mapfreeze'));
  if (!isNaN(fz)) { for (let t = 0; t <= fz; t += 1 / 60) map.update(t, T); map.update(fz, T); return new Promise(() => {}); }
  const t0 = performance.now();
  await new Promise((done) => {
    const loop = () => {
      const t = (performance.now() - t0) / 1000;
      map.update(Math.min(t, T), T);
      // 끝부분: 첫 정차역으로 줌인하며 하늘 배경으로 전환
      sky.style.opacity = Math.min(1, Math.max(0, (t - (T - 0.9)) / 0.9));
      if (t < T) requestAnimationFrame(loop); else done();
    };
    requestAnimationFrame(loop);
  });
  const pt = map.firstStopScreen();
  sec.style.opacity = 0;
  return pt;
}

// ── 장면: 안전 안내 ───────────────────────────────────────
async function playNotice() {
  const n = cfg.notice;
  const dim = $('#dim');
  if (!n.enabled) { await anim(dim, [{ opacity: 0 }], { duration: 500 }); return; }
  const sec = $('#notice'), scroll = sec.querySelector('.notice-scroll'), ticker = sec.querySelector('.ticker span');
  const bg = $('#noticeBg');
  if (n.backgroundVideo) { bg.src = n.backgroundVideo; bg.play().catch(() => {}); }
  scroll.innerHTML = '';
  n.lines.forEach(([txt, cls]) => scroll.appendChild(h('p', cls || '', txt || '&nbsp;')));
  ticker.textContent = n.tickers[0];
  sec.style.opacity = 1; $('#clock').style.opacity = 0;
  await anim(dim, [{ opacity: 1 }, { opacity: 0 }], { duration: 500 });

  // 박스 안에서 위로 스크롤 (5줄씩 보이고, 천천히 위로)
  const lineH = scroll.firstChild.offsetHeight, boxH = sec.querySelector('.notice-box').clientHeight, total = n.lines.length * lineH;
  const pad = (boxH - 5 * lineH) / 2;
  const hold = n.noticeHold || cfg.timing.noticeHold;
  const a = scroll.animate([
    { transform: `translateY(${pad}px)` },
    { transform: `translateY(${pad}px)`, offset: .35 },
    { transform: `translateY(${pad - (total - 5 * lineH)}px)`, offset: .75 },
    { transform: `translateY(${pad - (total - 5 * lineH)}px)` },
  ], { duration: hold, fill: 'forwards', easing: 'linear' });
  let ti = 0;
  const tk = setInterval(() => { ti = (ti + 1) % n.tickers.length; ticker.textContent = n.tickers[ti]; }, 5000);
  await a.finished;
  clearInterval(tk);

  if (n.afterVideo) {
    const v = $('#afterVideo'); v.src = n.afterVideo; v.style.display = 'block';
    try { await v.play(); await new Promise((r) => (v.onended = r)); } catch { /* 자동재생 차단 */ }
    v.style.display = 'none'; v.pause();
  }
  await anim(dim, [{ opacity: 0 }, { opacity: 1 }], { duration: 500 });
  sec.style.opacity = 0; bg.pause(); $('#clock').style.opacity = 1;
  await anim(dim, [{ opacity: 1 }, { opacity: 0 }], { duration: 300 });
}

// ── 메인 시퀀스 ─────────────────────────────────────────
// URL 파라미터 ?start=map | stops | notice 로 특정 장면부터 시작 가능
const start = new URLSearchParams(location.search).get('start');
async function run() {
  // 서울남산체 먼저 불러오기 (글자 폭 계산이 틀어지지 않도록)
  await Promise.all(['400 40px "SeoulNamsan"', '700 40px "SeoulNamsanB"'].map((f) => document.fonts.load(f, '역도착').catch(() => {})));
  let first = true;
  do {
    if (!first && autoMode) {
      // 반복할 때마다 현재 시각 기준으로 새로 생성
      const r = autoTimes(settings.route, settings.times);
      const list = [r.origin, ...(r.stops || []), r.destination];
      route.all.forEach((s, i) => { s.time = i === 0 ? list[i].depart : list[i].arrive; });
      cfg.departure = route.origin.time;
    }
    let pt = null;
    if (!(first && ['map', 'stops', 'notice'].includes(start))) await playIntro();
    if (!(first && ['stops', 'notice'].includes(start))) pt = await playMap();
    if (!(first && start === 'notice')) await playStops(pt);
    await playNotice();
    first = false;
  } while (cfg.loop);
}
run();

// R 키: 새로고침(처음부터)
addEventListener('keydown', (e) => { if (e.target.tagName !== 'INPUT' && (e.key === 'r' || e.key === 'R')) location.reload(); });
