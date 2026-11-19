/* The party and the encounter budget (2024 rules): who is here tonight, and how hard a set of monsters is for them.
   The budget is per character: add up the monsters' XP (CR to XP, no multiplier for how many there are) and compare it with the
   party's Low, Moderate and High totals. The table is the "XP Budget per Character" of the 2024 Dungeon Master's Guide; it is not in the
   SRD, so it is worth checking against your book. */
import { patchFrontmatter } from './frontmatter.js';
import { fieldDefs, getField } from './schema.js';

export const XP_BUDGET = {
  1: [50, 75, 100], 2: [100, 150, 200], 3: [150, 225, 400], 4: [250, 375, 500], 5: [500, 750, 1100],
  6: [600, 1000, 1400], 7: [750, 1300, 1700], 8: [1000, 1700, 2100], 9: [1300, 2000, 2600], 10: [1600, 2300, 3100],
  11: [1900, 2900, 4100], 12: [2200, 3700, 4700], 13: [2600, 4200, 5400], 14: [2900, 4900, 6200], 15: [3300, 5400, 7800],
  16: [3800, 6100, 9800], 17: [4500, 7200, 11700], 18: [5000, 8700, 14200], 19: [5500, 10700, 17200], 20: [6400, 13200, 22000],
};
export const TIER_LABELS = { low: 'Low', moderate: 'Moderate', high: 'High' };

const clampLevel = n => Math.max(1, Math.min(20, Math.round(Number(n) || 0)));

/* the party's budget: each character's number for their level, added up */
export function budgetFor(levels) {
  const out = { low: 0, moderate: 0, high: 0, n: 0 };
  for (const l of levels) {
    const lv = Number(l);
    if (!Number.isFinite(lv) || lv < 1) continue;
    const row = XP_BUDGET[clampLevel(lv)];
    out.low += row[0]; out.moderate += row[1]; out.high += row[2]; out.n++;
  }
  return out;
}

/* how hard the monsters are: the lowest tier whose budget covers their XP */
export function difficulty(total, b) {
  if (!b || !b.n) return { tier: 'none', label: 'No party' };
  if (!(total > 0)) return { tier: 'empty', label: 'No monsters yet' };
  if (total <= b.low) return { tier: 'low', label: 'Low' };
  if (total <= b.moderate) return { tier: 'moderate', label: 'Moderate' };
  if (total <= b.high) return { tier: 'high', label: 'High' };
  return { tier: 'over', label: 'Beyond High' };
}

/* how many of one monster each tier allows */
export function fitCounts(xp, b) {
  if (!(xp > 0) || !b || !b.n) return { low: 0, moderate: 0, high: 0 };
  return { low: Math.floor(b.low / xp), moderate: Math.floor(b.moderate / xp), high: Math.floor(b.high / xp) };
}

/* ---- who is here ---- */
export function absentOf(fm) {
  const v = fm && Object.entries(fm).find(([k]) => k.toLowerCase() === 'absent');
  if (!v) return [];
  const raw = v[1];
  return (Array.isArray(raw) ? raw : String(raw || '').split(',')).map(x => String(x).replace(/^\[\[|\]\]$/g, '').trim()).filter(Boolean);
}
/* the session note's text with one player marked here or away (an "absent" list in its properties; nobody away removes it) */
export function withPresence(sessionText, absent, name, here) {
  const set = absent.filter(a => a.toLowerCase() !== name.toLowerCase());
  if (!here) set.push(name);
  return patchFrontmatter(sessionText, { absent: set.length ? set : undefined });
}

const num = v => { const m = /-?\d+(\.\d+)?/.exec(String(v ?? '').replace(/,/g, '')); return m ? Number(m[0]) : null; };
export function partyRows(idx, absent = []) {
  const away = new Set(absent.map(a => a.toLowerCase()));
  return (idx.byType.player || []).map(n => {
    const f = key => { const d = fieldDefs('player').find(x => x.key === key); return d ? num(getField(n, d).value) : null; };
    return { path: n.path, name: n.name, level: f('level'), hp: f('hp'), ac: f('ac'), perception: f('perception'), gold: f('gold'), xp: f('xp'), here: !away.has(n.name.toLowerCase()) };
  });
}
