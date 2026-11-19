import { render } from 'preact';
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'preact/hooks';
import { Markdown } from './common.jsx';
import { renderEditable } from './render.js';
import { saveNoteEdit } from './actions.js';
import { S } from './store.js';
import { unitText, applyUnitEdit, toggleTask, addSibling, removeItem, blockText, applyBlockEdit, unitAt, insertParagraph, newLineAfter } from '../core/blocks.js';

/* A note's body, shown formatted and editable where it is:
     - click a checkbox to tick it
     - double-click a paragraph, heading or bullet (or click an empty bullet) to edit just that piece
     - double-click the empty space between two pieces to add a line there (a bullet under a list, otherwise a paragraph)
     - the pencil on a block edits the whole block (a callout, a table, a list...)
   Every edit rewrites only the lines it came from. See core/blocks.js. */

const fit = t => { t.style.height = 'auto'; t.style.height = t.scrollHeight + 'px'; };

function UnitEditor({ unit, initial, onSave, onEnter, onRemove, onCancel, placeholder }) {
  const ref = useRef();
  const done = useRef(false);
  const [v, setV] = useState(initial);
  useLayoutEffect(() => { const t = ref.current; t.focus(); t.setSelectionRange(t.value.length, t.value.length); fit(t); }, []);
  const once = fn => { if (done.current) return; done.current = true; fn(); };
  const cur = () => (ref.current ? ref.current.value : v);        // what is in the box right now (state can lag behind fast typing)
  const keys = e => {
    if (e.isComposing) return;
    const now = cur();
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); once(onCancel); return; }
    if (e.key === 'Enter' && !e.shiftKey) {
      if (unit.kind === 'p' && !unit.fresh && !(e.ctrlKey || e.metaKey)) return;        // Enter writes a new line in a paragraph; Ctrl/Cmd+Enter saves (a brand new line is added with Enter)
      e.preventDefault();
      if (unit.kind === 'li' && now.trim() && !(e.ctrlKey || e.metaKey)) once(() => onEnter(now));
      else once(() => (now !== initial ? onSave(now) : onCancel()));
      return;
    }
    if (e.key === 'Backspace' && unit.kind === 'li' && now === '' && initial === '') { e.preventDefault(); once(onRemove); }
  };
  return (
    <textarea ref={ref} class="u-edit" rows={1} value={v} spellcheck aria-label={placeholder ? 'Add a line' : 'Edit this text'} placeholder={placeholder}
      onInput={e => { setV(e.currentTarget.value); fit(e.currentTarget); }}
      onKeyDown={keys}
      onBlur={() => once(() => (cur() !== initial ? onSave(cur()) : onCancel()))} />
  );
}

function BlockEditor({ block, initial, onSave, onCancel }) {
  const ref = useRef();
  const [v, setV] = useState(initial);
  useLayoutEffect(() => { const t = ref.current; t.focus(); fit(t); }, []);
  const keys = e => {
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); onCancel(); }
    else if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); onSave(ref.current ? ref.current.value : v); }
  };
  return (
    <div class="blk-edit-box">
      <div class="small muted" style="margin-bottom:4px">{block.type === 'blockquote' ? 'Editing this callout. The > marks are put back for you.' : 'Editing this block.'}</div>
      <textarea ref={ref} class="blk-text" value={v} spellcheck={false} aria-label="Edit this block" onInput={e => { setV(e.currentTarget.value); fit(e.currentTarget); }} onKeyDown={keys} />
      <div class="row-actions" style="margin-top:6px">
        <button type="button" class="btn btn-sm btn-primary" data-block-save onClick={() => onSave(ref.current ? ref.current.value : v)}>Save</button>
        <button type="button" class="btn btn-sm" data-block-cancel onClick={onCancel}>Cancel</button>
        <span class="small muted">Ctrl/⌘+Enter saves · Esc cancels</span>
      </div>
    </div>
  );
}

let handledJump = 0;     // the stamp of the last jump that was carried out (survives the note page being closed and reopened)

