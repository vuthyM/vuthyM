import { typeLabel } from './schema.js';

/* The campaign snapshot: one note that sums up the whole campaign (the premise and tone, where the story is, open threads, factions, key
   people, places, recent sessions, and the DM-only secrets in their own section). Claude writes it once from your notes; after that
   "use my campaign as inspiration" reads that one note instead of picking through the campaign. Nothing here talks to Claude: it builds the
   questions, reads the note, and says how far the campaign has moved on since it was made. */

export const SNAPSHOT_NOTE = 'Campaign Snapshot';
export const SECRETS_HEADING = 'Secrets (DM only)';
const OWN_NOTES = new Set(['Campaign Snapshot', 'Generator Tables', 'DM Cheat Sheet']);

/* a short fingerprint of a note's text (FNV-1a), to tell later whether it has changed */
export function fingerprint(text) {
  let h = 0x811c9dc5;
  const s = String(text == null ? '' : text);
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
  return h.toString(36);
}

/* the notes that make up the campaign, as the snapshot sees them (not the notes DM Forge writes for itself) */
export function snapshotNotes(idx, campaign) {
  const dir = campaign ? campaign.path + '/' : '';
  return idx.notes
    .filter(n => n.type !== 'map' && !OWN_NOTES.has(n.name) && !(dir && n.path.startsWith(dir + 'Custom tables/')))
    .map(n => ({ path: n.path, name: n.name, type: n.type, fm: n.fm || {}, body: String(n.body || '') }));
}

const PER_NOTE = 4000;                 // longer notes are cut: the start of a note says most about it
export function noteBlock(n) {
  const fm = Object.entries(n.fm || {}).filter(([k, v]) => v !== '' && v != null && !/^(tags?|aliases|cssclasses?)$/i.test(k))
    .map(([k, v]) => k + ': ' + (Array.isArray(v) ? v.join(', ') : typeof v === 'object' ? JSON.stringify(v) : v)).join('; ');
  let body = n.body.replace(/\r\n/g, '\n').replace(/<!--[\s\S]*?-->/g, '').replace(/\n{3,}/g, '\n\n').trim();
  const cut = body.length > PER_NOTE;
  if (cut) body = body.slice(0, PER_NOTE).replace(/\s+\S*$/, '') + '\n(the rest of this note is left out)';
  return '### ' + typeLabel(n.type) + ': ' + n.name + '\n' + (fm ? '(' + fm.slice(0, 300) + ')\n' : '') + body;
}

/* split the notes into requests small enough to send: one request for a campaign of normal size */
export const BATCH_CHARS = 45000;
export function planSnapshot(notes, limit = BATCH_CHARS) {
  const blocks = notes.map(noteBlock);
  const batches = [];
  let cur = [], size = 0;
  for (const b of blocks) {
    if (cur.length && size + b.length > limit) { batches.push(cur); cur = []; size = 0; }
    cur.push(b); size += b.length + 2;
  }
  if (cur.length) batches.push(cur);
  return { batches: batches.map(x => x.join('\n\n')), count: notes.length, chars: blocks.reduce((n, b) => n + b.length, 0) };
}

export const SNAPSHOT_SYSTEM = 'You summarise a Dungeons & Dragons campaign for its Dungeon Master, from the notes you are given. '
  + 'Use only what is in the notes: if something is not there, leave it out instead of inventing it. Be concrete and compact. Reply with the markdown only.';

const SECTIONS = ['Premise and tone', 'Where the story is now', 'Open threads', 'Factions', 'Key people', 'Places', 'Recent sessions', SECRETS_HEADING];
export const SECTION_LIST = SECTIONS;

function sectionsText(secrets) {
  const list = secrets ? SECTIONS : SECTIONS.filter(s => s !== SECRETS_HEADING);
  return list.map(s => '## ' + s).join('\n');
}
const GUIDE = 'Under "Factions", "Key people" and "Places" give one line each: **Name** (as [[Name]], so it links in Obsidian), then what matters about them. '
  + 'Under "Open threads" list each unresolved plot thread with where it stands. Under "Recent sessions" give the last few sessions, newest first, a line or two each. ';

/* one question for the whole campaign, or (for a big one) a question for each batch and then one to join them */
export function snapshotPrompt({ campaign, text, secrets = true, part = 0, parts = 1 }) {
  const name = campaign ? ' "' + campaign + '"' : '';
  const partial = parts > 1;
  return 'I am a Dungeon Master. Below ' + (partial ? 'are some of the notes' : 'are the notes') + ' of my D&D campaign' + name + (partial ? ' (part ' + (part + 1) + ' of ' + parts + ')' : '') + '.\n\n'
    + 'Write a campaign snapshot that I can give to an AI later, so it understands where my campaign is at. '
    + (partial ? 'Keep to about 900 words for this part. ' : 'About 1,500 words. ')
    + 'Use these headings, exactly, in this order:\n' + sectionsText(secrets) + '\n\n' + GUIDE
    + (secrets ? 'Put every hidden truth, secret plan and unrevealed fact in "' + SECRETS_HEADING + '" only, and keep them out of the other sections. ' : 'Leave out anything the players do not know yet. ')
    + 'Reply with only the markdown, starting at the first heading.\n\n---\n' + text + '\n---';
}
export function mergePrompt({ campaign, partials, secrets = true }) {
  const name = campaign ? ' "' + campaign + '"' : '';
  return 'I am a Dungeon Master. Here are ' + partials.length + ' partial snapshots of my D&D campaign' + name + ', each written from a different part of my notes.\n\n'
    + 'Join them into one campaign snapshot of about 1,500 words, with these headings, exactly, in this order:\n' + sectionsText(secrets) + '\n\n' + GUIDE
    + 'Combine the same headings from every part, remove repeats, and keep every name. '
    + (secrets ? 'Keep the hidden truths in "' + SECRETS_HEADING + '" only. ' : '')
    + 'Reply with only the markdown, starting at the first heading.\n\n' + partials.map((p, i) => '--- part ' + (i + 1) + ' ---\n' + p).join('\n\n');
}

