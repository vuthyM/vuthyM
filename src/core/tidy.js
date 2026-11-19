/* Tidy notes: after a session, the rough notes typed during play (the log lines, and any sections of notes) become a clean, organised
   version, and the notes as typed are kept, exactly, so nothing is ever lost.

   What changes in the session note when it is applied:
     - the typed material is taken out of its place and the tidy version goes in under "## Session notes" (a marked block)
     - the open promises and hooks stay in a small log block ("## Promises and hooks"), so What am I forgetting?, Close out and
       Import last session keep working exactly as before
     - the notes as typed go into one hidden comment at the end of the note (<!-- dmforge:original ... -->). It does not show in
       Obsidian's reading view, is left out of player-safe copies, and is not counted for links or tags. "Put back my original"
       restores it.
   Prep, the players' Recap and everything DM Forge wrote itself (combat, DM recap, Next time, Last time...) are never touched.
   Pure functions; everything works on LF text and goes back to CRLF if that is what the note used. */
import { detectEol } from './frontmatter.js';
import { parseLog } from './sessionlog.js';
import { reformatBody } from './reformat.js';
import { playerSafe } from './playersafe.js';

export const TIDY_HEADING = 'Session notes';
export const TASKS_HEADING = 'Promises and hooks';
export const TIDY_ID = 'tidy';
const LOG_START = '<!-- dmforge:log -->', LOG_END = '<!-- /dmforge:log -->';
const TIDY_START = '<!-- dmforge:tidy -->', TIDY_END = '<!-- /dmforge:tidy -->';
const ORIG_RE = /<!-- dmforge:original([^\n]*)\n([\s\S]*?)\n?-->/;
const MACHINE_BLOCK = /<!-- dmforge:(combat-[\w-]+|dm-recap|next|recap-check|last-time|tidy) -->/;

export const TIDY_SYSTEM = 'You tidy a Dungeon Master\'s rough notes after a session of a D&D campaign. Keep the DM\'s own wording wherever it is clear; fix spelling, '
  + 'split run-on lines and organise by scene. Use only what is in the notes: never invent a name, a number, an event or a reason, and never drop a fact. '
  + 'Reply with the markdown only.';

const lf = s => String(s || '').replace(/\r\n/g, '\n');
const oneLine = s => String(s || '').replace(/\s+/g, ' ').trim();
const same = s => s.replace(/\[[ xX]\]/, '[ ]').replace(/\s+/g, ' ').trim();      // a line, whether or not its box is ticked

/* ---------- the notes as typed, kept in a comment ---------- */
const escapeRaw = s => String(s).replace(/-->/g, '--​>');
const unescapeRaw = s => String(s).replace(/--​>/g, '-->');
export const hasOriginal = body => ORIG_RE.test(lf(body));
export function getOriginal(body) {
  const m = ORIG_RE.exec(lf(body));
  if (!m) return null;
  const date = (/date=(\S+)/.exec(m[1]) || [])[1] || '';
  return { raw: unescapeRaw(m[2]), date };
}
const originalBlock = (raw, date) => '<!-- dmforge:original date=' + date + ' (your notes exactly as you typed them, kept by Tidy notes; Put back my original restores them)\n' + escapeRaw(raw.replace(/\n+$/, '')) + '\n-->';
export const hasTidy = body => lf(body).includes(TIDY_START);

