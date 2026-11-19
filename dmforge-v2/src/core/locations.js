/* Locations: places inside places, who is here, and a starting page for each kind of place.
   The "Within" property of a location (a [[link]] to the place it sits in) builds the tree; nothing else is stored. */
import { getField, typeInfo, fieldDefs } from './schema.js';

const defFor = (type, key) => fieldDefs(type).find(f => f.key === key);

/* ---------- the tree ---------- */
export function locationTree(idx) {
  const locs = idx.byType.location || [];
  const parent = new Map(), kids = new Map();
  const f = defFor('location', 'region');
  for (const n of locs) {
    const g = getField(n, f);
    const p = g && g.value ? idx.resolve(String(g.value).replace(/^\[\[|\]\]$/g, '').split('|')[0]) : null;
    if (p && p.type === 'location' && p.path !== n.path) {
      parent.set(n.path, p.path);
      if (!kids.has(p.path)) kids.set(p.path, []);
      kids.get(p.path).push(n);
    }
  }
  const byName = (a, b) => a.name.localeCompare(b.name);
  for (const arr of kids.values()) arr.sort(byName);
  // a loop (A is within B, B is within A) is cut where it closes, so every place can be reached from a root
  const roots = [];
  const seen = new Set();
  const walk = n => { if (seen.has(n.path)) return; seen.add(n.path); for (const c of kids.get(n.path) || []) walk(c); };
  for (const n of locs.slice().sort(byName)) if (!parent.has(n.path)) { roots.push(n); walk(n); }
  for (const n of locs.slice().sort(byName)) if (!seen.has(n.path)) { parent.delete(n.path); roots.push(n); walk(n); }
  const byPath = idx.byPath;
  const parentNote = n => (parent.has(n.path) ? byPath.get(parent.get(n.path)) : null);
  const ancestors = n => { const out = []; const guard = new Set([n.path]); let p = parentNote(n); while (p && !guard.has(p.path)) { out.unshift(p); guard.add(p.path); p = parentNote(p); } return out; };
  const children = n => kids.get(n.path) || [];
  const descendants = n => { const out = []; const guard = new Set([n.path]); const go = x => { for (const c of children(x)) if (!guard.has(c.path)) { guard.add(c.path); out.push(c); go(c); } }; go(n); return out; };
  /* every place in tree order, with its depth: roots by name, each followed by what is inside it */
  const flat = () => { const out = []; const guard = new Set(); const go = (n, d) => { if (guard.has(n.path)) return; guard.add(n.path); out.push({ note: n, depth: d, inside: children(n).length }); for (const c of children(n)) go(c, d + 1); }; for (const r of roots) go(r, 0); return out; };
  return { roots, parentNote, ancestors, children, descendants, flat };
}

/* where a place may be moved: anywhere except into itself or into something inside it (that would make a loop) */
export function canMoveInto(tree, note, target) {
  if (!target) return true;                                    // out to the top level
  if (target.path === note.path) return false;
  return !tree.descendants(note).some(d => d.path === target.path);
}
export function moveTargets(idx, tree, note) {
  const out = [];
  for (const { note: n, depth } of tree.flat()) if (canMoveInto(tree, note, n)) out.push({ note: n, depth });
  return out;
}

