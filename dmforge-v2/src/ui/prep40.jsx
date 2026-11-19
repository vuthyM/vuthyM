import { useMemo, useRef, useState } from 'preact/hooks';
import { S, set, useApp, getIndex, toast } from './store.js';
import { Modal, Inline, plainInline } from './common.jsx';
import { subtitle } from './notes.jsx';
import { openBeside, setCurrentSession, currentSessionPath, logLine, sessionLogEntries, tickTask, tickClock, clocksNow, secretsNow, setSecretRevealed, setLive, rollImprov, saveImprov, moveSectionIn, addMustBlock, importLastSession, lastSessionInfo, setSection, saveEncounterTo, editEncounterIn, deleteEncounterFrom, runEncounterFrom, loadEncounterToBudget } from './actions.js';
import { castOf } from '../core/cast.js';
import { outline, mustItems, readiness } from '../core/prep40.js';
import { parseEncounters, resolveItems, xpOf } from '../core/encounters.js';
import { partyRows, absentOf, budgetFor, difficulty } from '../core/party.js';
import { useMonsters } from './monsters.jsx';
import { Pie } from './clocks.jsx';
import { getField, fieldDefs } from '../core/schema.js';

const close = () => set({ dialog: null });
const plural = (n, w) => n + ' ' + w + (n === 1 ? '' : 's');

/* ---------- Live: everything you reach for mid-session, on the session's own page ---------- */
export function LivePanel({ note }) {
  const s = useApp();
  const idx = getIndex();
  const [line, setLine] = useState('');
  const must = mustItems(note.body);
  const { clocks } = clocksNow();
  const secrets = secretsNow().filter(g => g.path === note.path || g.type === 'plot').flatMap(g => g.items.filter(i => !i.done).map(i => ({ ...i, from: g.name, path: g.path })));
  const statusDef = fieldDefs('plot').find(f => f.key === 'status');
  const threads = (idx.byType.plot || []).filter(n => !/resolved|closed|done|abandoned|failed/i.test(String(statusDef ? getField(n, statusDef).value : ''))).slice(0, 10);
  const log = sessionLogEntries(note.path).slice(-5).reverse();
  const add = () => {
    const t = line.trim();
    if (!t) return;
    if (currentSessionPath() !== note.path) setCurrentSession(note.path);
    if (logLine(t, '')) { setLine(''); }
  };
  return (
    <div class="live" id="livePanel" role="region" aria-label="Live session tools">
      <div class="live-head"><strong>Live</strong><span class="small muted">What you reach for during play. Everything here is saved as changes you push later.</span>
        <button class="btn btn-sm btn-ghost" id="liveClose" onClick={() => setLive('')}>Close</button></div>
      <div class="live-grid">
        <section id="liveMust"><h4>Must happen</h4>
          {must.length === 0 && <p class="muted small">No MUST HAPPEN list in this session yet.</p>}
          {must.map(m => (
            <label key={m.raw} class={'live-task' + (m.done ? ' done' : '')}><input type="checkbox" checked={m.done} aria-label={plainInline(m.text)} onChange={() => tickTask(note.path, m.raw)} /> <Inline text={m.text} /></label>
          ))}
        </section>
        <section id="liveClocks"><h4>Clocks</h4>
          {clocks.length === 0 && <p class="muted small">No clocks yet.</p>}
          {clocks.map(c => (
            <div key={c.name} class="live-clock" data-liveclock={c.name}>
              <Pie filled={c.filled} size={c.size} px={42} />
              <span class="live-clock-name">{c.name}</span>
              <span class="live-ctl">
                <button class="mini" aria-label={'One slice back on ' + c.name} onClick={() => tickClock(c.name, -1)}>−</button>
                <span class="live-count" data-count>{c.filled}/{c.size}</span>
                <button class="mini" aria-label={'One slice forward on ' + c.name} onClick={() => tickClock(c.name, 1)}>+</button>
              </span>
            </div>
          ))}
        </section>
        <section id="liveSecrets"><h4>Secrets to reveal</h4>
          {secrets.length === 0 && <p class="muted small">Nothing hidden is waiting.</p>}
          {secrets.slice(0, 8).map(x => (
            <div key={x.raw} class="live-secret"><Inline text={x.secret} /><button class="btn btn-sm" data-reveal={x.secret} aria-label={'Reveal: ' + plainInline(x.secret)} title={'From ' + x.from + '. Logs a line in this session'} onClick={() => { if (currentSessionPath() !== note.path) setCurrentSession(note.path); setSecretRevealed(x.path, x.raw, true); }}>Reveal</button></div>
          ))}
        </section>
        <section id="liveThreads"><h4>Open threads</h4>
          {threads.length === 0 && <p class="muted small">No open plot threads.</p>}
          <div class="chips">{threads.map(n => <a key={n.path} href="#" class="chip-link" data-thread={n.name} onClick={e => { e.preventDefault(); openBeside(n.path); }}>{n.name}</a>)}</div>
        </section>
      </div>
      <div class="live-log">
        <div class="row-actions" style="gap:8px;flex-wrap:wrap">
          <input id="liveLine" aria-label="Add a line to the session log" placeholder="What just happened?" value={line} onInput={e => setLine(e.currentTarget.value)} onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); add(); } }} style="flex:1;min-width:220px" />
          <button class="btn btn-primary btn-sm" id="liveAdd" disabled={!line.trim()} onClick={add}>Log it</button>
          <button class="btn btn-sm" id="liveImprov" onClick={() => set({ dialog: { kind: 'improv', session: note.path } })}>Improvise an NPC</button>
        </div>
        <ul class="log-recent" id="liveRecent">{log.map((e, i) => <li key={e.raw + i}><span class="muted">{e.time}</span> <Inline text={e.text} /></li>)}{!log.length && <li class="muted">Nothing logged in {note.name} yet.</li>}</ul>
      </div>
    </div>
  );
}

