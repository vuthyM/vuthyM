/* "Reformat" fixes markdown that renders badly, without touching anything that is
   Obsidian-specific (callouts, [[links]], #tags, ==highlights==, %%comments%% and so on
   are all understood by the viewer, so they are left exactly as written).

   Only structural problems are fixed, and each fix is safe in Obsidian too. Pure function:
   reformatBody(body) -> { body, changes: [{ id, label, count }] }, working on LF text. */

const FENCE = /^\s*(```|~~~)/;
const HR = /^\s*([*+-]\s*){3,}$/;

export function reformatBody(input) {
  const counts = {};
  const bump = (id, n = 1) => { counts[id] = (counts[id] || 0) + n; };
  const src = String(input).replace(/\r\n/g, '\n').split('\n');

  /* pass 1: per-line fixes, outside code fences */
  let fence = null;
  const lines = src.map(line => {
    const f = line.match(FENCE);
    if (fence) { if (f && f[1] === fence) fence = null; return line; }
    if (f) { fence = f[1]; return line; }
    let l = line;
    let m = l.match(/^(#{2,6})([^\s#].*)$/);
    if (m) { l = m[1] + ' ' + m[2]; bump('heading'); }
    if (!HR.test(l)) {
      m = l.match(/^(\s*)[*+](\s+)(?=\S)/);
      if (m) { l = m[1] + '-' + m[2] + l.slice(m[0].length); bump('bullet'); }
    }
    m = l.match(/^(\s*)([-*+])\s?\[([ xX])\]\s*(\S.*)?$/);
    if (m && (m[4] || '') !== '' && !/^\(/.test(m[4])) {
      const fixed = m[1] + '- [' + m[3] + '] ' + m[4];
      if (fixed !== l) { l = fixed; bump('task'); }
    }
    const l2 = l.replace(/\[\[\s*([^\]|\n]*?)\s*(?:\|\s*([^\]\n]*?)\s*)?\]\]/g, (all, a, b) => (b !== undefined && b !== '' ? '[[' + a + '|' + b + ']]' : '[[' + a + ']]'));
    if (l2 !== l) { l = l2; bump('links'); }
    return l;
  });

  /* pass 2: blank lines around headings and tables, no runs of blank lines */
  const out = [];
  const isBlank = l => l === undefined || l.trim() === '';
  const isTable = l => /^\s*\|.*\|?\s*$/.test(l) && l.trim().length > 1;
  const isHeading = l => /^#{1,6}\s/.test(l);
  const inCode = [];
  { let fz = null; for (const l of lines) { const f = l.match(FENCE); if (fz) { inCode.push(true); if (f && f[1] === fz) fz = null; } else if (f) { fz = f[1]; inCode.push(true); } else inCode.push(false); } }
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i], prev = out[out.length - 1];
    if (inCode[i]) { out.push(l); continue; }
    const indented = /^( {4}|\t)/.test(l);
    if (!indented && out.length && !inCode[i - 1] && !isBlank(prev)) {
      if (isHeading(l)) { out.push(''); bump('spacing'); }
      else if (isTable(l) && !isTable(prev)) { out.push(''); bump('table'); }
      else if (!isBlank(l) && isHeading(prev)) { out.push(''); bump('spacing'); }
      else if (!isBlank(l) && isTable(prev) && !isTable(l)) { out.push(''); bump('table'); }
    }
    if (out.length && isBlank(l) && isBlank(prev)) { bump('blanks'); continue; }
    out.push(l);
  }

  /* an unclosed code fence swallows the rest of the note */
  let open = null;
  for (const l of out) { const f = l.match(FENCE); if (open) { if (f && f[1] === open) open = null; } else if (f) open = f[1]; }
  if (open) { if (!isBlank(out[out.length - 1])) out.push(''); out.push(open); bump('fence'); }

  const LABEL = {
    heading: ['Added the missing space after ## headings', 'headings'],
    spacing: ['Put a blank line around headings', 'places'],
    table: ['Separated tables from the text around them', 'tables'],
    bullet: ['Made bullet lists use “-”', 'items'],
    task: ['Fixed checkbox spacing', 'items'],
    links: ['Tidied spaces inside [[links]]', 'links'],
    blanks: ['Removed extra blank lines', 'lines'],
    fence: ['Closed a code block that was left open', ''],
  };
  const changes = Object.keys(counts).map(id => ({ id, label: LABEL[id][0], count: counts[id] }));
  return { body: out.join('\n'), changes };
}
