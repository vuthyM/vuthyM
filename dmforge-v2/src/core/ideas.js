/* The Workshop: ideas for one-shots and campaigns, kept apart from any campaign (like the Character Library).
   One idea is one ordinary Markdown note in the vault's Ideas folder, so it is backed up, versioned and synced like everything
   else, and opens in any editor:

     ---
     type: idea
     status: spark
     pitch: One line that sells it
     tone: Gothic comedy
     length: 3 to 4 hours
     players: 4
     level: 3
     tags: [heist, horror]
     ---
     # The Drowned Bell

     ## The idea
     free text
     ## Cast
     - **Mira Voss** — wants: the ledger · secret: she sold the map · voice: dry, never blinks
     ## Scenes and plot points
     1. **Arrival** — the ferry stops short of the dock
     ...

   Everything here is plain functions on text, so it can be tested without a page. Anything in the note that the Workshop does not
   know about (other headings, other front matter, text before the first heading) is kept and written back untouched. */
import { splitFrontmatter, patchFrontmatter, detectEol } from './frontmatter.js';
import { sanitizeName, stem, join } from './util.js';

export const IDEAS_FOLDER = 'Ideas';

export const STATUSES = [
  { id: 'spark', label: 'Spark', hint: 'Just an idea' },
  { id: 'developing', label: 'Developing', hint: 'Taking shape' },
  { id: 'ready', label: 'Ready to run', hint: 'Could run it tonight' },
  { id: 'played', label: 'Played', hint: 'Run at the table' },
];
export const statusOf = id => STATUSES.find(s => s.id === id) || STATUSES[0];

/* The sections, in page order. kind 'text' is free writing; 'rows' is a list of small cards with the named fields.
   `order` rows are numbered (scenes). `labels` name the fields on screen. */
export const SECTIONS = [
  { id: 'idea', title: 'The idea', kind: 'text', aliases: ['idea', 'premise', 'concept', 'overview', 'summary'], hint: 'What is this about? The premise, the feel, why it would be fun to run.' },
  { id: 'hook', title: 'Hook', kind: 'text', aliases: ['hook', 'hooks', 'the hook', 'strong start', 'opening'], hint: 'What happens in the first five minutes to get the table moving?' },
  { id: 'cast', title: 'Cast', kind: 'rows', fields: ['name', 'wants', 'secret', 'voice'], labels: ['Name', 'Wants', 'Secret', 'Voice and look'], single: 'NPC', aliases: ['cast', 'npcs', 'npc', 'characters', 'people', 'who'], hint: 'The people in it: who they are, what they want, what they are hiding.' },
  { id: 'places', title: 'Places', kind: 'rows', fields: ['name', 'note'], labels: ['Place', 'What is notable'], single: 'place', aliases: ['places', 'locations', 'location', 'place', 'where', 'settings'], hint: 'Where it happens, one line each.' },
  { id: 'scenes', title: 'Scenes and plot points', kind: 'rows', order: true, fields: ['name', 'note'], labels: ['Scene', 'What happens'], single: 'scene', aliases: ['scenes', 'scenes and plot points', 'plot points', 'plot', 'beats', 'outline', 'structure'], hint: 'The beats, in the order you expect them. Players will change it.' },
  { id: 'stakes', title: 'Stakes, goals and the clock', kind: 'text', aliases: ['stakes', 'stakes and the clock', 'stakes goals and the clock', 'stakes, goals and the clock', 'goals', 'end goals', 'clock', 'the clock'], hint: 'What the party is trying to do, what happens if they win or lose, and what is ticking.' },
  { id: 'twists', title: 'Twists and secrets', kind: 'rows', fields: ['name', 'note'], labels: ['Twist', 'Detail'], single: 'twist', aliases: ['twists', 'twists and secrets', 'secrets', 'twist', 'reveals', 'complications'], hint: 'What is really going on, and the surprises you could spring.' },
  { id: 'endings', title: 'Endings', kind: 'rows', fields: ['name', 'note'], labels: ['If…', 'Then…'], single: 'ending', aliases: ['endings', 'ending', 'end', 'outcomes', 'finale'], hint: 'How it might end, depending on what they do.' },
  { id: 'monsters', title: 'Monsters and encounters', kind: 'rows', fields: ['name', 'note'], labels: ['Monster or encounter', 'Notes'], single: 'encounter', aliases: ['monsters', 'monsters and encounters', 'encounters', 'encounter', 'bestiary', 'enemies'], hint: 'Fights and dangers, with numbers if you have them.' },
  { id: 'rewards', title: 'Rewards', kind: 'text', aliases: ['rewards', 'reward', 'loot', 'treasure'], hint: 'Loot, favours, information, anything they walk away with.' },
  { id: 'props', title: 'Props, handouts and music', kind: 'text', aliases: ['props', 'handouts', 'music', 'props handouts and music', 'props, handouts and music', 'atmosphere'], hint: 'Things to print, show or play.' },
  { id: 'maps', title: 'Maps', kind: 'text', optional: true, aliases: ['maps', 'map'], hint: 'Links to your map notes, or what the map needs to show.' },
  { id: 'notes', title: 'Other notes', kind: 'text', aliases: ['notes', 'other notes', 'misc', 'miscellaneous', 'extra'], hint: 'Anything that does not fit above.' },
];
export const SECTION_BY_ID = Object.fromEntries(SECTIONS.map(s => [s.id, s]));