/* ---------- Improvise an NPC: roll, look, keep ---------- */
export function ImproviseDialog({ d }) {
  const idx = getIndex();
  const [r, setR] = useState(() => rollImprov());
  const session = d.session && idx.byPath.get(d.session);
  const cast = session ? castOf(idx, session) : null;
  const places = (idx.byType.location || []).slice().sort((a, b) => a.name.localeCompare(b.name));
  const [at, setAt] = useState(cast && cast.places[0] ? cast.places[0].name : '');
  const [name, setName] = useState(null);
  const shown = { ...r, name: name === null ? r.name : name };
  const detail = useMemo(() => { const b = r.body || ''; const get = k => (new RegExp('\\*\\*' + k + ':\\*\\*\\s*(.+)').exec(b) || [])[1] || ''; return [['Look', get('Look')], ['Voice', get('Voice')], ['Quirk', get('Quirk')], ['Wants', get('Wants')], ['Secret', get('Secret')]]; }, [r]);
  const save = () => {
    const nm = shown.name.trim();
    if (!nm) return;
    if (idx.resolve(nm) && nm !== r.name) { toast('There is already a note called ' + nm + '.', true); return; }
    saveImprov({ ...r, name: nm, body: r.body.replace(/^# .*/, '# ' + nm) }, { at, sessionPath: d.session || '' });
    close();
    toast('Saved ' + nm + (at ? ' at ' + at : '') + (d.session ? ' and added to the cast' : '') + '. Push changes to keep them.');
  };
  return (
    <Modal title="Improvise an NPC" onClose={close} focusFirst={false}>
      <div class="improv" id="improv">
        <div class="row-actions" style="gap:8px;flex-wrap:wrap;align-items:center">
          <input id="improvName" aria-label="Name" value={shown.name} onInput={e => setName(e.currentTarget.value)} style="flex:1;min-width:180px;font-weight:600" />
          <button class="btn btn-sm" id="improvReroll" onClick={() => { setR(rollImprov()); setName(null); }}>Roll again</button>
        </div>
        <div class="small muted" style="margin:4px 0 8px">{[r.race, r.role].filter(Boolean).join(' · ')}</div>
        <dl class="improv-rows">{detail.filter(x => x[1]).map(([k, v]) => <div key={k}><dt>{k}</dt><dd>{v}</dd></div>)}</dl>
        <div class="row-actions" style="gap:8px;margin-top:8px"><label class="small muted" for="improvAt">At</label>
          <select id="improvAt" style="width:auto;max-width:240px" value={at} onChange={e => setAt(e.currentTarget.value)}><option value="">No place yet</option>{places.map(p => <option key={p.path} value={p.name}>{p.name}</option>)}</select></div>
        <p class="small muted" style="margin:8px 0 0">Saving makes the NPC note{d.session ? ', adds them to this session’s cast' : ''} and logs that you met them.</p>
      </div>
      <div class="modal-actions"><button class="btn" onClick={close}>Not now</button><button class="btn btn-primary" id="improvSave" disabled={!shown.name.trim()} onClick={save}>Save {shown.name || 'them'}</button></div>
    </Modal>
  );
}

/* ---------- Outline: jump around, fold everything, move a section ---------- */
export function OutlineBar({ note }) {
  const hs = outline(note.body).filter(h => h.level >= 2 && h.level <= 3);
  if (hs.length < 4) return null;
  const root = () => document.querySelector('.pane:not([hidden]) .edit-body') || document;
  const jump = h => {
    const all = outline(note.body);
    const k = all.findIndex(x => x.line === h.line);
    const els = [...root().querySelectorAll('h1,h2,h3,h4,h5,h6')];
    const el = els[k] && els[k].textContent.trim().startsWith(h.text.slice(0, 12)) ? els[k] : els.find(e => e.textContent.trim() === h.text);
    if (!el) return;
    const d = el.closest('details'); if (d && !d.open) d.open = true;
    el.scrollIntoView({ block: 'start', behavior: 'smooth' });
    el.classList.add('leftoff-flash'); setTimeout(() => el.classList.remove('leftoff-flash'), 2500);
  };
  const fold = open => root().querySelectorAll('details').forEach(d => { d.open = open; });
  return (
    <details class="outline" id="outline">
      <summary>Outline <span class="muted small">({plural(hs.length, 'section')})</span></summary>
      <div class="row-actions" style="margin:6px 0"><button class="btn btn-sm" id="outlineFold" onClick={() => fold(false)}>Fold all</button><button class="btn btn-sm" id="outlineOpen" onClick={() => fold(true)}>Open all</button></div>
      <ol class="outline-list">
        {hs.map(h => (
          <li key={h.line} class={'outline-row lvl' + h.level} data-outline={h.text}>
            <a href="#" class="outline-jump" onClick={e => { e.preventDefault(); jump(h); }}>{h.text}</a>
            <span class="outline-move"><button class="mini" aria-label={'Move ' + h.text + ' up'} data-up onClick={() => { if (!moveSectionIn(note.path, h.line, -1)) toast('It is already first at its level.'); }}>↑</button><button class="mini" aria-label={'Move ' + h.text + ' down'} data-down onClick={() => { if (!moveSectionIn(note.path, h.line, 1)) toast('It is already last at its level.'); }}>↓</button></span>
          </li>
        ))}
      </ol>
    </details>
  );
}

/* ---------- Prep check: what is not ready ---------- */
export function ReadinessCard({ note }) {
  useApp();
  const idx = getIndex();
  const { all } = useMonsters();
  const names = useMemo(() => new Set(all.map(m => String(m.n || '').toLowerCase())), [all]);
  const last = lastSessionInfo(note.path);
  const todo = readiness(idx, note, { monsters: all.length ? names : null, encounters: parseEncounters(note.body), last });
  const fix = f => {
    if (f === 'must') { addMustBlock(note.path); toast('Added a MUST HAPPEN list under Prep.'); }
    else if (f === 'last') { importLastSession(note.path); }
  };
  return (
    <details class={'ready' + (todo.length ? ' open-gaps' : '')} id="prepCheck" open={false}>
      <summary><b>Prep check</b> <span class={'pill ' + (todo.length ? 'pill-warn' : 'pill-good')} id="prepCount">{todo.length ? plural(todo.length, 'thing') + ' to look at' : 'All set'}</span></summary>
      {todo.length === 0 && <p class="small muted" style="margin:6px 0 0">The MUST HAPPEN list, the cast, their descriptions and places, and the monsters are all in order.</p>}
      <ul class="ready-list">
        {todo.map(t => (
          <li key={t.id} data-gap={t.id}>
            <span>{t.text}</span>
            {t.notes && <span class="chips">{t.notes.slice(0, 6).map(n => <a key={n.path} href="#" class="chip-link" onClick={e => { e.preventDefault(); openBeside(n.path); }}>{n.name}</a>)}</span>}
            {t.fix === 'must' && <button class="btn btn-sm" data-fix="must" onClick={() => fix('must')}>Add one</button>}
            {t.fix === 'last' && <button class="btn btn-sm" data-fix="last" onClick={() => fix('last')}>Bring it in</button>}
          </li>
        ))}
      </ul>
    </details>
  );
}

/* ---------- Prepared encounters ---------- */
/* change one encounter without leaving the page: its name, how many of each, which creature, more or fewer */
function EncounterEditor({ note, enc, all, onDone }) {
  const [title, setTitle] = useState(enc.title === 'Encounter' && !/Encounter\s*[:—–-]/i.test(enc.head || '') ? '' : enc.title);
  const [rows, setRows] = useState(() => enc.items.map((i, k) => ({ k, qty: i.qty, name: i.name })));
  const [next, setNext] = useState(enc.items.length);
  const [adding, setAdding] = useState('');
  const known = useMemo(() => new Set(all.map(m => String(m.n).toLowerCase())), [all]);
  const upd = (k, patch) => setRows(rs => rs.map(r => r.k === k ? { ...r, ...patch } : r));
  const clamp = n => Math.max(1, Math.min(99, n | 0 || 1));
  const addRow = () => {
    const name = adding.trim();
    if (!name) return;
    const at = rows.find(r => r.name.toLowerCase() === name.toLowerCase());
    if (at) upd(at.k, { qty: clamp(at.qty + 1) });
    else { setRows(rs => [...rs, { k: next, qty: 1, name }]); setNext(next + 1); }
    setAdding('');
  };
  const clean = rows.filter(r => r.name.trim());
  const dirty = (title.trim() || 'Encounter') !== enc.title || clean.length !== enc.items.length || clean.some((r, i) => r.qty !== enc.items[i].qty || r.name.trim() !== enc.items[i].name);
  const save = () => {
    if (!clean.length) return;
    if (editEncounterIn(note.path, enc.start, title, clean.map(r => ({ qty: r.qty, name: r.name.trim() })))) { if (dirty) toast('Changed “' + (title.trim() || 'Encounter') + '”. Push changes to keep it.'); onDone(); }
  };
  return (
    <div class="enc-edit" data-encedit={enc.title} onKeyDown={e => { if (e.key === 'Escape') { e.stopPropagation(); onDone(); } }}>
      <div class="field"><label class="small muted" for="encName">Name</label><input id="encName" value={title} placeholder="Encounter" onInput={e => setTitle(e.currentTarget.value)} /></div>
      <div class="enc-lines">
        {rows.map(r => (
          <div key={r.k} class="enc-line" data-encline={r.name}>
            <span class="enc-qty">
              <button class="btn btn-sm" data-encminus={r.name} aria-label={'One fewer ' + r.name} disabled={r.qty <= 1} onClick={() => upd(r.k, { qty: clamp(r.qty - 1) })}>−</button>
              <input class="enc-n" inputmode="numeric" aria-label={'How many ' + r.name} value={String(r.qty)} onInput={e => upd(r.k, { qty: clamp(parseInt(e.currentTarget.value.replace(/\D/g, ''), 10)) })} />
              <button class="btn btn-sm" data-encplus={r.name} aria-label={'One more ' + r.name} disabled={r.qty >= 99} onClick={() => upd(r.k, { qty: clamp(r.qty + 1) })}>+</button>
            </span>
            <input class="enc-name" list="encMonsters" aria-label="Creature" value={r.name} onInput={e => upd(r.k, { name: e.currentTarget.value })} />
            {r.name.trim() && !known.has(r.name.trim().toLowerCase()) && <span class="small muted enc-miss">not in the library</span>}
            <button class="btn btn-sm btn-ghost" data-encremove={r.name} aria-label={'Take ' + r.name + ' out'} onClick={() => setRows(rs => rs.filter(x => x.k !== r.k))}>Remove</button>
          </div>
        ))}
        {!rows.length && <div class="small muted">No creatures yet. Add one below.</div>}
      </div>
      <div class="enc-add">
        <input id="encAdd" list="encMonsters" aria-label="Add a creature" placeholder="Add a creature (start typing a name)" value={adding} onInput={e => setAdding(e.currentTarget.value)} onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addRow(); } }} />
        <button class="btn btn-sm" id="encAddBtn" disabled={!adding.trim()} onClick={addRow}>Add</button>
      </div>
      <datalist id="encMonsters">{all.map(m => <option key={m.key || m.n} value={m.n} />)}</datalist>
      <div class="row-actions" style="margin-top:8px">
        <button class="btn btn-sm btn-primary" id="encSave" disabled={!clean.length} onClick={save}>Save changes</button>
        <button class="btn btn-sm" id="encCancel" onClick={onDone}>Cancel</button>
        {!clean.length && <span class="small muted">An encounter needs at least one creature. Use Remove on the card to delete it.</span>}
      </div>
    </div>
  );
}

