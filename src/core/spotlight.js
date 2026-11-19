/* Spotlight: who has had a moment lately. Log a line with the Spotlight tag that names a player ("#spotlight [[Kestra Dune]] picked the lock");
   this counts them per player over the last few sessions, so the quiet ones stand out. */
import { splitFrontmatter } from './frontmatter.js';
import { parseLog, removeLogLine } from './sessionlog.js';

export const SPOTLIGHT_SESSIONS = 4;

/* does this log line name this player (in [[brackets]], in full, or by first name)? */
export function namesPlayer(raw, name) {
  const hay = String(raw || '').toLowerCase();
  const nm = String(name).toLowerCase();
  const first = nm.split(/\s+/)[0];
  return hay.includes('[[' + nm) || hay.includes(nm) || (first.length >= 3 && new RegExp('(^|[^\\p{L}])' + first.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '($|[^\\p{L}])', 'iu').test(hay));
}

/* the spotlight moments in one session's log, oldest first: { raw, text } */
export function spotlightLines(body) {
  return parseLog(body).filter(e => e.tags.includes('spotlight'));
}

/* takes the newest spotlight moment out of a session's log: for one player when `name` is given, otherwise for anyone.
   Returns { body, raw } or null when there is none. */
export function removeSpotlightMoment(body, name) {
  const hit = spotlightLines(body).filter(e => !name || namesPlayer(e.raw, name)).pop();
  if (!hit) return null;
  const nb = removeLogLine(body, hit.raw);
  return nb === null ? null : { body: nb, raw: hit.raw, text: hit.text };
}

export function spotlightStats(idx, { sessions = SPOTLIGHT_SESSIONS, away = [] } = {}) {
  const players = idx.byType.player || [];
  const list = (idx.byType.session || []);                      // newest first
  const away_ = new Set(away.map(a => a.toLowerCase()));
  const rows = players.map(p => ({ path: p.path, name: p.name, count: 0, last: -1, lines: [], away: away_.has(p.name.toLowerCase()) }));
  list.forEach((s, si) => {
    for (const e of parseLog(splitFrontmatter(s.text).body)) {
      if (!e.tags.includes('spotlight')) continue;
      for (const r of rows) {
        if (namesPlayer(e.raw, r.name)) {
          if (si < sessions) r.count++;
          if (r.last < 0 || si < r.last) r.last = si;
          if (r.lines.length < 3) r.lines.push({ session: s.name, text: e.text });
        }
      }
    }
  });
  const quiet = rows.filter(r => !r.away && r.count === 0);
  return { rows: rows.sort((a, b) => a.count - b.count || a.name.localeCompare(b.name)), quiet, sessions: Math.min(sessions, list.length), sessionCount: list.length };
}
