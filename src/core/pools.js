import { summarize } from './markdown.js';
import { plainText } from './mentions.js';
import { typeLabel } from './schema.js';
import { SNAPSHOT_NOTE } from './snapshot.js';

/* New rows for the generators' tables, and new tables of your own, written with Claude's help. Nothing here talks to Claude: it builds
   the question, reads the answer, and reads and writes the notes where the results live (in the vault, so they show in Obsidian too).

     "Generator Tables"      one section per table that has extra rows:  ## NPC · Quirk  /  <!-- dmf: npc/quirk -->  /  - a row
     "Custom tables/<name>"  one note per table you asked for: a markdown table, rolled from the Generate page */

export const POOLS_NOTE = 'Generator Tables';
export const TABLES_FOLDER = 'Custom tables';

const HEAD = '# Generator Tables\n\nExtra rows for the generators, written with Claude\'s help. DM Forge mixes them in when you roll on the matching generator. Edit or delete rows freely: one bullet per row.\n';

/* ---- the note of extra rows ---- */
export function parsePools(text) {
  const sections = [];
  let cur = null, fence = false;
  for (const line of String(text || '').replace(/\r\n/g, '\n').split('\n')) {
    if (/^\s{0,3}(```|~~~)/.test(line)) fence = !fence;
    const h = !fence && line.match(/^##[ \t]+(.+?)[ \t]*#*[ \t]*$/);
    if (h) { cur = { title: h[1].trim(), key: '', rows: [] }; sections.push(cur); continue; }
    if (!cur) continue;
    const k = line.match(/^<!--\s*dmf:\s*([\w\-./]+)\s*-->\s*$/);
    if (k) { cur.key = k[1]; continue; }
    const b = line.match(/^\s*[-*+][ \t]+(.+?)\s*$/);
    if (b) cur.rows.push(b[1]);
  }
  const out = {};
  for (const s of sections) if (s.key) out[s.key] = { title: s.title, rows: s.rows };
  return out;
}

/* writes the pools back; anything above the first section is kept as it is */
export function buildPools(pools, existing) {
  let head = HEAD;
  if (existing) {
    const out = [];
    let fence = false;
    for (const line of String(existing).replace(/\r\n/g, '\n').split('\n')) {
      if (/^\s{0,3}(```|~~~)/.test(line)) fence = !fence;
      if (!fence && /^##[ \t]+/.test(line)) break;
      out.push(line);
    }
    head = out.join('\n').replace(/\s+$/, '') + '\n';
  }
  return head + Object.entries(pools).filter(([, p]) => p.rows.length).map(([key, p]) => '\n## ' + p.title.replace(/\s+/g, ' ').trim() + '\n<!-- dmf: ' + key + ' -->\n\n' + p.rows.map(r => '- ' + r).join('\n') + '\n').join('');
}

export const normRow = s => String(s).toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

/* ---- what the campaign looks like, to steer Claude ----
   Built from your notes, with no Claude involved: the overview, where the story is (the latest session recaps), the open plot threads
   with their next steps, the player characters, and for each person, faction and place who they are, what they want and who they are
   tied to. The DM-only secrets (a note's Secret, Hidden or DM section) come with it unless asked to stay out. */
const SKIP = new Set(['session', 'map', 'root', 'other']);
const ours = n => n.name === SNAPSHOT_NOTE || n.name === POOLS_NOTE || n.name === 'DM Cheat Sheet';
const one = s => plainText(String(s || '')).replace(/\S+\.(?:svg|png|jpe?g|webp|gif|pdf)\b/gi, '').replace(/\s+/g, ' ').trim();
const stop = s => String(s).replace(/[.\s]+$/, '');
const cut = (s, n) => (s.length > n ? s.slice(0, n - 1).replace(/\s+\S*$/, '') + '…' : s);

