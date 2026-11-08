// 사이트에서 노선(출발역 · 정차역 · 종착역 · 시각) 지정하기
//  - S 키로 설정창 열기 / 닫기 (Esc로도 닫힘)
//  - [적용]: 브라우저에 저장(localStorage)하고 처음부터 다시 재생
//  - [링크 복사]: 지금 노선이 담긴 주소를 복사 (다른 PC에서도 같은 노선으로 열림)
//  - [기본값]: config.js의 노선으로 되돌리기
//  - 시각: 기본은 현재 시각 + 실제 역간 소요시간표로 자동 생성, '직접 입력'을 켜면 입력한 시각 사용
import { STATIONS } from './data/stations.js';
import { travelMinutes, DWELL } from './travel.js';

const KEY = 'ktxlcd.route';

// 설정 불러오기: URL(?route=, ?times=) → 브라우저 저장값 → config.js 순서
//  route: { origin, stops, destination }
//  times: { mode: 'auto' | 'manual', dwell }  (auto: 현재 시각 + 실제 역간 소요시간표로 자동 생성)
export function loadSettings(cfg) {
  const def = { route: cfg.route, times: { mode: 'auto', dwell: DWELL, ...(cfg.times || {}) } };
  let saved = null;
  try { const s = localStorage.getItem(KEY); if (s) saved = JSON.parse(s); } catch { /* 저장소 사용 불가 */ }
  if (saved && saved.origin) saved = { route: saved };          // 예전 저장 형식
  const out = { route: saved?.route || def.route, times: { ...def.times, ...(saved?.times || {}) } };
  try {
    const q = new URLSearchParams(location.search);
    if (q.get('route')) out.route = JSON.parse(q.get('route'));
    if (q.get('times')) out.times = { ...out.times, ...JSON.parse(q.get('times')) };
  } catch (e) { console.warn('[KTX LCD] 주소의 route/times 값을 읽지 못했습니다', e); }
  return { ...out, defaults: def };
}

// 현재 시각 기준 자동 시각: 출발 = 지금, 이후 역은 역간 소요시간표(data/travelTimes.js) + 정차시간
export function autoTimes(route, times, now = new Date()) {
  const r = JSON.parse(JSON.stringify(route));
  const dwell = Math.max(0, +(times.dwell ?? DWELL) || 0);
  let m = now.getHours() * 60 + now.getMinutes();
  const fmt = (x) => { x = ((x % 1440) + 1440) % 1440; return `${String(Math.floor(x / 60)).padStart(2, '0')}:${String(x % 60).padStart(2, '0')}`; };
  r.origin.depart = fmt(m);
  let prev = r.origin;
  (r.stops || []).concat([r.destination]).forEach((s, i) => {
    m += (i > 0 ? dwell : 0) + travelMinutes(prev, s);
    s.arrive = fmt(m);
    prev = s;
  });
  return r;
}

const esc = (v) => String(v ?? '').replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
const known = (name) => !!STATIONS[String(name || '').trim().replace(/역$/, '')];

function rowHTML(kind, e = {}) {
  const timeKey = kind === 'origin' ? 'depart' : 'arrive';
  const label = { origin: '출발역', stop: '정차역', destination: '종착역' }[kind];
  const name = e.name ?? '';
  const extra = !known(name) && name ? '' : 'hidden';
  return `<div class="st-row" data-kind="${kind}" data-via='${esc(JSON.stringify(e.via || []))}'>
    <span class="st-tag ${kind}">${label}</span>
    <input class="st-name" list="st-list" placeholder="역 이름" value="${esc(name)}">
    <input class="st-time" type="time" value="${esc(e[timeKey] || '')}" title="${kind === 'origin' ? '출발 시각' : '도착 시각'}">
    ${kind === 'stop' ? `<button class="st-btn up" title="위로">▲</button><button class="st-btn down" title="아래로">▼</button><button class="st-btn del" title="삭제">✕</button>` : '<span class="st-spacer"></span>'}
    <div class="st-extra ${extra}">
      <span>목록에 없는 역 →</span>
      <input class="st-en" placeholder="영문 (예: Salmi)" value="${esc(e.en || '')}">
      <input class="st-lat" placeholder="위도" value="${esc(e.lat ?? '')}">
      <input class="st-lon" placeholder="경도" value="${esc(e.lon ?? '')}">
    </div>
  </div>`;
}

function readRow(row) {
  const kind = row.dataset.kind;
  const q = (c) => row.querySelector(c)?.value.trim();
  const e = { name: q('.st-name') };
  e[kind === 'origin' ? 'depart' : 'arrive'] = q('.st-time');
  if (!known(e.name)) {
    if (q('.st-en')) e.en = q('.st-en');
    if (q('.st-lat') && q('.st-lon')) { e.lat = +q('.st-lat'); e.lon = +q('.st-lon'); }
  }
  try { const via = JSON.parse(row.dataset.via || '[]'); if (via.length) e.via = via; } catch { /* */ }
  return e;
}

