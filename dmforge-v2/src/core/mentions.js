import { splitFrontmatter, scalarize } from './frontmatter.js';
import { escapeRe } from './util.js';

/* Unlinked mentions, like Obsidian's: places where a note's text talks about another note
   (by its name, an alias, its acronym, the words an acronym stands for, even with typos)
   without a [[link]]. Used for link suggestions and for the graph's dashed lines.
   Nothing here changes a note; applyLinkToText does, and only when the user approves. */

const STOP = new Set(['of', 'the', 'and', 'a', 'an', 'in', 'on', 'to', 'for', 'at', 'by', 'from', 'with', 'de', 'la', 'le', 'du', 'von', 'van']);
const SUBJECT_PLAIN = new Set(['npc', 'player', 'location', 'faction', 'plot', 'item']);
const PERSON = new Set(['npc', 'player']);
const TITLES = new Set(['captain', 'lord', 'lady', 'sir', 'dame', 'king', 'queen', 'prince', 'princess', 'father', 'mother', 'brother', 'sister', 'master', 'mistress', 'doctor', 'mister', 'old', 'young', 'saint', 'baron', 'baroness', 'duke', 'duchess', 'count', 'countess', 'general', 'commander', 'sergeant', 'high', 'great', 'elder', 'grand', 'little', 'big', 'black', 'white', 'red']);

/* notes that other notes refer to by name (not sessions, maps or loose notes) */
export const isSubject = n => SUBJECT_PLAIN.has(n.type) || String(n.type).startsWith('x:');

