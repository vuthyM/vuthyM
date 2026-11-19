import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'preact/hooks';
import { PopMenu } from './popmenu.jsx';
import { Icon } from './icons.jsx';
import { S, set, useApp, getIndex, toast, registerDraft } from './store.js';
import { goto, navTo, openTab, openAssetTab, wantsNewTab, sectionForType, setSection, saveNoteEdit, obsidianUrl, deleteNote, discardChange, startPush, reformatNote, undoReformat, dismissReformat, approveLinks, addLinks, askClaude, claudeOn, jumpToLine, clearLeftOff, declineLink, declinedLinks, openGraph, unlinkInNote } from './actions.js';
import { bodyLinks, groupForLinking } from '../core/linkedit.js';
import { editorContextMenu } from './notemenu.js';
import { insertAt } from '../core/sessiontemplates.js';
import { timeAgo } from '../core/leftoff.js';
import { EditableBody } from './editbody.jsx';
import { CastStrip } from './cast.jsx';
import { LivePanel, OutlineBar, ReadinessCard, EncountersCard } from './prep40.jsx';
import { notePrompt, CLAUDE_SYSTEM, QUESTION_MARK } from '../core/claudeprompts.js';
import { TYPES, OTHER, fieldDefs, getField, toStored, displayValue, typeInfo } from '../core/schema.js';
import { suggestLinks, plainText } from '../core/mentions.js';
import { useTab } from './tabs.jsx';
import { splitFrontmatter } from '../core/frontmatter.js';
import { IMAGE_EXT, ext, basename } from '../core/util.js';
import { Markdown, Empty, FieldInput, Asset } from './common.jsx';
import { ForgettingCard } from './forgetting.jsx';
import { TidyStrip } from './tidy.jsx';
import { NoteClocks } from './clocks.jsx';
import { mapNoteFor, parsePins } from '../core/maps.js';
import { LocationPanel, LocationCrumbs } from './locations.jsx';
import { GroupedList, PlaceField, UnplacedNudge } from './grouped.jsx';
import { GROUPED } from '../core/grouping.js';
import { ListTools, BulkBar, loadView, saveView } from './listtools.jsx';
import { facetFor, filterByFacet, sortNotes } from '../core/listview.js';
import { seedersOf, seededThreads, seederFacet, filterBySeeder } from '../core/seeds.js';
import { placesOf, textPlaces, threadsAt, appearsFacet, filterByPlace, groupByPlace } from '../core/appears.js';
import { movePlace, duplicateNote, toggleLive, setNoteProp } from './actions.js';
import { locationTree, canMoveInto } from '../core/locations.js';
import { startTour, tourSeen, lastSessionInfo, importLastSession, isFav, toggleFav, timerToggle, timerElapsed } from './actions.js';
import { parseScenes } from '../core/scenes.js';
import { parseLog } from '../core/sessionlog.js';
import { splitFrontmatter as splitFm } from '../core/frontmatter.js';

function fieldVal(n, type, key) {
  const f = fieldDefs(type).find(x => x.key === key);
  return f ? getField(n, f).value : '';
}

export function subtitle(n) {
  switch (n.type) {
    case 'npc': return [fieldVal(n, 'npc', 'race'), fieldVal(n, 'npc', 'role')].filter(Boolean).join(' · ') || n.summary;
    case 'player': {
      const c = fieldVal(n, 'player', 'class'), l = fieldVal(n, 'player', 'level'), p = fieldVal(n, 'player', 'player');
      return [c && (l ? c + ' ' + l : c), p && 'played by ' + p].filter(Boolean).join(' · ') || n.summary;
    }
    case 'location': return fieldVal(n, 'location', 'kind') || n.summary;
    case 'faction': return fieldVal(n, 'faction', 'goal') || n.summary;
    case 'plot': return fieldVal(n, 'plot', 'status') || n.summary;
    case 'session': return [n.sdate, n.snum != null ? '#' + n.snum : ''].filter(Boolean).join(' · ') || n.summary;
    default: return n.summary;
  }
}

export function PendingDot({ n }) {
  return n.pending ? <span class={'dot-unpushed' + (n.pending === 'delete' ? ' del' : '')} title={n.pending === 'create' ? 'New, not pushed yet' : 'Edited, not pushed yet'} /> : null;
}

