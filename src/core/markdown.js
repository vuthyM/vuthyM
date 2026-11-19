import { splitFrontmatter, scalarize, detectEol } from './frontmatter.js';
import { stem, escapeRe } from './util.js';

/* the notes as typed that Tidy notes keeps in a comment are not read for links, tags or fields: they would count everything twice */
export const stripOriginal = t => t.replace(/<!-- dmforge:original[^\n]*\n[\s\S]*?-->/g, ' ');
const stripCode = t => stripOriginal(t).replace(/```[\s\S]*?```/g, ' ').replace(/`[^`\n]*`/g, ' ');

const WL = /(!?)\[\[([^\]|#^]+?)(#[^\]|]*)?(?:\|([^\]]*))?\]\]/g;
export function extractLinks(text) {
  const out = [];
  const t = stripCode(text);
  let m;
  WL.lastIndex = 0;
  while ((m = WL.exec(t))) out.push({ embed: !!m[1], target: m[2].trim(), alias: m[4] || '' });
  return out;
}

export function fmStrings(fm) {
  const out = [];
  for (const v of Object.values(fm || {})) {
    const s = scalarize(v);
    if (Array.isArray(s)) out.push(...s); else out.push(s);
  }
  return out;
}

export function extractTags(body, fm) {
  const set = new Set();
  const t = stripCode(body);
  const re = /(?:^|[\s(])#([A-Za-z][\w/-]*)/g;
  let m;
  while ((m = re.exec(t))) set.add(m[1]);
  const ft = fm && (fm.tags ?? fm.tag);
  if (ft) {
    const arr = Array.isArray(ft) ? ft : String(ft).split(/[,\s]+/);
    arr.forEach(x => { x = String(x).replace(/^#/, '').trim(); if (x) set.add(x); });
  }
  return [...set];
}

/* Dataview-style "Key:: value" and "**Key:** value" lines. First occurrence wins. */
export function extractInline(body) {
  const out = {};
  const t = stripCode(body);
  for (const line of t.split(/\r?\n/)) {
    let m = line.match(/^\s*(?:[-*]\s+)?\*\*([^*:\n]{1,40}?):?\*\*:?\s*(.+)$/);
    if (!m) m = line.match(/^\s*(?:[-*]\s+)?([A-Za-z][\w ]{0,30}?)::\s*(.+)$/);
    if (m) {
      const k = m[1].trim().toLowerCase();
      if (out[k] === undefined) out[k] = m[2].trim();
    }
  }
  return out;
}

export function firstHeading(body) {
  const m = body.match(/^#\s+(.+?)\s*#*\s*$/m);
  return m ? m[1].trim() : '';
}

export function summarize(body, max = 160) {
  for (const raw of body.split(/\r?\n\r?\n|\r?\n(?=#)/)) {
    const lines = raw.split(/\r?\n/).filter(l => l.trim() && !/^#{1,6}\s/.test(l) && !/^\s*[-*]\s/.test(l) && !/^\s*(\*\*[^*]+\*\*|[A-Za-z][\w ]{0,30}::)/.test(l) && !/^<!--/.test(l) && !/^---+$/.test(l) && !/^>/.test(l) && !/^\|/.test(l));
    if (!lines.length) continue;
    const s = lines.join(' ').replace(/!?\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g, (_, a, b) => b || a).replace(/\[([^\]]+)\]\([^)]*\)/g, '$1').replace(/[*_`~]/g, '').replace(/\s+/g, ' ').trim();
    if (s) return s.length > max ? s.slice(0, max - 1) + '…' : s;
  }
  return '';
}

export function parseNote(path, text) {
  const sp = splitFrontmatter(text);
  const body = sp.body;
  const links = new Set();
  extractLinks(body).forEach(l => { if (!l.embed) links.add(l.target); });
  fmStrings(sp.fm).forEach(s => extractLinks(s).forEach(l => { if (!l.embed) links.add(l.target); }));
  const name = stem(path);
  return {
    path, name, text,
    hasFm: sp.hasFm, fm: sp.fm, fmError: sp.error, body,
    inline: extractInline(body),
    links: [...links],
    tags: extractTags(body, sp.fm),
    summary: summarize(body),
    title: firstHeading(body) || name,
  };
}

/* ---- section / block helpers (used when the app appends to a note) ---- */
export function appendToSection(body, heading, md, level = 2) {
  const eol = detectEol(body);
  const lines = body.split(/\r?\n/);
  const hashes = '#'.repeat(level);
  const hRe = new RegExp('^' + hashes + '\\s+' + escapeRe(heading) + '\\s*$', 'i');
  const idx = lines.findIndex(l => hRe.test(l));
  const mdLines = md.replace(/\s+$/, '').split(/\r?\n/);
  if (idx < 0) {
    const trimmed = body.replace(/\s+$/, '');
    return (trimmed ? trimmed + eol + eol : '') + hashes + ' ' + heading + eol + eol + mdLines.join(eol) + eol;
  }
  const stopRe = new RegExp('^#{1,' + level + '}\\s');
  let end = lines.length;
  for (let i = idx + 1; i < lines.length; i++) { if (stopRe.test(lines[i])) { end = i; break; } }
  const section = lines.slice(idx + 1, end);
  while (section.length && !section[section.length - 1].trim()) section.pop();
  const head = lines.slice(0, idx + 1);
  const tail = lines.slice(end);
  const out = [...head, ...section, '', ...mdLines];
  if (tail.length) out.push('', ...tail); else out.push('');
  return out.join(eol);
}

export function upsertBlock(body, id, md, opts = {}) {
  const eol = detectEol(body);
  const start = '<!-- dmforge:' + id + ' -->';
  const end = '<!-- /dmforge:' + id + ' -->';
  const block = start + eol + md.trim() + eol + end;
  const si = body.indexOf(start);
  const ei = body.indexOf(end);
  if (si >= 0 && ei > si) return body.slice(0, si) + block + body.slice(ei + end.length);
  if (opts.heading) return appendToSection(body, opts.heading, block, opts.level || 2);
  return body.replace(/\s+$/, '') + eol + eol + block + eol;
}