/* ---------- who and what is here ---------- */
const linkTarget = (idx, note, type, key) => {
  const g = getField(note, defFor(type, key));
  if (!g || !g.value) return null;
  return idx.resolve(String(g.value).replace(/^\[\[|\]\]$/g, '').split('|')[0]);
};
export function hereOf(idx, note, tree = locationTree(idx)) {
  const inside = tree.descendants(note);
  const places = new Map([[note.path, note], ...inside.map(p => [p.path, p])]);
  const people = [];
  const seenPeople = new Set();
  for (const n of idx.byType.npc || []) {
    const at = linkTarget(idx, n, 'npc', 'location');
    if (at && places.has(at.path)) { people.push({ note: n, where: at.path === note.path ? null : at }); seenPeople.add(n.path); }
  }
  people.sort((a, b) => (a.where ? 1 : 0) - (b.where ? 1 : 0) || a.note.name.localeCompare(b.note.name));
  // what points at this place, or at anything inside it (a session in the tavern was a session in the town)
  const viaOf = new Map();
  const back = [];
  for (const p of places.values()) {
    for (const n of idx.backlinks.get(p.path) || []) {
      if (n.type === 'location' && places.has(n.path)) continue;
      if (!viaOf.has(n.path)) { viaOf.set(n.path, p.path === note.path ? null : p); back.push(n); }
      else if (p.path === note.path) viaOf.set(n.path, null);
    }
  }
  const group = t => back.filter(n => n.type === t);
  const mentionedPeople = [...group('npc'), ...group('player')].filter(n => !seenPeople.has(n.path));
  const sessions = group('session').slice().sort((a, b) => (b.sdate || '').localeCompare(a.sdate || '') || (b.snum || 0) - (a.snum || 0));
  const others = back.filter(n => !['npc', 'player', 'session', 'faction', 'plot', 'location'].includes(n.type));
  const factions = group('faction');
  // factions that name this place (or something inside it) as a property also count
  for (const n of idx.byType.faction || []) {
    if (factions.includes(n)) continue;
    for (const [k, v] of Object.entries(n.fm || {})) {
      const s = Array.isArray(v) ? v.join(' ') : String(v);
      const m = /\[\[([^\]|#]+)/.exec(s);
      const t = m ? idx.resolve(m[1]) : null;
      if (t && places.has(t.path)) { factions.push(n); break; }
    }
  }
  const kept = (idx.byType.item || []).filter(n => { const t = linkTarget(idx, n, 'item', 'location'); return t && places.has(t.path); });
  return {
    kept,
    people, mentionedPeople, factions, threads: group('plot'), sessions, lastSession: sessions[0] || null, lastVia: sessions[0] ? viaOf.get(sessions[0].path) || null : null, others,
    insideCount: inside.length,
  };
}

/* ---------- kinds of place, each with the headings that suit it ---------- */
const S = (...h) => h;
export const LOCATION_KINDS = [
  { id: 'town', label: 'Town or city', heads: S('At a glance', 'Sights, sounds and smells', 'Law and trouble', 'Rumours', 'Secrets', 'Hooks'),
    seed: { 'At a glance': ['**Size:** ', '**Who rules:** ', '**Known for:** '] } },
  { id: 'village', label: 'Village or hamlet', heads: S('At a glance', 'Sights, sounds and smells', 'Rumours', 'Secrets', 'Hooks'),
    seed: { 'At a glance': ['**Size:** ', '**Known for:** '] } },
  { id: 'tavern', label: 'Tavern or inn', heads: S('The place', 'Food, drink and prices', 'Rooms', 'Regulars and gossip', 'Secrets', 'Hooks'),
    seed: { 'Food, drink and prices': ['- '], Rooms: ['- '] } },
  { id: 'shop', label: 'Shop or market stall', heads: S('The place', 'What it sells', 'Haggling', 'Rumours', 'Secrets'),
    seed: { 'What it sells': ['- '] } },
  { id: 'temple', label: 'Temple or shrine', heads: S('Faith and deity', 'Rites and services', 'Sights, sounds and smells', 'Secrets', 'Hooks') },
  { id: 'castle', label: 'Castle, keep or fort', heads: S('At a glance', 'Defences', 'Layout', 'Garrison', 'Secrets', 'Hooks') },
  { id: 'dungeon', label: 'Dungeon or keyed area', heads: S('Overview', 'Getting in', 'Rooms', 'Wandering threats', 'Treasure', 'Secrets'),
    seed: { Rooms: ['1. **Entrance** — what is here; monsters; treasure; exits.', '2. **** — ', '3. **** — '] } },
  { id: 'wilderness', label: 'Wilderness or region', heads: S('Terrain and travel', 'Weather and seasons', 'Dangers', 'Points of interest', 'Secrets', 'Hooks') },
  { id: 'landmark', label: 'Landmark or ruin', heads: S('Description', 'History', 'What the party can learn', 'Secrets', 'Hooks') },
  { id: 'building', label: 'Building or room', heads: S('Description', 'What is inside', 'Secrets') },
];
export const LOCATION_KIND_LABELS = LOCATION_KINDS.map(k => k.label);
/* the kind whose label is (or starts like) what was typed in the Type box */
export function kindFor(text) {
  const t = String(text || '').trim().toLowerCase();
  if (!t) return null;
  return LOCATION_KINDS.find(k => k.label.toLowerCase() === t) || LOCATION_KINDS.find(k => k.label.toLowerCase().split(/ or |, /).some(w => w === t || t === w + 's')) || null;
}
export function locationBody(kindText, name) {
  const k = kindFor(kindText);
  if (!k) return '# ' + name + '\n\n## Description\n\n## Points of interest\n';
  const L = ['# ' + name, ''];
  for (const h of k.heads) { L.push('## ' + h, ''); for (const s of (k.seed && k.seed[h]) || []) L.push(s); if (k.seed && k.seed[h]) L.push(''); }
  return L.join('\n').replace(/\n+$/, '\n');
}
export { typeInfo };
