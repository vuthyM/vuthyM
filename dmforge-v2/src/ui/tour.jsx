import { useEffect, useLayoutEffect, useRef, useState } from 'preact/hooks';
import { useApp } from './store.js';
import { tourGo, endTour } from './actions.js';
import { TOUR } from '../core/tour.js';

/* the guided tour: dims the page, lights up the thing being described, and a card says what it is */
export function TourLayer() {
  const s = useApp();
  const st = s.tour;
  const [box, setBox] = useState(null);
  const [cardH, setCardH] = useState(230);
  const card = useRef();
  const n = st ? st.step : -1;
  const stop = st ? TOUR[n] : null;
  useLayoutEffect(() => {
    if (!stop) { setBox(null); return; }
    const place = () => {
      let el = null;
      for (const sel of stop.sel || []) {
        el = document.querySelector(sel);
        if (el && !el.getBoundingClientRect().width) {                // inside a folded sidebar group: point at the group instead
          const sec = el.closest('.nav-section'); el = sec && sec.querySelector('.nav-group-btn');
        }
        if (el && el.getBoundingClientRect().width) break; el = null;
      }
      if (!el) { setBox({ none: true }); return; }
      let r = el.getBoundingClientRect();
      if (r.height > window.innerHeight * 0.55) {                    // a very tall target: point at its heading, so the card has somewhere to sit
        const h = el.querySelector('h1,h2,h3,.card-head,summary');
        if (h && h.getBoundingClientRect().width) r = h.getBoundingClientRect();
      }
      setBox({ x: r.left, y: r.top, w: r.width, h: r.height });
    };
    place();
    const t = setTimeout(place, 250);                                // what the stop opened may take a moment to draw
    window.addEventListener('resize', place);
    return () => { clearTimeout(t); window.removeEventListener('resize', place); };
  }, [n, s.section, s.dataRev]);
  useLayoutEffect(() => {                                           // place the card by its real height
    const h = card.current ? Math.ceil(card.current.getBoundingClientRect().height) : 0;
    if (h && Math.abs(h - cardH) > 1) setCardH(h);
  });
  useEffect(() => {
    if (!st) return;
    const k = e => {
      if (e.key === 'Escape') { e.preventDefault(); endTour(); }
      else if (e.key === 'ArrowRight' || e.key === 'Enter') { e.preventDefault(); n >= TOUR.length - 1 ? endTour() : tourGo(n + 1); }
      else if (e.key === 'ArrowLeft') { e.preventDefault(); if (n > 0) tourGo(n - 1); }
    };
    window.addEventListener('keydown', k, true);
    return () => window.removeEventListener('keydown', k, true);
  }, [st && st.step]);
  if (!st || !stop) return null;
  const W = Math.min(360, window.innerWidth - 24);
  const has = box && !box.none;
  let style;
  if (has) {
    // the card never covers what it points at and never leaves the window: below, above, beside, else pinned bottom
    const vw = window.innerWidth, vh = window.innerHeight, H = cardH + 4, pad = 12, gap = 16;
    const clampX = x => Math.max(pad, Math.min(vw - W - pad, x));
    const clampY = y => Math.max(pad, Math.min(vh - H - pad, y));
    let left, top;
    if (box.y + box.h + gap + H + pad <= vh) { left = clampX(box.x); top = box.y + box.h + gap; }
    else if (box.y - gap - H >= pad) { left = clampX(box.x); top = box.y - gap - H; }
    else if (box.x + box.w + gap + W + pad <= vw) { left = box.x + box.w + gap; top = clampY(box.y); }
    else if (box.x - gap - W >= pad) { left = box.x - gap - W; top = clampY(box.y); }
    else { left = clampX(box.x); top = vh - H - pad; }
    style = 'width:' + W + 'px;left:' + Math.round(left) + 'px;top:' + Math.round(top) + 'px';
  } else style = 'width:' + W + 'px;left:50%;top:50%;transform:translate(-50%,-50%)';
  const last = n >= TOUR.length - 1;
  return (
    <div class="tour" id="tour" role="dialog" aria-modal="true" aria-label="Guided tour">
      <div class="tour-shield" />
      {has ? <div class="tour-spot" id="tourSpot" style={'left:' + (box.x - 6) + 'px;top:' + (box.y - 6) + 'px;width:' + (box.w + 12) + 'px;height:' + (box.h + 12) + 'px'} /> : <div class="tour-dim" />}
      <div class="tour-card" id="tourCard" ref={card} style={style}>
        <div class="tour-count small muted">Step {n + 1} of {TOUR.length}</div>
        <h3 id="tourTitle">{stop.title}</h3>
        <p id="tourText">{stop.text}</p>
        <div class="row-actions" style="justify-content:space-between">
          <button class="btn btn-ghost btn-sm" id="tourSkip" onClick={endTour}>{last ? 'Close' : 'Skip the tour'}</button>
          <span style="display:inline-flex;gap:6px">
            {n > 0 && <button class="btn btn-sm" id="tourBack" onClick={() => tourGo(n - 1)}>Back</button>}
            <button class="btn btn-primary btn-sm" id="tourNext" onClick={() => (last ? endTour() : tourGo(n + 1))}>{last ? 'Finish' : 'Next'}</button>
          </span>
        </div>
      </div>
    </div>
  );
}