/* the text under the first heading that matches `re`, up to the next heading */
export function sectionText(body, re) {
  const lines = String(body || '').replace(/\r\n/g, '\n').split('\n');
  let at = -1, depth = 0;
  for (let i = 0; i < lines.length; i++) {
    const h = lines[i].match(/^(#{1,6})\s+(.+?)\s*#*\s*$/);
    if (h && re.test(h[2].replace(/[*_`]/g, '').trim())) { at = i; depth = h[1].length; break; }
  }
  if (at < 0) return '';
  const out = [];
  for (let i = at + 1; i < lines.length; i++) {
    const h = lines[i].match(/^(#{1,6})\s/);
    if (h && h[1].length <= depth) break;
    out.push(lines[i]);
  }
  return out.join('\n').trim();
}
const WANTS = /^(wants?|goals?|motivations?|desires?|ambitions?|agenda)$/i;
const SECRET = /^(secrets?|hidden|dm( notes?| only)?|the truth|truth|what is really going on)$/i;
const NEXT = /^(next steps?|leads?|to do|todo)$/i;
const RECAP = /^recap$/i;
const FM_KEYS = ['race', 'class', 'role', 'kind', 'faction', 'location', 'status'];
const fmBits = n => FM_KEYS.map(k => (n.fm ? n.fm[k] : null)).filter(v => v != null && v !== '' && typeof v !== 'object').map(v => one(String(v))).filter(Boolean);
const order = n => { const v = n.fm && n.fm.number; return typeof v === 'number' ? v : parseFloat(v) || 0; };

/* does any person, faction, place or thread have DM-only text in it? (decides whether the "leave out the secrets" box is worth showing) */
export function liveHasSecrets(idx) {
  return idx.notes.some(n => !ours(n) && !SKIP.has(n.type) && !!sectionText(n.body, SECRET));
}

export function campaignContext(idx, campaign, { max = 7000, perType = 14, secrets = true } = {}) {
  const parts = [];                                  // in order of importance: the last ones are dropped first when it is too long
  const home = idx.notes.find(n => n.type === 'root' && campaign && n.name === campaign.name && !ours(n)) || idx.notes.find(n => n.type === 'root' && !ours(n));
  if (home) {
    const body = home.body.replace(/\r\n/g, '\n').replace(/<!--[\s\S]*?-->/g, '').replace(/\n{3,}/g, '\n\n').trim();
    if (body) parts.push('Overview of the campaign' + (campaign && campaign.name ? ' "' + campaign.name + '"' : '') + ':\n' + body.slice(0, 1100));
  }
  const by = idx.byType || {};
  // where the story is now
  const sessions = (by.session || []).slice().sort((a, b) => order(b) - order(a) || String(b.name).localeCompare(String(a.name)));
  const recaps = [];
  for (const n of sessions.slice(0, 3)) {
    const r = one(sectionText(n.body, RECAP));
    if (r) recaps.push('- ' + n.name + ': ' + cut(r, 420));
  }
  if (recaps.length) parts.push('Where the story is now (the latest sessions, newest first):\n' + recaps.join('\n'));
  // the open threads
  const plots = (by.plot || []).slice().sort((a, b) => (/^(active|ongoing|open|current)/i.test(String((b.fm || {}).status || '')) ? 1 : 0) - (/^(active|ongoing|open|current)/i.test(String((a.fm || {}).status || '')) ? 1 : 0));
  if (plots.length) {
    parts.push('Plot threads:\n' + plots.slice(0, 8).map(n => {
      const st = n.fm && n.fm.status ? ' (' + one(n.fm.status) + ')' : '';
      const nx = sectionText(n.body, NEXT).split('\n').map(one).filter(Boolean).slice(0, 3).join('; ');
      const sm = one(summarize(n.body, 200));
      return '- ' + n.name + st + (sm ? ': ' + sm : '') + (nx ? ' Next: ' + cut(nx, 160) : '');
    }).join('\n'));
  }
  // the player characters, then everyone else
  const entity = (n, lim) => {
    const bits = fmBits(n);
    const sm = cut(one(summarize(n.body, 220)), lim);
    const wants = one(sectionText(n.body, WANTS));
    const sec = secrets ? one(sectionText(n.body, SECRET)) : '';
    const tied = [...new Set((n.links || []).map(l => String(l).split('#')[0].trim()).filter(l => l && l !== n.name))].slice(0, 4);
    return '- ' + n.name + (bits.length ? ' (' + bits.join(', ') + ')' : '') + (sm ? ': ' + sm : '')
      + (wants ? ' Wants: ' + stop(cut(wants, 140)) + '.' : '') + (sec ? ' DM-only: ' + stop(cut(sec, 160)) + '.' : '') + (tied.length ? ' Tied to: ' + tied.join(', ') + '.' : '');
  };
  const order2 = ['player', 'npc', 'faction', 'location'];
  const labels = { player: 'The player characters', npc: 'People', faction: 'Factions', location: 'Places' };
  for (const t of order2) {
    const list = by[t];
    if (list && list.length) parts.push(labels[t] + ':\n' + list.slice(0, t === 'player' ? 8 : perType).map(n => entity(n, t === 'player' ? 200 : 170)).join('\n'));
  }
  for (const t of Object.keys(by)) {
    if (SKIP.has(t) || order2.includes(t) || t === 'plot') continue;
    const list = by[t];
    if (!list || !list.length) continue;
    parts.push(typeLabel(t) + ':\n' + list.slice(0, 8).map(n => entity(n, 110)).join('\n'));
  }
  // too long: drop whole lines from the end of the least important parts, never cutting the middle of one
  let out = parts.join('\n\n');
  while (out.length > max && parts.length) {
    const last = parts[parts.length - 1].split('\n');
    if (last.length > 2) { last.pop(); parts[parts.length - 1] = last.join('\n'); } else parts.pop();
    out = parts.join('\n\n');
  }
  return out;
}

/* ---- the questions ---- */
export const TABLE_SYSTEM = 'You write entries for a Dungeon Master\'s random tables for a Dungeons & Dragons 5e game. '
  + 'Reply with JSON only, with nothing before or after it. Each entry is short, concrete and specific, and different from every other entry and from the examples. '
  + 'Do not number the entries. Do not start many entries the same way.';

const list = rows => rows.map(r => '- ' + r).join('\n');

/* tables: [{ key, label, samples, mine }]. One question for all of them; the answer is a JSON object with one list per table. */
export const STRENGTHS = [
  ['light', 'Light touch'],
  ['strong', 'Strong (recommended)'],
  ['max', 'Very strong: every row names something'],
];
/* how hard the campaign should bear on the entries; the stronger ones ask for the names themselves, so the players see the link */
export function inspirationText(strength, examples = true) {
  const share = 'Spread the references around: do not use the same person, place or thread in more than two entries.' + (examples ? ' The examples above show the format only: do not copy their content, and do not let them pull you toward generic ideas.' : '');
  if (strength === 'light') return 'Let it shape the entries so they suit my world, but the entries must still make sense on their own (do not make every entry about one character or place).';
  if (strength === 'max') return 'Every single entry must name or directly refer to a specific person, place, faction, plot thread or event from the campaign above, using the real names, so the connection is obvious to my players at a glance. ' + share;
  return 'Tie the entries to my campaign so my players can see the connection. At least two out of every three entries must name or directly refer to a specific person, place, faction, plot thread or event from the campaign above, in a way the players would recognise. The rest must still clearly belong to this world: its tone, setting and history. ' + share;
}

export function refillPrompt({ gen, tables, count, context, direction, strength = 'strong' }) {
  const one = tables.length === 1;
  let p = 'I am a Dungeon Master. My random generator "' + gen + '" has ' + (one ? 'a table called "' + tables[0].label + '"' : tables.length + ' tables: ' + tables.map(t => '"' + t.label + '"').join(', ')) + '. '
    + (one ? 'It keeps' : 'They keep') + ' repeating themselves, so I need ' + count + ' NEW entries for ' + (one ? 'it' : 'each table') + '.\n';
  for (const t of tables) {
    p += '\n' + (one ? 'Here are some entries it already has' : 'Table "' + t.label + '" (key: ' + t.key + '). Entries it already has') + '. Match their style and length, but do not copy them or reword them:\n' + list(t.samples) + '\n';
    if (t.mine && t.mine.length) p += (one ? '\nEntries I have already added (do not repeat these either):\n' : 'Entries I have already added to "' + t.label + '" (do not repeat these either):\n') + list(t.mine.slice(-40)) + '\n';
  }
  if (context) p += '\nAbout my campaign. This is the most important part of what I am asking:\n---\n' + context + '\n---\n' + inspirationText(strength) + '\n';
  if (direction && direction.trim()) p += '\nWhat I would like: ' + direction.trim() + '\n';
  p += '\nReply with only a JSON object whose keys are exactly ' + tables.map(t => '"' + t.key + '"').join(', ') + ', each holding an array of ' + count + ' strings.';
  return p;
}

export function tablePrompt({ description, die, context, strength = 'strong' }) {
  const n = +String(die).replace(/\D/g, '') || 12;
  let p = 'I am a Dungeon Master. Make me a random table for this: ' + description.trim() + '\n\n'
    + 'It is rolled with a d' + n + ', so give exactly ' + n + ' entries, each one short and specific (one line), and different from each other.\n';
  if (context) p += '\nAbout my campaign. This is the most important part of what I am asking:\n---\n' + context + '\n---\n' + inspirationText(strength, false) + '\n';
  p += '\nReply with only JSON like {"title": "a short title", "rows": ["entry 1", "entry 2"]}.';
  return p;
}

const cleanRows = raw => {
  const rows = [];
  for (const r of raw || []) {
    const t = (typeof r === 'string' ? r : r && typeof r === 'object' ? Object.values(r).find(v => typeof v === 'string') : '') || '';
    const clean = t.replace(/\s+/g, ' ').replace(/^["'\u201c]|["'\u201d]$/g, '').trim();
    if (clean && clean.length <= 400) rows.push(clean);
  }
  return rows;
};

/* The answer to a refill: { key: [rows] } for the keys asked for. A plain list is accepted when only one table was asked about. */
export function parseTables(text, keys) {
  const s = String(text || '').trim().replace(/^```[a-z]*\s*/i, '').replace(/```\s*$/, '').trim();
  const tryJson = str => { try { return JSON.parse(str); } catch (e) { return null; } };
  let data = tryJson(s);
  if (!data) { const c = s.indexOf('{'), d = s.lastIndexOf('}'); if (c >= 0 && d > c) data = tryJson(s.slice(c, d + 1)); }
  const out = {};
  if (data && !Array.isArray(data) && typeof data === 'object') {
    for (const k of keys) if (Array.isArray(data[k])) out[k] = cleanRows(data[k]);
  } else if (keys.length === 1) {
    out[keys[0]] = parseAnswer(text).rows;
  }
  return out;
}

/* Claude's answer -> { title, rows }. It should be JSON; a plain list is accepted too. */
export function parseAnswer(text) {
  let s = String(text || '').trim().replace(/^```[a-z]*\s*/i, '').replace(/```\s*$/, '').trim();
  let data = null;
  const tryJson = str => { try { return JSON.parse(str); } catch (e) { return null; } };
  data = tryJson(s);
  if (!data) {
    const a = s.indexOf('['), b = s.lastIndexOf(']'), c = s.indexOf('{'), d = s.lastIndexOf('}');
    if (c >= 0 && d > c && (a < 0 || c < a)) data = tryJson(s.slice(c, d + 1));
    if (!data && a >= 0 && b > a) data = tryJson(s.slice(a, b + 1));
  }
  let title = '', raw = [];
  if (Array.isArray(data)) raw = data;
  else if (data && typeof data === 'object') { title = typeof data.title === 'string' ? data.title : ''; raw = Array.isArray(data.rows) ? data.rows : Array.isArray(data.entries) ? data.entries : []; }
  else raw = s.split('\n').map(l => l.replace(/^\s*(?:[-*+]|\d+[.)])\s+/, '')).filter(l => l.trim() && !/^[\[\]{}]$/.test(l.trim()));
  const rows = [];
  for (const r of raw) {
    const t = (typeof r === 'string' ? r : r && typeof r === 'object' ? Object.values(r).find(v => typeof v === 'string') : '') || '';
    const clean = t.replace(/\s+/g, ' ').replace(/^["'“]|["'”]$/g, '').trim();
    if (clean && clean.length <= 400) rows.push(clean);
  }
  return { title: title.trim(), rows };
}

/* drop rows that repeat one already there (or each other) */
export function freshRows(rows, known) {
  const seen = new Set((known || []).map(normRow));
  const out = [];
  let dropped = 0;
  for (const r of rows) {
    const k = normRow(r);
    if (!k || seen.has(k)) { dropped++; continue; }
    seen.add(k); out.push(r);
  }
  return { rows: out, dropped };
}

/* ---- tables of your own ---- */
const cell = s => String(s).replace(/\|/g, '\\|').replace(/\s*\n\s*/g, ' ');
export function buildTable(title, rows) {
  const n = rows.length;
  return '# ' + title.trim() + '\n\n*d' + n + ' table, written with Claude\'s help*\n\n| d' + n + ' | Result |\n|---|---|\n' + rows.map((r, i) => '| ' + (i + 1) + ' | ' + cell(r) + ' |').join('\n') + '\n';
}
export function parseTable(name, text) {
  const rows = [];
  for (const line of String(text || '').replace(/\r\n/g, '\n').split('\n')) {
    const m = line.match(/^\|\s*(\d+)\s*\|\s*((?:\\\||[^|])*?)\s*\|\s*$/);
    if (m) rows.push(m[2].replace(/\\\|/g, '|'));
  }
  return { name, rows };
}
export const rollTable = t => (t.rows.length ? (() => { const i = Math.floor(Math.random() * t.rows.length); return { n: i + 1, text: t.rows[i] }; })() : null);
