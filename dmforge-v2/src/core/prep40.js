/* Session prep and live play: the outline of a note, moving a section, the prep check, and who is likely to be where. */
import { hereOf } from './locations.js';
import { castOf } from './cast.js';

const HEAD = /^(#{1,6})[ \t]+(.+?)[ \t]*#*[ \t]*$/;

/* the headings of a note: [{ line, level, text }] (not inside code) */
export function outline(body) {
  const out = [];
  let fence = false;
  String(body || '').replace(/\r\n/g, '\n').split('\n').forEach((l, i) => {
    if (/^\s{0,3}(```|~~~)/.test(l)) { fence = !fence; return; }
    if (fence) return;
    const m = HEAD.exec(l);
    if (m) out.push({ line: i, level: m[1].length, text: m[2].replace(/[*_`]/g, '').replace(/\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g, (x, a, b) => b || a) });
  });
  return out;
}

/* swaps a section (a heading and everything under it) with the one above or below it at the same level.
   Returns the new body, or null when there is nothing to swap with. */
export function moveSection(body, line, dir) {
  const lines = String(body).replace(/\r\n/g, '\n').split('\n');
  const hs = outline(body);
  const i = hs.findIndex(h => h.line === line);
  if (i < 0) return null;
  const h = hs[i];
  const endOf = k => { const nx = hs.slice(k + 1).find(x => x.level <= hs[k].level); return nx ? nx.line : lines.length; };
  let other = -1;
  if (dir < 0) {
    for (let k = i - 1; k >= 0; k--) { if (hs[k].level < h.level) break; if (hs[k].level === h.level) { other = k; break; } }
  } else {
    const nx = hs.slice(i + 1).find(x => x.level <= h.level);
    if (nx && nx.level === h.level) other = hs.indexOf(nx);
  }
  if (other < 0) return null;
  const [a, b] = dir < 0 ? [other, i] : [i, other];
  const aStart = hs[a].line, aEnd = endOf(a), bStart = hs[b].line, bEnd = endOf(b);
  const trim = arr => { const r = arr.slice(); while (r.length && !r[r.length - 1].trim()) r.pop(); return r; };
  const first = trim(lines.slice(aStart, aEnd)), second = trim(lines.slice(bStart, bEnd));
  const before = lines.slice(0, aStart), after = lines.slice(bEnd);
  const out = [...before, ...second, '', ...first, ...(after.length && after.some(x => x.trim()) ? [''] : []), ...after];
  return out.join('\n');
}

/* every task in the MUST HAPPEN callout: { raw, text, done } */
export function mustItems(body) {
  const out = [];
  let inside = false;
  for (const l of String(body || '').replace(/\r\n/g, '\n').split('\n')) {
    if (/^>\s*\[!\w+\][+-]?\s*MUST HAPPEN/i.test(l)) { inside = true; continue; }
    if (inside && !/^>/.test(l)) inside = false;
    if (!inside) continue;
    const m = /^>\s*[-*]\s+\[( |x|X)\]\s*(.*?)\s*$/.exec(l);
    if (m && m[2]) out.push({ raw: l, text: m[2], done: m[1] !== ' ' });
  }
  return out;
}

const realWords = body => String(body || '').replace(/^#+.*$/gm, ' ').replace(/\*\*[^*\n]+\*\*:?/g, ' ').replace(/[#>*_`\-\[\]|]/g, ' ').split(/\s+/).filter(w => w.length > 1).length;

/* what is not ready for this session: [{ id, text, notes: [note], fix }] (empty when it is all set).
   `ctx` brings what lives in the app: { last: the "Import last session" info, monsters: the library, encounters: parsed, hasMust } */
export function readiness(idx, session, ctx = {}) {
  const cast = castOf(idx, session);
  const todo = [];
  const body = session.body || '';
  const hasBlock = /^>\s*\[!\w+\][+-]?\s*MUST HAPPEN/im.test(body);
  if (!ctx.hasMust && !mustItems(body).length) {
    todo.push(hasBlock
      ? { id: 'must', text: 'The MUST HAPPEN list is empty: write the two or three things that have to come up tonight.' }
      : { id: 'must', text: 'No MUST HAPPEN list: the two or three things that have to come up tonight.', fix: 'must' });
  }
  if (!cast.npcs.length) todo.push({ id: 'cast', text: 'No NPCs linked yet. Add the people who will appear.', fix: 'cast' });
  const thin = cast.npcs.filter(n => realWords(n.body) < 8);
  if (thin.length) todo.push({ id: 'thin', text: thin.length + (thin.length === 1 ? ' NPC has' : ' NPCs have') + ' no description or motivation yet.', notes: thin });
  const unplaced = cast.npcs.filter(n => thinPlace(idx, n));
  if (unplaced.length && cast.places.length) todo.push({ id: 'place', text: unplaced.length + (unplaced.length === 1 ? ' NPC is' : ' NPCs are') + ' not placed anywhere.', notes: unplaced });
  const bare = cast.places.filter(p => realWords(p.body) < 8);
  if (bare.length) todo.push({ id: 'bare', text: bare.length + (bare.length === 1 ? ' place has' : ' places have') + ' no description.', notes: bare });
  const encs = ctx.encounters || [];
  const unknown = [];
  for (const e of encs) for (const it of e.items) if (ctx.monsters && !ctx.monsters.has(it.name.toLowerCase())) unknown.push(it.name);
  if (unknown.length) todo.push({ id: 'monsters', text: [...new Set(unknown)].slice(0, 4).join(', ') + ' ' + (unknown.length === 1 ? 'is' : 'are') + ' not in the monster library or your Bestiary, so the encounter cannot be run from here.' });
  if (ctx.last && ctx.last.prev && ctx.last.data && !ctx.last.data.empty && !/^##\s+Last time\b/im.test(body)) todo.push({ id: 'last', text: ctx.last.prev.name + ' left things to carry over (' + ctx.last.parts + '), not brought in yet.', fix: 'last' });
  return todo;
}
const thinPlace = (idx, npc) => { const f = npc.fm || {}; const v = Object.entries(f).find(([k]) => /^(location|home|place|lives in)$/i.test(k)); return !(v && v[1]) && !/\*\*Location:\*\*\s*\S/i.test(npc.body || '') && !/\bLocation::\s*\S/.test(npc.body || ''); };

/* for each place the session mentions: the people placed there who are not in the cast yet, what is kept there, who is based there */
export function likelyHere(idx, session) {
  const cast = castOf(idx, session);
  const inCast = new Set(cast.npcs.map(n => n.path));
  const out = [];
  for (const place of cast.places) {
    const here = hereOf(idx, place);
    const people = here.people.map(p => p.note).filter(n => !inCast.has(n.path));
    if (people.length || here.kept.length || here.factions.length) out.push({ place, people, kept: here.kept, factions: here.factions });
  }
  return out;
}