/* drop a leading heading that only repeats the note's title */
const squash = x => String(x).toLowerCase().replace(/[^a-z0-9]+/g, '');
function viewBody(n) {
  return n.body.replace(/^\s*#\s+(.+?)\s*#*\s*(?:\r?\n)+/, (m, t) => (squash(t) === squash(n.name) ? '' : m));
}

/* ---------- list + detail for one note type ---------- */
/* click on a list entry: opens it here, or in a new tab with ctrl/cmd-click */
export function pickNote(n, e) {
  if (wantsNewTab(e)) { e.preventDefault(); openTab({ section: sectionForType(n.type), selected: n.path }); }
  else set({ selected: n.path, editing: false });
}

export function EntityPage({ type }) {
  const s = useApp();
  const tab = useTab();
  const idx = getIndex();
  const [q, setQ] = useState('');
  const [dragP, setDragP] = useState(null);         // a place being dragged in the Locations list
  const [dropOn, setDropOn] = useState(null);        // the place it is over, or '' for the top level
  const [vrev, setVrev] = useState(0);
  const [pick, setPick] = useState(false);            // choosing several notes to change at once
  const [chosen, setChosen] = useState(() => new Set());
  const t = typeInfo(type) || { label: 'Notes', single: 'Note' };
  const all = idx.byType[type] || [];
  const ql = q.trim().toLowerCase();
  const view = loadView(type);
  const facet = facetFor(type, all);
  const facetOn = facet ? view.facet.filter(v => facet.values.some(x => x.k === v)) : [];
  const typed = all.filter(n => !ql || n.name.toLowerCase().includes(ql) || subtitle(n).toLowerCase().includes(ql));
  const seed = type === 'plot' ? seederFacet(idx, all) : null;
  const seedOn = seed ? (view.seed || []).filter(v => seed.values.some(x => x.k === v)) : [];
  const apFacet = type === 'plot' ? appearsFacet(idx, all) : null;
  const apOn = apFacet ? (view.appears || []).filter(v => apFacet.values.some(x => x.k === v)) : [];
  const filtered = filterByPlace(idx, filterBySeeder(idx, filterByFacet(typed, type, facet, facetOn), seedOn), apOn);
  const plotGroups = type === 'plot' && view.group === 'place' ? groupByPlace(idx, sortNotes(filtered, view.sort, s.mtimes)) : null;
  const items = type === 'location' ? filtered : sortNotes(filtered, view.sort, s.mtimes);
  const setView = v => { saveView(type, v); setVrev(vrev + 1); };
  const toggleChosen = p => { const c = new Set(chosen); if (c.has(p)) c.delete(p); else c.add(p); setChosen(c); };
  // places are listed as a tree (what is inside what) unless you are filtering
  const depthOf = type === 'location' && !ql && !facetOn.length && !seedOn.length && !apOn.length ? new Map(locationTree(idx).flat().map(x => [x.note.path, x])) : null;
  const shown = depthOf ? locationTree(idx).flat().map(x => x.note).filter(n => items.includes(n)) : items;
  const sel = tab.selected && idx.byPath.get(tab.selected);
  const selected = sel && sel.type === type ? sel : null;
  const create = () => set({ dialog: type === 'session' ? { kind: 'newSession' } : { kind: 'new', type } });
  return (
    <>
      <div class="page-head">
        <h2 aria-level="1">{t.label}</h2>
        <button class="btn btn-primary" onClick={create}>+ New {t.single}</button>
      </div>
      {!all.length ? (
        <Empty title={'No ' + t.label.toLowerCase() + ' yet'}>
          Add the first one, or point DM Forge at a different folder with “Edit folder mapping”.
          <div style="margin-top:12px"><button class="btn btn-primary" onClick={create}>+ New {t.single}</button></div>
        </Empty>
      ) : (
        <div class={'split scroll-split' + (selected ? ' has-sel' : '')}>
          <div>
            <div class="field"><input type="search" placeholder={'Filter ' + t.label.toLowerCase()} value={q} onInput={e => setQ(e.currentTarget.value)} aria-label="Filter list" /></div>
            <ListTools type={type} facet={facet} seed={seed} appears={apFacet} view={{ ...view, facet: facetOn, seed: seedOn, appears: apOn }} onView={setView} pick={pick} onPick={() => { setPick(!pick); setChosen(new Set()); }} />
            {pick && <BulkBar type={type} chosen={chosen} shown={items.map(x => x.path)} onChosen={setChosen} onDone={() => setChosen(new Set())} />}
            {GROUPED[type] ? <GroupedList type={type} all={all} items={items} q={q} selected={selected} sort={view.sort} pick={pick} chosen={chosen} setChosen={setChosen} /> : plotGroups ? (
            <div class="list grp-plain" id="plotGroups">
              {plotGroups.map(g => {
                const open = ql ? true : view.over && view.over[g.key || '@none'] !== undefined ? view.over[g.key || '@none'] : true;
                return (
                  <section key={g.key || '@none'} class={'grp-sec' + (open ? ' open' : '')} data-group={g.label}>
                    <div class="grp-head-row"><button class="grp-head" aria-expanded={open} data-grouphead={g.label} onClick={() => setView({ ...view, facet: facetOn, seed: seedOn, appears: apOn, over: { ...(view.over || {}), [g.key || '@none']: !open } })}><Icon name="chev" size={14} /><b>{g.label}</b><span class="badge" data-count>{g.notes.length}</span></button></div>
                    {open && <div class="grp-body">{g.notes.map(n => (
                      <div key={n.path} class="list-row"><button class={'list-item' + (selected && selected.path === n.path ? ' cur' : '')} data-note={n.name} aria-current={selected && selected.path === n.path ? 'true' : undefined} onClick={e => pickNote(n, e)} onAuxClick={e => { if (e.button === 1) pickNote(n, e); }}>
                        <span class="t">{n.name}<PendingDot n={n} /></span><span class="s">{subtitle(n)}</span></button></div>
                    ))}</div>}
                  </section>
                );
              })}
              {!plotGroups.length && <div class="muted small">Nothing matches “{q}”.</div>}
            </div>
            ) : (
            <div class={'list' + (dragP ? ' dragging' : '')}>
              {dragP && <div class={'drop-top' + (dropOn === '' ? ' over' : '')} id="dropTop" onDragOver={e => { e.preventDefault(); setDropOn(''); }} onDragLeave={() => setDropOn(null)} onDrop={e => { e.preventDefault(); const p = dragP; setDragP(null); setDropOn(null); movePlace(p, ''); }}>Drop here to make it a top-level place</div>}
              {shown.map(n => (
                <button key={n.path} draggable={!!depthOf} onDragStart={e => { if (!depthOf) return; try { e.dataTransfer.setData('text/plain', 'place:' + n.path); e.dataTransfer.effectAllowed = 'move'; } catch (err) { /* no drag data */ } setDragP(n.path); }} onDragEnd={() => { setDragP(null); setDropOn(null); }}
                  onDragOver={e => { if (!dragP || !depthOf) return; const me = idx.byPath.get(dragP); if (me && canMoveInto(locationTree(idx), me, n)) { e.preventDefault(); if (dropOn !== n.path) setDropOn(n.path); } }}
                  onDragLeave={() => { if (dropOn === n.path) setDropOn(null); }}
                  onDrop={e => { if (!dragP || !depthOf) return; e.preventDefault(); const p = dragP; setDragP(null); setDropOn(null); if (movePlace(p, n.name)) toast((idx.byPath.get(p) || {}).name + ' is now inside ' + n.name + '.'); }}
                  class={'list-item' + (pick && chosen.has(n.path) ? ' picked' : '') + (depthOf && depthOf.get(n.path).depth ? ' tree-child' : '') + (dropOn === n.path ? ' drop-over' : '') + (dragP === n.path ? ' drag-src' : '')} style={depthOf && depthOf.get(n.path).depth ? 'margin-left:' + Math.min(depthOf.get(n.path).depth, 4) * 18 + 'px;width:calc(100% - ' + Math.min(depthOf.get(n.path).depth, 4) * 18 + 'px)' : undefined} data-depth={depthOf ? depthOf.get(n.path).depth : undefined} aria-current={selected && selected.path === n.path ? 'true' : undefined} onClick={e => (pick ? toggleChosen(n.path) : pickNote(n, e))} onAuxClick={e => { if (e.button === 1 && !pick) pickNote(n, e); }}>
                  <span class="t">{pick && <span class="pick-box" aria-hidden="true">{chosen.has(n.path) ? '☑' : '☐'}</span>}{n.name}<PendingDot n={n} /></span>
                  <span class="s">{subtitle(n)}{depthOf && depthOf.get(n.path).inside ? ' · ' + depthOf.get(n.path).inside + ' inside' : ''}</span>
                </button>
              ))}
              {!shown.length && <div class="muted small">Nothing matches “{q}”.</div>}
            </div>)}
          </div>
          <div>{selected && <button class="btn btn-sm back-list" id="backToList" onClick={() => set({ selected: null, editing: false })}>← All {t.label.toLowerCase()}</button>}{selected ? <NoteView key={selected.path} note={selected} /> : <Empty title={'Select ' + (/^([aeiou]|npc$)/i.test(t.single) ? 'an' : 'a') + ' ' + (/^[A-Z]{2,}$/.test(t.single) ? t.single : t.single.toLowerCase())}>Its properties, text and links appear here. Ctrl- or ⌘-click opens it in a new tab.</Empty>}</div>
        </div>
      )}
    </>
  );
}

function PropsBlock({ note, idx }) {
  const rows = [];
  const used = new Set(['type', 'tags', 'tag', 'aliases', 'cssclasses', 'cssclass']);
  for (const f of fieldDefs(note.type)) {
    [f.key, ...(f.aliases || [])].forEach(k => used.add(k.toLowerCase()));
    const g = getField(note, f);
    if (g.value) rows.push({ label: f.label, value: g.value, link: f.kind === 'link', seeders: f.kind === 'links' ? seedersOf(idx, note, f) : null, key: f.key });
  }
  for (const [k, v] of Object.entries(note.fm || {})) {
    if (used.has(k.toLowerCase())) continue;
    const val = displayValue(v);
    if (val) rows.push({ label: k, value: val });
  }
  if (!rows.length) return null;
  const peek = rows.slice(0, 3).map(r => r.value).join(' · ');
  return (
    <details class="props-box" open>
      <summary><span class="props-title">Properties</span><span class="muted small props-peek">{peek}</span></summary>
      <dl class="props">
        {rows.map(r => {
          const target = r.link ? idx.resolve(r.value) : null;
          if (r.seeders) return <><dt>{r.label}</dt><dd class="seeders" id={r.key === 'seeded' ? 'seededBy' : 'appearsIn'}>{r.seeders.map(x => x.note ? <a key={x.name} class="chip-link" href="#" title={typeInfo(x.note.type).single} onClick={e => { e.preventDefault(); navTo(x.note.path, e); }}>{x.name}</a> : <span key={x.name} class="chip-link dashed" title="No note with this name">{x.name}</span>)}</dd></>;
          return <><dt>{r.label}</dt><dd>{target ? <a class="chip-link" href="#" onClick={e => { e.preventDefault(); navTo(target.path, e); }}>{r.value}</a> : r.value}</dd></>;
        })}
      </dl>
    </details>
  );
}

/* on a plot thread: places its text mentions that are not in "Appears in" yet, one click to add */
function AppearsSuggest({ note, idx }) {
  if (note.type !== 'plot') return null;
  const sug = textPlaces(idx, note).slice(0, 8);
  if (!sug.length) return null;
  const have = placesOf(idx, note).map(p => p.note.name);
  const add = name => { if (setNoteProp(note.path, 'appears', [...have, name], 'plot')) toast('Added ' + name + ' to where “' + note.name + '” appears. Push changes to save it.'); };
  return (
    <div class="seeded-threads" id="appearsSuggest">
      <span class="lbl-inline">Mentions</span>
      {sug.map(p => <button key={p.note.path} type="button" class="chip-link dashed" data-add-appears={p.note.name} title={'Add ' + p.note.name + ' to Appears in'} onClick={() => add(p.note.name)}>＋ {p.note.name}</button>)}
      <span class="small muted">Add the ones this thread happens in.</span>
    </div>
  );
}

/* on a place: the plot threads that appear there */
function ThreadsHere({ note, idx }) {
  if (note.type !== 'location') return null;
  const threads = threadsAt(idx, note);
  if (!threads.length) return null;
  return (
    <div class="seeded-threads" id="threadsHere">
      <span class="lbl-inline">Plot {threads.length === 1 ? 'thread' : 'threads'} here</span>
      {threads.map(t => <a key={t.path} class="chip-link" href="#" data-thread-here={t.name} title={fieldVal(t, 'plot', 'status') || 'Plot thread'} onClick={e => { e.preventDefault(); navTo(t.path, e); }}>{t.name}{fieldVal(t, 'plot', 'status') ? <span class="muted small"> · {fieldVal(t, 'plot', 'status')}</span> : null}</a>)}
    </div>
  );
}

/* on an NPC, faction or player: the plot threads they seeded */
function SeededThreads({ note, idx }) {
  if (!['npc', 'faction', 'player'].includes(note.type)) return null;
  const threads = seededThreads(idx, note);
  if (!threads.length) return null;
  return (
    <div class="seeded-threads" id="seededThreads">
      <span class="lbl-inline">Seeded {threads.length === 1 ? 'thread' : 'threads'}</span>
      {threads.map(t => <a key={t.path} class="chip-link" href="#" data-seeded-thread={t.name} title={fieldVal(t, 'plot', 'status') || 'Plot thread'} onClick={e => { e.preventDefault(); navTo(t.path, e); }}>{t.name}{fieldVal(t, 'plot', 'status') ? <span class="muted small"> · {fieldVal(t, 'plot', 'status')}</span> : null}</a>)}
    </div>
  );
}

/* the [[links]] in a note, and the notes that link to it, with a way to remove each */
function existingLinks(note, idx) {
  const out = new Map();
  const add = (target, count, props) => {
    const r = idx.resolve(target);
    const key = r ? r.path : 'x:' + target.toLowerCase();
    const e = out.get(key) || { key, name: r ? r.name : target, path: r ? r.path : null, targetText: target, count: 0, props: false };
    e.count += count; if (props) e.props = true;
    out.set(key, e);
  };
  for (const l of bodyLinks(note.body)) if (!l.embed) add(l.target, 1, false);
  for (const t of note.links) { const r = idx.resolve(t); if (!out.has(r ? r.path : 'x:' + t.toLowerCase())) add(t, 0, true); }
  const outgoing = [...out.values()].sort((a, b) => a.name.localeCompare(b.name));
  const incoming = (idx.backlinks.get(note.path) || []).map(x => ({ note: x, count: bodyLinks(x.body).filter(l => { const r = idx.resolve(l.target); return !l.embed && r && r.path === note.path; }).length })).sort((a, b) => a.note.name.localeCompare(b.note.name));
  return { outgoing, incoming };
}

function ExistingLinks({ note, data }) {
  const { outgoing, incoming } = data;
  return (
    <div class="suggest-panel" role="group" aria-label="Existing links">
      <div class="small muted" style="margin-bottom:6px">Removing a link keeps its words in the note. You can also right-click a link in the text.</div>
      <label class="lbl">Links in this note</label>
      {!outgoing.length && <div class="muted small" style="margin-bottom:8px">This note does not link to anything yet.</div>}
      {outgoing.map(l => (
        <div key={l.key} class="existing-row">
          {l.path ? <a class="chip-link" href="#" onClick={e => { e.preventDefault(); navTo(l.path, e); }}>{l.name}</a> : <span class="chip-link dashed" title="No note with this name yet">{l.name}</span>}
          <span class="small muted">{l.count ? (l.count === 1 ? 'once' : l.count + ' times') + (l.props ? ', and in its properties' : '') : 'in a property (change it with Edit)'}</span>
          {l.count > 0 && <button class="btn btn-sm btn-ghost btn-danger" aria-label={'Remove ' + (l.count === 1 ? 'the link' : 'all links') + ' to ' + l.name} onClick={() => unlinkInNote(note.path, l.path ? { path: l.path } : { targetText: l.targetText, all: true })}>{l.count === 1 ? 'Remove link' : 'Remove all ' + l.count}</button>}
        </div>
      ))}
      <label class="lbl" style="margin-top:10px">Notes that link here</label>
      {!incoming.length && <div class="muted small">No other note links here yet.</div>}
      {incoming.map(x => (
        <div key={x.note.path} class="existing-row">
          <a class="chip-link" href="#" onClick={e => { e.preventDefault(); navTo(x.note.path, e); }}>{x.note.name}</a>
          <span class="small muted">{x.count ? (x.count === 1 ? 'once' : x.count + ' times') : 'in a property'}</span>
          {x.count > 0 && <button class="btn btn-sm btn-ghost btn-danger" aria-label={'Remove the links to this note in ' + x.note.name} onClick={() => unlinkInNote(x.note.path, { path: note.path })}>{x.count === 1 ? 'Remove link' : 'Remove all ' + x.count}</button>}
        </div>
      ))}
    </div>
  );
}


/* link to notes that do not mention this one (or the other way round): pick any notes, say where the links go */
function AddLinks({ note, idx, onDone }) {
  const [q, setQ] = useState('');
  const [picked, setPicked] = useState([]);
  const [heading, setHeading] = useState('Related');
  const [back, setBack] = useState(false);
  const linked = useMemo(() => new Set(bodyLinks(note.body).filter(l => !l.embed).map(l => { const r = idx.resolve(l.target); return r ? r.path : ''; })), [note.text]);
  const groups = useMemo(() => groupForLinking(idx, q, note.path), [q, idx, note.path]);
  const shown = groups.reduce((n, g) => n + g.notes.length, 0);
  const LIMIT = 150;
  let budget = LIMIT;
  const toggle = p => setPicked(picked.includes(p) ? picked.filter(x => x !== p) : [...picked, p]);
  const go = e => { e.preventDefault(); if (!picked.length) return; addLinks(note.path, picked, { heading, back }); setPicked([]); onDone(); };
  return (
    <form class="suggest-panel" role="group" aria-label="Add links" onSubmit={go}>
      <div class="small muted" style="margin-bottom:6px">Link to any note, even if neither one mentions the other. Tick as many as you like. The category with the most links in your vault comes first.</div>
      <div class="al-top">
        <input id="alSearch" type="search" value={q} onInput={e => setQ(e.currentTarget.value)} placeholder="Find a note by name" aria-label="Find a note" />
        <span class="small muted al-count" id="alCount" aria-live="polite">{picked.length ? picked.length + ' selected' : ''}</span>
      </div>
      <div class="le-list" style="margin-top:8px" role="listbox" aria-multiselectable="true" aria-label="Notes">
        {groups.map(g => {
          const rows = g.notes.slice(0, Math.max(0, budget));
          budget -= rows.length;
          if (!rows.length) return null;
          return (
            <div key={g.type} role="group" aria-label={g.label} class="al-group" data-group={g.type}>
              <div class="al-head" title={g.links ? g.links + ' link' + (g.links === 1 ? '' : 's') + ' in your vault point at ' + g.label.toLowerCase() : 'Nothing links to these yet'}>{g.label}<span class="muted"> · {g.total}{g.type === 'session' ? ' · newest first' : ''}</span></div>
              {rows.map(n => {
                const done = linked.has(n.path);
                return (
                  <label key={n.path} role="option" aria-selected={picked.includes(n.path)} class={'le-row al-row' + (picked.includes(n.path) ? ' on' : '') + (done ? ' dim' : '')}>
                    <input type="checkbox" data-path={n.path} checked={picked.includes(n.path)} disabled={done} onChange={() => toggle(n.path)} />
                    <strong>{n.name}</strong>{done && <span class="small muted"> · already linked</span>}
                  </label>
                );
              })}
            </div>
          );
        })}
        {!groups.length && <div class="muted small" style="padding:8px">No note has that name.</div>}
        {shown > LIMIT && <div class="muted small" style="padding:8px">Showing the first {LIMIT} of {shown}. Type a few letters to narrow it.</div>}
      </div>
      <div class="al-opts">
        <label class="small">Put the links under <input id="alHeading" value={heading} onInput={e => setHeading(e.currentTarget.value)} placeholder="(the end of the note)" style="width:160px;display:inline-block" /></label>
        <label class="small al-check"><input id="alBack" type="checkbox" style="width:auto" checked={back} onChange={e => setBack(e.currentTarget.checked)} /> Also add a link back from each of them</label>
      </div>
      <div class="row-actions" style="margin-top:8px"><button type="submit" class="btn btn-sm btn-primary" id="alGo" disabled={!picked.length}>{picked.length > 1 ? 'Add ' + picked.length + ' links' : 'Add link'}</button><button type="button" class="btn btn-sm btn-ghost" onClick={onDone}>Close</button></div>
    </form>
  );
}

function LinkSuggest({ note, idx }) {
  const s = useApp();
  const [mode, setMode] = useState(null);   // null | 'suggest' | 'existing' | 'add'
  const open = mode === 'suggest';
  const declined = declinedLinks();
  const list = useMemo(() => (open ? suggestLinks(note, idx, { declined }) : []), [open, note.text, s.dataRev, declined.join('|')]);
  const existing = useMemo(() => (mode === 'existing' ? existingLinks(note, idx) : null), [mode, note.text, s.dataRev]);
  return (
    <div class="link-suggest">
      <div class="chips" style="align-items:center">
        {note.tags.map(t => <span key={t} class="pill">#{t}</span>)}
        <PopMenu id="linksMenu" icon="link" text="Links" title="Suggest links, see the links in this note, or add one" align="left" btnClass="btn btn-sm btn-ghost">
          {({ close }) => (
            <>
              <button class="pop-item" id="suggestLinks" role="menuitem" aria-expanded={open} onClick={() => { setMode(open ? null : 'suggest'); close(); }}><Icon name="wand" size={16} />{open ? 'Hide link suggestions' : 'Suggest links'}</button>
              <button class="pop-item" id="existingLinks" role="menuitem" aria-expanded={mode === 'existing'} onClick={() => { setMode(mode === 'existing' ? null : 'existing'); close(); }}><Icon name="link" size={16} />{mode === 'existing' ? 'Hide existing links' : 'Existing links'}</button>
              <button class="pop-item" id="addLink" role="menuitem" aria-expanded={mode === 'add'} onClick={() => { setMode(mode === 'add' ? null : 'add'); close(); }}><Icon name="plus" size={16} />{mode === 'add' ? 'Hide add link' : 'Add a link…'}</button>
            </>
          )}
        </PopMenu>
      </div>
      {existing && <ExistingLinks note={note} data={existing} />}
      {mode === 'add' && <AddLinks note={note} idx={idx} onDone={() => setMode(null)} />}
      {open && (
        <div class="suggest-panel" role="group" aria-label="Suggested links">
          <div class="small muted" style="margin-bottom:6px">Places where your notes talk about each other without a <span class="mono">[[link]]</span>. Nothing changes until you press Link it.</div>
          {!list.length && <div class="muted small">Nothing to link right now. Suggestions appear when another note mentions this one, or this note mentions another one, by name, acronym or alias, without a link.</div>}
          {list.map(x => {
            const here = x.path === note.path;
            const alias = x.matched.toLowerCase() !== x.targetName.toLowerCase();
            return (
              <div key={x.path + '|' + x.target} class="link-row" title={'Becomes ' + x.link}>
                <div class="link-where small">
                  {here ? <strong>In this note</strong> : <>In <a class="chip-link" href="#" onClick={e => { e.preventDefault(); navTo(x.path, e); }}>{x.name}</a></>}
                  {x.section && <span class="muted"> · under “{x.section}”</span>}
                  {x.inTable && <span class="muted"> · in a table</span>}
                </div>
                <div class="snip">{x.before}<mark>{x.matched}</mark>{x.after}</div>
                <div class="link-foot">
                  <div class="small muted link-what">
                    Link to <span class="linkpill">{x.targetName}</span>
                    {alias && <> and keep showing “{x.matched}”</>}
                    {x.reason && <> · {x.reason}</>}
                  </div>
                  <div class="row-actions">
                    <button class="btn btn-sm btn-primary" onClick={() => approveLinks([x])}>Link it</button>
                    <button class="btn btn-sm btn-ghost" onClick={() => declineLink(x)}>No thanks</button>
                  </div>
                </div>
              </div>
            );
          })}
          {list.length > 1 && <div class="row-actions" style="margin-top:8px"><button class="btn btn-sm" onClick={() => approveLinks(list)}>Link all {list.length}</button></div>}
        </div>
      )}
    </div>
  );
}

function ReformatBar({ note }) {
  const s = useApp();
  const r = s.reformat;
  if (!r || r.path !== note.path) return null;
  return (
    <div class="unpushed-bar reformat-bar" role="status">
      <span><strong>Reformatted.</strong> {r.changes.map(c => c.label + (c.count > 1 ? ' (' + c.count + ')' : '')).join('; ')}.</span>
      <span class="row-actions"><button class="btn btn-sm" onClick={undoReformat}>Undo</button><button class="btn btn-sm btn-ghost" onClick={dismissReformat}>Dismiss</button></span>
    </div>
  );
}


/* "Where you left off": the last changes made to this session, with a jump to the newest one */
function LeftOff({ note }) {
  const s = useApp();
  const [open, setOpen] = useState(false);
  if (note.type !== 'session' || !s.settings.trackLeftOff) return null;
  // an "added" or "edited" entry is only true while that line is still in the note (it is not if the change was undone some other way)
  const plainLines = (note.body || '').split(/\r?\n/).map(l => plainText(l).trim());
  const there = e => e.kind === 'removed' || e.kind === 'properties' || !e.snippet || (e.snippet.endsWith('…') ? plainLines.some(l => l.startsWith(e.snippet.slice(0, -1))) : plainLines.includes(e.snippet));
  const list = (s.leftOff[note.path] || []).filter(there);
  if (!list.length) return null;
  const last = list[0];
  const KIND = { edit: 'Edited', added: 'Added', removed: 'Removed', properties: 'Changed' };
  const where = e => (e.kind === 'properties' ? 'the properties' : e.section ? 'under “' + e.section + '”' : 'near the top');
  return (
    <div class="leftoff" id="leftOff" role="group" aria-label="Where you left off">
      <div class="leftoff-head">
        <strong>Where you left off</strong>
        <span class="muted small" id="leftOffWhen">{timeAgo(last.ts)}</span>
        <span class="grow" />
        {last.kind !== 'properties' && <button class="btn btn-sm btn-primary" id="leftOffJump" onClick={() => jumpToLine(note.path, last.line)}>Jump to it</button>}
        <button class="btn btn-sm" id="leftOffMore" aria-expanded={open} onClick={() => setOpen(!open)}>{open ? 'Hide' : 'Recent changes (' + list.length + ')'}</button>
      </div>
      <div class="leftoff-last small">{KIND[last.kind]} {where(last)}{last.snippet && last.kind !== 'properties' ? <>: <em>“{last.snippet}”</em></> : null}</div>
      {open && (
        <ol class="leftoff-list" id="leftOffList">
          {list.map((e, i) => (
            <li key={e.ts + '-' + i}>
              <span class="muted small leftoff-time" title={new Date(e.ts).toLocaleString()}>{timeAgo(e.ts)}</span>
              <span class="small">{KIND[e.kind]} {where(e)}{e.snippet && e.kind !== 'properties' ? <>: <em>“{e.snippet}”</em></> : null}</span>
              {e.kind !== 'properties' && <button class="btn btn-sm btn-ghost" onClick={() => jumpToLine(note.path, e.line)}>Jump</button>}
            </li>
          ))}
          <li class="leftoff-foot"><button class="btn btn-sm btn-ghost" id="leftOffClear" onClick={() => clearLeftOff(note.path)}>Clear this list</button></li>
        </ol>
      )}
    </div>
  );
}

export function NoteView({ note }) {
  const s = useApp();
  const tab = useTab();
  const idx = getIndex();
  if (tab.editing) return <NoteEditor note={note} />;
  const back = idx.backlinks.get(note.path) || [];
  const del = () => set({ dialog: { kind: 'confirm', title: 'Delete “' + note.name + '”?', body: 'It is removed from the app now and moved to the vault’s .trash folder when you push. Until then you can discard the change.', confirmLabel: 'Delete note', danger: true, onConfirm: () => deleteNote(note.path) } });
  return (
    <div class="card">
      {note.pending && (
        <div class="unpushed-bar">
          <span>{note.pending === 'create' ? 'New note. Not in your vault until you push.' : 'Edited. Not in your vault until you push.'}</span>
          <button class="btn btn-sm" onClick={() => discardChange(note.path)}>{note.pending === 'create' ? 'Discard note' : 'Undo my edits'}</button>
        </div>
      )}
      <div class="note-head">
        <div>
          {note.type === 'location' && <LocationCrumbs note={note} />}
          <h2 id="noteTitle" class="renamable" title="Double-click to rename (F2)" onDblClick={() => set({ dialog: { kind: 'rename', path: note.path } })}>{note.name}</h2>
          <div class="small muted">{note.rel}</div>
        </div>
        <div class={'row-actions note-actions' + (note.type === 'session' ? ' is-session' : '')}>
          <div class="act-group act-main">
          <button class="btn btn-sm btn-primary" id="editBtn" onClick={() => set({ editing: true })}><Icon name="pencil" size={15} />Edit</button>
          <button class={'tb-icon note-pin' + (isFav('note:' + note.path) ? ' pinned' : '')} id="pinNote" aria-pressed={isFav('note:' + note.path)} title={isFav('note:' + note.path) ? 'Unpin from Favourites' : 'Pin to Favourites'} aria-label={isFav('note:' + note.path) ? 'Unpin from Favourites' : 'Pin to Favourites'} onClick={() => toggleFav('note:' + note.path)}><Icon name="star" size={17} fill={isFav('note:' + note.path)} /></button>
          {note.type === 'session' && <button class={'btn btn-sm' + (s.live === note.path ? ' btn-primary' : '')} id="liveBtn" aria-pressed={s.live === note.path} title="Everything for mid-session on this page: must-happens, clocks, secrets, a log line, an improvised NPC. Only one session is live at a time." onClick={() => toggleLive(note.path)}>Live</button>}
          {note.type === 'session' && <button class="btn btn-sm" onClick={() => set({ section: 'combat', combatTarget: note.path, selected: null })}>Run combat</button>}
          </div>
          <div class="act-group act-after">
          {note.type === 'session' && <ImportLastButton path={note.path} />}
          {note.type === 'session' && <button class="btn btn-sm" id="tidyBtn" title="After the session: your rough notes organised by scene. Your original is kept." onClick={() => set({ dialog: { kind: 'tidy', path: note.path } })}>Tidy notes…</button>}
          {note.type === 'session' && <button class="btn btn-sm" id="closeoutBtn" title="After the session: a recap for you, thread and NPC updates, and what to carry to next time" onClick={() => set({ dialog: { kind: 'closeout', path: note.path } })}>Close out…</button>}
          {note.type !== 'session' && <a class="btn btn-sm" href={obsidianUrl(note.path)} title="Open this note in Obsidian"><Icon name="ext" size={15} />Obsidian</a>}
          <PopMenu id="noteMore" title="More actions for this note">
            {({ close }) => (
              <>
                {note.type === 'session' && <a class="pop-item" id="obsidianBtn" role="menuitem" href={obsidianUrl(note.path)} title="Open this note in Obsidian" onClick={() => close()}><Icon name="ext" size={16} />Open in Obsidian</a>}
                <button class="pop-item" id="renameBtn" role="menuitem" title="Change the file name, the title at the top, and the links to it (F2)" onClick={() => { close(); set({ dialog: { kind: 'rename', path: note.path } }); }}><Icon name="pencil" size={16} />Rename…</button>
                <button class="pop-item" id="reformatBtn" role="menuitem" title="Fix markdown that renders badly (spacing, headings, tables, lists). Obsidian features are left alone." onClick={() => { close(); reformatNote(note.path); }}><Icon name="wand" size={16} />Reformat</button>
                <button class="pop-item" id="moveBtn" role="menuitem" onClick={() => { close(); set({ dialog: { kind: 'move', path: note.path } }); }}><Icon name="move" size={16} />Move…</button>
                <button class="pop-item" id="dupBtn" role="menuitem" title="Make a copy of this note beside it, named “… (copy)”" onClick={() => { close(); const np = duplicateNote(note.path); if (np) toast('Made a copy. Push changes to save it.'); }}><Icon name="tab" size={16} />Duplicate</button>
                <button class="pop-item" id="psBtn" role="menuitem" title="A copy without the DM’s secrets, to read out, paste or send to players" onClick={() => { close(); set({ dialog: { kind: 'playersafe', path: note.path } }); }}><Icon name="ext" size={16} />Player-safe copy…</button>
                {claudeOn() && <button class="pop-item" id="askClaudeBtn" role="menuitem" title="Ask Claude a question about this note (you see exactly what is sent first)" onClick={() => { close(); askClaude({ title: 'Ask Claude about “' + note.name + '”', system: CLAUDE_SYSTEM, prompt: notePrompt(note, s.campaign && s.campaign.name), needs: QUESTION_MARK }); }}><Icon name="spark" size={16} />Ask Claude</button>}
                <button class="pop-item" id="graphBtn" role="menuitem" title="See what this note connects to" onClick={() => { close(); openGraph(note.path); }}><Icon name="graph" size={16} />Show in graph</button>
                <button class="pop-item" id="newTabBtn" role="menuitem" onClick={() => { close(); openTab({ section: sectionForType(note.type), selected: note.path }); }}><Icon name="tab" size={16} />Open in new tab</button>
                {note.type === 'session' && <button class="pop-item" id="addTemplateBtn" role="menuitem" title="Paste a blank layout (must happen, places, state tracker, NPC cards)" onClick={() => { close(); set({ dialog: { kind: 'template', path: note.path } }); }}><Icon name="file" size={16} />Add template…</button>}
                <div class="pop-sep" />
                <button class="pop-item danger" id="deleteBtn" role="menuitem" onClick={() => { close(); del(); }}><Icon name="trash" size={16} />Delete…</button>
              </>
            )}
          </PopMenu>
          </div>
        </div>
      </div>
      {note.type === 'session' && s.live === note.path && <LivePanel note={note} />}
      {note.type === 'session' && <TidyStrip path={note.path} />}
      {note.type === 'session' && <CastStrip note={note} />}
      <ReformatBar note={note} />
      <LeftOff note={note} />
      <PropsBlock note={note} idx={idx} />
      <SeededThreads note={note} idx={idx} />
      <ThreadsHere note={note} idx={idx} />
      <AppearsSuggest note={note} idx={idx} />
      {note.type === 'session' && <ReadinessCard note={note} />}
      {note.type === 'session' && <EncountersCard note={note} />}
      {note.type === 'session' && <OutlineBar note={note} />}
      <NoteClocks note={note} idx={idx} />
      {GROUPED[note.type] && <PlaceField note={note} />}
      {note.type === 'location' && <LocationPanel note={note} />}
      <LinkSuggest note={note} idx={idx} />
      {note.body.trim() ? <EditableBody note={note} idx={idx} rev={s.dataRev} fallback={<Markdown body={viewBody(note)} index={idx} rev={s.dataRev} ctx={note.path} />} jump={s.jump} /> : <p class="muted">This note has no text yet. Choose Edit to add some.</p>}
      {back.length > 0 && (
        <div style="margin-top:18px">
          <label class="lbl">Mentioned in</label>
          <div class="chips">{back.map(b => <a key={b.path} class="chip-link" href="#" onClick={e => { e.preventDefault(); navTo(b.path, e); }}>{b.name}</a>)}</div>
        </div>
      )}
    </div>
  );
}

function NoteEditor({ note }) {
  const idx = getIndex();
  const tab = useTab();
  const defs = fieldDefs(note.type);
  const [vals, setVals] = useState(() => Object.fromEntries(defs.map(f => [f.key, getField(note, f).value])));
  const [dirty, setDirty] = useState({});
  const lf = x => x.replace(/\r\n/g, '\n');
  const [body, setBody] = useState(lf(note.body));
  const origRaw = lf(splitFrontmatter(note.text).fmRaw);
  const [raw, setRaw] = useState(origRaw);
  const [linkPick, setLinkPick] = useState('');
  const ta = useRef();
  const rawErr = raw !== origRaw && raw.trim() ? splitFrontmatter('---\n' + raw + '\n---\n').error : null;

  const isDirty = () => Object.keys(dirty).length > 0 || body !== lf(note.body) || raw !== origRaw;
  const save = (opts = {}) => {
    const changes = {};
    for (const f of defs) {
      if (!dirty[f.key]) continue;
      const g = getField(note, f);
      changes[g.source === 'fm' ? g.key : f.key] = toStored(f, vals[f.key]);
    }
    saveNoteEdit(note.path, { fmChanges: changes, rawFm: raw !== origRaw && !rawErr ? raw : undefined, body });
    set({ editing: false });
    if (!opts.quiet) toast(opts.auto ? 'Saved your changes to “' + note.name + '”. Push changes to write them to your vault.' : 'Saved. Push changes to write it to your vault.');
  };
  // an open editor lets the app save (or ask about) its text before you move to another section or note
  useLayoutEffect(() => { registerDraft(tab.id, { tabId: tab.id, path: note.path, name: note.name, dirty: isDirty, save }); });
  useEffect(() => () => registerDraft(tab.id, null), []);
  const insertLink = () => {
    if (!linkPick.trim()) return;
    const el = ta.current, at = el ? el.selectionStart : body.length;
    const text = '[[' + linkPick.trim() + ']]';
    setBody(body.slice(0, at) + text + body.slice(at));
    setLinkPick('');
  };
  const insertTemplate = tplBody => {
    const el = ta.current, at = el ? el.selectionStart : body.length;
    const r = insertAt(body, at, tplBody);
    setBody(r.text);
    setTimeout(() => { const t = ta.current; if (t) { t.focus(); t.setSelectionRange(r.caret, r.caret); } }, 0);
  };
  const names = idx.notes.map(n => n.name).sort((a, b) => a.localeCompare(b));
  return (
    <div class="card">
      <div class="note-head"><div><h2>Editing {note.name}</h2><div class="small muted">{note.rel}</div></div></div>
      {defs.length > 0 && (
        <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:10px 14px;margin-bottom:6px">
          {defs.map(f => (
            <div key={f.key}>
              <label class="lbl">{f.label}</label>
              <FieldInput field={f} value={vals[f.key]} index={idx} onChange={v => { setVals({ ...vals, [f.key]: v }); setDirty({ ...dirty, [f.key]: true }); }} />
            </div>
          ))}
        </div>
      )}
      <div class="field">
        <label class="lbl">Text (Markdown)</label>
        <textarea ref={ta} style="min-height:260px;font-family:var(--font-mono);font-size:13.5px" value={body} onInput={e => setBody(e.currentTarget.value)} onContextMenu={e => editorContextMenu(e, e.currentTarget, setBody)} />
        <div class="row-actions" style="margin-top:6px">
          <input list="note-names" style="max-width:240px" placeholder="Link to a note…" value={linkPick} onInput={e => setLinkPick(e.currentTarget.value)} aria-label="Note to link" />
          <datalist id="note-names">{names.map(n => <option key={n} value={n} />)}</datalist>
          <button class="btn btn-sm" onClick={insertLink}>Insert [[link]]</button>
          {note.type === 'session' && <button type="button" class="btn btn-sm" id="editTemplateBtn" onClick={() => set({ dialog: { kind: 'template', path: note.path, insert: insertTemplate } })}>Add template</button>}
        </div>
      </div>
      <details style="margin-bottom:12px">
        <summary class="small muted" style="cursor:pointer">Raw properties (YAML front matter)</summary>
        <textarea style="min-height:110px;font-family:var(--font-mono);font-size:13px;margin-top:6px" value={raw} onInput={e => setRaw(e.currentTarget.value)} spellcheck={false} />
        {rawErr && <div class="small" style="color:var(--danger)">This YAML is not valid: {rawErr}</div>}
      </details>
      <div class="row-actions">
        <button class="btn btn-primary" disabled={!!rawErr} onClick={() => save()}>Save to pending changes</button>
        <button class="btn" onClick={() => set({ editing: false })}>Cancel</button>
      </div>
    </div>
  );
}

/* ---------- overview ---------- */
/* has this session been played? (it has a log, or a recap from Close out) */
function sessionPlayed(n) {
  const body = splitFm(n.text || '').body;
  return parseLog(body).length > 0 || /<!-- dmforge:(dm-recap|next) -->/.test(body);
}

/* the front page of a campaign: what is next, and what to do before it */
export function Overview() {
  const s = useApp();
  const idx = getIndex();
  const root = idx.byType.root || [];
  const intro = root.find(n => n.name.toLowerCase() === s.campaign.name.toLowerCase()) || root[0];
  const threads = (idx.byType.plot || []).filter(n => fieldVal(n, 'plot', 'status').toLowerCase() === 'active');
  const latest = (idx.byType.session || [])[0];
  const played = !!latest && sessionPlayed(latest);
  const pend = s.working.list().filter(p => !(p.kind === 'delete' && p.movedTo));
  const scenes = latest && !played ? parseScenes(splitFm(latest.text || '').body) : [];
  const mins = scenes.reduce((a, x) => a + (x.est || 0), 0);
  const date = latest ? String(fieldVal(latest, 'session', 'date') || '') : '';
  const sub = latest
    ? [date, played ? 'played, so the next one is yours to start' : scenes.length ? scenes.length + ' scene' + (scenes.length === 1 ? '' : 's') + (mins ? ', about ' + mins + ' minutes' : '') : 'no scenes planned yet'].filter(Boolean).join(' · ')
    : 'Make your first session to see what is next.';
  const running = s.timer.run || timerElapsed(s.timer) > 0;
  return (
    <>
      <div class="page-head overview-head">
        <div>
          <h2 aria-level="1" id="overviewTitle">{latest ? (played ? 'Last played: ' : 'Next: ') + latest.name : s.campaign.name}</h2>
          <div class="muted" id="overviewSub">{sub}</div>
        </div>
        <div class="row-actions">
          {latest && <ImportLastButton path={latest.path} />}
          {latest && !running && <button class="btn btn-sm" id="overviewTimer" onClick={() => timerToggle()}><Icon name="timer" size={15} />Start timer</button>}
          {latest && <button class={'btn' + (played ? '' : ' btn-primary')} id="overviewOpen" onClick={() => goto(latest.path)}>Open session</button>}
          <button class={'btn' + (latest && !played ? '' : ' btn-primary')} id="overviewNew" onClick={() => set({ dialog: { kind: 'newSession' } })}>+ New session</button>
        </div>
      </div>
      <StartCard />
      {pend.length > 0 && (
        <div class="unpushed-bar" style="margin-bottom:20px">
          <span>{pend.length} unpushed change{pend.length === 1 ? '' : 's'}: {pend.filter(p => p.kind === 'create' && !p.movedFrom).length} new, {pend.filter(p => p.kind === 'update').length} edited, {pend.filter(p => p.movedFrom).length} moved, {pend.filter(p => p.kind === 'delete').length} deleted.</span>
          <button class="btn btn-sm btn-primary" onClick={startPush}>Review and push</button>
        </div>
      )}
      <UnplacedNudge />
      <ForgettingCard />
      <div class="ov-grid">
        <div class="card">
          <h3 style="margin-bottom:12px">Active plot threads</h3>
          {threads.length ? <div class="list">{threads.map(n => <button key={n.path} class="list-item" onClick={e => navTo(n.path, e)}><span class="t">{n.name}</span><span class="s">{n.summary}</span></button>)}</div> : <p class="muted small" style="margin:0">None marked Active. Set a thread’s Status to Active to see it here.</p>}
        </div>
        {intro && (
          <details class="card ov-about">
            <summary><h3 style="display:inline">About {s.campaign.name}</h3></summary>
            <div style="margin-top:12px"><Markdown body={intro.body} index={idx} rev={s.dataRev} /></div>
          </details>
        )}
      </div>
    </>
  );
}

export function MapsPage() {
  const s = useApp();
  const tab = useTab();
  const idx = getIndex();
  const imgs = s.files.filter(p => IMAGE_EXT.includes(ext(p)));
  const notes = idx.byType.map || [];
  const sel = tab.selected && idx.byPath.get(tab.selected);
  return (
    <>
      <div class="page-head"><h2 aria-level="1">Maps</h2></div>
      {!imgs.length ? <Empty title="No images found">Images in your campaign folder (png, jpg, webp, svg…) appear here.</Empty> : (
        <>
        <div class="muted small" style="margin:-8px 0 12px">Click an image to enlarge it. Choose “Open in a tab” (or Ctrl/⌘-click) to keep it open next to your notes.</div>
        <div class="gallery">
          {imgs.map(p => (
            <div key={p} class="thumb-wrap">
              <button class="thumb" onClick={e => (wantsNewTab(e) ? openAssetTab(p) : set({ dialog: { kind: 'lightbox', path: p } }))} onAuxClick={e => { if (e.button === 1) openAssetTab(p); }}>
                <div class="img"><Asset path={p} /></div>
                <div class="cap">{basename(p)}</div>
              </button>
              <div class="thumb-meta small"><span class="muted" data-pincount={basename(p)}>{(() => { const m = mapNoteFor(idx, p); const c = m ? parsePins(m.body).length : 0; return c ? c + ' pin' + (c === 1 ? '' : 's') : 'No pins'; })()}</span><button class="btn btn-sm" data-openmap={basename(p)} onClick={() => openAssetTab(p)}>Open as a map</button></div>
            </div>
          ))}
        </div>
        </>
      )}
      {notes.length > 0 && (
        <>
          <h3 style="margin:8px 0 10px">Map notes</h3>
          <div class="split">
            <div class="list">{notes.map(n => <button key={n.path} class="list-item" aria-current={sel && sel.path === n.path ? 'true' : undefined} onClick={e => pickNote(n, e)}><span class="t">{n.name}<PendingDot n={n} /></span><span class="s">{n.summary}</span></button>)}</div>
            <div>{sel && sel.type === 'map' ? <NoteView key={sel.path} note={sel} /> : null}</div>
          </div>
        </>
      )}
    </>
  );
}

/* ---------- notes that are not in a recognised folder ---------- */
export function OtherPage() {
  const s = useApp();
  const tab = useTab();
  const idx = getIndex();
  const items = [...(idx.byType.root || []), ...(idx.byType.other || [])].sort((a, b) => a.rel.localeCompare(b.rel));
  const sel = tab.selected && idx.byPath.get(tab.selected);
  const selected = sel && (sel.type === 'other' || sel.type === 'root') ? sel : null;
  return (
    <>
      <div class="page-head"><h2 aria-level="1">Other notes</h2></div>
      <div class="split scroll-split">
        <div class="list">{items.map(n => <button key={n.path} class="list-item" aria-current={selected && selected.path === n.path ? 'true' : undefined} onClick={e => pickNote(n, e)}><span class="t">{n.name}<PendingDot n={n} /></span><span class="s">{n.rel}</span></button>)}</div>
        <div>{selected ? <NoteView key={selected.path} note={selected} /> : <Empty title="Select a note">Notes in folders DM Forge does not recognise show up here.</Empty>}</div>
      </div>
    </>
  );
}

/* shown at the top of the Overview for someone new: the tour, the session zero kit, the sample campaign */
const START_KEY = 'dmforge:startcard';
function StartCard() {
  const s = useApp();
  const idx = getIndex();
  const [hidden, setHidden] = useState(() => { try { return localStorage.getItem(START_KEY) === 'hidden'; } catch (e) { return false; } });
  const practice = !!(s.vault && s.vault.kind === 'memory');
  if (hidden || (!practice && idx.notes.length >= 12 && tourSeen())) return null;
  const hide = () => { try { localStorage.setItem(START_KEY, 'hidden'); } catch (e) { /* storage unavailable */ } setHidden(true); };
  return (
    <div class="card start-card" id="startCard" style="margin-bottom:16px">
      <div class="start-head"><h3 style="margin:0">{practice ? 'You are on the practice campaign' : 'New to DM Forge?'}</h3><button class="btn btn-ghost btn-sm" id="startHide" aria-label="Hide this" onClick={hide}>Hide</button></div>
      <p class="small" style="margin:6px 0 10px">{practice ? 'Nothing you do here is saved to your computer, so try anything: roll dice, run a fight, log a session, rename notes. Take the tour first if you like.' : 'Take a two-minute tour, start a campaign from scratch with the session zero kit, or look around a complete sample campaign.'}</p>
      <div class="row-actions">
        <button class="btn btn-primary" id="startTour" onClick={() => startTour()}>Take the tour</button>
        <button class="btn" id="startKit" onClick={() => set({ dialog: { kind: 'starter' } })}>Session zero kit</button>
        {!practice && <button class="btn" id="startSample" onClick={() => set({ dialog: { kind: 'sample' } })}>Add the sample campaign</button>}
      </div>
    </div>
  );
}

/* "Import last session": the previous session's recap, carry-over tasks and hidden secrets, at the top of this one's prep */
function ImportLastButton({ path }) {
  useApp();
  const info = lastSessionInfo(path);
  const none = !info.prev ? 'There is no earlier session.' : info.data.empty ? info.prev.name + ' has nothing to bring in yet: close it out first.' : '';
  const go = () => {
    const r = importLastSession(path);
    toast(r.ok ? 'Brought in ' + r.parts + ' from ' + r.from + '. Push changes to save it.' : r.error, !r.ok);
  };
  return <button class="btn btn-sm" id="importLastBtn" disabled={!!none} title={none || 'Bring in ' + info.parts + ' from ' + info.prev.name + ', under “Last time” before the prep'} onClick={go}>Import last session</button>;
}
