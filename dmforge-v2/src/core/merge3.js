/* Keep both: when a note was changed in your vault (in Obsidian, say) while you were also changing it here, and the two sets of
   changes are in different places, they can be combined. This is the same idea as a three-way merge in git, by whole lines:
     base   = the note as it was when the campaign was opened
     mine   = the note as DM Forge has it now
     theirs = the note as it is on disk now
   It only merges when it is sure. Changes that overlap or touch (even two lines added at the same spot) are not merged: it
   returns null and the review offers the usual choices instead. */

const MAX_CELLS = 6e6;

/* the lines that differ between a and b, as hunks: base lines [s, e) are replaced by `lines` (s === e is an insertion) */
export function hunks(a, b) {
  let p = 0;
  while (p < a.length && p < b.length && a[p] === b[p]) p++;
  let sa = a.length, sb = b.length;
  while (sa > p && sb > p && a[sa - 1] === b[sb - 1]) { sa--; sb--; }
  const A = a.slice(p, sa), B = b.slice(p, sb);
  if (!A.length && !B.length) return [];
  if (!A.length || !B.length) return [{ s: p, e: sa, lines: B }];
  if (A.length * B.length > MAX_CELLS) return null;
  // longest common subsequence of the differing middle
  const n = A.length, m = B.length, w = m + 1;
  const L = new Uint32Array((n + 1) * w);
  for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) L[i * w + j] = A[i] === B[j] ? L[(i + 1) * w + j + 1] + 1 : Math.max(L[(i + 1) * w + j], L[i * w + j + 1]);
  const out = [];
  let i = 0, j = 0, cur = null;
  const flush = () => { if (cur) { out.push(cur); cur = null; } };
  while (i < n || j < m) {
    if (i < n && j < m && A[i] === B[j]) { flush(); i++; j++; continue; }
    if (!cur) cur = { s: p + i, e: p + i, lines: [] };
    if (j < m && (i >= n || L[i * w + j + 1] >= L[(i + 1) * w + j])) { cur.lines.push(B[j]); j++; }
    else { i++; cur.e = p + i; }
  }
  flush();
  return out;
}

const same = (x, y) => x.s === y.s && x.e === y.e && x.lines.length === y.lines.length && x.lines.every((l, k) => l === y.lines[k]);

/* the combined text, or null when it cannot be done safely */
export function merge3(base, mine, theirs) {
  if (typeof base !== 'string' || typeof mine !== 'string' || typeof theirs !== 'string') return null;
  if (mine === theirs) return mine;
  if (mine === base) return theirs;
  if (theirs === base) return mine;
  const a = base.split('\n'), m = mine.split('\n'), t = theirs.split('\n');
  const hm = hunks(a, m), ht = hunks(a, t);
  if (!hm || !ht) return null;
  const all = [];
  for (const h of hm) all.push({ ...h, by: 'm' });
  for (const h of ht) all.push({ ...h, by: 't' });
  all.sort((x, y) => x.s - y.s || x.e - y.e);
  const take = [];
  for (const h of all) {
    const prev = take[take.length - 1];
    if (prev) {
      if (prev.by !== h.by) {
        if (same(prev, h)) continue;                                  // both made exactly this change
        if (h.s <= prev.e) return null;                               // overlapping or touching: not safe
      } else if (h.s < prev.e) return null;
    }
    take.push(h);
  }
  const out = [];
  let at = 0;
  for (const h of take) { for (; at < h.s; at++) out.push(a[at]); out.push(...h.lines); at = h.e; }
  for (; at < a.length; at++) out.push(a[at]);
  return out.join('\n');
}
