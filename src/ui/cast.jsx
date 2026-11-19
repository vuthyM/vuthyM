import { useState } from 'preact/hooks';
import { useApp, getIndex, toast, set } from './store.js';
import { goto, openTab, openBeside, sectionForType, addToSessionCast, populatePlace } from './actions.js';
import { castOf, castHeadingName, rollOne } from '../core/cast.js';
import { likelyHere } from '../core/prep40.js';
import { GENERATORS } from '../core/generators.js';
import { subtitle } from './notes.jsx';

/* click: show it in the other pane (the session stays where it is); Ctrl/Cmd-click: a new tab; Shift-click: here */
function openChip(n, e) {
  e.preventDefault();
  if (e.shiftKey) goto(n.path);
  else if (e.ctrlKey || e.metaKey) openTab({ section: sectionForType(n.type), selected: n.path });
  else openBeside(n.path);
}

function Chips({ list, label, id, empty }) {
  return (
    <div class="cast-row" id={id}>
      <span class="cast-label small muted">{label}</span>
      {list.length === 0 && empty ? <span class="small muted">{empty}</span> : list.map(n => (
        <a key={n.path} href="#" class="chip-link cast-chip" data-cast={n.name} title={(subtitle(n) || n.type) + ' · click to read it beside this session, Ctrl/⌘-click for a new tab'} onClick={e => openChip(n, e)}>{n.name}</a>
      ))}
    </div>
  );
}

/* On a session: the party, the NPCs and places it mentions, each one click from the other pane; and a way to add an NPC to the cast */
export function CastStrip({ note }) {
  useApp();
  const idx = getIndex();
  const cast = castOf(idx, note);
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const [at, setAt] = useState(null);
  const places = (idx.byType.location || []).slice().sort((a, b) => a.name.localeCompare(b.name));
  const where = at === null ? (cast.places[0] ? cast.places[0].name : '') : at;
  const inCast = new Set(cast.npcs.map(n => n.path));
  const text = q.trim();
  const matches = text ? (idx.byType.npc || []).filter(n => !inCast.has(n.path) && n.name.toLowerCase().includes(text.toLowerCase())).slice(0, 6) : [];
  const exact = text ? idx.resolve(text) : null;
  const heading = castHeadingName(note.body);
  const likely = likelyHere(idx, note);
  const add = (name, create) => {
    const r = addToSessionCast(note.path, name, { create, at: where });
    if (!r) return;
    setQ('');
    if (r.dup) toast(r.name + ' is already under “' + r.heading + '”.');
    else toast((r.made ? 'Made ' + r.name + (where ? ' at ' + where : '') + ' and ' : '') + 'added to “' + r.heading + '”' + (r.madeHeading ? ' (a new heading)' : '') + '. Push changes to save it.');
  };
  const enter = e => {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    if (!text) return;
    if (exact && exact.type === 'npc') add(exact.name, false);
    else if (matches.length === 1) add(matches[0].name, false);
    else if (!exact) add(text, true);
  };
  return (
    <div class="cast-strip" id="castStrip">
      <Chips id="castPlayers" label="Party" list={cast.players} empty="No players yet." />
      <Chips id="castNpcs" label="NPCs" list={cast.npcs} empty="None linked yet." />
      {cast.places.length > 0 && <Chips id="castPlaces" label="Places" list={cast.places} />}
      {likely.length > 0 && (
        <div class="cast-likely" id="castLikely">
          {likely.map(l => (
            <div key={l.place.path} class="cast-row" data-likely={l.place.name}>
              <span class="cast-label small muted">At {l.place.name}</span>
              {l.people.slice(0, 8).map(n => <button key={n.path} class="chip-link cast-add-chip" data-addlikely={n.name} title={'Add ' + n.name + ' to this session’s cast'} onClick={() => add(n.name, false)}>＋ {n.name}</button>)}
              {l.kept.slice(0, 4).map(n => <a key={n.path} href="#" class="chip-link cast-chip" title="Kept here" onClick={e => openChip(n, e)}>{n.name}</a>)}
              {l.factions.slice(0, 3).map(n => <a key={n.path} href="#" class="chip-link cast-chip" title="Based here" onClick={e => openChip(n, e)}>{n.name}</a>)}
            </div>
          ))}
        </div>
      )}
      <div class="cast-add">
        <button class={'btn btn-sm' + (open ? ' btn-primary' : '')} id="castAddBtn" aria-expanded={open} onClick={() => setOpen(!open)}>＋ Add an NPC</button>
        <button class="btn btn-sm" id="castImprov" title="Roll someone on the spot and keep them" onClick={() => set({ dialog: { kind: 'improv', session: note.path } })}>Improvise an NPC</button>
        {!open && <span class="small muted">{cast.npcs.length ? '' : 'Link them with [[double brackets]] or add them here.'}</span>}
      </div>
      {open && (
        <div class="cast-panel" id="castPanel">
          <div class="row-actions" style="gap:8px;flex-wrap:wrap">
            <input id="castName" autofocus aria-label="NPC to add to this session" placeholder="Type a name: pick an NPC or make a new one" value={q} onInput={e => setQ(e.currentTarget.value)} onKeyDown={enter} style="flex:1;min-width:200px" />
            <label class="small muted" for="castAt">At</label>
            <select id="castAt" style="width:auto;max-width:220px" value={where} onChange={e => setAt(e.currentTarget.value)}>
              <option value="">No place yet</option>{places.map(p => <option key={p.path} value={p.name}>{p.name}</option>)}
            </select>
          </div>
          <div class="cast-matches">
            {matches.map(n => <button key={n.path} class="btn btn-sm" data-castpick={n.name} onClick={() => add(n.name, false)}>{n.name}<span class="muted small"> {subtitle(n)}</span></button>)}
            {text && !exact && <button class="btn btn-sm btn-primary" id="castCreate" onClick={() => add(text, true)}>Create “{text}”{where ? ' at ' + where : ''}</button>}
            {text && exact && exact.type !== 'npc' && <span class="small muted">“{exact.name}” is a {exact.type}, not an NPC.</span>}
          </div>
          <div class="small muted">{heading ? 'Goes under “' + heading + '”.' : 'This session has no cast heading yet, so a “Cast” heading is added at the end.'} New NPCs are made in your NPCs folder{where ? ' at ' + where : ''}.</div>
        </div>
      )}
    </div>
  );
}

