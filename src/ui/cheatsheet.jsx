import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { Icon } from './icons.jsx';
import { S, set, useApp, getIndex, toast } from './store.js';
import { toggleCheat, popOutCheat, toggleStar, customCards, saveCustomCards, updateSetting } from './actions.js';
import { GROUPS, EDITION, CUSTOM_NOTE, unitize, matches, allCards } from '../core/cheatsheet.js';
import { Markdown } from './common.jsx';

/* The DM cheat sheet: short reminders of the 2024 rules, searchable, with your own cards. It opens as a slide-over from the top
   bar and can be popped out into a tab. */

const BOOK = <svg viewBox="0 0 18 18" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round" aria-hidden="true"><path d="M3 3.5h4.5a1.5 1.5 0 0 1 1.5 1.5v9.5a1.5 1.5 0 0 0-1.5-1.5H3zM15 3.5h-4.5A1.5 1.5 0 0 0 9 5v9.5a1.5 1.5 0 0 1 1.5-1.5H15z" /></svg>;
const STAR = on => <svg viewBox="0 0 16 16" width="15" height="15" aria-hidden="true" fill={on ? 'currentColor' : 'none'} stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"><path d="M8 1.8l1.9 3.9 4.3.6-3.1 3 .7 4.3L8 11.6l-3.8 2 .7-4.3-3.1-3 4.3-.6z" /></svg>;

export function CheatButton() {
  const s = useApp();
  return (
    <button class={'tb-icon cheat-btn' + (s.cheatOpen ? ' on' : '')} id="cheatBtn" aria-expanded={s.cheatOpen} aria-controls="cheatPanel" title="DM cheat sheet: the rules at a glance" onClick={() => toggleCheat()}>
      <Icon name="cheat" /><span class="sr cheat-btn-label">Cheat sheet</span>
    </button>
  );
}

function CardForm({ card, onSave, onCancel, onDelete }) {
  const [title, setTitle] = useState(card ? card.title : '');
  const [body, setBody] = useState(card ? card.body : '');
  const ref = useRef();
  useEffect(() => { ref.current && ref.current.focus(); }, []);
  const submit = e => { e.preventDefault(); if (title.trim()) onSave({ title: title.trim(), body }); };
  return (
    <form class="cs-form" onSubmit={submit} onKeyDown={e => { if (e.key === 'Escape') { e.stopPropagation(); onCancel(); } }}>
      <label class="lbl" for="csTitle">Title</label>
      <input id="csTitle" ref={ref} value={title} onInput={e => setTitle(e.currentTarget.value)} placeholder="e.g. Flanking (house rule)" required />
      <label class="lbl" for="csBody">What to remember <span class="muted small">(markdown works)</span></label>
      <textarea id="csBody" rows={5} value={body} onInput={e => setBody(e.currentTarget.value)} />
      <div class="row-actions">
        <button type="submit" class="btn btn-sm btn-primary" id="csSave">Save card</button>
        <button type="button" class="btn btn-sm" onClick={onCancel}>Cancel</button>
        {onDelete && <button type="button" class="btn btn-sm btn-danger" id="csDelete" onClick={onDelete}>Delete</button>}
      </div>
      <div class="muted small">Saved in your vault as “{CUSTOM_NOTE}”. It is a pending change until you push.</div>
    </form>
  );
}

function Card({ card, starred, searching, idx, onEdit }) {
  return (
    <details class={'cs-card' + (card.custom ? ' cs-mine' : '')} open={searching || undefined} data-card={card.id}>
      <summary>
        <span class="cs-title">{card.title}</span>
        {card.check && <span class="pill pill-warn cs-check" title="Worth confirming in the book">double-check</span>}
        {card.custom && <span class="pill cs-check">yours</span>}
        <span class="cs-tools">
          {card.custom && <button type="button" class="cs-icon" aria-label={'Edit ' + card.title} title="Edit this card" onClick={e => { e.preventDefault(); e.stopPropagation(); onEdit(card); }}>✎</button>}
          <button type="button" class={'cs-icon cs-star' + (starred ? ' on' : '')} aria-pressed={starred} aria-label={(starred ? 'Unpin ' : 'Pin ') + card.title} title={starred ? 'Unpin from the top' : 'Pin to the top'} onClick={e => { e.preventDefault(); e.stopPropagation(); toggleStar(card.id); }}>{STAR(starred)}</button>
        </span>
      </summary>
      <div class="cs-body"><Markdown body={unitize(card.body)} index={idx} /></div>
    </details>
  );
}

