import { useState } from 'preact/hooks';
import { useApp, getIndex, set, toast } from './store.js';
import { setLinkProperty, setSection } from './actions.js';
import { locationTree } from '../core/locations.js';
import { GROUPED, PLACE_LABEL, MODES, MODE_LABEL, groupNotes, suggestPlaces, shouldGroup, placeOf } from '../core/grouping.js';
import { subtitle, PendingDot, pickNote } from './notes.jsx';
import { sortNotes } from '../core/listview.js';
import { Icon } from './icons.jsx';

/* what you chose for this list in this campaign: how to group it, and which groups you opened or closed by hand */
const key = type => 'dmforge:group:' + (window.__dmforge ? window.__dmforge.S.vaultKey : '') + '|' + (window.__dmforge && window.__dmforge.S.campaign ? window.__dmforge.S.campaign.path : '') + '|' + type;
export function loadChoice(type) {
  try { const o = JSON.parse(localStorage.getItem(key(type)) || 'null'); if (o && typeof o === 'object') return { mode: typeof o.mode === 'string' ? o.mode : 'auto', over: o.over && typeof o.over === 'object' ? o.over : {} }; } catch (e) { /* defaults */ }
  return { mode: 'auto', over: {} };
}
export function saveChoice(type, c) { try { localStorage.setItem(key(type), JSON.stringify(c)); } catch (e) { /* storage unavailable */ } }

/* the Overview asks for the places to be sorted: open that group in the NPC list */
export function showUnplaced(type) {
  const c = loadChoice(type);
  if (c.mode === 'none') c.mode = 'place';
  c.over = { ...c.over, ['@none:' + (c.mode === 'auto' ? 'place' : c.mode)]: true };
  saveChoice(type, c);
  setSection(type);
}

export function GroupedList({ type, all, items, q, selected, sort, pick, chosen, setChosen }) {
  const s = useApp();
  const idx = getIndex();
  const tree = locationTree(idx);
  const [bump, setBump] = useState(0);
  const [drag, setDrag] = useState(null);
  const [over, setOver] = useState(null);
  const choice = loadChoice(type);
  const modes = MODES[type];
  const auto = choice.mode === 'auto';
  const mode = auto ? (shouldGroup(all.length, s.settings.groupAfter) ? 'place' : 'none') : (modes.includes(choice.mode) ? choice.mode : 'none');
  const grouped = mode !== 'none';
  const searching = !!q.trim();
  const update = patch => { saveChoice(type, { ...choice, ...patch }); setBump(bump + 1); };
  const groups = grouped ? groupNotes(idx, items, type, mode, tree).map(g => (sort && sort !== 'name' ? { ...g, notes: sortNotes(g.notes, sort, s.mtimes) } : g)) : [];
  const nameKey = g => (g.none ? '@none:' + mode : g.key);
  const isOpen = g => {
    if (searching) return true;                                   // a search always shows what it found
    const o = choice.over[nameKey(g)];
    if (o !== undefined) return o;                                // what you opened or closed by hand
    return g.notes.some(n => (selected && n.path === selected.path) || n.pending);   // otherwise: where you are, and what has unpushed changes
  };
  const setAll = open => { const over = { ...choice.over }; for (const g of groups) over[nameKey(g)] = open; update({ over }); };
  const toggle = g => update({ over: { ...choice.over, [nameKey(g)]: !isOpen(g) } });
  const suggestions = type === 'npc' || type === 'faction' || type === 'item' ? suggestPlaces(idx, all) : new Map();
  const placeTargets = tree.flat();
  const field = GROUPED[type];
  const place = (n, name) => setLinkProperty(n.path, type, field, name);
  const acceptAll = g => {
    let c = 0;
    for (const n of g.notes) { const p = suggestions.get(n.path); if (p && place(n, p.name)) c++; }
    toast('Placed ' + c + (c === 1 ? ' note' : ' notes') + ' where their text puts them. Push changes to save.');
  };
  const dropOn = (g, e) => {
    e.preventDefault();
    const path = drag; setDrag(null); setOver(null);
    const n = path && idx.byPath.get(path);
    if (!n) return;
    if (mode === 'faction') { setLinkProperty(n.path, 'npc', 'faction', g.none ? '' : g.label); return; }
    place(n, g.none ? '' : g.label);
  };
  const row = (n, g) => {
    const p = type === 'npc' || type === 'faction' || type === 'item' ? placeOf(idx, n) : null;
    const sug = g && g.none && mode !== 'faction' ? suggestions.get(n.path) : null;
    const on = chosen.has(n.path);
    return (
      <div key={n.path} class={'list-row' + (on ? ' picked' : '')}>
        <button class={'list-item' + (selected && selected.path === n.path ? ' cur' : '')} draggable onDragStart={e => { try { e.dataTransfer.setData('text/plain', 'note:' + n.path); e.dataTransfer.effectAllowed = 'move'; } catch (err) { /* no drag data */ } setDrag(n.path); }} onDragEnd={() => { setDrag(null); setOver(null); }}
          aria-current={selected && selected.path === n.path ? 'true' : undefined} data-note={n.name}
          onClick={e => { if (pick) { const c = new Set(chosen); if (c.has(n.path)) c.delete(n.path); else c.add(n.path); setChosen(c); } else pickNote(n, e); }} onAuxClick={e => { if (e.button === 1 && !pick) pickNote(n, e); }}>
          <span class="t">{pick && <span class="pick-box" aria-hidden="true">{on ? '☑' : '☐'}</span>}{n.name}<PendingDot n={n} /></span>
          <span class="s">{subtitle(n)}{mode === 'place' && p && g && !g.none && p.path !== g.key ? ' · at ' + p.name : ''}{mode === 'exact' ? '' : ''}</span>
        </button>
        {sug && !pick && <button class="btn btn-sm sug-btn" data-suggest={n.name} title={'Its text mentions ' + sug.name} onClick={() => place(n, sug.name)}>Place at {sug.name}</button>}
      </div>
    );
  };
  const noun = type === 'npc' ? 'NPCs' : type === 'faction' ? 'factions' : 'items';
  const nSug = g => g.notes.filter(n => suggestions.has(n.path)).length;
  return (
    <div class="grp" id="grpWrap">
      <div class="grp-bar">
        <label class="small muted" for="grpMode">Group by</label>
        <select id="grpMode" style="width:auto" value={choice.mode} onChange={e => update({ mode: e.currentTarget.value })}>
          <option value="auto">Automatic{auto ? ' (' + (grouped ? MODE_LABEL.place.toLowerCase() : 'one list') + ')' : ''}</option>
          {modes.map(m => <option key={m} value={m}>{MODE_LABEL[m]}</option>)}
        </select>
        {grouped && <button class="btn btn-sm" id="grpCollapse" onClick={() => setAll(false)}>Collapse all</button>}
        {grouped && <button class="btn btn-sm" id="grpExpand" onClick={() => setAll(true)}>Expand all</button>}
      </div>
      <div class={'list' + (drag ? ' dragging' : '')}>
        {!grouped && items.map(n => row(n, null))}
        {grouped && groups.map(g => {
          const open = isOpen(g);
          return (
            <section key={nameKey(g)} class={'grp-sec' + (open ? ' open' : '') + (over === nameKey(g) ? ' drop-over' : '')} data-group={g.label}>
              <div class="grp-head-row" onDragOver={e => { if (drag) { e.preventDefault(); if (over !== nameKey(g)) setOver(nameKey(g)); } }} onDragLeave={() => { if (over === nameKey(g)) setOver(null); }} onDrop={e => dropOn(g, e)}>
                <button class="grp-head" aria-expanded={open} data-grouphead={g.label} onClick={() => toggle(g)}>
                  <Icon name="chev" size={14} /><b>{g.label}</b><span class="badge" data-count>{g.notes.length}</span>
                  {g.notes.some(n => n.pending) && <span class="dot-unpushed" title="Has unpushed changes" />}
                </button>
                {g.none && mode !== 'faction' && nSug(g) > 0 && <button class="btn btn-sm" data-acceptall onClick={() => acceptAll(g)}>Accept {nSug(g)} suggestion{nSug(g) === 1 ? '' : 's'}</button>}
              </div>
              {open && <div class="grp-body">{g.notes.map(n => row(n, g))}</div>}
            </section>
          );
        })}
        {items.length === 0 && <div class="muted small">Nothing matches “{q}”.</div>}
      </div>
    </div>
  );
}

