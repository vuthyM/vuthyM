/* Dice written in a note ("2d6 + 5", "Attack Roll: +9") become buttons that roll. Shift-click rolls with advantage, Alt-click with
   disadvantage (they only change a d20). Code, links, headings and buttons are left alone. */
import { rollNow } from './actions.js';
import { expressionFor } from '../core/roller.js';
import { toast } from './store.js';

const DICE = /(?<![\w.\/])((?:\d{1,3})?d(?:\d{1,4}|%)(?:(?:kh|kl)\d{1,3})?(?:\s*[+\-−]\s*(?:\d{1,3}d\d{1,4}|\d{1,4}))*)(?![\w])/gi;
const ATTACK = /(Attack Roll:\s*)([+\-−]\s*\d{1,2})(?![\d\w])/g;
const SKIP = 'a, button, code, pre, input, textarea, select, script, style, h1, h2, h3, h4, h5, h6, .dice-inline';

function pieces(text) {
  const hits = [];
  let m;
  ATTACK.lastIndex = 0;
  while ((m = ATTACK.exec(text))) hits.push({ start: m.index + m[1].length, end: m.index + m[0].length, label: m[2].replace(/\s+/g, '') });
  DICE.lastIndex = 0;
  while ((m = DICE.exec(text))) {
    const expr = expressionFor(m[1]);
    if (expr) hits.push({ start: m.index, end: m.index + m[1].length, label: m[1] });
  }
  hits.sort((a, b) => a.start - b.start);
  const out = [];
  let last = -1;
  for (const h of hits) { if (h.start >= last) { out.push(h); last = h.end; } }
  return out;
}

export function linkDice(root) {
  if (!root || !root.ownerDocument) return;
  const doc = root.ownerDocument;
  const walker = doc.createTreeWalker(root, 4 /* SHOW_TEXT */);
  const nodes = [];
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    if (!n.nodeValue || !/d\s*[\d%]|Attack Roll/i.test(n.nodeValue)) continue;
    if (n.parentElement && n.parentElement.closest(SKIP)) continue;
    nodes.push(n);
  }
  for (const node of nodes) {
    const text = node.nodeValue;
    const hits = pieces(text);
    if (!hits.length) continue;
    const frag = doc.createDocumentFragment();
    let at = 0;
    for (const h of hits) {
      if (h.start > at) frag.appendChild(doc.createTextNode(text.slice(at, h.start)));
      const b = doc.createElement('button');
      b.type = 'button';
      b.className = 'dice-inline';
      b.dataset.roll = expressionFor(h.label);
      b.title = 'Roll ' + b.dataset.roll + ' (Shift: advantage, Alt: disadvantage)';
      b.textContent = text.slice(h.start, h.end);
      frag.appendChild(b);
      at = h.end;
    }
    if (at < text.length) frag.appendChild(doc.createTextNode(text.slice(at)));
    node.parentNode.replaceChild(frag, node);
  }
}

/* one click handler for a whole rendered note */
export function diceClick(e) {
  const b = e.target.closest && e.target.closest('.dice-inline');
  if (!b) return;
  e.preventDefault();
  e.stopPropagation();
  const mode = e.shiftKey ? 'adv' : e.altKey ? 'dis' : 'normal';
  const r = rollNow(b.dataset.roll, mode);
  if (r) toast(r.expr + ' → ' + r.total + (r.crit ? '  Natural 20!' : r.fumble ? '  Natural 1' : '') + '   (' + r.detail + ')');
}
