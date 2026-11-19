import { splitFrontmatter } from './frontmatter.js';
import { plainText } from './mentions.js';

/* "Where you left off" in a session note: after each change, remember where in the note it was (which line, under which
   heading, and a few words of it), so the DM can jump straight back. Pure functions; the app keeps the list per session. */

const lines = t => String(t).split(/\r?\n/);

/* what changed between two versions of a note: { line, snippet, section, kind }.
   `line` is the first changed line of the body (0-based, counted after the properties), kind is 'edit', 'added', 'removed'
   or 'properties'. Returns null when nothing changed. */
export function describeChange(before, after) {
  if (before === after) return null;
  const a = lines(before), b = lines(after);
  let first = 0;
  while (first < a.length && first < b.length && a[first] === b[first]) first++;
  let endA = a.length, endB = b.length;
  while (endA > first && endB > first && a[endA - 1] === b[endB - 1]) { endA--; endB--; }
  const fm = splitFrontmatter(after).prefix ? lines(splitFrontmatter(after).prefix).length - 1 : 0;
  if (first < fm) return { line: 0, snippet: 'Properties', section: '', kind: 'properties' };
  const added = endB - first, removed = endA - first;
  const kind = added > 0 && removed === 0 ? 'added' : added === 0 && removed > 0 ? 'removed' : 'edit';
  // the line to show: the first changed line that has words in it, else the first removed one
  let shown = '', at = Math.min(first, b.length - 1);
  for (let i = first; i < endB && !shown; i++) { shown = plainText(b[i]).trim(); if (shown) at = i; }
  if (!shown) for (let i = first; i < endA && !shown; i++) shown = plainText(a[i]).trim();
  const lineInBody = Math.max(0, at - fm);
  let section = '';
  for (let i = at; i >= fm; i--) {
    const m = b[i] !== undefined && b[i].match(/^\s{0,3}#{1,6}[ \t]+(.+?)[ \t]*#*[ \t]*$/);
    if (m) { section = plainText(m[1]).trim(); break; }
  }
  return { line: lineInBody, snippet: shown.length > 110 ? shown.slice(0, 109) + '…' : shown, section, kind };
}

/* add a change to a session's list (newest first). A change on the same line within `mergeMs` of the last one replaces it, so
   typing a sentence and then fixing a word is one entry, not five. */
export function addEntry(list, entry, keep = 20, mergeMs = 90000) {
  const out = (list || []).slice();
  const last = out[0];
  if (last && entry.ts - last.ts < mergeMs && last.line === entry.line && last.kind !== 'removed' && entry.kind !== 'removed') out[0] = entry;
  else out.unshift(entry);
  return out.slice(0, Math.max(1, keep));
}

/* a human sentence for when something happened */
export function timeAgo(ts, now = Date.now()) {
  const s = Math.max(0, Math.round((now - ts) / 1000));
  if (s < 45) return 'just now';
  const m = Math.round(s / 60);
  if (m < 60) return m + (m === 1 ? ' minute ago' : ' minutes ago');
  const h = Math.round(m / 60);
  if (h < 24) return h + (h === 1 ? ' hour ago' : ' hours ago');
  const d = Math.round(h / 24);
  if (d < 14) return d + (d === 1 ? ' day ago' : ' days ago');
  return new Date(ts).toISOString().slice(0, 10);
}
