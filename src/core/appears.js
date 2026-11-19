/* Where a plot thread appears: the places on its "Appears in" property. (The places its text links to are only offered as suggestions.)
   Used for the "Appears in" filter and grouping on the plot thread list, and for the "Plot threads here" row on a place. */
import { fieldDefs, getField } from './schema.js';
import { seederNames } from './seeds.js';

export const appearsField = () => fieldDefs('plot').find(f => f.key === 'appears');

/* the locations a thread appears in: only the places on its "Appears in" property, A to Z. Places its text merely mentions do not count
   (a thread can mention a town without happening there); see textPlaces for offering those. */
export function placesOf(idx, thread) {
  const out = new Map();
  const raw = getField(thread, appearsField()).raw;
  if (raw !== undefined) for (const name of seederNames(raw)) { const n = idx.resolve(name); if (n && n.type === 'location') out.set(n.path, { note: n, via: 'property' }); }
  return [...out.values()].sort((a, b) => a.note.name.localeCompare(b.note.name));
}

/* places the thread's text links to that are not on its "Appears in" yet, most mentioned first: offered as one-click additions */
export function textPlaces(idx, thread) {
  const have = new Set(placesOf(idx, thread).map(p => p.note.path));
  const counts = new Map();
  for (const l of thread.links || []) {
    const n = idx.resolve(l);
    if (n && n.type === 'location' && !have.has(n.path)) counts.set(n.path, { note: n, count: (counts.get(n.path) ? counts.get(n.path).count : 0) + 1 });
  }
  return [...counts.values()].sort((a, b) => b.count - a.count || a.note.name.localeCompare(b.note.name));
}

/* the threads that appear at one place */
export function threadsAt(idx, place) {
  return (idx.byType.plot || []).filter(t => placesOf(idx, t).some(p => p.note.path === place.path)).sort((a, b) => a.name.localeCompare(b.name));
}

/* filter chips for the plot thread list: one per place, with how many threads appear there; null when no thread is tied to a place */
export function appearsFacet(idx, threads) {
  const counts = new Map();
  for (const t of threads) for (const p of placesOf(idx, t)) {
    const k = p.note.path;
    if (!counts.has(k)) counts.set(k, { v: p.note.name, k, count: 0 });
    counts.get(k).count++;
  }
  const values = [...counts.values()].sort((a, b) => b.count - a.count || a.v.localeCompare(b.v));
  return values.length ? { label: 'Appears in', values } : null;
}
export function filterByPlace(idx, threads, chosen) {
  if (!chosen || !chosen.length) return threads;
  const want = new Set(chosen);
  return threads.filter(t => placesOf(idx, t).some(p => want.has(p.note.path)));
}

/* the list grouped by place: a thread is listed under every place it appears in; threads with no place go last */
export function groupByPlace(idx, threads) {
  const groups = new Map();
  const none = { key: '', label: 'Not tied to a place', none: true, notes: [] };
  for (const t of threads) {
    const ps = placesOf(idx, t);
    if (!ps.length) { none.notes.push(t); continue; }
    for (const p of ps) {
      if (!groups.has(p.note.path)) groups.set(p.note.path, { key: p.note.path, label: p.note.name, none: false, notes: [] });
      groups.get(p.note.path).notes.push(t);
    }
  }
  const out = [...groups.values()].sort((a, b) => a.label.localeCompare(b.label));
  for (const g of out) g.notes.sort((a, b) => a.name.localeCompare(b.name));
  none.notes.sort((a, b) => a.name.localeCompare(b.name));
  if (none.notes.length) out.push(none);
  return out;
}
