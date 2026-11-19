/* "What am I forgetting?": worked out from the vault, with no Claude. A note counts as mentioned in a session when that session's note
   links to it or names it. Sessions are counted newest first, so "3 sessions ago" is the third newest session note. */
import { splitFrontmatter } from './frontmatter.js';
import { parseLog } from './sessionlog.js';
import { getSection } from './closeout.js';
import { getField, fieldDefs } from './schema.js';
import { upsertBlock } from './markdown.js';
import { secretsFrom } from './secrets.js';
import { spotlightStats } from './spotlight.js';
import { absentOf } from './party.js';

export const NEGLECT_CHOICES = [2, 3, 4, 5, 6];
export const NEGLECT_DEFAULT = 3;

const statusOf = (n, type) => {
  const f = fieldDefs(type).find(x => x.key === 'status');
  return f ? String(getField(n, f).value || '').trim() : '';
};

const isWord = c => !c || !/[\p{L}\p{N}_]/u.test(c);
function names(text, lower) {
  const t = lower;
  let at = t.indexOf(text);
  while (at >= 0) {
    if (isWord(t[at - 1]) && isWord(t[at + text.length])) return true;
    at = t.indexOf(text, at + 1);
  }
  return false;
}

/* the paths of the notes one session mentions */
export function mentionedPaths(idx, session, candidates) {
  const out = new Set();
  for (const l of session.links) { const r = idx.resolve(l); if (r) out.add(r.path); }
  const lower = (session.body || '').toLowerCase();
  for (const c of candidates) {
    if (out.has(c.path) || c.name.length < 4) continue;
    if (names(c.name.toLowerCase(), lower)) out.add(c.path);
  }
  return out;
}

function nextStep(note) {
  const sec = getSection(note.body || '', 'Next steps') || getSection(note.body || '', 'Next');
  const m = /^\s*[-*]\s+(?:\[[ xX]\]\s+)?(.+)$/m.exec(sec);
  return m ? m[1].replace(/\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g, (_, a, b) => b || a).trim() : '';
}

const MUST = /^>\s*[-*]\s+\[( |x|X)\]\s+(.+?)\s*$/;
/* the unticked MUST HAPPEN items in a session's prep (they sit in a callout, as "> - [ ] text") */
export function mustHappen(body) {
  const lines = String(body || '').split(/\r?\n/);
  const out = [];
  let inside = false;
  for (const l of lines) {
    if (/^>\s*\[!\w+\][+-]?\s*MUST HAPPEN/i.test(l)) { inside = true; continue; }
    if (inside && !/^>/.test(l)) inside = false;
    if (!inside) continue;
    const m = MUST.exec(l);
    if (m && m[1] === ' ') out.push({ raw: l.replace(/\r$/, ''), text: m[2] });
  }
  return out;
}
/* tasks under "Next time" (written by Close out) that are not ticked */
export function nextTime(body) {
  const out = [];
  for (const l of getSection(body, 'Next time').split(/\r?\n/)) {
    const m = /^\s*-\s+\[ \]\s+(.+?)\s*$/.exec(l);
    if (m) out.push({ raw: l.replace(/\r$/, ''), text: m[1] });
  }
  return out;
}

/* every task (ticked or not) in a marked block or a section: { raw, text, done } */
const taskLinesIn = lines => lines.map(l => { const m = /^\s*(?:>\s*)?[-*]\s+\[( |x|X)\]\s+(.+?)\s*$/.exec(l); return m ? { raw: l.replace(/\r$/, ''), text: m[2], done: m[1] !== ' ' } : null; }).filter(Boolean);
export function lastTimeTasks(body) {
  const b = String(body || '');
  const si = b.indexOf('<!-- dmforge:last-time -->'), ei = b.indexOf('<!-- /dmforge:last-time -->');
  return si >= 0 && ei > si ? taskLinesIn(b.slice(si, ei).split(/\r?\n/)) : [];
}
export const nextTimeAll = body => taskLinesIn(getSection(body, 'Next time').split(/\r?\n/));

