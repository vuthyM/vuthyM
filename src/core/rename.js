/* Renaming a note: the file name, the title heading inside it, and every [[link]] that points at it (in the text and in properties),
   the way Obsidian does. Links are found by name, as everywhere in DM Forge, so [[Old]], [[Old|words]], [[Old#Heading]],
   [[folder/Old]] and ![[Old]] all follow. Nothing inside code is touched. */
import { codeMask } from './linkedit.js';
import { sanitizeName, dirname, join } from './util.js';
import { IMAGE_EXT } from './util.js';

const WL = /(!?)\[\[([^\]\n|#^]+?)([#^][^\]\n|]*)?(?:\|([^\]\n]*))?\]\]/g;
const isImage = t => IMAGE_EXT.includes(String(t).split('.').pop().toLowerCase());
const keyOf = t => String(t).trim().replace(/\.md$/i, '').split('/').pop().toLowerCase();

/* what you typed, made safe as a file name */
export function cleanName(raw) {
  const name = sanitizeName(String(raw ?? '')).replace(/[. ]+$/, '').replace(/^\.+/, '').trim();
  return name;
}

/* [[Old]] becomes [[New]] outside code; keepAlias makes [[Old]] into [[New|Old]] so the old words still show */
export function renameLinks(text, oldName, newName, { keepAlias = false } = {}) {
  const oldKey = String(oldName).trim().toLowerCase();
  const mask = codeMask(text);
  let count = 0;
  WL.lastIndex = 0;
  const out = text.replace(WL, (whole, bang, target, rest, alias, offset) => {
    if (mask[offset]) return whole;
    if (bang && isImage(target)) return whole;
    if (keyOf(target) !== oldKey) return whole;
    const parts = target.trim().split('/');
    const last = parts.pop();
    const md = /\.md$/i.test(last) ? '.md' : '';
    const shown = last.replace(/\.md$/i, '');
    count++;
    const al = alias !== undefined ? alias : (keepAlias ? shown : undefined);
    return bang + '[[' + [...parts, newName + md].join('/') + (rest || '') + (al !== undefined ? '|' + al : '') + ']]';
  });
  return { text: out, count };
}

/* the first "# Heading" of a note's text, and a copy with it changed */
export function headingOf(body) {
  const m = String(body).match(/^#[ \t]+(.+?)[ \t]*#*[ \t]*\r?$/m);
  return m ? m[1].trim() : '';
}
export function setHeading(body, title) {
  return String(body).replace(/^#[ \t]+(.+?)[ \t]*#*[ \t]*(\r?)$/m, (_, _t, cr) => '# ' + title + cr);
}

/* everything a rename would do, without doing it: { ok, error, newPath, edits: [{ path, text }], self, linkCount, noteCount } */
export function planRename({ idx, working, path, newName, title = null, updateLinks = true, keepAlias = false }) {
  const note = idx.byPath.get(path);
  if (!note) return { ok: false, error: 'That note is not there any more.' };
  const name = cleanName(newName);
  if (!name) return { ok: false, error: 'Type a name.' };
  const oldName = note.name;
  const newPath = join(dirname(path), name + '.md');
  const sameName = name === oldName;
  const sameTitle = title === null || title === undefined || title === headingOf(note.body || '');
  if (sameName && sameTitle) return { ok: false, error: '', nothing: true };
  if (!sameName) {
    if (name.toLowerCase() === oldName.toLowerCase()) return { ok: false, error: 'A name that only changes capital letters cannot be saved safely on a Mac (the file system treats them as the same file). Change another letter, or rename it in two steps.' };
    const clash = (idx.byName.get(name.toLowerCase()) || []).find(n => n.path !== path);
    if (clash) return { ok: false, error: 'There is already a note called “' + name + '” (' + clash.rel + '). Links find notes by name, so two notes cannot share one.' };
    if (working.has(newPath)) return { ok: false, error: 'There is already a file called “' + name + '.md” in that folder.' };
  }
  let selfText = working.get(path);
  let linkCount = 0;
  if (!sameName) { const r = renameLinks(selfText, oldName, name, { keepAlias }); selfText = r.text; linkCount += r.count; }
  if (!sameTitle) {
    const fm = /^---\r?\n[\s\S]*?\r?\n---\r?\n?/.exec(selfText);
    const head = fm ? fm[0] : '';
    selfText = head + setHeading(selfText.slice(head.length), String(title).replace(/\s+/g, ' ').trim());
  }
  const edits = [];
  if (!sameName && updateLinks) {
    for (const n of idx.notes) {
      if (n.path === path) continue;
      const t = working.get(n.path);
      if (t === undefined) continue;
      const r = renameLinks(t, oldName, name, { keepAlias });
      if (r.count) { edits.push({ path: n.path, text: r.text, count: r.count }); linkCount += r.count; }
    }
  }
  return { ok: true, error: '', newPath, oldName, newName: name, self: selfText, edits, linkCount, noteCount: edits.length, renamed: !sameName, retitled: !sameTitle };
}
