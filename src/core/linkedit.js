import { splitFrontmatter, patchFrontmatter, scalarize, replaceBody, detectEol } from './frontmatter.js';
import { appendToSection } from './markdown.js';
import { IMAGE_EXT } from './util.js';
import { TYPE_ORDER, isCustom, typeLabel } from './schema.js';

/* Editing [[links]] in a note's text: listing them, removing them (the words stay), and turning a
   selected word into a link. All of it works on the body only, never inside code, and never
   changes anything but the link itself. */

/* code blocks, inline code and comments: nothing in these is a link */
const CODE = [/```[\s\S]*?(?:```|$)|~~~[\s\S]*?(?:~~~|$)/g, /`[^`\n]+`/g, /<!--[\s\S]*?-->/g, /%%[\s\S]*?%%/g];
export function codeMask(body) {
  const m = new Uint8Array(body.length);
  for (const re of CODE) { re.lastIndex = 0; let x; while ((x = re.exec(body))) { m.fill(1, x.index, x.index + x[0].length); if (!x[0].length) re.lastIndex++; } }
  return m;
}

const WL = /(!?)\[\[([^\]\n|#^]+?)(?:[#^][^\]\n|]*)?(?:\|([^\]\n]*))?\]\]/g;
const isImage = target => IMAGE_EXT.includes(String(target).split('.').pop().toLowerCase());
const keyOf = t => String(t).trim().replace(/\.md$/i, '').split('/').pop().toLowerCase();

/* every link in the body, in order: { start, end, embed, target, alias, shown } */
export function bodyLinks(body) {
  const mask = codeMask(body);
  const out = [];
  WL.lastIndex = 0;
  let m;
  while ((m = WL.exec(body))) {
    if (mask[m.index]) continue;
    const target = m[2].trim();
    const alias = m[3] === undefined ? '' : m[3].trim();
    out.push({ start: m.index, end: m.index + m[0].length, embed: !!m[1], image: !!m[1] && isImage(target), target, alias, shown: alias || target.split('/').pop().replace(/\.md$/i, '') });
  }
  return out;
}

/* Replaces links with the words they showed. Which links:
     { path }               every link that points at the note with this path (needs index)
     { targetText, nth }    the nth link (0-based) written with this target, as the page shows them
   { targetText, all }    every link written with this target
   Embeds (![[...]]) are left alone. Returns { text, changed, count }. */
export function removeLinks(text, index, which) {
  const sp = splitFrontmatter(text);
  const links = bodyLinks(sp.body);
  const pick = new Set();
  if (which.path) {
    links.forEach((l, i) => { if (!l.embed && index) { const r = index.resolve(l.target); if (r && r.path === which.path) pick.add(i); } });
  } else {
    let seen = 0;
    const want = keyOf(which.targetText);
    links.forEach((l, i) => {
      if (l.image || keyOf(l.target) !== want) return;
      if (which.all) { if (!l.embed) pick.add(i); return; }
      if (seen++ === (which.nth || 0) && !l.embed) pick.add(i);
    });
  }
  if (!pick.size) return { text, changed: false, count: 0 };
  let out = '', at = 0;
  links.forEach((l, i) => { if (!pick.has(i)) return; out += sp.body.slice(at, l.start) + l.shown; at = l.end; });
  out += sp.body.slice(at);
  return { text: sp.prefix + out, changed: true, count: pick.size };
}

/* the [[link]] under a text position, if any (used by the editor's right-click) */
export function linkAt(body, pos) {
  return bodyLinks(body).find(l => pos >= l.start && pos <= l.end) || null;
}

/* ---------- selected words ---------- */
const WORD = ch => !!ch && /[\p{L}\p{N}]/u.test(ch);
/* offsets of every whole-word occurrence of `needle` in `body` that is plain text (not inside a link, code,
   a heading, a url, a tag...). `mask` is mentions.maskOf(body). */
export function plainOccurrences(body, needle, mask) {
  const out = [];
  if (!needle) return out;
  let from = 0, i;
  while ((i = body.indexOf(needle, from)) >= 0) {
    const e = i + needle.length;
    let clear = !WORD(body[i - 1]) && !WORD(body[e]);
    for (let j = i; clear && j < e; j++) if (mask[j]) clear = false;
    if (clear) out.push(i);
    from = i + 1;
  }
  return out;
}

/* a link as written for the words that were selected */
export function linkFor(targetName, shown, dest) {
  const t = dest || targetName;
  return shown === targetName && t === targetName ? '[[' + targetName + ']]' : '[[' + t + '|' + shown + ']]';
}

/* adds a name to a note's `aliases` property, so mentions written that way are found later */
export function addAliasToText(text, alias) {
  const sp = splitFrontmatter(text);
  const key = Object.keys(sp.fm).find(k => k.toLowerCase() === 'aliases') || Object.keys(sp.fm).find(k => k.toLowerCase() === 'alias') || 'aliases';
  const cur = sp.fm[key];
  let list = [];
  if (Array.isArray(cur)) list = cur.map(x => String(scalarize(x)));
  else if (cur) list = String(cur).split(',').map(x => x.trim()).filter(Boolean);
  if (list.some(a => a.toLowerCase() === alias.toLowerCase())) return text;
  return patchFrontmatter(text, { [key]: [...list, alias] });
}

/* Links to notes that never mention each other: adds `- [[Name]]` lines under a heading (default "Related",
   made if it is not there yet). Notes the text already links to are skipped.
   Returns { text, added: [names], already: [names] }. */
export function addLinksToText(text, targets, index, heading = 'Related') {
  const sp = splitFrontmatter(text);
  const linked = new Set();
  for (const l of bodyLinks(sp.body)) { if (l.embed) continue; const r = index.resolve(l.target); if (r) linked.add(r.path); }
  const added = [], already = [], lines = [];
  for (const t of targets) {
    if (linked.has(t.path)) { already.push(t.name); continue; }
    linked.add(t.path);
    const dup = (index.byName.get(t.name.toLowerCase()) || []).length > 1;
    lines.push('- [[' + (dup ? t.path.replace(/\.md$/i, '') + '|' + t.name : t.name) + ']]');
    added.push(t.name);
  }
  if (!lines.length) return { text, added, already };
  const h = String(heading || '').trim();
  const eol = detectEol(sp.body);
  const body = h ? appendToSection(sp.body, h, lines.join('\n'))
    : sp.body.replace(/\s+$/, '') + (sp.body.trim() ? eol + eol : '') + lines.join(eol) + eol;
  return { text: replaceBody(text, body), added, already };
}

/* The notes to choose from when adding links, grouped by category. The category that the most links in the vault
   point at comes first (ties follow the sidebar order); inside a group notes are A to Z, and sessions newest first.
   A search keeps only matching notes and drops groups with none. Returns [{ type, label, links, total, notes }]. */
export function groupForLinking(index, query = '', exclude = '') {
  const ql = String(query).trim().toLowerCase();
  const keyOf2 = t => (t === 'root' || t === 'other' ? 'other' : t);
  const kinds = [...new Set(index.notes.map(n => keyOf2(n.type)))];
  const rank = k => {
    const i = TYPE_ORDER.indexOf(k);
    if (i >= 0) return i;
    return k === 'other' ? 1e6 : 1000 + kinds.indexOf(k);
  };
  const groups = [];
  for (const k of kinds) {
    const all = k === 'other' ? [...(index.byType.root || []), ...(index.byType.other || [])].sort((a, b) => a.name.localeCompare(b.name)) : (index.byType[k] || []);
    const pool = all.filter(n => n.path !== exclude);
    if (!pool.length) continue;
    const links = all.reduce((sum, n) => sum + (index.backlinks.get(n.path) || []).length, 0);
    let notes = pool.filter(n => !ql || n.name.toLowerCase().includes(ql));
    if (ql && k !== 'session') notes = [...notes.filter(n => n.name.toLowerCase().startsWith(ql)), ...notes.filter(n => !n.name.toLowerCase().startsWith(ql))];
    if (!notes.length) continue;
    groups.push({ type: k, label: k === 'other' ? 'Other notes' : typeLabel(k), links, total: pool.length, notes });
  }
  return groups.sort((a, b) => b.links - a.links || rank(a.type) - rank(b.type));
}
