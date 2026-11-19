/* Cast: who and what a session involves, adding people to its cast heading, rolling a crowd for a place, and copying a note. */
import { GENERATORS, newGenState } from './generators.js';
import { genToNote } from './templates.js';

const strip = s => String(s || '').replace(/^\[\[|\]\]$/g, '').split('|')[0].trim();

/* the notes a session links to, grouped by kind. Players are all of them: the party is always at the table. */
export function castOf(idx, session) {
  const seen = new Set();
  const out = { npcs: [], places: [], factions: [], threads: [], items: [], players: (idx.byType.player || []).slice() };
  const key = { npc: 'npcs', location: 'places', faction: 'factions', plot: 'threads', item: 'items' };
  for (const l of session.links || []) {
    const n = idx.resolve(strip(l));
    if (!n || n.path === session.path || seen.has(n.path)) continue;
    seen.add(n.path);
    if (key[n.type]) out[key[n.type]].push(n);
  }
  return out;
}

/* ---------- adding someone under the cast heading ---------- */
export const CAST_HEADING = /^(#{1,6})[ \t]+(.*\b(npcs?|cast|people|characters|appearing|who'?s here)\b.*)$/i;

/* Puts `- [[Name]]` under the heading that holds the session's cast (the first heading with NPC, cast, people... in it). When there is
   none, a "Cast" heading is added at the end. Returns { body, heading, created, line } (line is where the new bullet went, 0-based). */
export function addToCast(body, name) {
  const lf = String(body).replace(/\r\n/g, '\n');
  const lines = lf.split('\n');
  const bullet = '- [[' + name + ']]';
  const target = name.toLowerCase();
  let fence = false, h = -1, level = 0;
  for (let i = 0; i < lines.length; i++) {
    if (/^\s*(```|~~~)/.test(lines[i])) { fence = !fence; continue; }
    if (fence) continue;
    const m = CAST_HEADING.exec(lines[i]);
    if (m) { h = i; level = m[1].length; break; }
  }
  if (h < 0) {
    const trimmed = lf.replace(/\s+$/, '');
    const out = (trimmed ? trimmed + '\n\n' : '') + '## Cast\n\n' + bullet + '\n';
    return { body: out, heading: 'Cast', created: true, line: out.split('\n').length - 2 };
  }
  let end = lines.length;
  fence = false;
  for (let i = h + 1; i < lines.length; i++) {
    if (/^\s*(```|~~~)/.test(lines[i])) { fence = !fence; continue; }
    if (fence) continue;
    const m = /^(#{1,6})[ \t]+\S/.exec(lines[i]);
    if (m && m[1].length <= level) { end = i; break; }
  }
  // already listed here? then there is nothing to add
  for (let i = h + 1; i < end; i++) if (lines[i].toLowerCase().includes('[[' + target + ']]') && /^\s*[-*+]\s/.test(lines[i])) return { body: lf, heading: lines[h].replace(/^#+\s*/, ''), created: false, line: i, dup: true };
  let last = end - 1;
  while (last > h && !lines[last].trim()) last--;
  const heading = lines[h].replace(/^#+\s*/, '').replace(/\s*_\(.*\)_\s*$/, '').trim();
  let at;
  if (last === h) { lines.splice(h + 1, 0, '', bullet); at = h + 2; }
  else if (/^\s*[-*+]\s/.test(lines[last]) && !/^\s*>/.test(lines[last])) { lines.splice(last + 1, 0, bullet); at = last + 1; }
  else { lines.splice(last + 1, 0, '', bullet); at = last + 2; }
  return { body: lines.join('\n'), heading, created: false, line: at };
}

export function castHeadingName(body) {
  let fence = false;
  for (const l of String(body).split('\n')) {
    if (/^\s*(```|~~~)/.test(l)) { fence = !fence; continue; }
    if (fence) continue;
    const m = CAST_HEADING.exec(l);
    if (m) return m[2].replace(/\s*_\(.*\)_\s*$/, '').trim();
  }
  return '';
}

/* ---------- populate a place ---------- */
const HOW_MANY = { tavern: 4, inn: 4, shop: 2, market: 4, town: 6, city: 8, village: 4, hamlet: 3, temple: 3, dungeon: 3 };
export function suggestedCount(kindText, hasKids) {
  const k = String(kindText || '').toLowerCase();
  for (const w of Object.keys(HOW_MANY)) if (k.includes(w)) return HOW_MANY[w];
  return hasKids ? 6 : 3;
}

/* Rolls `count` people with the NPC generator. Names already in the campaign (or earlier in this roll) are re-rolled, so a crowd is all different. */
export function rollPeople(idx, count, taken = new Set()) {
  const g = GENERATORS.find(x => x.id === 'npc');
  const out = [];
  const used = new Set([...taken].map(x => x.toLowerCase()));
  for (let i = 0; i < count; i++) out.push(rollOne(idx, g, used));
  return out;
}
export function rollOne(idx, g, used) {
  g = g || GENERATORS.find(x => x.id === 'npc');
  let st, name;
  for (let tries = 0; tries < 30; tries++) {
    st = newGenState(g);
    name = String(st.vals.name || 'Someone').trim();
    if (!used.has(name.toLowerCase()) && !idx.resolve(name)) break;
  }
  used.add(name.toLowerCase());
  const n = genToNote(g, st, 'npc', name);
  return { name, race: st.vals.race || '', role: st.vals.role || '', fm: n.fm, body: n.body };
}

/* ---------- duplicate a note ---------- */
/* "Name (copy)", then "Name (copy 2)"... the first one nobody has */
export function copyName(name, taken) {
  const used = new Set([...taken].map(x => x.toLowerCase()));
  const base = String(name).replace(/\s*\(copy( \d+)?\)\s*$/i, '');
  let c = base + ' (copy)';
  for (let i = 2; used.has(c.toLowerCase()) && i < 500; i++) c = base + ' (copy ' + i + ')';
  return c;
}

/* the note's text under a new name: its first heading (when it matches the old name) becomes the new one */
export function copyText(text, oldName, newName) {
  const lf = String(text).replace(/\r\n/g, '\n');
  const esc = oldName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const re = new RegExp('^(#[ \\t]+)' + esc + '([ \\t]*)$', 'm');
  return re.test(lf) ? lf.replace(re, '$1' + newName.replace(/\$/g, '$$$$') + '$2') : lf;
}
