import { useState } from 'preact/hooks';
import { useApp, getIndex, set, toast } from './store.js';
import { setFieldValue, changeTag, deleteNote, setLinkProperty, movePlace, ensureMtimes } from './actions.js';
import { sortsFor, defaultSort } from '../core/listview.js';
import { locationTree, canMoveInto } from '../core/locations.js';
import { GROUPED, PLACE_LABEL } from '../core/grouping.js';
import { fieldDefs } from '../core/schema.js';

/* what you chose for a list in this campaign: how to sort it, and which filter chips are on */
const vkey = type => 'dmforge:view:' + (window.__dmforge ? window.__dmforge.S.vaultKey : '') + '|' + (window.__dmforge && window.__dmforge.S.campaign ? window.__dmforge.S.campaign.path : '') + '|' + type;
export function loadView(type) {
  try { const o = JSON.parse(localStorage.getItem(vkey(type)) || 'null'); if (o && typeof o === 'object') return { sort: ['date', 'name', 'edited', 'stale'].includes(o.sort) && (o.sort !== 'date' || type === 'session') ? o.sort : defaultSort(type), facet: Array.isArray(o.facet) ? o.facet.filter(x => typeof x === 'string') : [], seed: Array.isArray(o.seed) ? o.seed.filter(x => typeof x === 'string') : [], appears: Array.isArray(o.appears) ? o.appears.filter(x => typeof x === 'string') : [], group: o.group === 'place' ? 'place' : 'none', over: o.over && typeof o.over === 'object' ? o.over : {} }; } catch (e) { /* defaults */ }
  return { sort: defaultSort(type), facet: [], seed: [], appears: [], group: 'none', over: {} };
}
export function saveView(type, v) { try { localStorage.setItem(vkey(type), JSON.stringify(v)); } catch (e) { /* storage unavailable */ } }

