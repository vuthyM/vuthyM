/* Sorting and filtering a long list of notes: by name, by when the file was last changed, and by one facet such as status.
   (Grouping by place is in grouping.js; this is the part that works on a flat list.) */
import { getField, fieldDefs } from './schema.js';

export const SORTS = [['name', 'Name A to Z'], ['edited', 'Recently edited'], ['stale', 'Not touched for longest']];
/* sessions are listed newest first (by their date) unless you pick another order */
export const sortsFor = type => (type === 'session' ? [['date', 'Newest session first'], ...SORTS] : SORTS);
export const defaultSort = type => (type === 'session' ? 'date' : 'name');

/* the property to offer as filter chips: the first choice-list field (status, rarity...), else a short list of Types */
export function facetFor(type, notes) {
  const defs = fieldDefs(type);
  const sel = defs.find(f => f.kind === 'select');
  const def = sel || defs.find(f => f.key === 'kind' && f.kind === 'text');
  if (!def) return null;
  const counts = new Map();
  for (const n of notes) {
    const v = String(getField(n, def).value || '').trim();
    if (!v) continue;
    const k = v.toLowerCase();
    if (!counts.has(k)) counts.set(k, { v, count: 0, k });
    counts.get(k).count++;
  }
  const values = [...counts.values()];
  if (values.length < 2 || (!sel && values.length > 10)) return null;
  const order = sel && sel.options ? sel.options.map(o => o.toLowerCase()) : [];
  values.sort((a, b) => (order.indexOf(a.k) < 0 ? 99 : order.indexOf(a.k)) - (order.indexOf(b.k) < 0 ? 99 : order.indexOf(b.k)) || a.v.localeCompare(b.v));
  return { def, label: def.label, values };
}
const byName = (a, b) => a.name.localeCompare(b.name);
/* mtimes: Map(path -> ms); a note with unpushed changes counts as edited just now */
export function sortNotes(notes, sort, mtimes) {
  const when = n => (n.pending ? Date.now() : (mtimes && mtimes.get(n.path)) || 0);
  const out = notes.slice();
  if (sort === 'date') return out;
  if (sort === 'edited') out.sort((a, b) => when(b) - when(a) || byName(a, b));
  else if (sort === 'stale') out.sort((a, b) => when(a) - when(b) || byName(a, b));
  else out.sort(byName);
  return out;
}
export function filterByFacet(notes, type, facet, chosen) {
  if (!facet || !chosen || !chosen.length) return notes;
  const want = new Set(chosen.map(x => x.toLowerCase()));
  return notes.filter(n => want.has(String(getField(n, facet.def).value || '').trim().toLowerCase()));
}
/* the last-changed time of every note file, a dozen at a time */
export async function readMtimes(vault, paths) {
  const out = new Map();
  let i = 0;
  const worker = async () => {
    while (i < paths.length) {
      const p = paths[i++];
      try { out.set(p, (await vault.stat(p)).mtime || 0); } catch (e) { out.set(p, 0); }
    }
  };
  await Promise.all(Array.from({ length: 12 }, worker));
  return out;
}
