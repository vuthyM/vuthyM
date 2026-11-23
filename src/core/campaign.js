import { pool, basename, ext, stem, join, sanitizeName } from './util.js';
import { parseNote } from './markdown.js';
import { TYPES, OTHER, getField, fieldDefs, typeInfo } from './schema.js';

/* Reads every file in the campaign folder (recursively, skipping dot-folders). */
export async function loadCampaign(vault, path, onProgress) {
  if (vault.beginBulk) await vault.beginBulk();
  try { return await readCampaign(vault, path, onProgress); }
  finally { if (vault.endBulk) vault.endBulk(); }
}

async function readCampaign(vault, path, onProgress) {
  const files = [];
  const md = [];
  const dirs = [];
  async function walk(dir) {
    const ents = await vault.list(dir);
    for (const e of ents) {
      if (e.name.startsWith('.')) continue;
      const p = dir ? dir + '/' + e.name : e.name;
      if (e.kind === 'dir') { dirs.push(p); await walk(p); }
      else { files.push(p); if (/\.md$/i.test(e.name)) md.push(p); }
    }
  }
  await walk(path);
  const texts = new Map();
  let done = 0;
  await pool(md, 12, async p => {
    texts.set(p, await vault.readText(p));
    if (onProgress) onProgress(++done, md.length);
  });
  return { path, files, texts, dirs };
}

export function topFolderOf(path, base) {
  const rel = path.slice(base.length + 1);
  const i = rel.indexOf('/');
  return i < 0 ? '' : rel.slice(0, i);
}

export function topFolders(files, base, dirs = []) {
  const set = new Set();
  for (const p of files) { const t = topFolderOf(p, base); if (t) set.add(t); }
  for (const d of dirs) { const rel = d.slice(base.length + 1); if (d.startsWith(base + '/') && rel && rel.indexOf('/') < 0) set.add(rel); }
  return [...set].sort((a, b) => a.localeCompare(b));
}

const parseCache = new Map();
function parsed(path, text) {
  const c = parseCache.get(path);
  if (c && c.text === text) return c.note;
  const note = parseNote(path, text);
  parseCache.set(path, { text, note });
  return note;
}