export function initSettings(current, currentTimes, defaults) {
  const names = Object.keys(STATIONS).sort((a, b) => a.localeCompare(b, 'ko'));
  const wrap = document.createElement('div');
  wrap.innerHTML = `
    <div id="st-panel" hidden>
      <div class="st-box">
        <div class="st-head"><b>노선 설정</b><button class="st-close" title="닫기">✕</button></div>
        <div class="st-times">
          <label class="st-switch"><input type="checkbox" class="st-manual"> 출발·도착 시각 직접 입력</label>
          <div class="st-auto">현재 시각 기준 자동 · 역간 소요시간은 실제 운행 기준표(js/data/travelTimes.js) 사용 · 정차시간
            <input type="number" class="st-dwell" min="0" max="30"> 분</div>
        </div>
        <datalist id="st-list">${names.map((n) => `<option value="${esc(n)}">`).join('')}</datalist>
        <div class="st-rows"></div>
        <button class="st-add">+ 정차역 추가</button>
        <p class="st-msg"></p>
        <div class="st-foot">
          <button class="st-reset">기본값</button>
          <button class="st-link">링크 복사</button>
          <button class="st-apply">적용</button>
        </div>
        <p class="st-hint">역 이름은 목록에서 고르거나 직접 입력하세요. 출발역은 출발 시각, 나머지는 도착 시각이에요. 설정창은 S 키로도 열고 닫을 수 있어요.</p>
      </div>
    </div>`;
  document.body.appendChild(wrap);
  const panel = wrap.querySelector('#st-panel'), rows = wrap.querySelector('.st-rows'), msg = wrap.querySelector('.st-msg');

  const manual = wrap.querySelector('.st-manual'), dwellIn = wrap.querySelector('.st-dwell');
  const syncMode = () => {
    const on = manual.checked;
    wrap.querySelector('.st-auto').classList.toggle('off', on);
    rows.querySelectorAll('.st-time').forEach((el) => { el.disabled = !on; });
  };
  const setTimes = (t) => { manual.checked = t.mode === 'manual'; dwellIn.value = t.dwell ?? DWELL; };
  const render = (route) => {
    rows.innerHTML = rowHTML('origin', route.origin) +
      (route.stops || []).map((s) => rowHTML('stop', s)).join('') +
      rowHTML('destination', route.destination);
    syncMode();
  };
  setTimes(currentTimes);
  render(current);
  manual.onchange = syncMode;
  const collectTimes = () => ({ mode: manual.checked ? 'manual' : 'auto', dwell: Math.max(0, +dwellIn.value || 0) });

  const collect = () => {
    const rs = [...rows.querySelectorAll('.st-row')];
    return {
      origin: readRow(rs[0]),
      stops: rs.slice(1, -1).map(readRow),
      destination: readRow(rs[rs.length - 1]),
    };
  };
  const validate = (r) => {
    const all = [r.origin, ...r.stops, r.destination];
    const errs = [];
    all.forEach((e, i) => {
      if (!e.name) errs.push(`${i + 1}번째 칸에 역 이름이 없어요.`);
      else if (!known(e.name) && (e.lat == null || !e.en)) errs.push(`'${e.name}'은(는) 목록에 없는 역이라 영문·위도·경도를 적어 주세요.`);
      if (manual.checked && !(e.depart || e.arrive)) errs.push(`'${e.name || i + 1 + '번째'}' 시각이 비어 있어요.`);
    });
    if (!r.stops.length) errs.push('정차역을 하나 이상 넣어 주세요.');
    return errs;
  };

  const open = (on) => { panel.hidden = !on; if (on) { msg.textContent = ''; } };
  wrap.querySelector('.st-close').onclick = () => open(false);
  panel.addEventListener('click', (e) => { if (e.target === panel) open(false); });
  addEventListener('keydown', (e) => {
    if (e.target.tagName === 'INPUT') return;
    if (e.key === 's' || e.key === 'S') open(panel.hidden);
    if (e.key === 'Escape') open(false);
  });

  rows.addEventListener('click', (e) => {
    const row = e.target.closest('.st-row'); if (!row) return;
    if (e.target.classList.contains('del')) row.remove();
    if (e.target.classList.contains('up') && row.previousElementSibling?.dataset.kind === 'stop') row.parentNode.insertBefore(row, row.previousElementSibling);
    if (e.target.classList.contains('down') && row.nextElementSibling?.dataset.kind === 'stop') row.parentNode.insertBefore(row.nextElementSibling, row);
  });
  // 목록에 없는 역이면 영문/위도/경도 칸 표시
  rows.addEventListener('input', (e) => {
    if (!e.target.classList.contains('st-name')) return;
    const row = e.target.closest('.st-row');
    row.querySelector('.st-extra').classList.toggle('hidden', !e.target.value.trim() || known(e.target.value));
  });
  wrap.querySelector('.st-add').onclick = () => {
    const last = rows.lastElementChild;
    last.insertAdjacentHTML('beforebegin', rowHTML('stop', {}));
    syncMode();
    last.previousElementSibling.querySelector('.st-name').focus();
  };

  wrap.querySelector('.st-apply').onclick = () => {
    const r = collect(), errs = validate(r);
    if (errs.length) { msg.textContent = errs.join(' '); return; }
    try { localStorage.setItem(KEY, JSON.stringify({ route: r, times: collectTimes() })); } catch { /* */ }
    // 주소에 route가 있으면 지우고 다시 불러오기
    const u = new URL(location.href); u.searchParams.delete('route'); u.searchParams.delete('times');
    location.href = u.toString();
  };
  wrap.querySelector('.st-reset').onclick = () => {
    try { localStorage.removeItem(KEY); } catch { /* */ }
    setTimes(defaults.times);
    render(defaults.route);
    msg.textContent = 'config.js의 기본 노선으로 되돌렸어요. [적용]을 누르면 반영됩니다.';
  };
  wrap.querySelector('.st-link').onclick = async () => {
    const r = collect(), errs = validate(r);
    if (errs.length) { msg.textContent = errs.join(' '); return; }
    const u = new URL(location.href);
    u.search = ''; u.searchParams.set('route', JSON.stringify(r)); u.searchParams.set('times', JSON.stringify(collectTimes()));
    try { await navigator.clipboard.writeText(u.toString()); msg.textContent = '링크를 복사했어요.'; }
    catch { msg.textContent = u.toString(); }
  };
}
