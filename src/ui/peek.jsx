import { useEffect, useState } from 'preact/hooks';
import { getIndex } from './store.js';
import { typeLabel, fieldDefs, getField } from '../core/schema.js';
import { summarize } from '../core/markdown.js';
import { ruleFor } from '../core/rules.js';

/* Quick-peek: hover (or focus) a [[link]], a creature's name in the fight, or a condition, and a small card tells you who or what it is
   without leaving the page. The card never takes the mouse, so it cannot get in the way of a click. */
const SELECTOR = 'a.wl[data-target], [data-peek], [data-rule]';
const SHOW_AFTER = 280;

function noteCard(n) {
  const rows = [];
  for (const f of fieldDefs(n.type)) {
    const v = getField(n, f).value;
    if (v !== '' && v !== null && v !== undefined && rows.length < 5) rows.push([f.label, String(v)]);
  }
  return { title: n.name, kind: typeLabel(n.type), rows, text: summarize(n.body || '', 300), tags: (n.tags || []).slice(0, 5) };
}

function cardFor(el) {
  const idx = getIndex();
  if (el.dataset.rule) {
    const text = ruleFor(el.dataset.rule);
    return text ? { title: el.dataset.rule, kind: 'Condition', rows: [], text, tags: [] } : null;
  }
  const target = el.dataset.peek || el.dataset.target;
  const n = idx && target ? idx.resolve(target) : null;
  return n ? noteCard(n) : null;
}

export function PeekLayer() {
  const [peek, setPeek] = useState(null);
  useEffect(() => {
    let timer = 0, cur = null, shown = false;
    const hide = () => { clearTimeout(timer); cur = null; shown = false; setPeek(null); };
    const show = el => {
      const card = cardFor(el);
      if (!card) return;
      const r = el.getBoundingClientRect();
      const w = Math.min(340, window.innerWidth - 16);
      const left = Math.max(8, Math.min(window.innerWidth - w - 8, r.left));
      const below = r.bottom + 8 + 190 < window.innerHeight;
      shown = true;
      setPeek({ card, left, w, top: below ? r.bottom + 8 : null, bottom: below ? null : window.innerHeight - r.top + 8 });
    };
    const over = e => {
      const el = e.target.closest && e.target.closest(SELECTOR);
      if (!el || el === cur) return;
      clearTimeout(timer);
      cur = el;
      timer = setTimeout(() => show(el), SHOW_AFTER);
    };
    const out = e => {
      const el = e.target.closest && e.target.closest(SELECTOR);
      if (!el) return;
      if (e.relatedTarget && el.contains(e.relatedTarget)) return;
      hide();
    };
    const key = e => { if (e.key === 'Escape') hide(); };
    document.addEventListener('mouseover', over);
    document.addEventListener('mouseout', out);
    document.addEventListener('focusin', over);
    document.addEventListener('focusout', out);
    document.addEventListener('mousedown', hide, true);
    const scrolled = () => { if (shown) hide(); };            // a card that is up goes when the page moves; one still waiting to show is placed where the link is by then
    document.addEventListener('scroll', scrolled, true);
    document.addEventListener('keydown', key);
    return () => {
      hide();
      document.removeEventListener('mouseover', over); document.removeEventListener('mouseout', out);
      document.removeEventListener('focusin', over); document.removeEventListener('focusout', out);
      document.removeEventListener('mousedown', hide, true); document.removeEventListener('scroll', scrolled, true);
      document.removeEventListener('keydown', key);
    };
  }, []);
  if (!peek) return null;
  const c = peek.card;
  return (
    <div class="peek" id="peekCard" role="tooltip" style={'left:' + peek.left + 'px;width:' + peek.w + 'px;' + (peek.top !== null ? 'top:' + peek.top + 'px' : 'bottom:' + peek.bottom + 'px')}>
      <div class="peek-head"><strong>{c.title}</strong><span class="peek-kind">{c.kind}</span></div>
      {c.rows.length > 0 && <dl class="peek-rows">{c.rows.map(([k, v]) => <div key={k}><dt>{k}</dt><dd>{v}</dd></div>)}</dl>}
      {c.text && <p class="peek-text">{c.text}</p>}
      {c.tags.length > 0 && <div class="peek-tags">{c.tags.map(t => <span key={t}>#{t}</span>)}</div>}
    </div>
  );
}