const normTitle = t => String(t || '').toLowerCase().replace(/[^a-z0-9, ]+/g, ' ').replace(/\s+/g, ' ').trim();
const sectionFor = title => { const n = normTitle(title); return SECTIONS.find(s => normTitle(s.title) === n || s.aliases.includes(n)) || null; };

let rowSeq = 0;
export const newRow = (sec, init = {}) => {
  const r = { _id: ++rowSeq };
  for (const f of SECTION_BY_ID[sec].fields) r[f] = init[f] || '';
  return r;
};

export function blankIdea(title = '') {
  const sec = {};
  for (const s of SECTIONS) sec[s.id] = s.kind === 'rows' ? [] : '';
  return { title, status: 'spark', pitch: '', tone: '', length: '', players: '', level: '', tags: [], campaign: '', sec, extras: [], base: '', eol: '\n' };
}

/* ---------------------------------------------------------------- reading */

const LIST_LINE = /^( {0,3})(?:[-*+]|\d+[.)])[ \t]+(.*)$/;
const NAME_LINE = /^\*\*(.+?)\*\*(?:[ \t]*(?:—|–)[ \t]*|:[ \t]*|[ \t]+-[ \t]+|[ \t]+|$)(.*)$/;
const CAST_KEY = /^(wants|secret|voice)[ \t]*:[ \t]*(.*)$/i;

/* the lines of a "rows" section back into rows */
function parseRows(sec, lines) {
  const def = SECTION_BY_ID[sec];
  const rows = [];
  let cur = null;
  const finish = () => { if (cur) { rows.push(rowFrom(def, cur)); cur = null; } };
  for (const line of lines) {
    const m = line.match(LIST_LINE);
    if (m) { finish(); cur = [m[2]]; continue; }
    if (!line.trim()) { if (cur) cur.push(''); continue; }
    if (cur && /^( {2,}|\t)/.test(line)) { cur.push(line.replace(/^( {2}|\t)/, '')); continue; }
    finish();
    cur = [line.trim()];                                  // a plain paragraph in a list section is kept as a row of its own
  }
  finish();
  return rows;
}
function rowFrom(def, parts) {
  while (parts.length > 1 && !parts[parts.length - 1].trim()) parts.pop();
  const first = parts[0];
  const r = { _id: ++rowSeq };
  for (const f of def.fields) r[f] = '';
  const m = first.match(NAME_LINE);
  let rest;
  if (m) { r.name = m[1].trim(); rest = [m[2] || '', ...parts.slice(1)].join('\n').replace(/^\n+/, ''); }
  else rest = parts.join('\n');
  if (def.id === 'cast') {
    const segs = rest.split(/ · /);
    const plain = [];
    for (const seg of segs) {
      const k = seg.match(CAST_KEY);
      if (k) r[k[1].toLowerCase()] = k[2].trim();
      else if (seg.trim()) plain.push(seg.trim());
    }
    if (plain.length) r.wants = [plain.join(' · '), r.wants].filter(Boolean).join(' · ');
  } else r.note = rest.trim();
  return r;
}

