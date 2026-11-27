import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { S, useApp, getIndex, set, toast } from './store.js';
import { Modal } from './common.jsx';
import { openSettings, goto, setSection, openTab, openAssetTab, createNote, setDiceOpen, setLogOpen, timerOpen, toggleCheat, startPush, startTour, toggleTheme, setLayout, checkForUpdate, wantsNewTab, duplicateNote, askUndoPush, tableMode, toggleLive, liveTarget, currentSessionPath, setAccent } from './actions.js';
import { openLibrary } from './libraryactions.js';
import { openWorkshop } from './ideasactions.js';
import { ACCENTS } from '../core/accent.js';
import { search } from '../core/campaign.js';
import { typeInfo } from '../core/schema.js';
import { isMapNote, placeOf as mapPlace } from '../core/maps.js';
import { Icon } from './icons.jsx';

const close = () => set({ dialog: null });
const SECTIONS = [['overview', 'Overview'], ['session', 'Sessions'], ['plot', 'Plot threads'], ['secrets', 'Secrets'], ['clocks', 'Clocks and standing'], ['npc', 'NPCs'], ['location', 'Locations'], ['faction', 'Factions'], ['item', 'Items'], ['map', 'Maps'], ['bestiary', 'Bestiary'], ['party', 'Party'], ['player', 'Players'], ['combat', 'Combat'], ['generate', 'Generate'], ['rules', 'Rules and spells'], ['graph', 'Graph']];
const CREATE = [['npc', 'NPC'], ['location', 'location'], ['faction', 'faction'], ['plot', 'plot thread'], ['item', 'item']];

/* every action the switcher can run; the list is built fresh each time so it knows about maps and what is open */
function actions(idx, q) {
  const list = [];
  for (const [key, label] of SECTIONS) list.push({ id: 'go:' + key, label: 'Go to ' + label, words: label + ' open show page', run: () => setSection(key) });
  list.push(
    { id: 'dice', label: 'Roll dice', words: 'dice roll d20', run: () => setDiceOpen(true) },
    { id: 'log', label: 'Log a line in the session', words: 'log capture quick session note', run: () => setLogOpen(true) },
    { id: 'timer', label: 'Session timer', words: 'timer clock scenes break', run: () => timerOpen(true) },
    { id: 'cheat', label: 'DM cheat sheet', words: 'cheat sheet rules quick reference', run: () => toggleCheat(true) },
    { id: 'push', label: 'Push changes', words: 'push save write publish', run: () => startPush() },
    { id: 'monsters', label: 'Monster library', words: 'monsters creatures bestiary stat block new custom monster', run: () => set({ dialog: { kind: 'monsters' } }) },
    { id: 'workshop', label: 'Workshop (ideas and one-shots)', words: 'workshop ideas one-shot oneshot brainstorm write adventure plan', run: () => openWorkshop('app') },
    { id: 'library', label: 'Character Library', words: 'characters library creator level up items', run: () => openLibrary('app') },
    { id: 'theme', label: 'Switch light and dark', words: 'theme dark light mode', run: () => toggleTheme() },
    { id: 'settings', label: 'Settings', words: 'settings preferences options', run: () => openSettings() },
    { id: 'menu', label: 'Menu', words: 'menu', run: () => set({ dialog: { kind: 'menu' } }) },
    ...(currentSessionPath() ? [{ id: 'tidynotes', label: 'Tidy notes (current session)', words: 'tidy rewrite organise clean notes session', run: () => set({ dialog: { kind: 'tidy', path: currentSessionPath() } }) }] : []),
    ...(S.helper ? [{ id: 'undopush', label: 'Undo last push', words: 'undo push revert restore previous written', run: () => askUndoPush() }] : []),
    ...(S.hosted ? [{ id: 'atlas', label: 'Import a dungeon from DMAtlas', words: 'dmatlas atlas dungeon import map rooms levels', run: () => set({ dialog: { kind: 'atlas' } }) }] : []),
    { id: 'trash', label: 'Open the trash', words: 'trash deleted restore recover bin', run: () => set({ dialog: { kind: 'trash' } }) },
    ...(S.helper ? [{ id: 'version', label: 'Version: roll back or forward', words: 'version rollback roll back forward downgrade', run: () => set({ dialog: { kind: 'version' } }) }] : []),
    { id: 'tour', label: 'Take the tour', words: 'tour help guide', run: () => startTour() },
    { id: 'update', label: 'Check for an update', words: 'update upgrade version install', run: () => checkForUpdate({ manual: true }) },
    { id: 'live', label: 'Live mode: toggle the session tools (for the session you have open)', words: 'live mode session tools play table must happen clocks secrets', run: () => { const p = liveTarget(); if (!p) { toast('There is no session yet to go live on.', true); return; } toggleLive(p); } },
    { id: 'improv', label: 'Improvise an NPC', words: 'improvise npc roll random character on the spot', run: () => set({ dialog: { kind: 'improv', session: currentSessionPath() } }) },
    ...(S.campaign ? ACCENTS.map(a => ({ id: 'accent:' + a.key, label: 'Campaign colour: ' + a.label, words: 'accent colour color campaign theme paint ' + a.key, run: () => setAccent(a.key) })) : []),
    { id: 'tablemode', label: 'Table mode: session, party and NPCs', words: 'table mode layout session party npcs panes play', run: () => tableMode() },
    { id: 'shortcuts', label: 'Keyboard shortcuts', words: 'keyboard shortcuts keys hotkeys help ?', run: () => set({ dialog: { kind: 'shortcuts' } }) },
    { id: 'layout1', label: 'Layout: one pane', words: 'layout panes single', run: () => setLayout('single') },
    { id: 'layout2', label: 'Layout: two columns', words: 'layout panes two columns', run: () => setLayout('two') },
    { id: 'layout3', label: 'Layout: prep and two panes', words: 'layout panes prep three table', run: () => setLayout('prep') },
  );
  for (const n of idx.byType.map || []) {
    if (!isMapNote(n)) continue;
    const place = mapPlace(idx, n), image = idx.findAsset(String(n.fm.image));
    if (image) list.push({ id: 'map:' + n.path, label: 'Open the map of ' + (place ? place.name : n.name), words: 'map pins ' + n.name, run: () => openAssetTab(image) });
  }
  const cur = S.selected && idx.byPath.get(S.selected);
  if (cur) list.push({ id: 'dup', label: 'Duplicate “' + cur.name + '”', words: 'duplicate copy clone note', run: () => { if (duplicateNote(cur.path)) toast('Made a copy. Push changes to save it.'); } });
  if (cur) list.push({ id: 'psafe', label: 'Player-safe copy of “' + cur.name + '”', words: 'player safe copy secrets handout share export', run: () => set({ dialog: { kind: 'playersafe', path: cur.path } }) });
  const t = q.trim();
  if (t) for (const [type, label] of CREATE) list.push({ id: 'new:' + type, label: 'Create ' + (type === 'npc' ? 'an' : 'a') + ' ' + label + ' called “' + t + '”', words: '', create: true, run: () => { const p = createNote(type, t); goto(p); } });
  return list;
}
const matchWords = (a, q) => { const hay = (a.label + ' ' + a.words).toLowerCase(); return q.toLowerCase().split(/\s+/).filter(Boolean).every(w => hay.includes(w)); };

