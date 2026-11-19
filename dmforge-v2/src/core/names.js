/* The name checker: is a name (a new NPC, a place) already used, or close to one that is? Looks at every note in the campaign by
   name, and compares the first name and the family name as well as the whole thing, so "Mireille Dunmore" is flagged when
   "Mireille Vane" exists. Common titles and little words are ignored. */
const SKIP = new Set(['the', 'of', 'and', 'a', 'an', 'in', 'on', 'at', 'old', 'young', 'little', 'big', 'great', 'lord', 'lady', 'sir', 'dame', 'brother', 'sister', 'father', 'mother', 'captain', 'master', 'mistress', 'mister', 'mr', 'mrs', 'ms', 'dr', 'doctor', 'saint', 'st', 'house', 'clan', 'inn', 'tavern', 'the']);
const words = s => String(s || '').toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/[^\p{L}\p{N}\s'-]/gu, ' ').split(/\s+/).filter(Boolean);
const meaningful = s => words(s).filter(w => !SKIP.has(w));

export function distance(a, b) {
  if (a === b) return 0;
  if (Math.abs(a.length - b.length) > 3) return 9;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    prev = cur;
  }
  return prev[b.length];
}

const KINDS = new Set(['npc', 'player', 'location', 'faction', 'plot', 'item']);

/* { exact, first, last, close }: lists of notes, at most `limit` each */
export function nameClashes(name, idx, { exclude = '', limit = 4 } = {}) {
  const out = { exact: [], first: [], last: [], close: [] };
  const full = words(name).join(' ');
  const mw = meaningful(name);
  if (!full || !idx) return out;
  const given = mw[0] || '';
  const family = mw.length > 1 ? mw[mw.length - 1] : '';
  const seen = new Set();
  const add = (k, n) => { if (!seen.has(n.path) && out[k].length < limit) { seen.add(n.path); out[k].push(n); } };
  for (const n of idx.notes) {
    if (n.path === exclude || !KINDS.has(n.type)) continue;
    const nf = words(n.name).join(' ');
    if (nf === full) { add('exact', n); continue; }
  }
  for (const n of idx.notes) {
    if (n.path === exclude || !KINDS.has(n.type) || seen.has(n.path)) continue;
    const nm = meaningful(n.name);
    if (!nm.length) continue;
    if (given.length >= 3 && nm[0] === given) { add('first', n); continue; }
    if (family.length >= 3 && nm.length > 1 && nm[nm.length - 1] === family) { add('last', n); continue; }
  }
  for (const n of idx.notes) {
    if (n.path === exclude || !KINDS.has(n.type) || seen.has(n.path)) continue;
    const nm = meaningful(n.name);
    if (!nm.length) continue;
    const near = (given.length >= 5 && nm[0].length >= 5 && distance(given, nm[0]) <= 1) || (full.length >= 7 && distance(full, words(n.name).join(' ')) <= 2);
    if (near) add('close', n);
  }
  return out;
}
export const hasClash = c => !!(c.exact.length || c.first.length || c.last.length || c.close.length);
