/* None of this app's fields is a login, but password managers (Bitwarden, 1Password, LastPass, Dashlane) guess from a field's name,
   id, label and placeholder, and some attach their menu to a plain text box. Every field is marked so they leave it alone:

   - the marks go on when the field is CREATED (a Preact hook), so they are there before the field reaches the page and before any
     extension has looked at it. Marking afterwards is too late for some extensions, which decide once, when a field first appears;
   - a MutationObserver marks anything else that appears (a safety net);
   - data-bwignore is the one Bitwarden honours; autocomplete="off" is only added where nothing was set.

   Keep field ids, names and labels free of words like login, user, email, account and password. */
import { options } from 'preact';

const SKIP_TYPES = new Set(['checkbox', 'radio', 'button', 'submit', 'reset', 'hidden', 'range', 'color', 'file', 'image']);
const MARKS = { 'data-bwignore': 'true', 'data-lpignore': 'true', 'data-1p-ignore': 'true', 'data-form-type': 'other' };
const FIELDS = new Set(['input', 'textarea', 'select']);

const skipType = t => SKIP_TYPES.has(String(t || 'text').toLowerCase());

export function markField(el) {
  if (!el || el.nodeType !== 1) return;
  const tag = el.tagName;
  if (tag !== 'INPUT' && tag !== 'TEXTAREA' && tag !== 'SELECT') return;
  if (tag === 'INPUT' && skipType(el.getAttribute('type'))) return;
  for (const k in MARKS) if (!el.hasAttribute(k)) el.setAttribute(k, MARKS[k]);
  if (!el.hasAttribute('autocomplete')) el.setAttribute('autocomplete', 'off');
}

function markTree(node) {
  if (!node || node.nodeType !== 1) return;
  markField(node);
  if (node.querySelectorAll) node.querySelectorAll('input,textarea,select').forEach(markField);
}

export function keepPasswordManagersOut() {
  const prev = options.vnode;
  options.vnode = vnode => {
    if (typeof vnode.type === 'string' && FIELDS.has(vnode.type) && !(vnode.type === 'input' && skipType(vnode.props && vnode.props.type))) {
      const p = vnode.props || (vnode.props = {});
      for (const k in MARKS) if (p[k] === undefined) p[k] = MARKS[k];
      if (p.autocomplete === undefined && p.autoComplete === undefined) p.autocomplete = 'off';
    }
    if (prev) prev(vnode);
  };
  if (typeof document === 'undefined' || typeof MutationObserver === 'undefined') return;
  markTree(document.body);
  new MutationObserver(list => { for (const m of list) m.addedNodes.forEach(markTree); }).observe(document.body, { childList: true, subtree: true });
}
