/* Every keyboard shortcut in one list, shown by pressing ? (and in the quick switcher). `mod` is Ctrl, or ⌘ on a Mac; `alt` is Alt, or Option on a Mac. */
export const SHORTCUTS = [
  { group: 'Anywhere', items: [
    ['mod+K', 'Quick switcher: find a note, go to a page, run an action'],
    ['?', 'Show this list'],
    ['mod+B', 'Open or close the sidebar when it is set to hide until you point at it'],
    ['Esc', 'Close the box or menu you are in, or stop editing'],
    ['mod+[  /  mod+]', 'Back and forward through where this tab has been (Alt+← and Alt+→ also work outside a text box)'],
  ] },
  { group: 'At the table', items: [
    ['alt+L', 'Open or close the quick log (type a line, Enter adds it)'],
    ['alt+D', 'Open or close the dice roller'],
    ['alt+1 … alt+7', 'In the quick log: set the tag of the line (Plot, NPC, Loot, Rule…)'],
    ['@  or  [[', 'In the quick log: link to a note as you type (or pick “Create … as an NPC, place or item” to make it on the spot)'],
  ] },
  { group: 'Editing notes', items: [
    ['F2', 'Rename the note you are looking at'],
    ['Double-click', 'Edit a paragraph, heading or bullet where it is; double-click the gap between two pieces to add a line there'],
    ['Enter', 'In a bullet: a new bullet under it. In a new line: add it. (Shift+Enter makes a new line inside it)'],
    ['mod+Enter', 'Save a paragraph or block you are editing'],
    ['Backspace', 'On an empty bullet: take it out'],
    ['Right-click', 'On a [[link]] or on selected words: turn into a page, link to a note, remove a link'],
  ] },
  { group: 'Combat', items: [
    ['↑  /  ↓', 'Move between creatures in the initiative list'],
    ['Enter', 'Apply the number you typed to the creature'],
  ] },
];

const isMac = () => typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent || '');
/* "mod+K" as the keys for this computer: "⌘K" on a Mac, "Ctrl+K" elsewhere */
export function keysText(keys, mac = isMac()) {
  return String(keys).replace(/mod\+/g, mac ? '⌘' : 'Ctrl+').replace(/alt\+/g, mac ? '⌥' : 'Alt+');
}

/* "0.5", ".25", "1/2", "1 1/2", "2s", "750ms": a wait typed any way you like, in milliseconds (0 to 10 seconds); null when it is not one */
export const MAX_DELAY = 10000;
export function parseDelay(text) {
  const t = String(text == null ? '' : text).trim().toLowerCase().replace(',', '.');
  if (!t) return null;
  const m = /^(\d+(?:\.\d+)?|\.\d+|\d+\s+\d+\/\d+|\d+\/\d+)\s*(ms|msec|milliseconds?|s|sec|secs|seconds?)?$/.exec(t);
  if (!m) return null;
  let n;
  const num = m[1];
  if (num.includes('/')) {
    const parts = num.split(/\s+/);
    const [a, b] = parts[parts.length - 1].split('/').map(Number);
    if (!b) return null;
    n = (parts.length === 2 ? Number(parts[0]) : 0) + a / b;
  } else n = parseFloat(num);
  const ms = Math.round(m[2] && m[2].startsWith('m') ? n : n * 1000);
  return Number.isFinite(ms) && ms >= 0 && ms <= MAX_DELAY ? ms : null;
}
export const delayText = ms => (ms === 0 ? 'straight away' : ms < 1000 ? ms + ' ms' : (ms / 1000) + (ms === 1000 ? ' second' : ' seconds'));