export function forgetting(idx, { after = NEGLECT_DEFAULT } = {}) {
  const sessions = idx.byType.session || [];                      // newest first
  const threadsAll = (idx.byType.plot || []).filter(n => !/^(resolved|dormant|closed|done)$/i.test(statusOf(n, 'plot')));
  const npcsAll = (idx.byType.npc || []).filter(n => !/^dead$/i.test(statusOf(n, 'npc')));
  const cands = [...threadsAll, ...npcsAll];
  const seen = sessions.map(s => mentionedPaths(idx, s, cands));
  const since = path => seen.findIndex(set => set.has(path));      // 0 = the newest session, -1 = never
  const importance = n => (idx.backlinks.get(n.path) || []).length;

  const threads = [];
  for (const n of threadsAll) {
    const i = since(n.path);
    if (i >= after || (i < 0 && sessions.length >= after)) threads.push({ path: n.path, name: n.name, since: i < 0 ? null : i, never: i < 0, next: nextStep(n), weight: importance(n) });
  }
  threads.sort((a, b) => (b.never - a.never) || ((b.since || 0) - (a.since || 0)) || b.weight - a.weight || a.name.localeCompare(b.name));

  const npcs = [];
  for (const n of npcsAll) {
    const i = since(n.path);
    if (i >= after) npcs.push({ path: n.path, name: n.name, since: i, weight: importance(n), status: statusOf(n, 'npc') });
  }
  npcs.sort((a, b) => b.weight - a.weight || a.since - b.since || a.name.localeCompare(b.name));

  const carry = [], promises = [];
  const seenCarry = new Set();
  const doneElsewhere = new Set();                              // done in a newer session's copy, so an older unticked copy is not waiting any more
  sessions.slice(0, 3).forEach(s => {
    const body = splitFrontmatter(s.text).body;
    const carried = [...nextTimeAll(body).map(t => ({ ...t, kind: 'next' })), ...lastTimeTasks(body).map(t => ({ ...t, kind: 'next' }))];
    for (const t of carried) if (t.done) doneElsewhere.add(t.text.toLowerCase());
    const add = (kind, it) => { const k = it.text.toLowerCase(); if (!seenCarry.has(k) && !doneElsewhere.has(k)) { seenCarry.add(k); carry.push({ kind, path: s.path, session: s.name, raw: it.raw, text: it.text }); } };
    for (const it of mustHappen(body)) add('must', it);
    for (const t of carried) if (!t.done) add('next', t);
  });
  sessions.slice(0, 8).forEach(s => {
    for (const e of parseLog(splitFrontmatter(s.text).body)) {
      if (!e.task || e.done) continue;
      // Close out copies open promises into "Next time": show them once, and tick both when it is ticked
      const twin = carry.find(c => c.text.toLowerCase() === e.text.toLowerCase());
      if (twin) { (twin.also = twin.also || []).push({ path: s.path, raw: e.raw }); continue; }
      promises.push({ path: s.path, session: s.name, raw: e.raw, text: e.text, tag: e.tags[0] || '', time: e.time });
    }
  });
  // secrets the players have not found out yet (from the latest sessions and the active threads)
  const recent = new Set([...sessions.slice(0, 3).map(x => x.path), ...threadsAll.map(x => x.path)]);
  const secrets = [];
  for (const g of secretsFrom(idx)) if (recent.has(g.path)) for (const it of g.items) if (!it.done) secrets.push({ path: g.path, from: g.name, text: it.secret, clues: it.clues.length });
  // players with no spotlight moment lately: only said when the Spotlight tag is in use
  const sess0 = sessions[0];
  const sp = spotlightStats(idx, { away: sess0 ? absentOf(sess0.fm) : [] });
  const used = sp.rows.some(r => r.count > 0);
  const quiet = used && sp.sessions >= 2 ? sp.quiet.map(r => ({ path: r.path, name: r.name, sessions: sp.sessions })) : [];
  const result = { after, sessionCount: sessions.length, threads: threads.slice(0, 20), npcs: npcs.slice(0, 12), carry: carry.slice(0, 20), promises: promises.slice(0, 20), secrets: secrets.slice(0, 12), quiet };
  result.total = result.threads.length + result.npcs.length + result.carry.length + result.promises.length + result.secrets.length + result.quiet.length;
  return result;
}

const plural = (n, w) => n + ' ' + w + (n === 1 ? '' : 's');
export function sinceText(it) { return it.never ? 'never mentioned in a session' : 'not mentioned for ' + plural(it.since, 'session'); }

/* the checklist written into a session's prep */
export function forgettingMarkdown(f) {
  const out = ['**Before we start**'];
  for (const c of f.carry) out.push('- [ ] ' + c.text + ' _(' + (c.kind === 'must' ? 'must happen' : 'carried over') + ', ' + c.session + ')_');
  for (const p of f.promises) out.push('- [ ] ' + p.text + ' _(' + (p.tag || 'promise') + ', ' + p.session + ')_');
  for (const t of f.threads) out.push('- [ ] [[' + t.name + ']]: ' + sinceText(t) + (t.next ? '. Next: ' + t.next : ''));
  for (const n of f.npcs) out.push('- [ ] [[' + n.name + ']]: ' + sinceText(n));
  for (const x of f.secrets || []) out.push('- [ ] Secret: ' + x.text + ' _(' + x.from + ')_');
  for (const q of f.quiet || []) out.push('- [ ] [[' + q.name + ']]: no spotlight moment in ' + q.sessions + ' sessions');
  return out.join('\n');
}
export function addForgettingToPrep(sessionText, f) {
  const sp = splitFrontmatter(sessionText);
  return sp.prefix + upsertBlock(sp.body, 'forgetting', forgettingMarkdown(f), { heading: 'Prep' });
}

/* ticks (or unticks) the line equal to `raw` in a note; returns the new text or null */
export function flipTaskLine(text, raw) {
  const lines = String(text).split('\n');
  const want = String(raw).replace(/\r$/, '');
  const i = lines.findIndex(l => l.replace(/\r$/, '') === want);
  if (i < 0) return null;
  const cr = /\r$/.test(lines[i]) ? '\r' : '';
  const body = lines[i].replace(/\r$/, '');
  const flipped = /\[ \]/.test(body) ? body.replace('[ ]', '[x]') : body.replace(/\[[xX]\]/, '[ ]');
  if (flipped === body) return null;
  lines[i] = flipped + cr;
  return lines.join('\n');
}
