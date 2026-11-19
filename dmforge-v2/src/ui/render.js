import { marked } from 'marked';
import DOMPurify from 'dompurify';
import { IMAGE_EXT } from '../core/util.js';
import { buildBlocks, renderBlock } from '../core/blocks.js';

const URI_OK = /^(?:(?:https?|mailto|obsidian|dmf-link|dmf-asset):|[^a-z]|[a-z+.\-]+(?:[^a-z+.\-:]|$))/i;

/* Runs `fn` on the parts of the text that are not fenced code or inline code. */
function outsideCode(text, fn) {
  return text.split(/(```[\s\S]*?```|~~~[\s\S]*?~~~|`[^`\n]+`)/).map((chunk, i) => (i % 2 ? chunk : fn(chunk))).join('');
}

/* Obsidian-only syntax the viewer understands, without rewriting the note:
   %%comments%% and ^block-ids disappear, ==highlights== are marked, [[links]] and
   ![[embeds]] become links (see convertLinks). */
function obsidianSyntax(text) {
  return outsideCode(text, chunk => chunk
    .replace(/%%[\s\S]*?%%/g, m => '\n'.repeat((m.match(/\n/g) || []).length))      // keeps the line count, so lines in the page map to lines in the file
    .replace(/[ \t]+\^[A-Za-z0-9-]+[ \t]*$/gm, '')
    .replace(/==(?=\S)([^=\n]+?)(?<=\S)==/g, '<mark>$1</mark>')
    // an empty checkbox line ("- [ ] ") is a checkbox in Obsidian; markdown only treats it as one when it has text
    .replace(/^([ \t]*(?:>[ \t]*)*[-*+][ \t]+\[[ xX]\])[ \t]*$/gm, '$1 \u200b'));
}

function convertLinks(text) {
  return outsideCode(text, chunk => chunk
    .replace(/!\[\[([^\]|#]+?)(?:#[^\]|]*)?(?:\|[^\]]*)?\]\]/g, (m, f) => {
      const name = f.trim();
      const e = name.split('.').pop().toLowerCase();
      return IMAGE_EXT.includes(e)
        ? '![' + name.replace(/[\[\]]/g, '') + '](dmf-asset:' + encodeURIComponent(name) + ')'
        : '↪ [' + name + '](dmf-link:' + encodeURIComponent(name) + ')';
    })
    .replace(/\[\[([^\]|#^]+?)(?:[#^][^\]|]*)?(?:\|([^\]]*))?\]\]/g, (m, target, alias) => {
      const label = (alias || target).trim().replace(/[\[\]]/g, '');
      return '[' + label + '](dmf-link:' + encodeURIComponent(target.trim()) + ')';
    }));
}

/* > [!note] Title  ->  a callout box (collapsible when written as [!note]- or [!note]+) */
function applyCallouts(html) {
  if (html.indexOf('[!') < 0) return html;
  const box = document.createElement('div');
  box.innerHTML = html;
  const convert = bq => {
    const p = bq.firstElementChild;
    if (!p || p.tagName !== 'P') return;
    const first = p.firstChild;
    if (!first || first.nodeType !== 3) return;
    const m = first.nodeValue.match(/^\s*\[!([\w-]+)\]([+-])?[ \t]*/);
    if (!m) return;
    const kind = m[1].toLowerCase();
    const titleId = p.getAttribute('data-u');
    first.nodeValue = first.nodeValue.slice(m[0].length);
    // the title is everything up to the first line break in that paragraph
    const title = document.createElement('div');
    title.className = 'callout-title';
    const rest = document.createDocumentFragment();
    let inTitle = true;
    while (p.firstChild) {
      const node = p.firstChild;
      if (inTitle && node.nodeName === 'BR') { p.removeChild(node); inTitle = false; continue; }
      (inTitle ? title : rest).appendChild(node);
    }
    if (!title.textContent.trim()) title.textContent = kind.charAt(0).toUpperCase() + kind.slice(1).replace(/-/g, ' ');
    const body = document.createElement('div');
    body.className = 'callout-body';
    if (rest.textContent.trim()) { const para = document.createElement('p'); para.appendChild(rest); body.appendChild(para); }
    p.remove();
    while (bq.firstChild) body.appendChild(bq.firstChild);
    let out;
    if (m[2]) {
      out = document.createElement('details');
      if (m[2] === '+') out.open = true;
      const sum = document.createElement('summary');
      sum.className = 'callout-title';
      while (title.firstChild) sum.appendChild(title.firstChild);
      out.appendChild(sum);
    } else { out = document.createElement('div'); out.appendChild(title); }
    if (titleId !== null) {      // the title text stays editable in place
      const t = out.firstElementChild, span = document.createElement('span');
      span.className = 'u'; span.setAttribute('data-u', titleId);
      while (t.firstChild) span.appendChild(t.firstChild);
      t.appendChild(span);
    }
    out.className = 'callout callout-' + kind.replace(/[^a-z0-9-]/g, '');
    out.setAttribute('data-callout', kind);
    out.appendChild(body);
    bq.replaceWith(out);
  };
  box.querySelectorAll('blockquote').forEach(convert);
  return box.innerHTML;
}

/* One line of text with its inline formatting (bold, italic, code, ==highlight==, links) as safe HTML, for lists of tasks, secrets and log
   lines that are kept as markdown in the note. [[links]] show their name. */
export function renderInline(text) {
  const t = String(text || '')
    .replace(/\[\[([^\]|#^]+?)(?:[#^][^\]|]*)?(?:\|([^\]]*))?\]\]/g, (m, target, alias) => (alias || target).trim())
    .replace(/==(?=\S)([^=\n]+?)(?<=\S)==/g, '<mark>$1</mark>');
  return DOMPurify.sanitize(marked.parseInline(t, { gfm: true }), { ALLOWED_TAGS: ['strong', 'em', 'b', 'i', 'code', 'del', 'mark', 'a', 'br'], ALLOWED_ATTR: ['href'], ALLOWED_URI_REGEXP: URI_OK });
}
/* the same text without the formatting, for labels read by a screen reader */
export function plainInline(text) {
  const d = document.createElement('div');
  d.innerHTML = renderInline(text);
  return d.textContent || '';
}

export function renderMarkdown(body) {
  // single line breaks stay line breaks, which is how Obsidian shows a note
  const html = marked.parse(convertLinks(obsidianSyntax(body || '')), { gfm: true, breaks: true });
  const clean = DOMPurify.sanitize(html, { ALLOWED_URI_REGEXP: URI_OK });
  return applyCallouts(clean);
}

/* The same page as renderMarkdown, but split into top-level blocks, each with a pencil, and with ids on the paragraphs, headings
   and bullets so they can be edited where they are (see core/blocks.js and ui/editbody.jsx). Returns { ok, html, units, blocks },
   or { ok: false } if the page cannot be mapped back to the file (then the plain page is shown). */
const squashName = x => String(x).toLowerCase().replace(/[^a-z0-9]+/g, '');
export function renderEditable(bodyLf, noteName) {
  const built = buildBlocks(bodyLf, convertLinks(obsidianSyntax(bodyLf)));
  if (!built.ok) return { ok: false };
  let html = '';
  built.blocks.forEach((b, i) => {
    const t = b.token;
    // a note's own title heading is not repeated on the page (the note's name is shown above it)
    if (i === 0 && t.type === 'heading' && t.depth === 1 && squashName(t.text) === squashName(noteName)) { b.hidden = true; return; }
    const inner = applyCallouts(DOMPurify.sanitize(renderBlock(b), { ALLOWED_URI_REGEXP: URI_OK }));
    html += '<div class="blk" data-blk="' + b.index + '">' + inner + '<button type="button" class="blk-edit" data-edit-blk="' + b.index + '" aria-label="Edit this block" title="Edit this block"></button></div>';
  });
  return { ok: true, html, units: built.units, blocks: built.blocks };
}
