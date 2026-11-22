/* "Import last session": what Close out saved in the previous session note (your recap, the Next time tasks, the secrets still hidden,
   promises and hooks you logged) becomes a "Last time" section at the top of the new session's prep, so you start where you stopped. */
import { splitFrontmatter, detectEol } from './frontmatter.js';
import { playersRecap } from './closeout.js';
import { parseSecrets } from './secrets.js';
import { parseLog } from './sessionlog.js';
import { mustHappen, nextTimeAll, lastTimeTasks } from './forgetting.js';

export const LAST_START = '<!-- dmforge:last-time -->';
export const LAST_END = '<!-- /dmforge:last-time -->';
const oneLine = s => String(s || '').replace(/\s+/g, ' ').trim();

function dmRecap(body) {
  const m = /<!-- dmforge:dm-recap -->([\s\S]*?)<!-- \/dmforge:dm-recap -->/.exec(body);
  return m ? m[1].trim() : '';
}

/* what could be brought in from this session's text */
export function lastSessionData(text) {
  const body = splitFrontmatter(text || '').body;
  let recap = dmRecap(body), from = recap ? 'dm' : '';
  if (!recap) { recap = playersRecap(body); from = recap ? 'players' : ''; }
  if (!recap) {
    const log = parseLog(body).filter(e => !e.task).slice(0, 14);
    recap = log.map(e => '- ' + e.text).join('\n');
    from = recap ? 'log' : '';
  }
  const seen = new Set();
  const carry = [];
  const add = t => { const k = oneLine(t).toLowerCase(); if (k && !seen.has(k)) { seen.add(k); carry.push(oneLine(t)); } };
  for (const t of nextTimeAll(body)) if (!t.done) add(t.text);
  for (const t of lastTimeTasks(body)) if (!t.done) add(t.text);
  for (const t of mustHappen(body)) add(t.text);
  for (const e of parseLog(body)) if (e.task && !e.done) add(e.text);
  const secrets = parseSecrets(body).filter(x => !x.done).map(x => ({ text: x.secret, clues: x.clues.length }));
  return { recap, from, carry, secrets, empty: !recap && !carry.length && !secrets.length };
}

export const FROM_LABEL = { dm: 'your recap', players: 'the players’ recap', log: 'the session log' };

export function lastTimeMarkdown(d, prevName, keepTasks = []) {
  const out = [];
  if (d.recap) out.push('**Previously, in [[' + prevName + ']]** _(' + FROM_LABEL[d.from] + ')_:', '', d.recap.trim(), '');
  const tasks = [...keepTasks];
  const have = new Set(keepTasks.map(t => oneLine(t.text).toLowerCase()));
  for (const c of d.carry) if (!have.has(c.toLowerCase())) tasks.push({ text: c, done: false });
  if (tasks.length) out.push('**To carry over**', '', ...tasks.map(t => '- [' + (t.done ? 'x' : ' ') + '] ' + t.text), '');
  if (d.secrets.length) out.push('**Secrets still hidden**', '', ...d.secrets.map(s => '- ' + s.text + (s.clues ? ' _(' + s.clues + (s.clues === 1 ? ' clue' : ' clues') + ')_' : '')), '');
  return out.join('\n').replace(/\n+$/, '');
}

/* puts the block in the note: refreshed in place if it is already there (ticks you made are kept), else a "## Last time" section before "## Prep" */
export function putLastTime(text, d, prevName) {
  const sp = splitFrontmatter(text);
  const body = sp.body;
  const eol = detectEol(body);
  const si = body.indexOf(LAST_START), ei = body.indexOf(LAST_END);
  const existing = si >= 0 && ei > si ? lastTimeTasks(body) : [];
  const md = lastTimeMarkdown(d, prevName, existing.map(t => ({ text: t.text, done: t.done }))).replace(/\n/g, eol);
  const block = LAST_START + eol + md + eol + LAST_END;
  if (si >= 0 && ei > si) return sp.prefix + body.slice(0, si) + block + body.slice(ei + LAST_END.length);
  const section = '## Last time' + eol + eol + block + eol + eol;
  const lines = body.split(/\r?\n/);
  let at = lines.findIndex(l => /^##\s+Prep\s*$/i.test(l));
  let pos;
  if (at >= 0) pos = lines.slice(0, at).join(eol).length + (at ? eol.length : 0);
  else {
    const h1 = lines.findIndex(l => /^#\s+/.test(l));
    pos = h1 >= 0 ? lines.slice(0, h1 + 1).join(eol).length + eol.length : 0;
    return sp.prefix + body.slice(0, pos) + (h1 >= 0 ? eol : '') + section + body.slice(pos).replace(/^(\r?\n)+/, '');
  }
  return sp.prefix + body.slice(0, pos) + section + body.slice(pos);
}

/* the session before this one (sessions are newest first); for a path that is not listed, the newest */
export function previousSession(idx, path) {
  const list = idx.byType.session || [];
  const i = list.findIndex(n => n.path === path);
  return i >= 0 ? list[i + 1] || null : list[0] || null;
}

/* the session after this one (the next one to be played): sessions are newest first, so it is the one just above; null for the newest */
export function nextSession(idx, path) {
  const list = idx.byType.session || [];
  const i = list.findIndex(n => n.path === path);
  return i > 0 ? list[i - 1] : null;
}
