/* Grouping long lists by place: NPCs by where they live, factions by where they are based, items by where they are kept.
   One level only: the town (the nearest place that is a town, city or village, else the outermost place). */
import { getField, fieldDefs } from './schema.js';
import { kindFor } from './locations.js';

/* the property that holds the place, for each kind of note */
export const GROUPED = { npc: 'location', faction: 'base', item: 'location' };
export const PLACE_LABEL = { npc: 'Lives in', faction: 'Based in', item: 'Kept at' };
export const NONE_LABEL = { npc: 'Not placed anywhere', faction: 'No base yet', item: 'Not kept anywhere' };
export const GROUP_AFTER_CHOICES = [[0, 'Always'], [10, 'When there are more than 10'], [20, 'When there are more than 20'], [50, 'When there are more than 50'], [9999, 'Never']];
export const shouldGroup = (count, after) => after === 9999 ? false : count > (Number.isFinite(after) ? after : 20);

const defOf = type => fieldDefs(type).find(f => f.key === GROUPED[type]);
const stripLink = v => String(v || '').replace(/^\[\[|\]\]$/g, '').split('|')[0].split('#')[0].trim();

/* the place a note is at, as a location note (or null) */
export function placeOf(idx, note) {
  const d = defOf(note.type);
  if (!d) return null;
  const g = getField(note, d);
  if (!g || !g.value) return null;
  const t = idx.resolve(stripLink(g.value));
  return t && t.type === 'location' ? t : null;
}
const kindText = n => getField(n, fieldDefs('location').find(f => f.key === 'kind')).value;
/* the town a place belongs to: the nearest place, going outwards, whose Type is a town, city or village; if none, the outermost one */
export function townOf(tree, place) {
  const chain = [...tree.ancestors(place), place];
  for (let i = chain.length - 1; i >= 0; i--) {
    const k = kindFor(kindText(chain[i]));
    if (k && (k.id === 'town' || k.id === 'village')) return chain[i];
  }
  return chain[0];
}

/* modes: 'place' (by town), 'exact' (by the place itself), 'faction' (NPCs only), 'none' */
export const MODES = { npc: ['place', 'exact', 'faction', 'none'], faction: ['place', 'exact', 'none'], item: ['place', 'exact', 'none'] };
export const MODE_LABEL = { place: 'Town', exact: 'Exact place', faction: 'Faction', none: 'One long list' };

const byName = (a, b) => a.name.localeCompare(b.name);
/* [{ key, label, place, none, notes }]: named groups A to Z, the "nowhere" group last; notes A to Z inside each */
export function groupNotes(idx, notes, type, mode, tree) {
  const groups = new Map();
  const none = { key: '', label: mode === 'faction' ? 'No faction' : NONE_LABEL[type], place: null, none: true, notes: [] };
  for (const n of notes) {
    let key = '', label = '', place = null;
    if (mode === 'faction') {
      const g = getField(n, fieldDefs('npc').find(f => f.key === 'faction'));
      const f = g && g.value ? idx.resolve(stripLink(g.value)) : null;
      if (f) { key = f.path; label = f.name; place = f; }
    } else {
      const p = placeOf(idx, n);
      if (p) { const t = mode === 'exact' ? p : townOf(tree, p); key = t.path; label = t.name; place = t; }
    }
    if (!key) { none.notes.push(n); continue; }
    if (!groups.has(key)) groups.set(key, { key, label, place, none: false, notes: [] });
    groups.get(key).notes.push(n);
  }
  const out = [...groups.values()].sort((a, b) => a.label.localeCompare(b.label));
  for (const g of out) g.notes.sort(byName);
  none.notes.sort(byName);
  if (none.notes.length) out.push(none);
  return out;
}

/* for notes with no place: the place their own text mentions most (a [[link]] to a location), if any */
export function suggestPlaces(idx, notes) {
  const out = new Map();
  for (const n of notes) {
    if (placeOf(idx, n)) continue;
    const counts = new Map();
    for (const l of n.links || []) {
      const t = idx.resolve(l);
      if (t && t.type === 'location') counts.set(t.path, (counts.get(t.path) || 0) + 1);
    }
    let best = null;
    for (const [p, c] of counts) if (!best || c > best[1]) best = [p, c];
    if (best) out.set(n.path, idx.byPath.get(best[0]));
  }
  return out;
}