/* the cards themselves; used by the slide-over and by the tab */
export function CheatBody({ focusSearch }) {
  const s = useApp();
  const [q, setQ] = useState('');
  const [form, setForm] = useState(null);           // null, { card } to edit, or { card: null } to add
  const ref = useRef();
  const idx = getIndex();
  const stars = s.settings.cheatStars || [];
  const mine = customCards();
  const searching = !!q.trim();
  useEffect(() => { if (focusSearch && ref.current) ref.current.focus(); }, []);
  const shown = useMemo(() => {
    const groups = GROUPS.map(g => ({ ...g, cards: g.cards.filter(c => matches(c, q)) })).filter(g => g.cards.length);
    return { mine: mine.filter(c => matches(c, q)), groups };
  }, [q, s.dataRev, s.working.count]);
  const pinned = allCards(mine).filter(c => stars.includes(c.id) && matches(c, q));
  const none = !shown.mine.length && !shown.groups.length;

  const save = ({ title, body }) => {
    const all = customCards();
    const cur = form && form.card;
    const next = cur ? all.map(c => (c.id === cur.id ? { ...c, title, body } : c)) : [...all, { title, body }];
    saveCustomCards(next);
    setForm(null);
    toast('Card saved to “' + CUSTOM_NOTE + '”. Push to write it to your vault.');
  };
  const remove = () => {
    const cur = form.card;
    set({ dialog: { kind: 'confirm', title: 'Delete this card?', body: '“' + cur.title + '” will be removed from your “' + CUSTOM_NOTE + '” note.', confirmLabel: 'Delete card', danger: true, onConfirm: () => { saveCustomCards(customCards().filter(c => c.id !== cur.id)); setForm(null); } } });
  };
  const cardEl = c => <Card key={c.id} card={c} starred={stars.includes(c.id)} searching={searching} idx={idx} onEdit={card => setForm({ card })} />;

  return (
    <div class="cs">
      <div class="cs-bar">
        <input ref={ref} type="search" id="csSearch" class="cs-search" placeholder="Search the rules (prone, grapple, cover...)" aria-label="Search the cheat sheet" value={q} onInput={e => setQ(e.currentTarget.value)}
          onKeyDown={e => { if (e.key === 'Escape' && q) { e.stopPropagation(); setQ(''); } }} />
      </div>
      <div class="small muted cs-edition">{EDITION} rules, in short. Your own cards are saved in your vault.</div>
      {form
        ? <CardForm card={form.card} onSave={save} onCancel={() => setForm(null)} onDelete={form.card ? remove : null} />
        : <div class="row-actions" style="margin:8px 0"><button class="btn btn-sm" id="csAdd" onClick={() => setForm({ card: null })}>+ Add my own card</button></div>}
      {pinned.length > 0 && <section class="cs-group" data-group="pinned"><h4>Pinned</h4>{pinned.map(cardEl)}</section>}
      {shown.mine.length > 0 && <section class="cs-group" data-group="mine"><h4>My cards</h4>{shown.mine.map(cardEl)}</section>}
      {shown.groups.map(g => <section class="cs-group" key={g.id} data-group={g.id}><h4>{g.title}</h4>{g.cards.map(cardEl)}</section>)}
      {none && <div class="muted" style="padding:16px 4px">Nothing matches “{q}”.</div>}
    </div>
  );
}

/* the slide-over */
export function CheatPanel() {
  const s = useApp();
  useEffect(() => {
    if (!s.cheatOpen) return;
    const k = e => { if (e.key === 'Escape' && !S.dialog && !S.menu) toggleCheat(false); };
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [s.cheatOpen]);
  if (!s.cheatOpen) return null;
  return (
    <aside class="cheat-panel" id="cheatPanel" role="complementary" aria-label="DM cheat sheet">
      <div class="cheat-head">
        <h3>DM cheat sheet</h3>
        <div class="row-actions">
          <button class="btn btn-sm" id="cheatPop" title="Open it as a tab, to keep beside your notes" onClick={popOutCheat}>Open as a tab</button>
          <button class="btn btn-sm btn-ghost" id="cheatClose" aria-label="Close the cheat sheet" onClick={() => toggleCheat(false)}>✕</button>
        </div>
      </div>
      <div class="cheat-scroll"><CheatBody focusSearch /></div>
    </aside>
  );
}

/* the same thing as a tab */
export function CheatPage() {
  return (
    <>
      <div class="page-head"><div><h2 aria-level="1">DM cheat sheet</h2><div class="small muted">The {EDITION} rules at a glance</div></div></div>
      <CheatBody />
    </>
  );
}
