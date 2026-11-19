/* Progress clocks and faction standing, kept in one note in the campaign ("Clocks and Standing") as plain markdown lists:
     ## Clocks
     - **The bells ring again** — 3/6 — the ferrymen finish the ritual
     - **The bells ring again** — 3/6 — [[The Missing Bells]] — the ferrymen finish the ritual    (linked to a note, such as a plot thread)
     ## Faction standing
     - [[Ember Court]] — Friendly (+1) — they owe the party a favour
   The two lists are rewritten when you change something here; anything else in the note is left alone. */
import { splitFrontmatter } from './frontmatter.js';
import { upsertBlock } from './markdown.js';

export const CLOCKS_NOTE = 'Clocks and Standing';
export const CLOCK_SIZES = [2, 3, 4, 5, 6, 7, 8, 9, 10, 12];
export const STANDINGS = [[-3, 'Hostile'], [-2, 'Unfriendly'], [-1, 'Wary'], [0, 'Neutral'], [1, 'Friendly'], [2, 'Trusted'], [3, 'Allied']];
export const standingLabel = n => (STANDINGS.find(s => s[0] === n) || [0, 'Neutral'])[1];
const signed = n => (n > 0 ? '+' + n : String(n).replace('-', '−'));

const oneLine = s => String(s || '').replace(/\s+/g, ' ').trim();
const section = (body, heading) => {
  const lines = body.split(/\r?\n/);
  const i = lines.findIndex(l => new RegExp('^##\\s+' + heading + '\\s*$', 'i').test(l));
  if (i < 0) return [];
  let end = lines.length;
  for (let j = i + 1; j < lines.length; j++) if (/^#{1,2}\s/.test(lines[j])) { end = j; break; }
  return lines.slice(i + 1, end);
};

export function parseClocks(body) {
  const out = [];
  for (const raw of section(body, 'Clocks')) {
    const m = /^\s*[-*]\s+\*\*(.+?)\*\*\s*(?:[—–-]+\s*(\d{1,2})\s*\/\s*(\d{1,2}))?\s*(?:[—–-]+\s*(.*))?$/.exec(raw);
    if (!m) continue;
    const size = Math.max(2, Math.min(24, parseInt(m[3] || '6', 10)));
    // a note that is just a [[link]] (then perhaps a dash and more words) is the note this clock belongs to
    let link = '', note = oneLine(m[4]);
    const lk = /^\[\[([^\]|#]+)(?:[#|][^\]]*)?\]\]\s*(?:[—–-]+\s*(.*))?$/.exec(note);
    if (lk) { link = oneLine(lk[1]); note = oneLine(lk[2]); }
    out.push({ name: oneLine(m[1]), filled: Math.max(0, Math.min(size, parseInt(m[2] || '0', 10))), size, link, note });
  }
  return out;
}
export function parseStandings(body) {
  const out = [];
  for (const raw of section(body, 'Faction standing')) {
    const m = /^\s*[-*]\s+(?:\[\[([^\]|#]+)(?:[#|][^\]]*)?\]\]|([^—–]+?))\s*[—–-]+\s*([A-Za-z]+)?\s*\(?\s*([+\-−]?\d)?\s*\)?\s*(?:[—–-]+\s*(.*))?$/.exec(raw);
    if (!m) continue;
    const name = oneLine(m[1] || m[2]);
    let n = m[4] === undefined ? null : parseInt(m[4].replace('−', '-'), 10);
    if (n === null) { const hit = STANDINGS.find(s => s[1].toLowerCase() === String(m[3] || '').toLowerCase()); n = hit ? hit[0] : 0; }
    if (name) out.push({ name, value: Math.max(-3, Math.min(3, n)), note: oneLine(m[5]) });
  }
  return out;
}

export const clockLine = c => '- **' + oneLine(c.name) + '** — ' + c.filled + '/' + c.size + (c.link ? ' — [[' + oneLine(c.link) + ']]' : '') + (c.note ? ' — ' + oneLine(c.note) : '');
export const standingLine = s => '- [[' + oneLine(s.name) + ']] — ' + standingLabel(s.value) + ' (' + signed(s.value) + ')' + (s.note ? ' — ' + oneLine(s.note) : '');

const replaceSection = (body, heading, lines) => {
  const all = body.split('\n');
  const i = all.findIndex(l => new RegExp('^##\\s+' + heading + '\\s*$', 'i').test(l.replace(/\r$/, '')));
  const text = lines.length ? lines.join('\n') : '_None yet._';
  if (i < 0) return body.replace(/\s+$/, '') + '\n\n## ' + heading + '\n\n' + text + '\n';
  let end = all.length;
  for (let j = i + 1; j < all.length; j++) if (/^#{1,2}\s/.test(all[j])) { end = j; break; }
  return [...all.slice(0, i + 1), '', text, '', ...all.slice(end)].join('\n').replace(/\n{3,}/g, '\n\n');
};

export function buildNote(clocks, standings) {
  return replaceSection(replaceSection('# ' + CLOCKS_NOTE + '\n', 'Clocks', clocks.map(clockLine)), 'Faction standing', standings.map(standingLine));
}
/* the note's text with the two lists replaced */
export function writeLists(text, clocks, standings) {
  const sp = splitFrontmatter(text || '');
  let body = sp.body || '# ' + CLOCKS_NOTE + '\n';
  body = replaceSection(body, 'Clocks', clocks.map(clockLine));
  body = replaceSection(body, 'Faction standing', standings.map(standingLine));
  return (sp.prefix || '') + body;
}
export function readLists(text) {
  const body = splitFrontmatter(text || '').body;
  return { clocks: parseClocks(body), standings: parseStandings(body) };
}
