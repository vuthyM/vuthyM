/* Closing out a session: from the log (and combat blocks, and your prep) to a recap for you, updates to threads and NPCs,
   and what to carry to next time. Claude only proposes; nothing is applied unless it is ticked. Without Claude, the log is simply tidied. */
import { splitFrontmatter, patchFrontmatter, detectEol } from './frontmatter.js';
import { appendToSection, upsertBlock } from './markdown.js';
import { parseLog, LOG_ID } from './sessionlog.js';

export const THREAD_STATUSES = ['Active', 'Dormant', 'Resolved'];
export const NPC_STATUSES = ['Alive', 'Dead', 'Missing', 'Unknown'];
export const UPDATES_HEADING = 'Session updates';
export const CLOSEOUT_SYSTEM = 'You help a Dungeon Master tidy up after a session of a D&D campaign, from the notes you are given. '
  + 'Use only what is in the notes: if something is not there, leave it out instead of inventing it. Be concrete and short. Reply with the JSON object only.';

const oneLine = s => String(s || '').replace(/\s+/g, ' ').trim();
const escapeRe = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const stripMarks = s => String(s || '').replace(/<!-- dmforge:([\w-]+) -->[\s\S]*?<!-- \/dmforge:\1 -->/g, '').replace(/<!--[\s\S]*?-->/g, '').replace(/\n{3,}/g, '\n\n').trim();

/* the text under a "## Heading" (to the next heading of the same or higher level), or '' */
export function getSection(body, heading, level = 2) {
  const lines = String(body || '').split(/\r?\n/);
  const re = new RegExp('^#{' + level + '}\\s+' + escapeRe(heading) + '\\s*$', 'i');
  const i = lines.findIndex(l => re.test(l));
  if (i < 0) return '';
  const stop = new RegExp('^#{1,' + level + '}\\s');
  let end = lines.length;
  for (let j = i + 1; j < lines.length; j++) if (stop.test(lines[j])) { end = j; break; }
  return lines.slice(i + 1, end).join('\n');
}

/* what the players wrote as their recap in the session note ("## Recap", or a heading with "player" and "recap" in it);
   anything DM Forge wrote itself (marked blocks) is left out */
export function playersRecap(body) {
  const lines = String(body || '').split(/\r?\n/);
  let name = '';
  for (const l of lines) {
    const m = /^##\s+(.+?)\s*$/.exec(l);
    if (m && /player/i.test(m[1]) && /recap/i.test(m[1])) { name = m[1]; break; }
  }
  const text = name ? getSection(body, name) : getSection(body, 'Recap');
  return stripMarks(text);
}

export function relatedNotes(idx, session, logText) {
  const names = new Set(session.links);
  const hay = String(logText || '').toLowerCase();
  const npcs = [], threads = [];
  for (const n of idx.notes) {
    if (n.type === 'plot') {
      if (!/resolved/i.test(String((n.fm && n.fm.status) || ''))) threads.push(n);
    } else if (n.type === 'npc') {
      const linked = [...names].some(t => t.split('/').pop().replace(/\.md$/i, '').toLowerCase() === n.name.toLowerCase());
      if (linked || (n.name.length > 2 && hay.includes(n.name.toLowerCase()))) npcs.push(n);
    }
  }
  return { npcs: npcs.slice(0, 25), threads: threads.slice(0, 25) };
}

const statusOf = n => oneLine((n.fm && n.fm.status) || '') || '?';

export function closeoutContext({ session, idx }) {
  const sp = splitFrontmatter(session.text);
  const log = parseLog(sp.body);
  const logText = log.map(e => (e.time ? e.time + ' ' : '') + (e.tags.length ? '[' + e.tags.join(',') + '] ' : '') + e.text).join('\n');
  const rest = stripMarks(sp.body.replace(/<!-- \/?dmforge:tidy -->/g, '').replace(new RegExp('<!-- dmforge:' + LOG_ID + ' -->[\\s\\S]*?<!-- /dmforge:' + LOG_ID + ' -->'), '').replace(/<!-- dmforge:(dm-recap|next|recap-check)[\s\S]*?<!-- \/dmforge:\1 -->/g, ''));
  const rel = relatedNotes(idx, session, logText + '\n' + rest);
  return {
    log: logText,
    notes: rest.length > (/dmforge:tidy/.test(sp.body) ? 16000 : 6000) ? rest.slice(0, /dmforge:tidy/.test(sp.body) ? 16000 : 6000) + '…' : rest,
    recap: playersRecap(sp.body),
    threads: rel.threads.map(n => ({ name: n.name, status: statusOf(n), summary: n.summary || '' })),
    npcs: rel.npcs.map(n => ({ name: n.name, status: statusOf(n), summary: n.summary || '' })),
  };
}

