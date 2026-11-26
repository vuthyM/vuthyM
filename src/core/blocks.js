import { Marked } from 'marked';

/* Editing a note where it is shown. Every heading, paragraph, bullet and top-level block on the page is traced back to the
   exact lines it came from, so an edit rewrites those lines and nothing else (the rest of the note is left byte for byte).
   Works on the note's body with LF line endings; the app turns them back into the file's own line endings when it saves.

   A "unit" is something small you can edit in place:
     p      a paragraph          h   a heading (the words after the #s)
     li     the text of one bullet / numbered item / checkbox (its own lines, not its sub-items)
   A "block" is a whole top-level piece (a callout, a list, a table, a code block...) edited from its pencil button.
   Callout lines start with "> "; that prefix is kept for you and added back when you save. */

const QUOTE = /^ {0,3}>[ \t]?/;
/* a bullet that ends in a colon (the colon may be inside bold): a label waiting for its answer */
const LABEL_ONLY = /:(?:\*\*|__)?$/;
const LEAD = /^(\s*(?:[-*+]|\d+[.)])[ \t]+)(?:\[([ xX])\][ \t]?)?/;      // "  - ", "1. ", and an optional "[ ] "

const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/* ---- rendering: the usual markdown, with ids on the pieces that can be edited ---- */
const md = new Marked({
  gfm: true, breaks: true,
  renderer: {
    paragraph(t) { return t._u === undefined ? false : '<p data-u="' + t._u + '">' + this.parser.parseInline(t.tokens) + '</p>\n'; },
    heading(t) { return t._u === undefined ? false : '<h' + t.depth + ' data-u="' + t._u + '">' + this.parser.parseInline(t.tokens) + '</h' + t.depth + '>\n'; },
    listitem(item) {
      if (item._u === undefined) return false;
      let box = '', span = '', rest = '', own = true;
      const kids = item.tokens.some(t => t.type === 'list');       // a line that introduces a nested list is not waiting to be filled in
      for (const tok of item.tokens) {
        if (tok.type === 'checkbox') {
          const name = String(item.text || '').replace(/\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g, (m, a, b) => b || a).replace(/[*_`#>\[\]]/g, '').replace(/\s+/g, ' ').trim().slice(0, 120) || 'task';
          box = '<input type="checkbox" data-task="' + item._u + '" aria-label="' + name.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;') + '"' + (tok.checked ? ' checked' : '') + '> ';
          continue;
        }
        if (own && (tok.type === 'text' || tok.type === 'paragraph')) {
          own = false;
          const inner = this.parser.parseInline(tok.tokens || [{ type: 'text', raw: tok.text, text: tok.text, escaped: true }]);
          const empty = !String(tok.text || '').replace(/[\s\u200b]/g, '');
          // a line that is only a label ("- **Place:** ", "- Torches / light:") still gets a spot to click after it, like an empty checkbox line does
          const slot = !empty && !kids && LABEL_ONLY.test(String(tok.text || '').trim()) ? (/\s$/.test(inner) ? '' : ' ') + '<span class="u-empty">\u200b</span>' : '';
          const sp = '<span class="u' + (empty ? ' u-empty' : '') + '" data-u="' + item._u + '">' + inner + slot + '</span>';
          span = tok.type === 'paragraph' ? '<p>' + sp + '</p>\n' : sp;
          continue;
        }
        rest += this.parser.parse([tok]);
      }
      // a bullet with nothing in it yet still gets a spot to click
      if (own) span = '<span class="u u-empty" data-u="' + item._u + '">\u200b</span>';
      return '<li>' + box + span + rest + '</li>\n';
    },
  },
});

/* ---- finding where each piece lives ---- */
const nl = s => { let n = 0; for (let i = 0; i < s.length; i++) if (s.charCodeAt(i) === 10) n++; return n; };
const contentLines = raw => raw.replace(/\n+$/, '').split('\n').length;

export function buildBlocks(body, lexText) {
  const orig = body.split('\n');
  const text = lexText == null ? body : lexText;
  if (text.split('\n').length !== orig.length) return { ok: false, blocks: [], units: [], tokens: [] };
  const tokens = md.lexer(text);
  const units = [];
  const blocks = [];

  const unit = u => { u.id = units.length; units.push(u); return u; };
  const pfxOf = ctx => i => ctx.pfx[i] || '';
  const lineText = (ctx, i) => orig[i].slice(pfxOf(ctx)(i).length);

  const walk = (toks, start, ctx, top) => {
    let line = start;
    for (const t of toks) {
      const from = line, to = from + contentLines(t.raw);
      line += nl(t.raw);
      if (t.type === 'space' || t.type === 'checkbox') continue;
      if (t.type === 'paragraph') {
        if (to > orig.length) continue;
        t._u = unit({ kind: 'p', start: from, end: to, pfx: ctx.pfx, indent: (lineText(ctx, from).match(/^[ \t]*/) || [''])[0] }).id;
      } else if (t.type === 'heading') {
        const l = lineText(ctx, from);
        if (to - from === 1 && /^ {0,3}#{1,6}[ \t]+/.test(l)) t._u = unit({ kind: 'h', start: from, end: to, pfx: ctx.pfx, lead: l.match(/^ {0,3}#{1,6}[ \t]+/)[0] }).id;
      } else if (t.type === 'blockquote') {
        const pfx = ctx.pfx.slice();
        for (let i = from; i < to; i++) { const m = lineText(ctx, i).match(QUOTE); pfx[i] = pfxOf(ctx)(i) + (m ? m[0] : ''); }
        walk(t.tokens || [], from, { pfx }, false);
      } else if (t.type === 'list') {
        let at = from;
        for (const item of t.items) {
          const iFrom = at, iTo = iFrom + contentLines(item.raw);
          at += nl(item.raw);
          const first = lineText(ctx, iFrom).match(LEAD);
          if (!first) continue;
          // the item's own lines: up to a blank line or its first nested list
          const kids = item.tokens.filter(k => k.type !== 'checkbox');
          let ownEnd = iTo;
          let offset = 0;
          for (const k of item.tokens) {
            if (k.type === 'list') { ownEnd = iFrom + offset; break; }
            if (k.type === 'space') { ownEnd = iFrom + offset; break; }
            offset += nl(k.raw);
          }
          // a paragraph token's raw may end in a newline that belongs to the gap, so count content lines of the first token
          const firstTok = kids[0];
          if (firstTok && (firstTok.type === 'text' || firstTok.type === 'paragraph')) ownEnd = Math.min(ownEnd, iFrom + contentLines(firstTok.raw));
          ownEnd = Math.max(iFrom + 1, Math.min(ownEnd, iTo));
          const lead = first[1], task = first[2] === undefined ? null : first[2];
          const mark = lead.match(/^\s*(?:[-*+]|(\d+)[.)])/);
          const u = unit({ kind: 'li', start: iFrom, end: ownEnd, full: iTo, pfx: ctx.pfx, lead, task, cont: ' '.repeat(lead.length + (task === null ? 0 : 4)), num: mark && mark[1] ? +mark[1] : null, ordered: !!(mark && mark[1]), bullet: (lead.match(/[-*+]|\d+([.)])/) || ['-'])[0] });
          item._u = u.id;
          // the rest of the item (more paragraphs, nested lists) is walked from where the first token ends
          const rest = item.tokens.filter(k => k.type !== 'checkbox');
          let l2 = iFrom;
          for (const k of rest) {
            const kFrom = l2, kTo = kFrom + contentLines(k.raw);
            l2 += nl(k.raw);
            if (k === rest[0] && (k.type === 'text' || k.type === 'paragraph')) continue;
            walk([k], kFrom, ctx, false);
          }
        }
      }
    }
  };

  let line = 0;
  const topPfx = [];
  for (const t of tokens) {
    const from = line, to = from + contentLines(t.raw);
    line += nl(t.raw);
    if (t.type === 'space') continue;
    const before = units.length;
    walk([t], from, { pfx: topPfx }, true);
    blocks.push({ index: blocks.length, type: t.type, token: t, start: from, end: Math.min(to, orig.length), unitIds: units.slice(before).map(u => u.id) });
  }
  return { ok: true, blocks, units, tokens };
}

/* the html of one top-level block, with edit ids on its paragraphs, headings and bullets */
export function renderBlock(block) { return md.parser([block.token]); }

/* ---- reading and writing the text of a unit or block ---- */
const rawLines = (body, from, to) => body.split('\n').slice(from, to);

export function unitText(body, u) {
  const lines = rawLines(body, u.start, u.end);
  return lines.map((l, i) => {
    let t = l.slice((u.pfx[u.start + i] || '').length);
    if (u.kind === 'h') return t.slice(u.lead.length).replace(/[ \t]+#+[ \t]*$/, '');
    if (u.kind === 'li') return i === 0 ? t.slice(u.lead.length + (u.task === null ? 0 : (t.slice(u.lead.length).match(/^\[[ xX]\][ \t]?/) || [''])[0].length)) : t.replace(new RegExp('^ {0,' + u.cont.length + '}'), '');
    if (u.kind === 'p' && u.indent) return t.startsWith(u.indent) ? t.slice(u.indent.length) : t.replace(/^[ \t]+/, '');
    return t;
  }).join('\n');
}

const pfxFor = (u, i) => (u.pfx[u.start + Math.min(i, u.end - u.start - 1)] || '');

export function applyUnitEdit(body, u, text) {
  const lines = body.split('\n');
  const parts = String(text).replace(/\r\n/g, '\n').split('\n');
  const out = [];
  if (u.kind === 'h') out.push(pfxFor(u, 0) + u.lead + parts.join(' ').trim());
  else if (u.kind === 'li') {
    const box = u.task === null ? '' : '[' + u.task + '] ';
    parts.forEach((p, i) => out.push(pfxFor(u, i) + (i === 0 ? u.lead + box : u.cont) + p));
  } else parts.forEach((p, i) => out.push(pfxFor(u, i) + (u.indent || '') + p));
  lines.splice(u.start, u.end - u.start, ...out);
  return lines.join('\n');
}

export function toggleTask(body, u) {
  if (u.kind !== 'li' || u.task === null) return body;
  const lines = body.split('\n');
  const l = lines[u.start], p = (u.pfx[u.start] || '').length;
  const at = p + u.lead.length;
  if (!/^\[[ xX]\]/.test(l.slice(at))) return body;
  lines[u.start] = l.slice(0, at) + '[' + (u.task === ' ' ? 'x' : ' ') + ']' + l.slice(at + 3);
  return lines.join('\n');
}

/* a new empty item under this one (after its sub-items), like pressing Enter at the end of a bullet. Returns { body, line }. */
export function addSibling(body, u) {
  const lines = body.split('\n');
  const mark = u.ordered ? (u.num + 1) + u.bullet.replace(/^\d+/, '') : u.bullet;
  const lead = u.lead.replace(/^(\s*)(?:[-*+]|\d+[.)])/, '$1' + mark);
  const box = u.task === null ? '' : '[ ] ';
  lines.splice(u.full, 0, (u.pfx[u.start] || '') + lead + box);
  return { body: lines.join('\n'), line: u.full };
}

/* delete an item (and its sub-items), like Backspace on an empty bullet */
export function removeItem(body, u) {
  const lines = body.split('\n');
  lines.splice(u.start, u.full - u.start);
  return lines.join('\n');
}

/* whole-block editing. A callout is shown without its "> " marks and they are put back on save. */
export function blockText(body, b) {
  const lines = rawLines(body, b.start, b.end);
  if (b.type === 'blockquote') return lines.map(l => l.replace(QUOTE, '')).join('\n');
  return lines.join('\n');
}

export function applyBlockEdit(body, b, text) {
  const lines = body.split('\n');
  let parts = String(text).replace(/\r\n/g, '\n').replace(/\n+$/, '').split('\n');
  if (b.type === 'blockquote') {
    const first = (lines[b.start].match(QUOTE) || ['> '])[0];
    parts = parts.map(p => (p === '' ? first.replace(/[ \t]+$/, '') : first + p));
  }
  lines.splice(b.start, b.end - b.start, ...parts);
  return lines.join('\n');
}

/* A new paragraph at a line of the body (lines 0..n): blank lines are kept around it so it stays its own paragraph.
   Returns { body, line } where line is the new paragraph's first line. */
export function insertParagraph(body, at, text) {
  const lines = body.split('\n');
  at = Math.max(0, Math.min(lines.length, at));
  const parts = String(text).replace(/\r\n/g, '\n').replace(/\s+$/, '').split('\n');
  const before = at > 0 && lines[at - 1].trim() !== '' ? [''] : [];
  const after = at < lines.length && lines[at].trim() !== '' ? [''] : [];
  lines.splice(at, 0, ...before, ...parts, ...after);
  return { body: lines.join('\n'), line: at + before.length };
}

/* what a double-click in the gap after a block should add: a bullet under a list, otherwise a paragraph.
   `bi` is the index of the block above (-1 for the top of the note). */
export function newLineAfter(body, built, bi) {
  const blocks = built.blocks;
  if (bi < 0 || !blocks[bi]) return { kind: 'p', at: blocks.length && blocks[0].hidden ? blocks[0].end : 0 };
  const b = blocks[bi];
  if (b.type === 'list') {
    const lis = b.unitIds.map(id => built.units[id]).filter(u => u && u.kind === 'li');
    if (lis.length) {
      const indent = u => (u.lead.match(/^\s*/) || [''])[0].length;
      const min = Math.min(...lis.map(indent));
      const top = lis.filter(u => indent(u) === min);
      return { kind: 'li', unit: top[top.length - 1], at: b.end };
    }
  }
  return { kind: 'p', at: b.end };
}

export function unitAt(units, line, kind) {
  return units.find(u => u.start === line && (!kind || u.kind === kind)) || null;
}
