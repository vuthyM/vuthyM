import { S, set, getIndex, toast } from './store.js';
import { openMenu, pageKinds, subfoldersOf, turnIntoPage, replaceInNote, unlinkInNote, goto, openTab, openGraph, sectionForType } from './actions.js';
import { bodyLinks, linkAt, plainOccurrences } from '../core/linkedit.js';
import { copyText } from './common.jsx';

const trunc = (s, n = 30) => (s.length > n ? s.slice(0, n - 1) + '…' : s);
const MAX_WORDS = 80;

/* "Turn into a page": the kinds of page, each with its sub-folders when it has some */
function pageItems(selected, replace, { open = false } = {}) {
  const items = pageKinds().map(k => {
    const make = sub => () => turnIntoPage({ selected, type: k.type, sub, replace, open });
    const subs = subfoldersOf(k.folder);
    if (!subs.length) return { label: k.label, onClick: make('') };
    return {
      label: k.label,
      children: [
        { label: 'In ' + k.folder, hint: 'top level', onClick: make('') },
        { sep: true },
        ...subs.map(sf => ({ label: sf, onClick: make(sf) })),
        { sep: true },
        { label: 'Another folder…', onClick: () => set({ dialog: { kind: 'pageFrom', selected, replace, type: k.type, focusSub: true } }) },
      ],
    };
  });
  items.push({ sep: true }, { label: 'More options…', onClick: () => set({ dialog: { kind: 'pageFrom', selected, replace } }) });
  return items;
}

function selectionItems(selected, replace) {
  const items = [{ header: '“' + trunc(selected) + '”' }];
  items.push({ label: 'Turn into a page', children: pageItems(selected, replace) });
  if (replace) items.push({ label: 'Link to an existing note…', onClick: () => set({ dialog: { kind: 'linkExisting', selected, replace } }) });
  else items.push({ label: 'Can’t link these words here', hint: 'heading, code or link', disabled: true });
  items.push({ sep: true }, { label: 'Copy', onClick: () => copyText(selected, 'Copied') });
  return items;
}

/* the menu for an existing [[link]]: open it, take it out, or create the page it points at */
function linkItems({ shown, target, resolved, noteOpen, removeOne, removeAll, countHere }) {
  const items = [{ header: '“' + trunc(shown) + '”' + (resolved ? '' : ' (no such page yet)') }];
  if (resolved) {
    items.push({ label: 'Open', onClick: () => goto(resolved.path) });
    items.push({ label: 'Open in a new tab', onClick: () => openTab({ section: sectionForType(resolved.type), selected: resolved.path }) });
    items.push({ label: 'Show in graph', onClick: () => openGraph(resolved.path) });
    items.push({ label: 'Rename this note…', onClick: () => set({ dialog: { kind: 'rename', path: resolved.path } }) });
  } else {
    items.push({ label: 'Create this page', children: pageItems(target, null) });
  }
  items.push({ sep: true });
  if (removeOne) items.push({ label: 'Remove this link', hint: 'keeps the words', onClick: removeOne });
  if (removeAll && countHere > 1) items.push({ label: 'Remove all ' + countHere + ' links to “' + trunc(target, 22) + '” here', danger: true, onClick: removeAll });
  return items;
}

const WORD = /[\p{L}\p{N}]/u;
const EXCLUDED = 'a, code, pre, h1, h2, h3, h4, h5, h6, button';
/* which plain occurrence of the selected words the user picked (counting only text a link could go in) */
function selectionNth(container, range, text) {
  const node = range.startContainer;
  if (node.nodeType !== 3 || node !== range.endContainer) return { nth: 0, exact: false, excluded: !!(range.commonAncestorContainer.parentElement && range.commonAncestorContainer.parentElement.closest(EXCLUDED)) };
  if (node.parentElement && node.parentElement.closest(EXCLUDED)) return { nth: 0, exact: false, excluded: true };
  const lead = (node.data.slice(range.startOffset).match(/^\s*/) || [''])[0].length;
  const start = range.startOffset + lead;
  let n = 0;
  const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT);
  for (let cur = walker.nextNode(); cur; cur = walker.nextNode()) {
    if (cur.parentElement && cur.parentElement.closest(EXCLUDED)) continue;
    const occ = plainOccurrences(cur.data, text, new Uint8Array(cur.data.length));
    if (cur === node) { n += occ.filter(i => i < start).length; break; }
    n += occ.length;
  }
  return { nth: n, exact: true, excluded: false };
}

/* right-click inside a rendered note: on a link, or on selected words */
export function noteContextMenu(e, container, notePath) {
  const idx = getIndex();
  const a = e.target.closest && e.target.closest('a.wl');
  if (a && container.contains(a)) {
    const target = a.dataset.target;
    const all = [...container.querySelectorAll('a.wl')].filter(x => x.dataset.target.toLowerCase() === target.toLowerCase());
    const nth = all.indexOf(a);
    const resolved = idx.resolve(target);
    openMenu(e, linkItems({
      shown: a.textContent, target, resolved,
      removeOne: () => unlinkInNote(notePath, { targetText: target, nth }),
      removeAll: () => unlinkInNote(notePath, { targetText: target, all: true }),
      countHere: all.length,
    }));
    return;
  }
  const sel = window.getSelection();
  if (!sel || sel.isCollapsed || !sel.rangeCount || !container.contains(sel.anchorNode) || !container.contains(sel.focusNode)) return;
  const text = sel.toString().replace(/\s+/g, ' ').trim();
  if (text.length < 2 || text.length > MAX_WORDS) return;
  const info = selectionNth(container, sel.getRangeAt(0), text);
  const replace = info.excluded ? null : link => replaceInNote(notePath, text, info.nth, link);
  openMenu(e, selectionItems(text, replace));
}

/* right-click in the editor's text box */
export function editorContextMenu(e, ta, setBody) {
  const body = ta.value;
  let s = ta.selectionStart, en = ta.selectionEnd;
  const at = linkAt(body, s);
  if (at && (s === en || en <= at.end)) {
    const links = bodyLinks(body);
    const same = links.filter(l => !l.image && l.target.toLowerCase() === at.target.toLowerCase());
    const resolved = getIndex().resolve(at.target);
    openMenu(e, linkItems({
      shown: at.shown, target: at.target, resolved,
      removeOne: at.embed ? null : () => setBody(b => b.slice(0, at.start) + at.shown + b.slice(at.end)),
      removeAll: () => setBody(b => { let out = '', pos = 0; for (const l of bodyLinks(b)) if (!l.embed && l.target.toLowerCase() === at.target.toLowerCase()) { out += b.slice(pos, l.start) + l.shown; pos = l.end; } return out + b.slice(pos); }),
      countHere: same.length,
    }));
    return;
  }
  if (s === en) return;
  const raw = body.slice(s, en);
  const text = raw.replace(/\s+/g, ' ').trim();
  if (text.length < 2 || text.length > MAX_WORDS || /\n/.test(raw.trim())) return;
  s += raw.length - raw.trimStart().length; en -= raw.length - raw.trimEnd().length;
  const replace = link => setBody(b => b.slice(0, s) + link + b.slice(en));
  openMenu(e, selectionItems(text, replace));
}
