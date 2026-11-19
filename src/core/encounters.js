/* Prepared encounters: a callout in a session's prep that lists the monsters, so the fight is ready to run.

     > [!danger]- Encounter: Ambush at the weir
     > - 3× Goblin
     > - 1× Bugbear

   Plain Obsidian markdown, so it reads fine there too. */
import { placeTemplate } from './sessiontemplates.js';
import { crXp } from './monsters.js';

const HEAD = /^>\s*\[!danger\][+-]?\s*Encounter\s*[:—–-]?\s*(.*?)\s*$/i;
const ITEM = /^>\s*[-*]\s+(?:(\d{1,2})\s*[×xX]\s*(.+?)|(.+?)\s*[×xX]\s*(\d{1,2}))\s*$/;

export function parseEncounters(body) {
  const lines = String(body || '').replace(/\r\n/g, '\n').split('\n');
  const out = [];
  for (let i = 0; i < lines.length; i++) {
    const h = HEAD.exec(lines[i]);
    if (!h) continue;
    let end = i + 1;
    const items = [];
    while (end < lines.length && /^>/.test(lines[end])) {
      const m = ITEM.exec(lines[end]);
      if (m) items.push({ qty: Math.max(1, parseInt(m[1] || m[4], 10)), name: (m[2] || m[3]).replace(/\*\*|_/g, '').trim() });
      end++;
    }
    out.push({ title: h[1] || 'Encounter', start: i, end, items, head: lines[i] });
    i = end - 1;
  }
  return out;
}

export function encounterBlock(title, items) {
  const t = String(title || '').replace(/\s+/g, ' ').trim() || 'Encounter';
  return ['> [!danger]- Encounter: ' + t, ...items.map(x => '> - ' + x.qty + '× ' + x.name)].join('\n');
}

/* puts a new encounter into the session's prep (see placeTemplate); returns the new body */
export function addEncounter(body, title, items) {
  return placeTemplate(String(body).replace(/\r\n/g, '\n'), 'encounter', encounterBlock(title, items)).text;
}

export function removeEncounter(body, enc) {
  const lines = String(body).replace(/\r\n/g, '\n').split('\n');
  const stop = enc.end < lines.length && lines[enc.end].trim() === '' ? enc.end + 1 : enc.end;
  lines.splice(enc.start, stop - enc.start);
  return lines.join('\n');
}

/* the monsters in the library for each line (matched by name, ignoring case); lines with no match come back as missing */
export function resolveItems(items, monsters) {
  const by = new Map();
  for (const m of monsters) { const k = String(m.n || '').toLowerCase(); if (k && !by.has(k)) by.set(k, m); }
  const found = [], missing = [];
  for (const it of items) {
    const m = by.get(it.name.toLowerCase());
    if (m) found.push({ m, qty: it.qty, name: it.name }); else missing.push(it);
  }
  return { found, missing };
}
export const xpOf = found => found.reduce((t, x) => t + crXp(x.m.cr) * x.qty, 0);

/* changes one encounter: a new name and a new list of creatures. Any other line inside the callout (your own notes on tactics, say)
   stays where it was, after the creatures; the fold marker (- or +) is kept. Returns the new body. */
export function replaceEncounter(body, enc, title, items) {
  const lines = String(body).replace(/\r\n/g, '\n').split('\n');
  const t = String(title || '').replace(/\s+/g, ' ').trim() || 'Encounter';
  const marker = (/\[!danger\]([+-]?)/i.exec(enc.head || lines[enc.start]) || [])[1] ?? '-';
  const keep = lines.slice(enc.start + 1, enc.end).filter(l => !ITEM.test(l));
  const fresh = ['> [!danger]' + marker + ' Encounter: ' + t, ...items.map(x => '> - ' + Math.max(1, Math.min(99, x.qty | 0)) + '× ' + String(x.name).replace(/\s+/g, ' ').trim()), ...keep];
  lines.splice(enc.start, enc.end - enc.start, ...fresh);
  return lines.join('\n');
}