export function closeoutPrompt({ campaign, session, ctx }) {
  const name = campaign ? ' "' + campaign + '"' : '';
  const list = a => (a.length ? a.map(x => '- ' + x.name + ' (' + x.status + ')' + (x.summary ? ': ' + x.summary : '')).join('\n') : '(none)');
  return 'I am the Dungeon Master of a D&D campaign' + name + '. I have just played "' + session + '". Below is my live log of the session, my notes for it'
    + (ctx.recap ? ', and the recap my players wrote' : '') + ', then the plot threads and NPCs that may be affected.\n\n'
    + 'Reply with one JSON object, and nothing else, with these keys:\n'
    + '  "recap": my own recap of what happened, as markdown bullets or short paragraphs, about 150 to 250 words, in order. Include what the players do not know.\n'
    + '  "threads": a list of {"name", "status", "text"} for plot threads that moved. "name" must be exactly a name from the thread list. "status" is one of ' + THREAD_STATUSES.join(', ') + '. "text" is one short line: what changed and what comes next.\n'
    + '  "npcs": a list of {"name", "status", "text"} for NPCs from the NPC list whose situation changed. "status" is one of ' + NPC_STATUSES.join(', ') + '. "text" is one short line.\n'
    + '  "next": a list of short strings: loose ends, unanswered questions, promises made, and hooks to carry into the next session.\n'
    + (ctx.recap ? '  "differences": a list of short strings: what the players\' recap got wrong, missed or added compared with my log.\n' : '')
    + 'Only include threads and NPCs that really changed. Use empty lists when there is nothing.\n\n'
    + '=== MY LIVE LOG ===\n' + (ctx.log || '(empty)') + '\n\n'
    + '=== MY NOTES FOR THE SESSION ===\n' + (ctx.notes || '(empty)') + '\n\n'
    + (ctx.recap ? '=== THE PLAYERS\' RECAP ===\n' + ctx.recap + '\n\n' : '')
    + '=== PLOT THREADS ===\n' + list(ctx.threads) + '\n\n=== NPCs ===\n' + list(ctx.npcs) + '\n';
}

/* Claude's answer, checked: names that are not notes are marked, statuses that are not allowed are dropped */
export function parseCloseout(answer, idx) {
  let s = String(answer || '').trim().replace(/^```[a-z]*\s*/i, '').replace(/```\s*$/, '').trim();
  let data = null;
  try { data = JSON.parse(s); } catch (e) {
    const a = s.indexOf('{'), b = s.lastIndexOf('}');
    if (a >= 0 && b > a) { try { data = JSON.parse(s.slice(a, b + 1)); } catch (e2) { data = null; } }
  }
  if (!data || typeof data !== 'object' || Array.isArray(data)) return null;
  const strs = v => (Array.isArray(v) ? v : []).map(x => oneLine(typeof x === 'string' ? x : x && typeof x === 'object' ? Object.values(x).find(y => typeof y === 'string') : '')).filter(Boolean).slice(0, 30);
  const recap = typeof data.recap === 'string' ? data.recap.trim() : Array.isArray(data.recap) ? data.recap.map(x => '- ' + oneLine(x)).join('\n') : '';
  const upd = (v, type, allowed) => (Array.isArray(v) ? v : []).filter(x => x && typeof x === 'object').slice(0, 25).map(x => {
    const nm = oneLine(x.name).replace(/^\[\[|\]\]$/g, '');
    const note = nm ? idx.resolve(nm) : null;
    const status = allowed.find(a => a.toLowerCase() === oneLine(x.status).toLowerCase()) || '';
    return { name: note ? note.name : nm, path: note && note.type === type ? note.path : '', status, text: oneLine(x.text) };
  }).filter(x => x.name && (x.status || x.text));
  const out = { recap, threads: upd(data.threads, 'plot', THREAD_STATUSES), npcs: upd(data.npcs, 'npc', NPC_STATUSES), next: strs(data.next), differences: strs(data.differences) };
  return out.recap || out.threads.length || out.npcs.length || out.next.length || out.differences.length ? out : null;
}

/* with Claude off: the log tidied into a recap, and the open promises and hooks as the things to carry over */
export function plainCloseout(body) {
  const log = parseLog(body);
  const recap = log.filter(e => !e.task).map(e => '- ' + (e.time ? e.time + ' ' : '') + (e.tags.length ? '(' + e.tags.join(', ') + ') ' : '') + e.text).join('\n');
  const next = log.filter(e => e.task && !e.done).map(e => e.text);
  return { recap, threads: [], npcs: [], next, differences: [] };
}

function existingTasks(block) {
  return block.split(/\r?\n/).map(l => l.trim()).filter(l => /^- \[[ xX]\] /.test(l));
}

/* writes the ticked parts into the session note. "DM recap" and the rest are marked blocks, so doing it again updates them. */
export function applySessionParts(noteText, { recap, next, check }) {
  const sp = splitFrontmatter(noteText);
  const eol = detectEol(sp.body);
  let body = sp.body;
  if (recap && recap.trim()) body = upsertBlock(body, 'dm-recap', recap.trim().replace(/\r?\n/g, eol), { heading: 'DM recap' });
  if (next && next.length) {
    const si = body.indexOf('<!-- dmforge:next -->'), ei = body.indexOf('<!-- /dmforge:next -->');
    const old = si >= 0 && ei > si ? existingTasks(body.slice(si, ei)) : [];
    const have = new Set(old.map(l => l.replace(/^- \[[ xX]\] /, '').toLowerCase()));
    const add = next.map(oneLine).filter(x => x && !have.has(x.toLowerCase())).map(x => '- [ ] ' + x);
    body = upsertBlock(body, 'next', [...old, ...add].join(eol), { heading: 'Next time' });
  }
  if (check && check.length) body = upsertBlock(body, 'recap-check', check.map(x => '- ' + oneLine(x)).join(eol), { heading: 'Recap check' });
  return sp.prefix + body;
}

/* a thread or NPC: the new status (only if it differs) and a line under "Session updates" that links back to the session */
export function applyNoteUpdate(text, { status, line }) {
  let t = text;
  const sp0 = splitFrontmatter(t);
  const cur = oneLine((sp0.fm && sp0.fm.status) || '');
  if (status && cur.toLowerCase() !== status.toLowerCase()) t = patchFrontmatter(t, { status });
  if (line) {
    const sp = splitFrontmatter(t);
    if (!sp.body.includes(line)) t = sp.prefix + appendToSection(sp.body, UPDATES_HEADING, line);
  }
  return t;
}
export const updateLine = (sessionName, date, text) => '- [[' + sessionName + ']]' + (date ? ' (' + date + ')' : '') + (text ? ': ' + oneLine(text) : '');