export function EditableBody({ note, idx, rev, fallback, jump }) {
  const lf = note.body.replace(/\r\n/g, '\n');
  const built = useMemo(() => renderEditable(lf, note.name), [lf, note.name]);
  const [edit, setEdit] = useState(null);          // { kind: 'unit', id }, { kind: 'block', index } or { kind: 'new', at, after } (a new line after block `after`)
  const wrap = useRef();
  const pendingLine = useRef(null);

  const commit = (body, focusLine) => {
    pendingLine.current = focusLine == null ? null : focusLine;
    setEdit(null);
    if (body !== lf) saveNoteEdit(note.path, { body });
  };

  // after a bullet is added, open it for typing
  useEffect(() => {
    if (pendingLine.current == null || !built.ok) return;
    const u = unitAt(built.units, pendingLine.current, 'li');
    pendingLine.current = null;
    if (u) setEdit({ kind: 'unit', id: u.id });
  }, [built]);

  // "jump to where you left off": scroll to the line and flash it. Once per jump: a jump that was already done (or is old) is
  // ignored, so editing the note or coming back to it later never scrolls the page again.
  useEffect(() => {
    if (!jump || jump.path !== note.path || !built.ok || !wrap.current) return;
    if (jump.stamp === handledJump || Date.now() - jump.stamp > 15000) return;
    const line = jump.line;
    const u = built.units.filter(x => x.start <= line && line < x.end).pop();
    const b = built.blocks.find(x => x.start <= line && line < x.end);
    const el = (u && wrap.current.querySelector('[data-u="' + u.id + '"]')) || (b && wrap.current.querySelector('.blk[data-blk="' + b.index + '"]'));
    if (!el) return;
    handledJump = jump.stamp;
    if (S.jump && S.jump.stamp === jump.stamp) S.jump = null;
    const d = el.closest('details');
    if (d && jump.open !== false && !d.open) d.open = true;
    el.scrollIntoView({ block: 'center', behavior: 'smooth' });
    el.classList.add('leftoff-flash');
    const t = setTimeout(() => el.classList.remove('leftoff-flash'), 3500);
    return () => clearTimeout(t);
  }, [jump && jump.stamp, built]);

  // put the editor where the piece being edited is
  useLayoutEffect(() => {
    if (!edit || !built.ok || !wrap.current) return;
    const root = wrap.current;
    let host, hide, hideClass, cleanup;
    if (edit.kind === 'unit') {
      const u = built.units[edit.id];
      const el = u && root.querySelector('[data-u="' + edit.id + '"]');
      if (!el) { setEdit(null); return; }
      const li = u.kind === 'li';
      host = document.createElement(li ? 'span' : 'div');
      host.className = 'u-host';
      el.parentNode.insertBefore(host, li ? el.nextSibling : el);
      el.classList.add('u-hidden'); hide = el; hideClass = 'u-hidden';
      const initial = unitText(lf, u);
      render(<UnitEditor unit={u} initial={initial}
        onSave={t => commit(applyUnitEdit(lf, u, t))}
        onCancel={() => setEdit(null)}
        onEnter={t => {
          const body1 = applyUnitEdit(lf, u, t);
          const added = t.split('\n').length - (u.end - u.start);
          const r = addSibling(body1, { ...u, end: u.end + added, full: u.full + added });
          commit(r.body, r.line);
        }}
        onRemove={() => commit(removeItem(lf, u))} />, host);
    } else if (edit.kind === 'new') {
      host = document.createElement('div');
      host.className = 'u-host u-new';
      const prev = edit.after >= 0 ? root.querySelector('.blk[data-blk="' + edit.after + '"]') : null;
      if (prev) prev.parentNode.insertBefore(host, prev.nextSibling);
      else { const first = root.querySelector('.blk'); if (first) first.parentNode.insertBefore(host, first); else root.appendChild(host); }
      hide = host; hideClass = 'u-new-open';
      render(<UnitEditor unit={{ kind: 'p', fresh: true }} initial="" placeholder="Type a line. Enter adds it, Shift+Enter for a new line, Esc cancels."
        onSave={t => { if (!t.trim()) { setEdit(null); return; } const r = insertParagraph(lf, edit.at, t); commit(r.body); }}
        onCancel={() => setEdit(null)} />, host);
    } else {
      const b = built.blocks[edit.index];
      const el = b && root.querySelector('.blk[data-blk="' + edit.index + '"]');
      if (!el) { setEdit(null); return; }
      host = document.createElement('div');
      host.className = 'blk-host';
      el.appendChild(host);
      el.classList.add('blk-editing'); hide = el; hideClass = 'blk-editing';
      render(<BlockEditor block={b} initial={blockText(lf, b)}
        onSave={t => commit(applyBlockEdit(lf, b, t))}
        onCancel={() => setEdit(null)} />, host);
    }
    cleanup = () => { render(null, host); host.remove(); hide.classList.remove(hideClass); };
    return cleanup;
  }, [edit, built]);

  if (!built.ok) return fallback;

  const unitOf = el => { const e = el && el.closest && el.closest('[data-u]'); return e && wrap.current && wrap.current.contains(e) ? built.units[+e.getAttribute('data-u')] : null; };
  const onClick = e => {
    if (edit) return;
    const box = e.target.closest && e.target.closest('input[data-task]');
    if (box) { e.preventDefault(); const u = built.units[+box.getAttribute('data-task')]; if (u) commit(toggleTask(lf, u)); return; }
    const pencil = e.target.closest && e.target.closest('[data-edit-blk]');
    if (pencil) { e.preventDefault(); setEdit({ kind: 'block', index: +pencil.getAttribute('data-edit-blk') }); return; }
    const empty = e.target.closest && e.target.closest('.u-empty');
    if (empty) { const u = unitOf(empty); if (u) { e.preventDefault(); setEdit({ kind: 'unit', id: u.id }); } }
  };
  const onDblClick = e => {
    if (edit) return;
    if (e.target.closest && e.target.closest('a, input, button, textarea')) return;
    const u = unitOf(e.target);
    if (u) { e.preventDefault(); getSelection().removeAllRanges(); setEdit({ kind: 'unit', id: u.id }); return; }
    // the empty space between two pieces (or under the last one): add a line there
    const root = wrap.current;
    const gap = e.target === root || e.target.parentNode === root || (e.target.classList && e.target.classList.contains('blk'));
    if (!gap) return;
    const els = [...root.querySelectorAll('.blk')];
    let above = -1;
    for (const el of els) { const r = el.getBoundingClientRect(); if (r.top + r.height / 2 < e.clientY) above = +el.getAttribute('data-blk'); }
    const n = newLineAfter(lf, built, above);
    e.preventDefault(); getSelection().removeAllRanges();
    if (n.kind === 'li') { const r = addSibling(lf, n.unit); commit(r.body, r.line); }
    else setEdit({ kind: 'new', at: n.at, after: above });
  };
  return (
    <div class="edit-body" ref={wrap} onClick={onClick} onDblClick={onDblClick}>
      <Markdown html={built.html} index={idx} rev={rev} ctx={note.path} />
    </div>
  );
}