export function EncountersCard({ note, hideEmpty }) {
  useApp();
  const [editing, setEditing] = useState(null);       // the line the encounter being edited starts on
  const idx = getIndex();
  const { all } = useMonsters();
  const encs = parseEncounters(note.body);
  const rows = partyRows(idx, absentOf(note.fm)).filter(r => r.here && r.level);
  const b = budgetFor(rows.map(r => r.level));
  if (!encs.length && hideEmpty) return null;
  if (!encs.length) return (
    <div class="enc-empty small muted" id="encEmpty">No prepared encounters. Line one up on the <a href="#" onClick={e => { e.preventDefault(); setSection('party'); }}>Party page</a> and press <b>Save to session</b>.</div>
  );
  return (
    <div class="enc" id="encounters">
      <div class="enc-head"><b>Prepared encounters</b></div>
      {encs.map(e => {
        const { found, missing } = resolveItems(e.items, all);
        const d = difficulty(xpOf(found), b);
        return (
          <div key={e.start} class="enc-row" data-enc={e.title}>
            <div class="enc-title"><b>{e.title}</b> <span class={'pill ' + (d.tier === 'over' ? 'pill-bad' : d.tier === 'high' ? 'pill-warn' : 'pill-good')} data-diff={d.tier}>{d.label}</span></div>
            {editing === e.start ? <EncounterEditor key={e.start} note={note} enc={e} all={all} onDone={() => setEditing(null)} /> : <>
            <div class="small">{e.items.map(i => i.qty + '× ' + i.name).join(', ')}</div>
            {missing.length > 0 && <div class="small muted">Not in the library: {missing.map(m => m.name).join(', ')}</div>}
            <div class="row-actions" style="margin-top:6px">
              <button class="btn btn-sm" data-editenc={e.title} onClick={() => setEditing(e.start)}>Edit</button>
              <button class="btn btn-sm btn-primary" data-run={e.title} disabled={!found.length} onClick={() => { const n = runEncounterFrom(note.path, found); toast('Added ' + plural(n, 'creature') + ' to the fight, with initiative rolled.'); }}>Run in Combat</button>
              <button class="btn btn-sm" data-load={e.title} disabled={!found.length} onClick={() => loadEncounterToBudget(found)}>Open in the budget</button>
              <button class="btn btn-sm btn-ghost" data-delenc={e.title} onClick={() => { deleteEncounterFrom(note.path, e.start); toast('Removed that encounter from the session.'); }}>Remove</button>
            </div></>}
          </div>
        );
      })}
    </div>
  );
}

