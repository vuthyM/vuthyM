import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'preact/hooks';
import { S, useApp, toast } from './store.js';
import { goto, obsidianUrl, wantsNewTab } from './actions.js';
import { noteContextMenu } from './notemenu.js';
import { renderMarkdown, renderInline, plainInline } from './render.js';
import { linkDice, diceClick } from './dicelink.js';
import { nameClashes, hasClash } from '../core/names.js';
import { getIndex } from './store.js';

/* text from a task, secret or log line, with its bold, italics and so on shown instead of the ** and _ marks */
export function Inline({ text }) { return <span class="inline-md" dangerouslySetInnerHTML={{ __html: renderInline(text) }} />; }
export { plainInline };

export function Modal({ title, children, onClose, wide, cls, focusFirst = true }) {
  const ref = useRef();
  // a layout effect, so Escape works from the moment the window is on the screen (an effect runs a frame later, and a key pressed in that gap was ignored)
  useLayoutEffect(() => {
    const k = e => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', k);
    // a form starts with its first field ready to type in; a window of options (Settings) starts with nothing highlighted
    const first = focusFirst && ref.current && ref.current.querySelector('input:not([type=checkbox]):not([type=radio]),textarea,select');
    if (first) first.focus(); else if (ref.current) ref.current.focus({ preventScroll: true });
    return () => window.removeEventListener('keydown', k);
  }, []);
  return (
    <div class="backdrop" onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div class={'modal' + (wide ? ' wide' : '') + (cls ? ' ' + cls : '')} role="dialog" aria-modal="true" aria-label={title} ref={ref} tabIndex={-1}>
        {title && <h3>{title}</h3>}
        {children}
      </div>
    </div>
  );
}

export function Toasts() {
  const s = useApp();
  return (
    <div class="toasts" aria-live="polite">
      {s.toasts.map(t => <div key={t.id} class={'toast' + (t.err ? ' err' : '')}>{t.msg}</div>)}
    </div>
  );
}

export function Empty({ title, children }) {
  return <div class="empty"><h3>{title}</h3><div>{children}</div></div>;
}

/* ---------- images from the vault ---------- */
const urlCache = new Map();
export async function assetUrl(path) {
  const key = S.vaultKey + '|' + path;
  if (urlCache.has(key)) return urlCache.get(key);
  const blob = await S.vault.readBlob(path);
  const url = URL.createObjectURL(blob);
  urlCache.set(key, url);
  return url;
}

export function Asset({ path, alt }) {
  const [url, setUrl] = useState(null);
  useEffect(() => { let live = true; assetUrl(path).then(u => { if (live) setUrl(u); }).catch(() => {}); return () => { live = false; }; }, [path]);
  return url ? <img src={url} alt={alt || path} /> : <span>…</span>;
}

/* ---------- rendered note body ---------- */
export function Markdown({ body, html: ready, index, rev, ctx }) {
  const ref = useRef();
  const html = useMemo(() => (ready != null ? ready : renderMarkdown(body)), [body, ready]);
  useEffect(() => {
    const root = ref.current;
    if (!root) return;
    root.querySelectorAll('a[href^="dmf-link:"]').forEach(a => {
      const t = decodeURIComponent(a.getAttribute('href').slice(9));
      a.dataset.target = t;
      a.classList.add('wl');
      a.classList.toggle('missing', !index.resolve(t));
    });
    root.querySelectorAll('img[src^="dmf-asset:"]').forEach(img => {
      const name = decodeURIComponent(img.getAttribute('src').slice(10));
      const p = index.findAsset(name);
      if (!p) { const s = document.createElement('em'); s.textContent = '[image not found: ' + name + ']'; img.replaceWith(s); return; }
      assetUrl(p).then(u => { img.src = u; }).catch(() => {});
    });
    root.querySelectorAll('a[href^="http"]').forEach(a => { a.target = '_blank'; a.rel = 'noopener noreferrer'; });
    linkDice(root);
  }, [html, rev]);
  const click = e => {
    if (e.target.closest && e.target.closest('.dice-inline')) { diceClick(e); return; }
    const a = e.target.closest('a.wl');
    if (!a) return;
    e.preventDefault();
    const n = index.resolve(a.dataset.target);
    if (n) goto(n.path, { newTab: wantsNewTab(e) });
    else window.open(obsidianUrl(a.dataset.target), '_self');
  };
  const aux = e => { if (e.button === 1 && e.target.closest('a.wl')) click(e); };
  const menu = ctx ? e => noteContextMenu(e, ref.current, ctx) : undefined;
  return <div class="md" ref={ref} onClick={click} onAuxClick={aux} onContextMenu={menu} dangerouslySetInnerHTML={{ __html: html }} />;
}

/* ---------- a form control for one schema field ---------- */
let uidc = 0;
/* several links in one field ("Seeded by"): the chosen ones as chips you can remove, and a box that suggests names from your notes.
   The value outside is one string, "A, B". Enter, a comma, leaving the box or picking a suggestion adds the name. */