/* on the Overview: how many NPCs are not in a place yet, with a way to sort them */
export function UnplacedNudge() {
  useApp();
  const idx = getIndex();
  if (!(idx.byType.location || []).length) return null;
  const npcs = idx.byType.npc || [];
  const n = npcs.filter(x => !placeOf(idx, x)).length;
  if (!n || n === npcs.length && npcs.length < 4) return null;
  const sug = suggestPlaces(idx, npcs).size;
  return (
    <div class="card" id="unplacedNudge" style="margin-bottom:16px;display:flex;gap:12px;align-items:center;flex-wrap:wrap">
      <div style="flex:1;min-width:220px"><b>{n} NPC{n === 1 ? ' is' : 's are'} not in a place yet.</b><div class="small muted">{sug ? sug + ' of them mention a place in their notes, so DM Forge can suggest where.' : 'Put each one in a place and the NPC list can fold them up by town.'}</div></div>
      <button class="btn" id="unplacedGo" onClick={() => showUnplaced('npc')}>Sort them into places</button>
    </div>
  );
}

/* on an NPC's, faction's or item's page: where it is, as a list of places */
export function PlaceField({ note }) {
  useApp();
  const idx = getIndex();
  const tree = locationTree(idx);
  if (!GROUPED[note.type] || !(idx.byType.location || []).length) return null;
  const cur = placeOf(idx, note);
  const change = e => {
    const v = e.currentTarget.value;
    if (setLinkProperty(note.path, note.type, GROUPED[note.type], v)) toast(v ? note.name + ': ' + PLACE_LABEL[note.type].toLowerCase() + ' ' + v + '.' : note.name + ' is no longer placed anywhere.');
  };
  return (
    <div class="loc-move row-actions" id="placeField">
      <label class="small muted" for="placeFieldSel">{PLACE_LABEL[note.type]}</label>
      <select id="placeFieldSel" aria-label={PLACE_LABEL[note.type]} style="width:auto;max-width:300px" value={cur ? cur.name : ''} onChange={change}>
        <option value="">{note.type === 'npc' ? 'Not placed anywhere' : 'Nowhere'}</option>
        {tree.flat().map(({ note: t, depth }) => <option key={t.path} value={t.name}>{'  '.repeat(depth) + t.name}</option>)}
      </select>
    </div>
  );
}