export function Palette() {
  const s = useApp();
  const idx = getIndex();
  const [q, setQ] = useState('');
  const [at, setAt] = useState(0);
  const list = useRef();
  const rows = useMemo(() => {
    const out = [];
    const term = q.trim();
    if (!term) {
      const recent = s.recent.map(p => idx.byPath.get(p)).filter(Boolean).slice(0, 8);
      for (const n of recent) out.push({ kind: 'note', note: n, head: out.length === 0 ? 'Recent' : null });
      const hand = actions(idx, '').filter(a => ['go:npc', 'go:location', 'go:session', 'dice', 'log', 'push'].includes(a.id));
      hand.forEach((a, i) => out.push({ kind: 'act', act: a, head: i === 0 ? 'Actions' : null }));
      return out;
    }
    const hits = search(idx, term, 8);
    hits.forEach((h, i) => out.push({ kind: 'note', note: h.note, snippet: h.snippet, head: i === 0 ? 'Notes' : null }));
    const exact = idx.resolve(term);
    const acts = actions(idx, term).filter(a => (a.create ? !exact : matchWords(a, term)));
    let first = true;
    for (const a of acts.filter(a => !a.create).slice(0, 8)) { out.push({ kind: 'act', act: a, head: first ? 'Actions' : null }); first = false; }
    first = true;
    for (const a of acts.filter(a => a.create)) { out.push({ kind: 'act', act: a, head: first ? 'Create' : null }); first = false; }
    return out;
  }, [q, s.recent.join('|'), s.dataRev]);
  useEffect(() => { setAt(0); }, [q]);
  useEffect(() => { const el = list.current && list.current.querySelector('[aria-selected="true"]'); if (el && el.scrollIntoView) el.scrollIntoView({ block: 'nearest' }); }, [at]);
  const run = (row, e) => {
    if (!row) return;
    close();
    if (row.kind === 'note') goto(row.note.path, { newTab: !!(e && (e.ctrlKey || e.metaKey)) });
    else setTimeout(() => row.act.run(), 0);
  };
  const keys = e => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setAt(a => Math.min(rows.length - 1, a + 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setAt(a => Math.max(0, a - 1)); }
    else if (e.key === 'Enter') { e.preventDefault(); run(rows[at], e); }
  };
  return (
    <Modal title="Quick switcher" onClose={close} cls="palette">
      <div class="pal-input"><Icon name="search" size={17} /><input id="palInput" type="text" aria-label="Jump to a note or run an action" role="combobox" aria-expanded="true" aria-controls="palList" autocomplete="off" placeholder="Jump to a note, or type an action…" value={q} onInput={e => setQ(e.currentTarget.value)} onKeyDown={keys} /></div>
      <div class="pal-list" id="palList" role="listbox" ref={list}>
        {rows.length === 0 && <div class="muted small" style="padding:10px 4px">Nothing matches “{q}”.</div>}
        {rows.map((r, i) => (
          <div key={i}>
            {r.head && <div class="pal-head">{r.head}</div>}
            <button class="pal-row" role="option" aria-selected={i === at} data-pal={r.kind === 'note' ? r.note.name : r.act.label} onMouseMove={() => at !== i && setAt(i)} onClick={e => run(r, e)}>
              {r.kind === 'note'
                ? <><span class="pal-t">{r.note.name}</span><span class="pill">{r.note.type === 'root' || r.note.type === 'other' ? 'Other' : (typeInfo(r.note.type) ? typeInfo(r.note.type).single : 'Note')}</span>{r.snippet && <span class="muted small pal-s">{r.snippet}</span>}</>
                : <><span class="pal-t">{r.act.label}</span></>}
            </button>
          </div>
        ))}
      </div>
      <div class="pal-foot muted small">↑↓ to move · Enter to open · Ctrl/⌘+Enter in a new tab · Esc to close</div>
    </Modal>
  );
}