const strip = s => String(s).toLowerCase().replace(/[’']/g, '');
export const norm = s => strip(s).replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
const isWordChar = ch => !!ch && /[\p{L}\p{N}]/u.test(ch);

/* ---------- which parts of a note's text may be turned into a link ---------- */
const TAG_RE = /(^|[\s(])#[\p{L}\p{N}_/-]+/gu;
const MASKS = [
  /```[\s\S]*?(?:```|$)|~~~[\s\S]*?(?:~~~|$)/g,      // code blocks
  /`[^`\n]+`/g,                                       // inline code
  /!?\[\[[^\]\n]*\]\]/g,                              // existing links and embeds
  /!?\[[^\]\n]*\]\([^)\n]*\)/g,                       // markdown links and images
  /https?:\/\/[^\s)>\]]+/g,                           // bare URLs
  /<!--[\s\S]*?-->/g, /%%[\s\S]*?%%/g,                // comments
  /<[^>\n]+>/g,                                       // html tags
  /^#{1,6}[ \t].*$/gm,                                // headings
  TAG_RE,                                             // #tags
];
export function maskOf(body) {
  const m = new Uint8Array(body.length);
  for (const re of MASKS) {
    re.lastIndex = 0;
    let x;
    while ((x = re.exec(body))) {
      const s = x.index + (re === TAG_RE ? x[1].length : 0);
      m.fill(1, s, x.index + x[0].length);
      if (!x[0].length) re.lastIndex++;
    }
  }
  return m;
}

const TOKEN = /[\p{L}\p{N}]+(?:['’][\p{L}\p{N}]+)*/gu;
const cache = new Map();
function textOf(note) {
  const hit = cache.get(note.path);
  if (hit && hit.src === note.body) return hit;
  const body = note.body;
  const mask = maskOf(body);
  const toks = [];
  TOKEN.lastIndex = 0;
  let m;
  while ((m = TOKEN.exec(body))) {
    if (mask[m.index]) continue;
    toks.push({ raw: m[0], n: strip(m[0]), start: m.index, end: m.index + m[0].length });
  }
  const info = { src: body, body, mask, toks };
  cache.set(note.path, info);
  return info;
}
const GAP = /^(?:[ \t]+|[ \t]*[-–—][ \t]*)$/;
const joined = (t, i, k) => { for (let j = i; j < i + k - 1; j++) if (!GAP.test(t.body.slice(t.toks[j].end, t.toks[j + 1].start))) return false; return true; };

/* ---------- the ways a note can be referred to ---------- */
const formCache = new Map();
const cleanName = name => String(name).replace(/\([^)]*\)/g, ' ').replace(/^\s*\d+\s*[-.)]\s*/, '').replace(/\s+/g, ' ').trim();
const initialsOf = words => words.map(w => w[0]).join('');
function derivedAcronyms(name) {
  const words = norm(cleanName(name)).split(' ').filter(Boolean);
  const sig = words.filter(w => !STOP.has(w));
  if (sig.length < 2) return [];
  const out = new Set();
  for (const ws of [words, sig]) { const a = initialsOf(ws).toUpperCase(); if (a.length >= 3 && a.length <= 6) out.add(a); }
  return [...out];
}
function aliasesOf(note) {
  const a = note.fm && (note.fm.aliases ?? note.fm.alias);
  if (!a) return [];
  const s = scalarize(a);
  return (Array.isArray(s) ? s : String(s).split(',')).map(x => String(x).trim()).filter(Boolean);
}
export function formsOf(note) {
  const hit = formCache.get(note.path);
  if (hit && hit.src === note.text) return hit.forms;
  const phrases = new Map();
  const addPhrase = (text, partial = false) => {
    const p = norm(text);
    if (p.length < 4 || STOP.has(p)) return;
    if (!phrases.has(p)) phrases.set(p, { text: String(text).trim(), partial });
  };
  const name = cleanName(note.name);
  addPhrase(name);
  if (/^the\s/i.test(name)) addPhrase(name.replace(/^the\s+/i, ''));
  for (const a of aliasesOf(note)) addPhrase(a);
  const acro = new Set();
  const nameTok = note.name.match(/\b[A-Z]{2,6}\b/g) || [];
  nameTok.forEach(t => acro.add(t));
  const acroIsName = nameTok.length > 0 && norm(name) === nameTok.join(' ').toLowerCase();
  if (!PERSON.has(note.type)) derivedAcronyms(note.name).forEach(t => acro.add(t));
  // "Acolytes of Solace (AOS)" in the note itself teaches the acronym and what it stands for
  const head = note.body.slice(0, 1500);
  for (const m of head.matchAll(/\(([A-Z]{2,6})\)/g)) {
    acro.add(m[1]);
    const before = norm(head.slice(Math.max(0, m.index - 80), m.index)).split(' ');
    for (let n = Math.min(before.length, m[1].length + 3); n >= m[1].length; n--) {
      const win = before.slice(before.length - n);
      if (initialsOf(win).toUpperCase() === m[1] && !STOP.has(win[0])) { addPhrase(win.join(' ')); break; }
    }
  }
  if (PERSON.has(note.type)) {
    const all = cleanName(note.name).split(' ');
    if (all.length >= 2) for (const w of all) if (w.length >= 4 && !STOP.has(w.toLowerCase()) && !TITLES.has(w.toLowerCase()) && /^[A-Z]/.test(w)) addPhrase(w, true);
  }
  const forms = { phrases: [...phrases].map(([p, v]) => ({ p, text: v.text, partial: v.partial, words: p.split(' ') })), acro: [...acro], acroIsName };
  formCache.set(note.path, { src: note.text, forms });
  return forms;
}

function within(a, b, max) {
  if (Math.abs(a.length - b.length) > max) return false;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    let rowMin = i;
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      if (cur[j] < rowMin) rowMin = cur[j];
    }
    if (rowMin > max) return false;
    prev = cur;
  }
  return prev[b.length] <= max;
}

/* the best place in `target`'s text that mentions the note with these forms and is not linked yet:
   { how, text, start, end, weight } (offsets into target.body) or null */
export function findMention(forms, target, { skipPartial } = {}) {
  const t = textOf(target);
  const toks = t.toks;
  const span = (i, k, how, weight) => ({ how, text: t.body.slice(toks[i].start, toks[i + k - 1].end), start: toks[i].start, end: toks[i + k - 1].end, weight });
  for (const f of forms.phrases) {            // 1. its name or an alias
    if (f.partial) continue;
    const k = f.words.length;
    for (let i = 0; i + k <= toks.length; i++) {
      let ok = true;
      for (let j = 0; j < k && ok; j++) {
        const w = f.words[j], x = toks[i + j].n;
        ok = x === w || (j === k - 1 && (x === w + 's' || x === w + 'es'));
      }
      if (ok && joined(t, i, k)) return span(i, k, 'name', 4);
    }
  }
  for (const a of forms.acro) {               // 2. its acronym, written in capitals
    for (let i = 0; i < toks.length; i++) if (toks[i].raw === a) return span(i, 1, 'acronym', 3.5);
  }
  if (forms.acroIsName) {                     // 3. the words an acronym-named note stands for ("acolytes of solace" for AOS)
    for (const a of forms.acro) {
      const need = a.toLowerCase();
      for (let k = need.length; k <= need.length + 2; k++) {
        for (let i = 0; i + k <= toks.length; i++) {
          const w = toks.slice(i, i + k).map(x => x.n);
          if (STOP.has(w[0]) || STOP.has(w[k - 1]) || initialsOf(w) !== need) continue;
          if (w.some(x => !STOP.has(x) && x.length < 4) || !joined(t, i, k)) continue;
          return span(i, k, 'expansion', 3);
        }
      }
    }
  }
  for (const f of forms.phrases) {            // 4. its name with a typo or two
    if (f.partial || f.p.length < 9 || f.words.length > 6) continue;
    const k = f.words.length, max = Math.max(1, Math.floor(f.p.length / 7));
    for (let i = 0; i + k <= toks.length; i++) {
      if (toks[i].n[0] !== f.p[0]) continue;
      const cand = toks.slice(i, i + k).map(x => x.n).join(' ');
      if (cand !== f.p && within(cand, f.p, max) && joined(t, i, k)) return span(i, k, 'fuzzy', 3);
    }
  }
  for (const f of forms.phrases) {            // 5. a first or last name, capitalised
    if (!f.partial || (skipPartial && skipPartial.has(f.p))) continue;
    for (let i = 0; i < toks.length; i++) if (toks[i].raw === f.text) return span(i, 1, 'partial', 1.5);
  }
  return null;
}

/* ---------- link suggestions ---------- */
export function linkText(matched, target, index) {
  const dup = (index.byName.get(target.name.toLowerCase()) || []).length > 1;
  const dest = dup ? target.path.replace(/\.md$/i, '') : target.name;
  return matched === target.name && !dup ? '[[' + target.name + ']]' : '[[' + dest + '|' + matched + ']]';
}
/* Markdown is noise in a preview: show the words, not the **, |, > [!callout] or ## around them. */
export function plainText(s) {
  return String(s)
    .replace(/!?\[\[(?:[^\]|]*\|)?([^\]]*)\]\]/g, '$1')
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/^[ \t]*>+[ \t]*(?:\[![\w-]+\][+-]?)?/gm, ' ')
    .replace(/^[ \t]*#{1,6}[ \t]+/gm, ' ')
    .replace(/^[ \t]*(?:[-*+]|\d+[.)])[ \t]+/gm, ' ')
    .replace(/\[![\w-]+\][+-]?/g, ' ')
    .replace(/(^|[\s(])[*_~]+(?=\S)|(?<=\S)[*_~]+(?=$|[\s).,;:!?])/g, '$1')
    .replace(/`+/g, '')
    .replace(/\s*\|\s*/g, ' · ')
    .replace(/(?:\s*·\s*)*(?:-{3,}|:?-{2,}:?)(?:\s*·\s*)*/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/^[\s·]+|[\s·]+$/g, '');
}
const clip = (s, n, fromEnd) => {
  if (s.length <= n) return s;
  const cut = fromEnd ? s.slice(s.length - n) : s.slice(0, n);
  return fromEnd ? '…' + cut.replace(/^\S*\s/, '') : cut.replace(/\s\S*$/, '') + '…';
};
/* a readable preview of the line (or table cell) a match is in, plus where in the note it is */
function snippet(body, start, end) {
  const ls = body.lastIndexOf('\n', start - 1) + 1;
  let le = body.indexOf('\n', end); if (le < 0) le = body.length;
  let from = ls, to = le, inTable = false;
  if (/^\s*\|/.test(body.slice(ls, le))) {            // a table row: show just the cell
    inTable = true;
    const p1 = body.lastIndexOf('|', start - 1), p2 = body.indexOf('|', end);
    from = Math.max(ls, p1 + 1); to = p2 < 0 || p2 > le ? le : p2;
  }
  const before = clip(plainText(body.slice(from, start)), 70, true);
  const after = clip(plainText(body.slice(end, to)), 70, false);
  let section = '';
  const heads = [...body.slice(0, start).matchAll(/^#{1,6}[ \t]+(.+?)[ \t]*#*[ \t]*$/gm)];
  if (heads.length) section = plainText(heads[heads.length - 1][1]);
  const lead = /\s$/.test(body.slice(from, start)) || !before ? ' ' : '';
  const trail = /^\s/.test(body.slice(end, to)) || !after ? ' ' : '';
  return { before: before ? before + lead : '', after: after ? trail + after : '', section, inTable };
}
const HOW = { name: 'its name', acronym: 'its acronym', expansion: 'the words an acronym stands for', fuzzy: 'its name, spelled a little differently', partial: 'a first or last name' };

/* Suggestions for the note being looked at, each one a link that could be added:
     { path, name, target, targetName, matched, link, how, before, after, reason, kind }
   `path` is the note that would be edited: another note that mentions this one ("in-other"),
   or this note, mentioning another ("in-this"). `declined` is a list of "path|target". */
export function suggestLinks(note, index, { declined = [], limit = 24 } = {}) {
  const skip = new Set(declined);
  const subjects = index.notes.filter(isSubject);
  const partialCount = new Map();
  for (const n of subjects) for (const f of formsOf(n).phrases) if (f.partial) partialCount.set(f.p, (partialCount.get(f.p) || 0) + 1);
  for (const n of subjects) for (const f of formsOf(n).phrases) if (!f.partial) partialCount.set(f.p, (partialCount.get(f.p) || 0) + 1);
  const skipPartial = new Set([...partialCount].filter(([, c]) => c > 1).map(([p]) => p));
  const out = [];
  const push = (editNote, target, m, kind) => {
    if (skip.has(editNote.path + '|' + target.path)) return;
    const { before, after, section, inTable } = snippet(editNote.body, m.start, m.end);
    out.push({ path: editNote.path, name: editNote.name, target: target.path, targetName: target.name, matched: m.text, link: linkText(m.text, target, index), how: m.how, weight: m.weight, before, after, section, inTable, kind, reason: m.how === 'name' ? '' : 'found by ' + HOW[m.how] });
  };
  if (isSubject(note)) {
    const forms = formsOf(note);
    const linkers = new Set((index.backlinks.get(note.path) || []).map(n => n.path));
    for (const x of index.notes) {
      if (x.path === note.path || linkers.has(x.path)) continue;
      const m = findMention(forms, x, { skipPartial });
      if (m) push(x, note, m, 'in-other');
    }
  }
  const linksOut = new Set(note.links.map(l => { const r = index.resolve(l); return r ? r.path : null; }));
  for (const n of subjects) {
    if (n.path === note.path || linksOut.has(n.path)) continue;
    const m = findMention(formsOf(n), note, { skipPartial });
    if (m) push(note, n, m, 'in-this');
  }
  return out.sort((a, b) => b.weight - a.weight || (a.kind === b.kind ? 0 : a.kind === 'in-other' ? -1 : 1) || a.name.localeCompare(b.name)).slice(0, limit);
}

/* Replaces the first unlinked occurrence of `matched` in the note text with `link`.
   Looked up again at approval time, so it still works if the note changed since. */
export function applyLinkToText(text, matched, link, nth = 0) {
  const sp = splitFrontmatter(text);
  const body = sp.body;
  const mask = maskOf(body);
  let from = 0, i, seen = 0, first = null;
  while ((i = body.indexOf(matched, from)) >= 0) {
    const e = i + matched.length;
    let clear = !isWordChar(body[i - 1]) && !isWordChar(body[e]);
    for (let j = i; clear && j < e; j++) if (mask[j]) clear = false;
    if (clear) {
      if (first === null) first = i;
      if (seen++ === nth) return { text: sp.prefix + body.slice(0, i) + link + body.slice(e), changed: true };
    }
    from = i + 1;
  }
  // the nth one is gone (the note changed): fall back to the first
  if (first !== null && nth > 0) return { text: sp.prefix + body.slice(0, first) + link + body.slice(first + matched.length), changed: true };
  return { text, changed: false };
}

/* Every unlinked mention across the campaign: [{ from, to }] meaning the note `from` talks about `to`.
   Async so a big vault does not freeze the page; `onProgress(done, total)` is optional. */
export async function allMentions(index, { onProgress, shouldStop } = {}) {
  const subjects = index.notes.filter(isSubject);
  const partialCount = new Map();
  for (const n of subjects) for (const f of formsOf(n).phrases) partialCount.set(f.p, (partialCount.get(f.p) || 0) + 1);
  const skipPartial = new Set([...partialCount].filter(([, c]) => c > 1).map(([p]) => p));
  const linked = new Set();
  for (const n of index.notes) for (const l of n.links) { const r = index.resolve(l); if (r) linked.add(n.path + '>' + r.path); }
  const out = [];
  let done = 0;
  for (const n of subjects) {
    const forms = formsOf(n);
    for (const x of index.notes) {
      if (x.path === n.path || linked.has(x.path + '>' + n.path)) continue;
      if (findMention(forms, x, { skipPartial })) out.push({ from: x.path, to: n.path });
    }
    done++;
    if (onProgress) onProgress(done, subjects.length);
    if (shouldStop && shouldStop()) break;
    if (done % 4 === 0) await new Promise(r => setTimeout(r, 0));
  }
  return out;
}