/* the Party page's budget card: put what is lined up into a session as a prepared encounter */
export function SaveEncounterBar({ items }) {
  const idx = getIndex();
  const sessions = idx ? (idx.byType.session || []) : [];
  const [title, setTitle] = useState('');
  const [path, setPath] = useState(() => currentSessionPath());
  const ref = useRef();
  if (!sessions.length) return null;
  const go = () => {
    const sp = path || sessions[0].path;
    const t = title.trim() || 'Encounter';
    if (saveEncounterTo(sp, t, items.map(e => ({ qty: e.qty, name: e.m.n })))) { toast('Saved “' + t + '” to ' + idx.byPath.get(sp).name + '. Push changes to keep it.'); setTitle(''); }
  };
  return (
    <div class="row-actions" id="ebSaveBar" style="margin-top:10px;gap:8px;flex-wrap:wrap">
      <input ref={ref} id="ebTitle" aria-label="Name for this encounter" placeholder="Name this encounter, e.g. Ambush at the weir" value={title} onInput={e => setTitle(e.currentTarget.value)} style="flex:1;min-width:200px;max-width:340px" />
      <select id="ebSession" aria-label="Session to save it in" style="width:auto;max-width:240px" value={path || sessions[0].path} onChange={e => setPath(e.currentTarget.value)}>{sessions.map(n => <option key={n.path} value={n.path}>{n.name}</option>)}</select>
      <button class="btn" id="ebSave" disabled={!items.length} onClick={go}>Save to session</button>
    </div>
  );
}