function LinksInput({ field, value, onChange, index }) {
  const [listId] = useState(() => 'dl' + (++uidc));
  const [text, setText] = useState('');
  const names = String(value || '').split(/\s*,\s*/).filter(Boolean);
  const set = list => onChange(list.join(', '));
  const add = raw => {
    const n = String(raw || '').replace(/[,\[\]]/g, ' ').replace(/\s+/g, ' ').trim();
    setText('');
    if (!n) return;
    const hit = (field.linkTypes || []).flatMap(t => index.byType[t] || []).find(x => x.name.toLowerCase() === n.toLowerCase());
    const name = hit ? hit.name : n;
    if (!names.some(x => x.toLowerCase() === name.toLowerCase())) set([...names, name]);
  };
  const cands = [];
  for (const t of field.linkTypes || []) for (const n of (index.byType[t] || [])) if (!names.some(x => x.toLowerCase() === n.name.toLowerCase())) cands.push(n);
  return (
    <div class="links-input" data-links={field.key}>
      {names.length > 0 && (
        <div class="links-chips">
          {names.map(n => <span key={n} class="chip-link links-chip" data-link-chip={n}>{n}<button type="button" class="links-x" aria-label={'Remove ' + n} onClick={() => set(names.filter(x => x !== n))}>×</button></span>)}
        </div>
      )}
      <input list={listId} value={text} placeholder={names.length ? 'Add another…' : 'Add a name (NPC, faction or player)'} aria-label={field.label}
        onInput={e => { const v = e.currentTarget.value; if (e.inputType === 'insertReplacementText' || e.inputType === undefined) add(v); else if (/,$/.test(v)) add(v); else setText(v); }}
        onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); e.stopPropagation(); add(text); } else if (e.key === 'Backspace' && !text && names.length) set(names.slice(0, -1)); }}
        onBlur={() => add(text)} />
      <datalist id={listId}>{cands.map(n => <option key={n.path} value={n.name}>{typeLabelOf(n.type)}</option>)}</datalist>
    </div>
  );
}
const typeLabelOf = t => ({ npc: 'NPC', faction: 'Faction', player: 'Player' }[t] || '');

export function FieldInput({ field, value, onChange, index }) {
  const [listId] = useState(() => 'dl' + (++uidc));
  if (field.kind === 'links') return <LinksInput field={field} value={value} onChange={onChange} index={index} />;
  if (field.kind === 'select') {
    const opts = field.options.includes(value) || !value ? field.options : [value, ...field.options];
    return (
      <select value={value} onChange={e => onChange(e.currentTarget.value)}>
        <option value="">(none)</option>
        {opts.map(o => <option key={o} value={o}>{o}</option>)}
      </select>
    );
  }
  if (field.kind === 'link') {
    const cands = [];
    for (const t of field.linkTypes || []) for (const n of (index.byType[t] || [])) cands.push(n.name);
    return (
      <>
        <input list={listId} value={value} onInput={e => onChange(e.currentTarget.value)} placeholder="Note name" />
        <datalist id={listId}>{cands.map(c => <option key={c} value={c} />)}</datalist>
      </>
    );
  }
  return <input type={field.kind === 'number' ? 'number' : field.kind === 'date' ? 'date' : 'text'} value={value} onInput={e => onChange(e.currentTarget.value)} />;
}

export function copyText(text, okMsg) {
  const done = () => toast(okMsg || 'Copied');
  const fallback = () => {
    try {
      const ta = document.createElement('textarea');
      ta.value = text; ta.setAttribute('readonly', ''); ta.style.cssText = 'position:fixed;opacity:0;top:0;left:0';
      document.body.appendChild(ta); ta.select();
      const ok = document.execCommand('copy');
      ta.remove();
      if (ok) done(); else toast('Could not copy. Select the text and copy it manually.', true);
    } catch (e) { toast('Could not copy. Select the text and copy it manually.', true); }
  };
  if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(done, fallback); else fallback();
}

/* tells you if a name is already used in the campaign, or close to one that is */
export function NameCheck({ name, exclude = '' }) {
  const idx = getIndex();
  const c = useMemo(() => (name && name.trim().length >= 3 && idx ? nameClashes(name, idx, { exclude }) : null), [name, exclude, idx]);
  if (!c || !hasClash(c)) return null;
  const links = list => list.map((n, i) => <span key={n.path}>{i ? ', ' : ''}<a href="#" onClick={e => { e.preventDefault(); goto(n.path, { newTab: wantsNewTab(e) }); }}>{n.name}</a></span>);
  return (
    <div class={'namecheck' + (c.exact.length ? ' exact' : '')} id="nameCheck" role="status">
      {c.exact.length > 0 && <div data-nc="exact"><strong>Already used:</strong> {links(c.exact)}</div>}
      {c.first.length > 0 && <div data-nc="first">Same first name: {links(c.first)}</div>}
      {c.last.length > 0 && <div data-nc="last">Same family name: {links(c.last)}</div>}
      {c.close.length > 0 && <div data-nc="close">Close to: {links(c.close)}</div>}
    </div>
  );
}