/* On a place: roll a few people to live here, keep the ones you like, and they become NPC notes placed at this place */
export function PopulateBox({ place, count: suggested }) {
  const idx = getIndex();
  const [open, setOpen] = useState(false);
  const [count, setCount] = useState(suggested);
  const [rows, setRows] = useState([]);
  const g = GENERATORS.find(x => x.id === 'npc');
  const used = rows => new Set(rows.map(r => r.name));
  const roll = n => { const u = new Set(); const out = []; for (let i = 0; i < n; i++) out.push({ ...rollOne(idx, g, u), keep: true }); setRows(out); };
  const reroll = i => { const u = used(rows.filter((_, j) => j !== i)); const r = rollOne(idx, g, u); setRows(rows.map((x, j) => (j === i ? { ...r, keep: true } : x))); };
  const toggle = i => setRows(rows.map((x, j) => (j === i ? { ...x, keep: !x.keep } : x)));
  const chosen = rows.filter(r => r.keep);
  const begin = () => { setOpen(true); if (!rows.length) roll(count); };
  const add = () => {
    const n = populatePlace(place.name, chosen);
    toast('Added ' + n + ' ' + (n === 1 ? 'person' : 'people') + ' at ' + place.name + '. Push changes to save them.');
    setRows([]); setOpen(false);
  };
  if (!open) return <button class="btn btn-sm" id="popBtn" title={'Roll some people who live or work in ' + place.name} onClick={begin}>Populate this place…</button>;
  return (
    <div class="pop-box" id="popBox">
      <div class="row-actions" style="gap:8px;flex-wrap:wrap">
        <label class="small muted" for="popCount">How many</label>
        <input id="popCount" type="number" min="1" max="20" style="width:70px" value={count} onInput={e => setCount(Math.max(1, Math.min(20, Number(e.currentTarget.value) || 1)))} />
        <button class="btn btn-sm" id="popRoll" onClick={() => roll(count)}>Roll again</button>
        <button class="btn btn-sm btn-ghost" id="popClose" onClick={() => setOpen(false)}>Close</button>
      </div>
      <ul class="pop-rows">
        {rows.map((r, i) => (
          <li key={i} class={'pop-row' + (r.keep ? '' : ' off')} data-pop={r.name}>
            <label><input type="checkbox" checked={r.keep} onChange={() => toggle(i)} /> <b>{r.name}</b> <span class="muted small">{[r.race, r.role].filter(Boolean).join(' · ')}</span></label>
            <button class="btn btn-sm btn-ghost" data-popreroll={i} aria-label={'Roll someone else instead of ' + r.name} title="Roll someone else" onClick={() => reroll(i)}>↻</button>
          </li>
        ))}
      </ul>
      <div class="row-actions"><button class="btn btn-sm btn-primary" id="popAdd" disabled={!chosen.length} onClick={add}>Add {chosen.length} {chosen.length === 1 ? 'person' : 'people'} to {place.name}</button></div>
    </div>
  );
}