/* the row under a list's filter box: sort, filter chips, and "select several" */
export function ListTools({ type, facet, seed, appears, view, onView, pick, onPick }) {
  const s = useApp();
  const setSort = v => { onView({ ...view, sort: v }); if (v === 'edited' || v === 'stale') ensureMtimes(); };
  const toggle = k => onView({ ...view, facet: view.facet.includes(k) ? view.facet.filter(x => x !== k) : [...view.facet, k] });
  const seeds = view.seed || [];
  const places = view.appears || [];
  const togglePlace = k => onView({ ...view, appears: places.includes(k) ? places.filter(x => x !== k) : [...places, k] });
  const toggleSeed = k => onView({ ...view, seed: seeds.includes(k) ? seeds.filter(x => x !== k) : [...seeds, k] });
  return (
    <div class="lv-bar" id="lvBar">
      <div class="lv-row">
        <label class="small muted" for="lvSort">Sort</label>
        <select id="lvSort" style="width:auto" value={view.sort} onChange={e => setSort(e.currentTarget.value)}>{sortsFor(type).map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
        {(view.sort === 'edited' || view.sort === 'stale') && !s.mtimes && <span class="small muted">reading dates…</span>}
        <button class={'btn btn-sm' + (pick ? ' btn-primary' : '')} id="grpPick" aria-pressed={pick} onClick={onPick}>Select several</button>
        {type === 'plot' && <><label class="small muted" for="lvGroup">Group by</label><select id="lvGroup" style="width:auto" value={view.group || 'none'} onChange={e => onView({ ...view, group: e.currentTarget.value })}><option value="none">One list</option><option value="place">Location</option></select></>}
      </div>
      {facet && (
        <div class="lv-chips" id="lvChips" role="group" aria-label={'Filter by ' + facet.label.toLowerCase()}>
          {facet.values.map(x => <button key={x.k} class={'chip-link' + (view.facet.includes(x.k) ? ' on' : '')} data-chip={x.v} aria-pressed={view.facet.includes(x.k)} onClick={() => toggle(x.k)}>{x.v} <span class="muted">{x.count}</span></button>)}
          {view.facet.length > 0 && <button class="btn btn-sm btn-ghost" id="lvClear" onClick={() => onView({ ...view, facet: [] })}>Clear</button>}
        </div>
      )}
      {appears && (
        <div class="lv-chips" id="lvAppearsChips" role="group" aria-label="Filter by where it appears">
          <span class="small muted">Appears in</span>
          {appears.values.map(x => <button key={x.k} class={'chip-link' + (places.includes(x.k) ? ' on' : '')} data-appears-chip={x.v} aria-pressed={places.includes(x.k)} onClick={() => togglePlace(x.k)}>{x.v} <span class="muted">{x.count}</span></button>)}
          {places.length > 0 && <button class="btn btn-sm btn-ghost" id="lvAppearsClear" onClick={() => onView({ ...view, appears: [] })}>Clear</button>}
        </div>
      )}
      {seed && (
        <div class="lv-chips" id="lvSeedChips" role="group" aria-label="Filter by who seeded it">
          <span class="small muted">Seeded by</span>
          {seed.values.map(x => <button key={x.k} class={'chip-link' + (seeds.includes(x.k) ? ' on' : '')} data-seed-chip={x.v} aria-pressed={seeds.includes(x.k)} onClick={() => toggleSeed(x.k)}>{x.v} <span class="muted">{x.count}</span></button>)}
          {seeds.length > 0 && <button class="btn btn-sm btn-ghost" id="lvSeedClear" onClick={() => onView({ ...view, seed: [] })}>Clear</button>}
        </div>
      )}
    </div>
  );
}

/* what you can do to the notes you ticked */
export function BulkBar({ type, chosen, shown, onChosen, onDone }) {
  useApp();
  const idx = getIndex();
  const [tag, setTag] = useState('');
  const n = chosen.size;
  const paths = [...chosen];
  const selects = fieldDefs(type).filter(f => f.kind === 'select');
  const factions = idx.byType.faction || [];
  const tree = locationTree(idx);
  const placeable = !!GROUPED[type];
  const done = (msg) => { toast(msg + ' Push changes to save.'); onDone && onDone(); };
  const setSelect = (f, v) => { if (v === '@') return; for (const p of paths) setFieldValue(p, type, f.key, v); done('Set ' + f.label.toLowerCase() + (v ? ' to ' + v : ' to nothing') + ' on ' + n + (n === 1 ? ' note.' : ' notes.')); };
  const setFaction = v => { if (v === '@') return; for (const p of paths) setLinkProperty(p, 'npc', 'faction', v); done((v ? 'Faction set to ' + v : 'Faction cleared') + ' on ' + n + (n === 1 ? ' note.' : ' notes.')); };
  const move = v => {
    if (v === '@') return;
    let c = 0;
    for (const p of paths) {
      if (type === 'location') { const me = idx.byPath.get(p), target = v ? idx.resolve(v) : null; if (me && canMoveInto(tree, me, target) && movePlace(p, v)) c++; }
      else if (setLinkProperty(p, type, GROUPED[type], v)) c++;
    }
    done('Moved ' + c + (c === 1 ? ' note' : ' notes') + (v ? ' to ' + v + '.' : ' out of any place.'));
  };
  const tagNow = add => { const t = tag.trim(); if (!t) return; let c = 0; for (const p of paths) if (changeTag(p, t, add)) c++; setTag(''); done((add ? 'Tagged ' : 'Removed the tag from ') + c + (c === 1 ? ' note' : ' notes') + (add ? ' #' + t.replace(/^#/, '') + '.' : '.')); };
  const del = () => set({ dialog: { kind: 'confirm', title: 'Delete ' + n + (n === 1 ? ' note?' : ' notes?'), body: 'They move to your vault’s trash folder when you push. You can undo this before then with Discard.', confirmLabel: 'Delete ' + n, danger: true, onConfirm: () => { for (const p of paths) deleteNote(p); toast('Deleted ' + n + (n === 1 ? ' note' : ' notes') + '. Push changes to save.'); onDone && onDone(); } } });
  const placeLabel = type === 'location' ? 'Move inside…' : (PLACE_LABEL[type] || 'Place') + '…';
  return (
    <div class="grp-bulk" id="grpBulk">
      <span class="small"><b>{n}</b> selected</span>
      <button class="btn btn-sm" id="bulkAll" onClick={() => onChosen(new Set(shown))}>All {shown.length}</button>
      <button class="btn btn-sm" id="bulkNone" disabled={!n} onClick={() => onChosen(new Set())}>None</button>
      {(placeable || type === 'location') && (
        <select id="grpMoveTo" aria-label="Move the selected notes to a place" style="width:auto;max-width:240px" value="@" disabled={!n} onChange={e => move(e.currentTarget.value)}>
          <option value="@">{placeLabel}</option><option value="">{type === 'location' ? 'Nothing (top level)' : type === 'npc' ? 'Not placed anywhere' : 'Nowhere'}</option>
          {tree.flat().map(({ note: t, depth }) => <option key={t.path} value={t.name}>{'  '.repeat(depth) + t.name}</option>)}
        </select>
      )}
      {selects.map(f => (
        <select key={f.key} data-bulkfield={f.key} aria-label={'Set ' + f.label + ' on the selected notes'} style="width:auto;max-width:200px" value="@" disabled={!n} onChange={e => setSelect(f, e.currentTarget.value)}>
          <option value="@">Set {f.label.toLowerCase()}…</option>{f.options.map(o => <option key={o} value={o}>{o}</option>)}
        </select>
      ))}
      {type === 'npc' && factions.length > 0 && (
        <select id="bulkFaction" aria-label="Set the faction of the selected notes" style="width:auto;max-width:200px" value="@" disabled={!n} onChange={e => setFaction(e.currentTarget.value)}>
          <option value="@">Set faction…</option><option value="">No faction</option>{factions.map(f => <option key={f.path} value={f.name}>{f.name}</option>)}
        </select>
      )}
      <span class="row-actions" style="gap:4px">
        <input id="bulkTag" aria-label="A tag" placeholder="tag" style="width:110px" value={tag} onInput={e => setTag(e.currentTarget.value)} />
        <button class="btn btn-sm" id="bulkTagAdd" disabled={!n || !tag.trim()} onClick={() => tagNow(true)}>Add tag</button>
        <button class="btn btn-sm" id="bulkTagRemove" disabled={!n || !tag.trim()} onClick={() => tagNow(false)}>Remove tag</button>
      </span>
      <button class="btn btn-sm btn-ghost btn-danger" id="bulkDelete" disabled={!n} onClick={del}>Delete</button>
    </div>
  );
}
