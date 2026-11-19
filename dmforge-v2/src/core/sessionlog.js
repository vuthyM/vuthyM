/* The session log: one line at a time, added while you play, kept in a marked block under "## Session log" in the session note.
   Lines are plain markdown ("- 20:41 #reveal The ferryman is the smuggler"), so Obsidian shows them as they are. A line tagged
   Promise or Hook is a task ("- [ ] 20:41 #promise ..."), so it can be ticked off later (here, or in Obsidian). */
import { detectEol } from './frontmatter.js';
import { upsertBlock } from './markdown.js';

export const LOG_HEADING = 'Session log';
export const LOG_ID = 'log';
export const LOG_TAGS = [
  { key: 'reveal', label: 'Reveal', task: false },
  { key: 'loot', label: 'Loot', task: false },
  { key: 'decision', label: 'Decision', task: false },
  { key: 'ruling', label: 'Ruling', task: false },
  { key: 'promise', label: 'Promise', task: true },
  { key: 'hook', label: 'Hook', task: true },
  { key: 'spotlight', label: 'Spotlight', task: false },
];
export const tagInfo = key => LOG_TAGS.find(t => t.key === key) || null;

const START = '<!-- dmforge:' + LOG_ID + ' -->';
const END = '<!-- /dmforge:' + LOG_ID + ' -->';

export function fmtTime(d = new Date()) {
  return String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
}

const oneLine = s => String(s || '').replace(/\s+/g, ' ').trim();

/* the markdown line for an entry; '' when there is nothing to say */
export function buildLine({ time, text, tag } = {}) {
  const t = oneLine(text);
  if (!t) return '';
  const info = tag ? tagInfo(tag) : null;
  const when = /^\d{1,2}:\d{2}$/.test(time || '') ? time : fmtTime();
  return (info && info.task ? '- [ ] ' : '- ') + when + (info ? ' #' + info.key : '') + ' ' + t;
}

/* adds a line at the end of the log block, creating the block (under "## Session log") the first time.
   Anything else inside the block, such as lines you wrote in Obsidian, stays where it is. */
export function appendLogLine(body, line) {
  if (!line) return body;
  const si = body.indexOf(START), ei = body.indexOf(END);
  if (si >= 0 && ei > si) {
    const eol = detectEol(body);
    const inner = body.slice(si + START.length, ei).replace(/\s+$/, '');
    return body.slice(0, si) + START + inner + eol + line + eol + body.slice(ei);
  }
  return upsertBlock(body, LOG_ID, line, { heading: LOG_HEADING });
}

/* the lines of the log block, as entries */
export function parseLog(body) {
  const si = body.indexOf(START), ei = body.indexOf(END);
  if (si < 0 || ei < si) return [];
  const out = [];
  const lines = body.slice(si + START.length, ei).split(/\r?\n/);
  lines.forEach((raw, i) => {
    const m = /^\s*[-*]\s+(?:\[( |x|X)\]\s+)?(?:(\d{1,2}:\d{2})\s+)?(.*)$/.exec(raw);
    if (!m || !m[3].trim()) return;
    const tags = [...m[3].matchAll(/(?:^|\s)#([A-Za-z][\w-]*)/g)].map(x => x[1].toLowerCase());
    const text = m[3].replace(/(?:^|\s)#(?:reveal|loot|decision|ruling|promise|hook|spotlight)(?=\s|$)/gi, ' ').replace(/\s+/g, ' ').trim();
    out.push({ raw, time: m[2] || '', text, tags, task: m[1] !== undefined, done: m[1] === 'x' || m[1] === 'X' });
  });
  return out;
}

/* removes the last line of the log block (the "Undo" in the log box); returns the new body, or null if the log is empty */
export function removeLastLogLine(body) {
  const si = body.indexOf(START), ei = body.indexOf(END);
  if (si < 0 || ei < si) return null;
  const inner = body.slice(si + START.length, ei);
  const lines = inner.split(/\r?\n/);
  for (let i = lines.length - 1; i >= 0; i--) {
    if (/^\s*[-*]\s+/.test(lines[i]) && lines[i].trim()) {
      lines.splice(i, 1);
      return body.slice(0, si + START.length) + lines.join(detectEol(body)) + body.slice(ei);
    }
  }
  return null;
}

/* removes one exact line (the last one that matches) from the log block; returns the new body, or null if it is not there */
export function removeLogLine(body, raw) {
  const si = body.indexOf(START), ei = body.indexOf(END);
  if (si < 0 || ei < si) return null;
  const inner = body.slice(si + START.length, ei);
  const lines = inner.split(/\r?\n/);
  const at = lines.lastIndexOf(raw);
  if (at < 0) return null;
  lines.splice(at, 1);
  return body.slice(0, si + START.length) + lines.join(detectEol(body)) + body.slice(ei);
}

/* ticks (or unticks) the n-th line of the log block if it is a task; returns the new body or null */
export function toggleLogTask(body, raw) {
  const si = body.indexOf(START), ei = body.indexOf(END);
  if (si < 0 || ei < si) return null;
  const inner = body.slice(si + START.length, ei);
  const at = inner.indexOf(raw);
  if (at < 0) return null;
  const flipped = /\[ \]/.test(raw) ? raw.replace('[ ]', '[x]') : raw.replace(/\[[xX]\]/, '[ ]');
  if (flipped === raw) return null;
  return body.slice(0, si + START.length) + inner.slice(0, at) + flipped + inner.slice(at + raw.length) + body.slice(ei);
}

/* @name typed in the log box: the notes whose name starts with it (then contains it), shortest first */
export function mentionMatches(notes, frag, limit = 6) {
  const f = String(frag || '').trim().toLowerCase();
  if (!f) return [];
  const starts = [], inside = [];
  for (const n of notes) {
    const nm = n.name.toLowerCase();
    if (nm.startsWith(f)) starts.push(n); else if (nm.includes(f)) inside.push(n);
  }
  const by = (a, b) => a.name.length - b.name.length || a.name.localeCompare(b.name);
  return [...starts.sort(by), ...inside.sort(by)].slice(0, limit);
}

/* the "@frag" that ends the text at the caret, if there is one: { start, frag } */
export function mentionAt(text, caret) {
  const before = String(text).slice(0, caret);
  const b = /\[\[([^\[\]|]*)$/.exec(before);                 // an unfinished [[link
  if (b) return { start: before.length - b[1].length - 2, frag: b[1], bracket: true };
  const m = /(?:^|\s)@([^\s@\[\]]*)$/.exec(before);
  return m ? { start: before.length - m[1].length - 1, frag: m[1] } : null;
}