/* ---------- splitting a session note into the parts that matter ---------- */
const NOTESY = /^(session\s+)?(notes?|log|live(\s+notes?)?|what\s+happened|play(ed)?|events?|during(\s+the\s+session)?|table\s+notes?)\b/i;
const PREP = /^prep/i;
const strip = h => String(h || '').replace(/[*_`#]/g, '').replace(/^[^\p{L}\p{N}]+/u, '').trim();

/* body -> { segments } where each segment is a run of lines: the preface (title and anything before the first "## "), or one "## " section.
   kind: 'log' (holds the log block), 'notes' (a section that looks like notes taken during play), 'other' (any other section of yours),
   'keep' (Prep, the players' Recap) or 'machine' (written by DM Forge). `include` is what the dialog ticks to begin with. */
export function splitSession(bodyIn) {
  // the preserved original is not part of any section: it is kept apart and put back at the end by applyTidy and restoreOriginal
  const lines = lf(bodyIn).replace(new RegExp(ORIG_RE.source, 'g'), '').replace(/\s+$/, '\n').split('\n');
  const segs = [];
  let cur = { heading: null, lines: [] };
  let fence = false, inBlock = false;
  for (const l of lines) {
    if (/^\s*(```|~~~)/.test(l)) fence = !fence;
    if (/^<!-- dmforge:/.test(l)) inBlock = true;
    const isH2 = !fence && !inBlock && /^##\s+\S/.test(l) && !/^###/.test(l);
    if (isH2) { segs.push(cur); cur = { heading: strip(l.replace(/^##\s+/, '')), lines: [l] }; continue; }
    cur.lines.push(l);
    if (/^<!-- \/dmforge:/.test(l) || (/<!-- dmforge:[\w-]+ -->/.test(l) && /<!-- \/dmforge:[\w-]+ -->/.test(l))) inBlock = false;
  }
  segs.push(cur);
  const seenIds = {};
  const out = segs.map((s, i) => {
    const raw = s.lines.join('\n');
    const text = raw;
    let kind;
    if (s.heading === null) kind = 'keep';                       // the title and anything above the first section stay as they are
    else if (raw.includes(LOG_START)) kind = 'log';
    else if (MACHINE_BLOCK.test(raw)) kind = 'machine';
    else if (/^recap$/i.test(s.heading) || (/player/i.test(s.heading) && /recap/i.test(s.heading))) kind = 'keep';
    else if (PREP.test(s.heading)) kind = 'keep';
    else if (/^(combat|dm\s+recap|next\s+time|recap\s+check|last\s+time|session\s+updates)\b/i.test(s.heading)) kind = 'machine';
    else if (NOTESY.test(s.heading)) kind = 'notes';
    else kind = 'other';
    const body = s.lines.filter((l, j) => !(j === 0 && s.heading !== null)).join('\n').trim();
    const base = s.heading === null ? 'preface' : 'h:' + s.heading.toLowerCase();
    seenIds[base] = (seenIds[base] || 0) + 1;
    return { id: seenIds[base] > 1 ? base + '#' + seenIds[base] : base, heading: s.heading, kind, raw, text, empty: !body, include: kind === 'log' || kind === 'notes' };
  });
  return { segments: out };
}

/* the section as plain material: the log block's markers and the "## " heading are dropped; the lines stay exactly as typed */
const toMaterial = raw => lf(raw).replace(/<!-- \/?dmforge:log -->\n?/g, '').replace(/^##\s+(Session log|Promises and hooks)\s*\n?/gim, '').replace(/\n{3,}/g, '\n\n').trim();

/* what there is to tidy, for the dialog: each section, whether it can be chosen, and how much is in it */
export function tidyPlan(body) {
  const { segments } = splitSession(body);
  const orig = getOriginal(body);
  return {
    segments: segments.filter(s => s.heading !== null && s.kind !== 'machine').map(s => ({
      id: s.id, heading: s.heading, kind: s.kind, include: s.include && !s.empty,
      lines: s.kind === 'log' ? parseLog(s.raw).length : s.raw.split('\n').filter(l => l.trim() && !/^##?\s/.test(l) && !/^<!--/.test(l)).length,
      locked: s.kind === 'keep' || s.empty,
    })),
    logLines: parseLog(lf(body)).length,
    tidied: hasTidy(body) && !!orig,
    originalDate: orig ? orig.date : '',
  };
}

/* the text to tidy for a choice of sections. When the note was tidied before, the notes as typed then come first, and anything
   typed since (a line logged, a section added) is added to the end, so a second tidy starts from everything. */
export function buildMaterial(body, ids) {
  const { segments } = splitSession(body);
  const chosen = segments.filter(s => ids.includes(s.id) && !s.empty && (s.kind === 'log' || s.kind === 'notes' || s.kind === 'other'));
  const currentRaw = chosen.map(s => s.raw).join('\n');
  const prior = getOriginal(body);
  let raw = currentRaw;
  if (prior) {
    const seen = new Set(toMaterial(prior.raw).split('\n').map(same).filter(Boolean));
    const fresh = toMaterial(currentRaw).split('\n').filter(l => l.trim() && !/^##\s/.test(l) && !seen.has(same(l)));
    raw = prior.raw.replace(/\n+$/, '') + (fresh.length ? '\n\n## Typed since\n' + fresh.join('\n') : '');
  }
  return { raw, text: toMaterial(raw), ids: chosen.map(s => s.id), count: toMaterial(raw).split('\n').filter(l => l.trim()).length };
}

/* ---------- splitting long notes ---------- */
export function chunkMaterial(text, max = 5500) {
  const blocks = lf(text).split(/\n(?=##\s)|\n{2,}/).filter(b => b.trim());
  const out = [];
  let cur = '';
  const push = () => { if (cur.trim()) out.push(cur.trim()); cur = ''; };
  for (let b of blocks) {
    while (b.length > max) {                          // one enormous block: split at line ends
      const cut = b.lastIndexOf('\n', max) > max / 2 ? b.lastIndexOf('\n', max) : max;
      if ((cur + '\n\n' + b.slice(0, cut)).length > max) push();
      cur += (cur ? '\n\n' : '') + b.slice(0, cut); push();
      b = b.slice(cut).replace(/^\n/, '');
    }
    if ((cur + '\n\n' + b).length > max) push();
    cur += (cur ? '\n\n' : '') + b;
  }
  push();
  return out.length ? out : [''];
}

/* the people, places and factions worth offering Claude to link: the ones the notes mention, by name or by a distinctive word of it */
export function mentionedNames(material, notes, cap = 80) {
  const low = lf(material).toLowerCase();
  const words = new Set(low.match(/[a-z][a-z'’-]+/g) || []);
  const hit = n => { const el = n.name.toLowerCase(); return el.length > 2 && (low.includes(el) || el.split(/\s+/).some(w => w.length >= 4 && !TITLES.has(w) && words.has(w))); };
  const linkable = new Set(['npc', 'location', 'faction', 'plot', 'player', 'item']);
  const names = notes.filter(n => linkable.has(n.type) && n.type !== 'player' && hit(n)).map(n => n.name);
  const party = notes.filter(n => n.type === 'player').map(n => n.name);
  return { names: [...new Set(names)].slice(0, cap), party: party.slice(0, 12) };
}

/* the parts of a long night, put together: the DM-only bits gathered under one heading at the end, and an "At a glance" list only once */
export function joinParts(parts) {
  const secrets = [];
  const bodies = parts.map(p => {
    const lines = lf(p).split('\n'), keep = [];
    for (let i = 0; i < lines.length; i++) {
      if (/^#{2,4}\s+secrets?\b/i.test(lines[i])) {
        i++;
        while (i < lines.length && !/^#{2,4}\s/.test(lines[i])) { if (lines[i].trim()) secrets.push(lines[i].trimEnd()); i++; }
        i--;
        continue;
      }
      keep.push(lines[i]);
    }
    return keep.join('\n').trim();
  }).filter(Boolean);
  return bodies.join('\n\n') + (secrets.length ? '\n\n### Secrets (DM only)\n' + secrets.join('\n') : '');
}

/* ---------- the question ---------- */
export function tidyPrompt({ campaign, session, chunk, part = 1, parts = 1, names = [], party = [], glance = true, before = '' }) {
  const name = campaign ? ' "' + campaign + '"' : '';
  const list = a => (a.length ? a.map(x => '- ' + x).join('\n') : '(none)');
  return 'I am the Dungeon Master of a D&D campaign' + name + '. Below are my rough notes from "' + session + '", typed at the table with no formatting'
    + (parts > 1 ? ' (this is part ' + part + ' of ' + parts + ', in order)' : '') + '. Rewrite them as clean notes.\n\n'
    + 'Rules:\n'
    + '- Organise in order of play: a "### Scene title" heading (three to eight words, taken from the notes) for each scene, with bullets under it. Where a line has a time, keep it: "- 20:41 text".\n'
    + '- Keep my wording wherever it is clear. Fix spelling and punctuation, split run-on lines, drop repeated words. Do not summarise, and do not add anything: no names, numbers, events, reasons, opinions or advice that are not in my notes. Do not leave any fact out.\n'
    + '- Link people, places and factions with [[Exact Name]] when my notes clearly mean one from the lists below (if I wrote it differently, [[Exact Name|my words]]). Do not link anything else. Keep my #tags as they are.\n'
    + '- Start lines tagged #reveal, #loot, #decision, #ruling or #spotlight with a bold label: "- 19:55 **Reveal:** text".\n'
    + '- Lines that start with "- [ ]" or "- [x]" are open promises and hooks: leave them out, the app keeps them.\n'
    + '- Anything that is secret, for the DM only, or marked Secret, Clue or DM: put it under a final "### Secrets (DM only)" heading, lightly tidied, and nowhere else.\n'
    + (parts > 1 && part > 1 ? '- Carry on from the earlier part' + (before ? '; its headings so far were: ' + before : '') + '. Do not repeat headings you have already used for a different scene.\n' : '')
    + (glance ? '- End with "### At a glance" and four bullets: "**Who:**" people and creatures that appeared, "**Where:**" places, "**Loot:**", "**Open threads:**". Use only what is in my notes, linked as above, and leave a bullet out if there is nothing for it.\n' : '- Do not add a summary or an "At a glance" list.\n')
    + '- Reply with the markdown only: no introduction, no code fence, no closing remarks.\n\n'
    + '=== PEOPLE, PLACES AND FACTIONS I CAN LINK ===\n' + list(names) + '\n\n'
    + '=== THE PARTY ===\n' + list(party) + '\n\n'
    + '=== MY ROUGH NOTES ===\n' + chunk + '\n';
}
export function glancePrompt({ campaign, session, tidy, names = [] }) {
  return 'Here are my tidied notes from "' + session + '"' + (campaign ? ' of the D&D campaign "' + campaign + '"' : '') + '. Write only a "### At a glance" heading and up to four bullets: '
    + '"**Who:**" people and creatures that appeared, "**Where:**" places, "**Loot:**", "**Open threads:**". Use only what is in the notes, leave out any bullet with nothing for it, and link a name as [[Exact Name]] only if it is on this list:\n'
    + (names.length ? names.map(x => '- ' + x).join('\n') : '(none)') + '\n\nReply with the markdown only.\n\n=== TIDIED NOTES ===\n' + tidy + '\n';
}

/* Claude's answer as markdown, or null when it is not usable: prose with no headings or bullets (a refusal, an apology), or far
   shorter than the notes it was given (`minLen`). A chatty first line ("Here is the tidy version:") is dropped. */
export function parseTidy(answer, minLen = 0) {
  let s = String(answer || '').trim().replace(/^```[a-z]*\s*\n/i, '').replace(/\n```\s*$/, '').trim();
  s = lf(s).replace(/^(here(?:'s| is| are)\b[^\n]*|sure[^\n]*|certainly[^\n]*|of course[^\n]*)\n+/i, '');
  s = s.replace(/^#{1,2}\s+(Session notes|Tidy(ied)? notes)\s*\n+/i, '');
  if (s.length < 12 || s.length < minLen) return null;
  if (!/^\s*(#{1,6}\s|[-*+]\s|\d+[.)]\s)/m.test(s)) return null;
  return s;
}

/* ---------- the check: nothing lost, nothing made up, no secret moved ---------- */
const TIME = /\b\d{1,2}:\d{2}\b/g;
const STD_TAGS = new Set(['reveal', 'loot', 'decision', 'ruling', 'promise', 'hook', 'spotlight']);
const unbracket = t => t.replace(/\[\[([^\]|#]+)(?:#[^\]|]*)?(?:\|([^\]]*))?\]\]/g, (m, a, b) => a + (b ? ' ' + b : ''));
const WORD = /[A-Za-z][A-Za-z'’-]{2,}/g;
const TITLES = new Set(['the', 'old', 'lord', 'lady', 'captain', 'brother', 'sister', 'father', 'mother', 'house', 'order', 'dame', 'king', 'queen', 'prince', 'princess', 'city', 'town', 'village', 'guild', 'court', 'company', 'circle', 'league', 'young', 'great', 'little', 'big']);
/* a typed line that is meant for the DM only: "Secret: ...", "DM note: ...", #secret (after a time or a bullet) */
const SECRETY = /^\s*(?:[-*+]\s+)?(?:\[[ xX]\]\s+)?(?:\d{1,2}:\d{2}\s+)?(?:\*\*)?(?:secret|dm|gm|dm\s+note|gm\s+note|clue)s?(?:\*\*)?\s*:|(?:^|\s)#(?:secret|dm|gm)\b/i;

function factsOf(textIn, entities = []) {
  const text = lf(textIn);
  const links = new Set(), nums = new Set(), names = new Set(), tags = new Set(), ents = new Set();
  for (const m of text.matchAll(/\[\[([^\]|#]+)/g)) links.add(m[1].trim().toLowerCase());
  const plain = unbracket(text).replace(TIME, ' ').replace(/<!--[\s\S]*?-->/g, ' ');
  for (const raw of plain.split('\n')) {
    if (/^\s*#{1,6}\s/.test(raw)) continue;                                      // headings are written by the tidy
    const l = raw.replace(/^\s*(?:>\s*)*(?:[-*+]\s+(?:\[[ xX]\]\s+)?|\d+[.)]\s+)?/, '').replace(/\*\*[^*]{1,30}:\*\*\s*/g, '');
    for (const m of l.matchAll(/(?<![\w.])\d+(?:[.,]\d+)*/g)) nums.add(m[0].replace(/,/g, ''));
    let prevEnd = true;
    for (const w of l.matchAll(/[A-Za-z][A-Za-z'’-]*|[.!?:;"“(]/g)) {
      const t = w[0].replace(/['’]s$/i, '');                                   // Wren's is Wren
      if (/^[.!?:;"“(]$/.test(t)) { prevEnd = true; continue; }
      if (!prevEnd && /^[A-Z][a-z'’-]{2,}$/.test(t)) names.add(t.toLowerCase());
      prevEnd = false;
    }
    for (const m of l.matchAll(/(?:^|[\s(])#([A-Za-z][\w/-]*)/g)) if (!STD_TAGS.has(m[1].toLowerCase())) tags.add(m[1].toLowerCase());
  }
  const low = plain.toLowerCase();
  const words = new Set(low.match(/[a-z][a-z'’-]+/g) || []);
  for (const e of entities) {
    const el = e.toLowerCase();
    if (el.length > 2 && low.includes(el)) { ents.add(el); continue; }
    // "Mireille" for "Mireille Vane": a word of the name that is long enough and not a title
    if (el.split(/\s+/).some(w => w.length >= 4 && !TITLES.has(w) && words.has(w))) ents.add(el);
  }
  return { links, nums, names, tags, ents };
}

/* material = the notes as typed (what Claude was given); output = the tidy version plus the promise and hook lines the app keeps */
export function checkFidelity(material, output, entities = []) {
  const a = factsOf(material, entities), b = factsOf(output, entities);
  const miss = (x, y) => [...x].filter(v => !y.has(v));
  const known = new Set();
  for (const e of entities) for (const w of e.toLowerCase().match(WORD) || []) known.add(w);
  // a name or number is only "missing" if it is nowhere in the output, even inside a link
  const outText = unbracket(lf(output)).toLowerCase();
  const missing = {
    numbers: miss(a.nums, b.nums),
    names: miss(a.names, b.names).filter(n => !outText.includes(n)),
    links: miss(a.links, b.links).filter(n => !outText.includes(n)),
    tags: miss(a.tags, b.tags),
    entities: miss(a.ents, b.ents).filter(n => !outText.includes(n)),
  };
  // a word that is in the notes in any case ("arcana", written "Arcana" by the tidy version) was not made up
  const matWords = new Set((unbracket(lf(material)).toLowerCase().match(/[a-z][a-z'’-]+/g) || []).map(w => w.replace(/['’]s$/, '')));
  const added = {
    numbers: miss(b.nums, a.nums),
    names: miss(b.names, a.names).filter(n => !known.has(n) && !matWords.has(n)),
  };
  const hard = missing.numbers.length + missing.names.length + missing.links.length + missing.entities.length;
  return { missing, added, hard, addedCount: added.numbers.length + added.names.length };
}

/* a secret that has moved into the part players would see: anything the player-safe copy of the notes removed that the player-safe copy of the tidy version still shows */
export function secretLeaks(material, tidy) {
  const lines = toMaterial(material).split('\n').filter(l => l.trim());
  const safeOrig = lf(playerSafe(toMaterial(material), '', { plainLinks: false }).text);
  const safeSet = new Set(safeOrig.split('\n').map(l => l.trim()));
  const secretLines = lines.filter(l => (!safeSet.has(l.trim()) || SECRETY.test(l)) && !/^##\s/.test(l));
  if (!secretLines.length) return [];
  const safeTidy = lf(playerSafe(tidy, '', { plainLinks: false }).text).toLowerCase();
  const openFacts = factsOf(safeOrig.split('\n').filter(l => !SECRETY.test(l)).join('\n'));
  const out = [];
  for (const l of secretLines) {
    const f = factsOf(l);
    const key = [...f.nums, ...f.names].filter(t => !openFacts.nums.has(t) && !openFacts.names.has(t));
    const hit = key.filter(t => new RegExp('\\b' + t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\b').test(safeTidy));
    if (key.length && hit.length === key.length) out.push(oneLine(l).slice(0, 120));
  }
  return out;
}

/* ---------- without Claude: formatting only, no rewording ---------- */
export function plainTidy(material) {
  const text = toMaterial(material);
  const loose = [], log = [], secrets = [];
  for (const raw of text.split('\n')) {
    if (SECRETY.test(raw) && !/^\s*[-*]\s+\[[ xX]\]/.test(raw)) { secrets.push(raw.replace(/^\s*[-*+]\s+/, '- ').trimEnd()); continue; }
    const m = /^\s*[-*]\s+(?:\[[ xX]\]\s+)?(?:(\d{1,2}:\d{2})\s+)?(.*)$/.exec(raw);
    const isLog = m && /^\s*[-*]\s+(?:\[[ xX]\]\s+)?\d{1,2}:\d{2}\s/.test(raw);
    if (isLog) {
      if (/^\s*[-*]\s+\[[ xX]\]/.test(raw)) continue;                          // promises and hooks stay as tasks
      const e = parseLog(LOG_START + '\n' + raw + '\n' + LOG_END)[0];
      if (!e) { loose.push(raw); continue; }
      const tag = e.tags.find(t => STD_TAGS.has(t) && t !== 'promise' && t !== 'hook');
      log.push('- ' + (e.time ? e.time + ' ' : '') + (tag ? '**' + tag[0].toUpperCase() + tag.slice(1) + ':** ' : '') + e.text);
    } else if (raw.trim() || (loose.length && loose[loose.length - 1].trim())) loose.push(raw);
  }
  const free = reformatBody(loose.join('\n').replace(/^\s+|\s+$/g, '')).body.trim();
  const parts = [];
  if (log.length) parts.push('### Timeline\n' + log.join('\n'));
  if (free) parts.push(log.length ? '### Other notes\n' + free : free);
  if (secrets.length) parts.push('### Secrets (DM only)\n' + secrets.join('\n'));
  return parts.join('\n\n').trim() || '';
}

/* ---------- writing it into the note ---------- */
const tasksOf = body => parseLog(lf(body)).filter(e => e.task);

/* body + the tidy markdown -> the new body (or null when there is nothing chosen). `ids` are the sections that were tidied, `material` is
   the text Claude was given. Anything typed in those sections after that (while Claude was working) is kept, and added to the end of
   the tidy version. Everything outside the tidied sections is left exactly as it was, spaces and all. */
export function applyTidy(bodyIn, { tidy, ids, material, today }) {
  const eol = detectEol(bodyIn);
  const body = lf(bodyIn);
  const { segments } = splitSession(body);
  const chosen = segments.filter(s => ids.includes(s.id) && !s.empty && (s.kind === 'log' || s.kind === 'notes' || s.kind === 'other'));
  if (!chosen.length) return null;
  const seen = new Set(toMaterial(material).split('\n').map(same).filter(Boolean));
  const mat = buildMaterial(body, ids);
  const late = toMaterial(mat.raw).split('\n').filter(l => l.trim() && !/^##\s/.test(l) && !seen.has(same(l)) && !/^\s*[-*+]\s+\[[ xX]\]\s/.test(l));
  const tidyFull = tidy.replace(/\s+$/, '') + (late.length ? '\n\n### Added while tidying\n' + late.join('\n') : '');
  // the promises and hooks of the log being tidied, as they are now (ticks made meanwhile are kept)
  const taskLines = [], seenTask = new Set();
  for (const s of chosen.filter(x => x.kind === 'log')) for (const e of tasksOf(s.raw)) { const k = same(e.raw); if (!seenTask.has(k)) { seenTask.add(k); taskLines.push(e.raw.replace(/\s+$/, '')); } }
  const tidySec = '## ' + TIDY_HEADING + '\n' + TIDY_START + '\n' + tidyFull.trim() + '\n' + TIDY_END + '\n';
  const tasksSec = taskLines.length ? '## ' + TASKS_HEADING + '\n' + LOG_START + '\n' + taskLines.join('\n') + '\n' + LOG_END + '\n' : '';
  const drop = new Set(chosen.map(s => s.id));
  for (const s of segments) if (s.raw.includes(TIDY_START)) drop.add(s.id);        // an earlier tidy is replaced
  const firstAt = segments.findIndex(s => drop.has(s.id));
  const pieces = [];
  segments.forEach((s, i) => {
    if (i === firstAt) { pieces.push(tidySec); if (tasksSec) pieces.push(tasksSec); }
    if (!drop.has(s.id)) pieces.push(s.raw);
  });
  let result = pieces.join('\n').replace(new RegExp(ORIG_RE.source, 'g'), '').replace(/\s+$/, '');
  result += '\n\n' + originalBlock(mat.raw, today) + '\n';
  return result.replace(/\n/g, eol);
}

/* put the notes back as they were typed; the tidy version is removed, and ticks made since carry back into the restored lines */
export function restoreOriginal(bodyIn) {
  const eol = detectEol(bodyIn);
  const body = lf(bodyIn);
  const orig = getOriginal(body);
  if (!orig) return null;
  const { segments } = splitSession(body);
  const tidyAt = segments.findIndex(s => s.raw.includes(TIDY_START));
  const next = tidyAt >= 0 ? segments[tidyAt + 1] : null;
  const tasksAt = next && next.kind === 'log' && /^promises and hooks$/i.test(next.heading || '') ? tidyAt + 1 : -1;
  const ticks = new Map();
  if (tasksAt >= 0) for (const e of tasksOf(segments[tasksAt].raw)) ticks.set(e.text, e.done);
  const restored = orig.raw.replace(/\n+$/, '').split('\n').map(l => {
    const m = /^(\s*[-*]\s+)\[([ xX])\](.*)$/.exec(l);
    if (!m) return l;
    const e = parseLog(LOG_START + '\n' + l + '\n' + LOG_END)[0];
    return e && ticks.has(e.text) ? m[1] + '[' + (ticks.get(e.text) ? 'x' : ' ') + ']' + m[3] : l;
  }).join('\n') + '\n';
  const pieces = [];
  let placed = false;
  segments.forEach((s, i) => {
    if (i === tidyAt) { pieces.push(restored); placed = true; return; }
    if (i === tasksAt) return;
    pieces.push(s.raw);
  });
  if (!placed) pieces.push(restored);
  const result = pieces.join('\n').replace(new RegExp(ORIG_RE.source, 'g'), '').replace(/\s+$/, '') + '\n';
  return result.replace(/\n/g, eol);
}