const dateRe = /(\d{4}-\d{2}-\d{2})/;
function sessionMeta(n) {
  const fmDate = n.fm && n.fm.date != null ? String(n.fm.date).slice(0, 10) : '';
  const date = /^\d{4}-\d{2}-\d{2}$/.test(fmDate) ? fmDate : ((n.name.match(dateRe) || [])[1] || '');
  let num = n.fm && n.fm.number != null ? Number(n.fm.number) : NaN;
  if (!Number.isFinite(num)) { const m = n.name.match(/\b(?:session|episode|ep|chapter|part)\.?\s*#?\s*(\d+)/i); num = m ? Number(m[1]) : NaN; }
  return { date, num: Number.isFinite(num) ? num : null };
}

/* The number to offer for a new session: one more than the number of sessions in the folder, and never
   lower than the highest number already used (so a gap or a numbered "Episode 12" still moves it on). */
export function suggestSessionNumber(sessions) {
  const highest = sessions.reduce((m, n) => Math.max(m, n.snum || 0), 0);
  return Math.max(sessions.length, highest) + 1;
}

/* What to call a session: "Session", "Episode", "Chapter" or "Part". It follows the folder's name
   ("Episodes" gives Episode), else whichever word the existing notes use most, else Session. */
const WORDS = ['Session', 'Episode', 'Chapter', 'Part'];
export function sessionWord(sessions, folderName) {
  const f = String(folderName || '').toLowerCase().replace(/[^a-z]+/g, ' ');
  for (const w of WORDS) if (new RegExp('\\b' + w.toLowerCase() + 's?\\b').test(f)) return w;
  const count = new Map();
  for (const n of sessions) { const m = n.name.match(/\b(session|episode|chapter|part)\.?\s*#?\s*\d+/i); if (m) { const w = WORDS.find(x => x.toLowerCase() === m[1].toLowerCase()); count.set(w, (count.get(w) || 0) + 1); } }
  let best = 'Session', bc = 0;
  for (const w of WORDS) if ((count.get(w) || 0) > bc) { best = w; bc = count.get(w); }
  return best;
}

export function buildIndex({ campaign, mapping, working, files }) {
  const base = campaign.path;
  const notes = [];
  for (const p of working.paths()) {
    if (!/\.md$/i.test(p)) continue;
    const text = working.get(p);
    const top = topFolderOf(p, base);
    const n = Object.assign({}, parsed(p, text));
    n.top = top;
    n.rel = p.slice(base.length + 1);
    n.type = top === '' ? 'root' : (mapping[top] || OTHER);
    const pend = working.pending.get(p);
    n.pending = pend ? pend.kind : null;
    if (n.type === 'session') Object.assign(n, { sdate: '', snum: null }, (() => { const m = sessionMeta(n); return { sdate: m.date, snum: m.num }; })());
    notes.push(n);
  }
  const byPath = new Map(notes.map(n => [n.path, n]));
  const byName = new Map();
  for (const n of notes) {
    const k = n.name.toLowerCase();
    if (!byName.has(k)) byName.set(k, []);
    byName.get(k).push(n);
  }
  const byType = {};
  for (const n of notes) (byType[n.type] = byType[n.type] || []).push(n);
  for (const t of Object.keys(byType)) {
    byType[t].sort(t === 'session'
      ? (a, b) => (b.sdate || '').localeCompare(a.sdate || '') || (b.snum || 0) - (a.snum || 0) || b.name.localeCompare(a.name)
      : (a, b) => a.name.localeCompare(b.name));
  }
  const resolve = target => {
    const t = String(target).split('/').pop().replace(/\.md$/i, '').toLowerCase().trim();
    const c = byName.get(t);
    return c ? c[0] : null;
  };
  const backlinks = new Map();
  for (const n of notes) {
    for (const l of n.links) {
      const r = resolve(l);
      if (r && r.path !== n.path) {
        if (!backlinks.has(r.path)) backlinks.set(r.path, []);
        const arr = backlinks.get(r.path);
        if (!arr.includes(n)) arr.push(n);
      }
    }
  }
  const assetIndex = new Map();
  for (const f of files) assetIndex.set(basename(f).toLowerCase(), f);
  const findAsset = name => assetIndex.get(String(name).split('/').pop().toLowerCase()) || null;
  return { notes, byPath, byName, byType, resolve, backlinks, findAsset };
}

/* where a new note of this type should live */
export function folderFor(type, mapping) {
  for (const [folder, t] of Object.entries(mapping)) if (t === type) return folder;
  const i = typeInfo(type);
  return i ? i.folder : '';
}
/* sub: an optional folder inside the category's folder ("Villains" puts the note in NPCs/Villains) */
export function newNotePath(campaign, mapping, type, name, working, sub) {
  const folder = folderFor(type, mapping);
  const clean = sanitizeName(name) || 'Untitled';
  const subClean = String(sub || '').split(/[\\/]/).filter(x => x.trim() && !x.trim().startsWith('.')).map(sanitizeName).filter(Boolean).join('/');   // never '..' or a hidden folder
  const dir = join(campaign.path, folder, subClean);
  // two names that differ only in capitals are one file on a Mac, so they count as taken
  const key = x => x.normalize('NFC').toLowerCase();
  const taken = new Set(working.paths().map(key));
  let p = join(dir, clean + '.md');
  for (let i = 2; taken.has(key(p)) && i < 200; i++) p = join(dir, clean + ' ' + i + '.md');
  return { path: p, folder, isNewFolder: !(folder in mapping) };
}

/* Search across name, properties and body. */
export function search(index, query, limit = 30) {
  const q = String(query || '').toLowerCase().trim();
  if (!q) return [];
  const terms = q.split(/\s+/);
  const out = [];
  for (const n of index.notes) {
    let score = 0;
    const name = n.name.toLowerCase();
    const body = n.body.toLowerCase();
    const fmText = Object.values(n.fm || {}).map(v => JSON.stringify(v)).join(' ').toLowerCase();
    let all = true;
    for (const t of terms) {
      let s = 0;
      if (name === t) s += 10; else if (name.startsWith(t)) s += 6; else if (name.includes(t)) s += 4;
      if (fmText.includes(t)) s += 2;
      if (body.includes(t)) s += 1;
      if (!s) { all = false; break; }
      score += s;
    }
    if (!all) continue;
    let snippet = '';
    const bi = body.indexOf(terms[0]);
    if (bi >= 0) snippet = n.body.slice(Math.max(0, bi - 40), bi + 90).replace(/\s+/g, ' ').trim();
    out.push({ note: n, score, snippet });
  }
  out.sort((a, b) => b.score - a.score || a.note.name.localeCompare(b.note.name));
  return out.slice(0, limit);
}

export { getField, fieldDefs, stem, ext };
