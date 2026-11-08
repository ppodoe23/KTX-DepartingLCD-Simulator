export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Web Animations API 래퍼: 끝나면 resolve, 최종 상태 유지
export function anim(el, keyframes, opts = {}) {
  const a = el.animate(keyframes, { fill: 'forwards', easing: 'cubic-bezier(.22,.8,.3,1)', ...opts });
  return a.finished.catch(() => {});
}

export const EASE_OUT = 'cubic-bezier(.16,.84,.3,1)';
export const EASE_IN = 'cubic-bezier(.6,0,.85,.4)';
export const EASE_BACK = 'cubic-bezier(.34,1.45,.5,1)';

// '18:40' → { ko:'오후', en:'PM', time:'6:40' }
export function splitTime(hhmm) {
  const [h, m] = hhmm.split(':').map(Number);
  const pm = h >= 12;
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return { ko: pm ? '오후' : '오전', en: pm ? 'PM' : 'AM', pm, time: `${h12}:${String(m).padStart(2, '0')}` };
}

export function h(tag, cls, html) {
  const el = document.createElement(tag);
  if (cls) el.className = cls;
  if (html != null) el.innerHTML = html;
  return el;
}

// 고정 너비에 들어가도록 가로 압축
export function fitWidth(el, maxW) {
  el.style.transform = '';
  const w = el.scrollWidth;
  if (w > maxW) el.style.transform = `scaleX(${maxW / w})`;
}
