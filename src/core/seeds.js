/* Who seeded a plot thread: the NPCs, factions and player characters that planted it. Stored on the thread as a list of [[links]]
   in its "seeded" property (aliases such as "planted by" are read too), so Obsidian shows and follows them. */
import { fieldDefs, getField } from './schema.js';
import { scalarize } from './frontmatter.js';

const LINK = /!?\[\[([^\]|#]+)(?:#[^\]|]*)?(?:\|[^\]]*)?\]\]/g;
export const seedField = () => fieldDefs('plot').find(f => f.key === 'seeded');

/* the names in a "seeded by" value: a list of [[links]], one string of links, or plain names separated by commas */
export function seederNames(raw) {
  const s = scalarize(raw);
  const parts = Array.isArray(s) ? s : [s];
  const out = [], seen = new Set();
  const add = n => { n = String(n).trim(); const k = n.toLowerCase(); if (n && !seen.has(k)) { seen.add(k); out.push(n); } };
  for (const p of parts) {
    const text = Array.isArray(p) ? p.join(', ') : String(p);
    const links = [...text.matchAll(LINK)].map(m => m[1]);
    if (links.length) links.forEach(add); else text.split(/\s*[,;]\s*/).forEach(add);
  }
  return out;
}

/* the seeders of one thread: { name, note } where note is the NPC, faction or player it points at (null when there is no such note) */
export function seedersOf(idx, thread, field) {
  const f = field || seedField();
  const raw = getField(thread, f).raw;
  if (raw === undefined) return [];
  return seederNames(raw).map(name => { const note = idx.resolve(name); return { name: note ? note.name : name, note: note || null }; });
}

/* the threads this NPC, faction or player seeded */
export function seededThreads(idx, target) {
  return (idx.byType.plot || []).filter(t => seedersOf(idx, t).some(s => s.note && s.note.path === target.path)).sort((a, b) => a.name.localeCompare(b.name));
}

/* filter chips for the plot thread list: one per seeder, with how many threads each seeded; null when nothing is seeded yet */
export function seederFacet(idx, threads) {
  const counts = new Map();
  for (const t of threads) for (const s of seedersOf(idx, t)) {
    const k = s.name.toLowerCase();
    if (!counts.has(k)) counts.set(k, { v: s.name, k, count: 0 });
    counts.get(k).count++;
  }
  const values = [...counts.values()].sort((a, b) => b.count - a.count || a.v.localeCompare(b.v));
  return values.length ? { label: 'Seeded by', values } : null;
}
export function filterBySeeder(idx, threads, chosen) {
  if (!chosen || !chosen.length) return threads;
  const want = new Set(chosen.map(x => x.toLowerCase()));
  return threads.filter(t => seedersOf(idx, t).some(s => want.has(s.name.toLowerCase())));
}