export function parseIdea(text, fallbackTitle = '') {
  const eol = detectEol(text);
  const sp = splitFrontmatter(text);
  const fm = sp.fm || {};
  const idea = blankIdea();
  idea.eol = eol;
  idea.base = sp.hasFm ? sp.prefix : '';
  idea.status = STATUSES.some(s => s.id === String(fm.status || '').toLowerCase()) ? String(fm.status).toLowerCase() : 'spark';
  idea.pitch = fm.pitch == null ? '' : String(fm.pitch);
  idea.tone = fm.tone == null ? '' : String(fm.tone);
  idea.length = fm.length == null ? '' : String(fm.length);
  idea.players = fm.players == null ? '' : String(fm.players);
  idea.level = fm.level == null ? '' : String(fm.level);
  idea.campaign = fm.campaign == null ? '' : String(fm.campaign);
  idea.tags = Array.isArray(fm.tags) ? fm.tags.map(String) : typeof fm.tags === 'string' ? fm.tags.split(/[,\s]+/).filter(Boolean) : [];
  const lines = sp.body.replace(/\r\n/g, '\n').split('\n');
  let i = 0;
  while (i < lines.length && !lines[i].trim()) i++;
  const pre = [];
  let title = '';
  // text before the first "## " heading: an optional "# Title" line, and anything else is kept as part of the idea
  let fence = false;
  const groups = [];
  let curGroup = null;
  for (; i < lines.length; i++) {
    const line = lines[i];
    if (/^(```|~~~)/.test(line)) fence = !fence;
    const h2 = !fence && line.match(/^##[ \t]+(.+?)[ \t]*#*[ \t]*$/);
    if (h2) { curGroup = { title: h2[1].trim(), lines: [] }; groups.push(curGroup); continue; }
    if (!curGroup) {
      const h1 = !title && !fence && line.match(/^#[ \t]+(.+?)[ \t]*#*[ \t]*$/);
      if (h1) { title = h1[1].trim(); continue; }
      pre.push(line);
    } else curGroup.lines.push(line);
  }
  idea.title = title || fallbackTitle;
  const trimBlock = ls => { let a = 0, b = ls.length; while (a < b && !ls[a].trim()) a++; while (b > a && !ls[b - 1].trim()) b--; return ls.slice(a, b); };
  const used = new Set();
  for (const g of groups) {
    const def = sectionFor(g.title);
    if (def && !used.has(def.id)) {
      used.add(def.id);
      if (def.kind === 'rows') idea.sec[def.id] = parseRows(def.id, g.lines);
      else idea.sec[def.id] = trimBlock(g.lines).join('\n');
    } else idea.extras.push({ _id: ++rowSeq, title: g.title, body: trimBlock(g.lines).join('\n') });
  }
  const preText = trimBlock(pre).join('\n');
  if (preText) idea.sec.idea = idea.sec.idea ? preText + '\n\n' + idea.sec.idea : preText;
  return idea;
}

/* ---------------------------------------------------------------- writing */

/* between a bold name and its note: a dash, unless the name already ends in punctuation ("If they ring it:") */
export const sepAfter = name => (/[:.?!…]$/.test(String(name).trim()) ? ' ' : ' — ');
const oneLine = s => String(s == null ? '' : s).replace(/\s*\n\s*/g, ' ').replace(/ · /g, ' / ').trim();

function rowLines(sec, rows) {
  const def = SECTION_BY_ID[sec];
  const out = [];
  let n = 0;
  for (const r of rows) {
    if (sec === 'cast') {
      const name = oneLine(r.name);
      const parts = [];
      if (oneLine(r.wants)) parts.push('wants: ' + oneLine(r.wants));
      if (oneLine(r.secret)) parts.push('secret: ' + oneLine(r.secret));
      if (oneLine(r.voice)) parts.push('voice: ' + oneLine(r.voice));
      if (!name && !parts.length) continue;
      out.push('- ' + (name ? '**' + name + '**' : '') + (name && parts.length ? ' — ' : '') + parts.join(' · '));
      continue;
    }
    const name = oneLine(r.name);
    const note = String(r.note || '').replace(/\r/g, '').replace(/^\n+|\s+$/g, '');
    if (!name && !note) continue;
    n++;
    const bullet = def.order ? n + '. ' : '- ';
    const noteLines = note.split('\n');
    const first = (name ? '**' + name + '**' : '') + (name && noteLines[0] ? sepAfter(name) : '') + noteLines[0];
    out.push(bullet + first);
    for (const l of noteLines.slice(1)) out.push(l.trim() ? '  ' + l : '');
  }
  return out;
}

export function serializeIdea(idea) {
  const out = ['# ' + (idea.title || 'Untitled idea'), ''];
  for (const def of SECTIONS) {
    const v = idea.sec[def.id];
    if (def.kind === 'rows') {
      const ls = rowLines(def.id, v || []);
      if (!ls.length && def.optional) continue;
      out.push('## ' + def.title, '', ...ls, ...(ls.length ? [''] : []));
    } else {
      const t = String(v || '').replace(/\r/g, '').replace(/^\n+|\s+$/g, '');
      if (!t && def.optional) continue;
      out.push('## ' + def.title, '', ...(t ? [t, ''] : []));
    }
  }
  for (const e of idea.extras || []) {
    const t = String(e.body || '').replace(/\r/g, '').replace(/^\n+|\s+$/g, '');
    out.push('## ' + e.title, '', ...(t ? [t, ''] : []));
  }
  while (out.length && out[out.length - 1] === '') out.pop();
  const body = out.join('\n') + '\n';
  const num = v => { const n = Number(String(v).trim()); return String(v).trim() !== '' && Number.isFinite(n) ? n : (String(v).trim() || undefined); };
  const fm = patchFrontmatter(idea.base || '', {
    type: 'idea', status: idea.status || 'spark',
    pitch: oneLine(idea.pitch) || undefined, tone: oneLine(idea.tone) || undefined, length: oneLine(idea.length) || undefined,
    players: num(idea.players), level: num(idea.level), tags: idea.tags && idea.tags.length ? idea.tags : undefined,
    campaign: idea.campaign ? idea.campaign : undefined,
  });
  const text = fm + body;
  return idea.eol === '\r\n' ? text.replace(/\r?\n/g, '\r\n') : text;
}

/* ---------------------------------------------------------------- files */

export const ideaPath = title => join(IDEAS_FOLDER, (sanitizeName(title) || 'Untitled idea') + '.md');

/* a card for the shelf, from the text of a note */
export function summarize(path, text) {
  const m = parseIdea(text, stem(path));
  const count = id => (m.sec[id] || []).filter(r => r.name || r.note || r.wants).length;
  const words = Object.values(m.sec).reduce((n, v) => n + (typeof v === 'string' ? (v.match(/\S+/g) || []).length : v.reduce((k, r) => k + Object.entries(r).reduce((a, [key, val]) => a + (key === '_id' ? 0 : (String(val).match(/\S+/g) || []).length), 0), 0)), 0);
  return { path, title: m.title || stem(path), status: m.status, pitch: m.pitch, tone: m.tone, length: m.length, players: m.players, level: m.level, tags: m.tags, campaign: m.campaign,
    cast: count('cast'), places: count('places'), scenes: count('scenes'), endings: count('endings'), words };
}

export async function listIdeas(vault) {
  let ents = [];
  try { ents = await vault.list(IDEAS_FOLDER); } catch (e) { return []; }
  const out = [];
  for (const e of ents) {
    if (e.kind === 'dir' || !/\.md$/i.test(e.name) || e.name.startsWith('.')) continue;
    const path = join(IDEAS_FOLDER, e.name);
    try { out.push(summarize(path, await vault.readText(path))); } catch (err) { /* unreadable: left out */ }
  }
  return out;
}

export async function freeTitle(vault, title) {
  const base = sanitizeName(title) || 'Untitled idea';
  for (let i = 1; i < 200; i++) {
    const t = i === 1 ? base : base + ' ' + i;
    if (!(await vault.exists(ideaPath(t)))) return t;
  }
  return base + ' ' + Date.now();
}

/* The shelf's order: what you touched most recently is not known from the files alone, so: ready ones, developing, sparks, played; then by title. */
const RANK = { developing: 0, ready: 1, spark: 2, played: 3 };
export const shelfOrder = (a, b) => (RANK[a.status] - RANK[b.status]) || a.title.localeCompare(b.title);
export function filterShelf(list, q, status) {
  const terms = String(q || '').toLowerCase().split(/\s+/).filter(Boolean);
  return list.filter(c => (!status || c.status === status) && terms.every(t => (c.title + ' ' + c.pitch + ' ' + c.tone + ' ' + c.tags.join(' ')).toLowerCase().includes(t))).sort(shelfOrder);
}