/* ---- the note ---- */
const META = /<!--\s*dmf-snapshot:\s*(\{[\s\S]*?\})\s*-->/;
const clip = s => String(s || '').replace(/^```[a-z]*\s*/i, '').replace(/```\s*$/, '').trim();

/* Claude's answer, tidied: it must at least have some of the headings */
export function cleanSnapshot(answer) {
  let t = clip(answer);
  const first = t.search(/^##\s+/m);
  if (first > 0) t = t.slice(first);            // anything said before the first heading is dropped
  const found = SECTIONS.filter(s => new RegExp('^##\\s+' + s.replace(/[()]/g, '\\$&') + '\\s*$', 'mi').test(t));
  return { text: t, headings: found, ok: found.length >= 4 };
}

export function buildSnapshotNote({ body, notes, campaign, secrets, made = new Date() }) {
  const map = {};
  for (const n of notes) map[n.path] = fingerprint(n.name + '\n' + n.body);
  const meta = { made: made.toISOString(), notes: map, secrets: !!secrets };
  return '# ' + SNAPSHOT_NOTE + '\n\n*Made ' + made.toISOString().slice(0, 10) + ' by Claude from ' + notes.length + ' notes' + (campaign ? ' of ' + campaign : '') + '. Edit it freely: DM Forge reads this text when you ask it to use the snapshot. To bring it up to date, use Refresh in Menu, Settings.*\n\n'
    + '<!-- dmf-snapshot: ' + JSON.stringify(meta) + ' -->\n\n' + body.trim() + '\n';
}

export function parseSnapshot(text) {
  const t = String(text || '').replace(/\r\n/g, '\n');
  if (!t.trim()) return null;
  let meta = null;
  const m = t.match(META);
  if (m) { try { meta = JSON.parse(m[1]); } catch (e) { meta = null; } }
  const sections = {};
  let cur = null, fence = false;
  for (const line of t.split('\n')) {
    if (/^\s{0,3}(```|~~~)/.test(line)) fence = !fence;
    const h = !fence && line.match(/^##\s+(.+?)\s*#*\s*$/);
    if (h) { cur = h[1].trim(); sections[cur] = []; continue; }
    if (cur) sections[cur].push(line);
  }
  const out = {};
  for (const [k, v] of Object.entries(sections)) out[k] = v.join('\n').trim();
  return { meta, sections: out, text: t, made: meta && meta.made ? new Date(meta.made) : null };
}

/* the part of the snapshot to send as "about my campaign": its sections, without the note's own header, and without the secrets if asked */
export function snapshotContext(text, { secrets = true, max = 9500 } = {}) {
  const p = parseSnapshot(text);
  if (!p) return '';
  const parts = [];
  for (const [k, v] of Object.entries(p.sections)) {
    if (!v) continue;
    if (!secrets && k.toLowerCase().startsWith('secrets')) continue;
    parts.push('## ' + k + '\n' + v);
  }
  let out = parts.join('\n\n');
  if (out.length > max) out = out.slice(0, max - 1).replace(/\n[^\n]*$/, '') + '\n…';
  return out;
}

/* How far the campaign has moved since the snapshot was made. A note counts as changed when its fingerprint differs; new and
   removed notes count too. "Worth refreshing" when 5 or more notes are affected, or 15% of them, or any session note is among them. */
export function compareSnapshot(snap, notes) {
  if (!snap || !snap.meta || !snap.meta.notes) return null;
  const before = snap.meta.notes;
  const now = {};
  const byPath = {};
  for (const n of notes) { now[n.path] = fingerprint(n.name + '\n' + n.body); byPath[n.path] = n; }
  const changed = [], added = [], removed = [];
  for (const p of Object.keys(now)) { if (!(p in before)) added.push(p); else if (before[p] !== now[p]) changed.push(p); }
  for (const p of Object.keys(before)) if (!(p in now)) removed.push(p);
  const affected = changed.length + added.length + removed.length;
  const isSession = p => (byPath[p] && byPath[p].type === 'session') || /\/Sessions?\//i.test(p);
  const sessions = [...changed, ...added, ...removed].some(isSession);
  const total = Math.max(1, Object.keys(before).length);
  return { changed, added, removed, affected, sessions, total, worth: affected >= 5 || affected / total >= 0.15 || sessions };
}

/* "Made 4 days ago · 3 notes changed, 1 new" */
export function describeSnapshot(snap, cmp, now = Date.now()) {
  if (!snap) return '';
  const days = snap.made ? Math.floor((now - snap.made.getTime()) / 86400000) : null;
  const when = days == null ? 'Made earlier' : days <= 0 ? 'Made today' : days === 1 ? 'Made yesterday' : 'Made ' + days + ' days ago';
  if (!cmp) return when;
  const bits = [];
  if (cmp.changed.length) bits.push(cmp.changed.length + ' note' + (cmp.changed.length === 1 ? '' : 's') + ' changed');
  if (cmp.added.length) bits.push(cmp.added.length + ' new');
  if (cmp.removed.length) bits.push(cmp.removed.length + ' removed');
  return when + ' · ' + (bits.length ? bits.join(', ') : 'nothing has changed since');
}
