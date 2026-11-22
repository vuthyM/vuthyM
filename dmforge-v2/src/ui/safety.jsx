import { useEffect, useState } from 'preact/hooks';
import { S, set, toast, touch } from './store.js';
import { Modal } from './common.jsx';
import { listTrash, restoreFromTrash, reloadCampaign, askSwitchVersion, openTab, setSection } from './actions.js';
import { basename, dirname } from '../core/util.js';

const close = () => set({ dialog: null });
const nice = ms => (ms ? new Date(ms).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }) : '');

/* Menu, Trash: the notes deleted from this campaign. Deleting only ever moves a note here; Restore puts it back where it was. */
export function TrashDialog() {
  const [list, setList] = useState(null);
  const [err, setErr] = useState('');
  const [back, setBack] = useState([]);          // names restored in this visit
  const [busy, setBusy] = useState('');
  useEffect(() => {
    let live = true;
    listTrash().then(l => live && setList(l)).catch(e => live && setErr(e && e.message ? e.message : String(e)));
    return () => { live = false; };
  }, []);
  const done = () => { close(); if (back.length) reloadCampaign(); };
  const restore = async x => {
    setBusy(x.path);
    try {
      const to = await restoreFromTrash(x.path);
      setBack([...back, basename(to).replace(/\.md$/i, '')]);
      setList(list.filter(y => y.path !== x.path));
    } catch (e) { toast('Could not restore it: ' + (e && e.message ? e.message : e), true); }
    setBusy('');
  };
  const pend = S.working ? [...S.working.pending.entries()].filter(([, v]) => v && v.kind === 'delete').length : 0;
  return (
    <Modal title="Trash" onClose={done} wide focusFirst={false}>
      <p class="muted small" style="margin-top:0">Notes you delete are moved to your vault’s <span class="mono">.trash</span> folder when you push, never erased. Restore puts one back where it was (as “… (restored)” if something is there now).{pend ? ' ' + pend + ' more ' + (pend === 1 ? 'is' : 'are') + ' waiting to be pushed to the trash; those can still be undone from the pending changes.' : ''}</p>
      {err && <p class="small" style="color:var(--danger)">Could not read the trash: {err}</p>}
      {!list && !err && <p class="muted">Looking…</p>}
      {list && list.length === 0 && <p id="trashEmpty" class="muted">Nothing in the trash for this campaign.</p>}
      {list && list.length > 0 && (
        <ul class="trash-list" id="trashList">
          {list.map(x => (
            <li key={x.path} class="trash-row" data-trash={basename(x.original)}>
              <div><b>{basename(x.original).replace(/\.md$/i, '')}</b><div class="small muted">{dirname(x.original).split('/').slice(1).join(' › ') || 'campaign folder'} · file dated {nice(x.mtime)}</div></div>
              <button class="btn btn-sm" data-restore={basename(x.original)} disabled={busy === x.path} onClick={() => restore(x)}>{busy === x.path ? 'Restoring…' : 'Restore'}</button>
            </li>
          ))}
        </ul>
      )}
      {back.length > 0 && <p class="small" id="trashRestored"><span class="pill pill-good">Restored</span> {back.join(', ')}. They show up when you close this.</p>}
      <div class="modal-actions"><button class="btn btn-primary" id="trashDone" onClick={done}>{back.length ? 'Done' : 'Close'}</button></div>
    </Modal>
  );
}

/* Menu, Version: the version you are on, and the one before (or after a roll back, the newer one) one click away */
export function VersionDialog() {
  const [info, setInfo] = useState(null);
  const [err, setErr] = useState('');
  useEffect(() => {
    let live = true;
    S.vault.rollbackInfo().then(i => live && setInfo(i)).catch(e => live && setErr(e && e.message ? e.message : String(e)));
    return () => { live = false; };
  }, []);
  const history = e => { close(); if (e.ctrlKey || e.metaKey) openTab({ section: 'history' }); else setSection('history'); };
  return (
    <Modal title="Version" onClose={close} focusFirst={false}>
      <p style="margin-top:0">You are on <b id="verNow">{(info && info.current) || __DMF_VERSION__}</b>.</p>
      {err && <p class="small" style="color:var(--danger)">Could not ask the helper: {err}</p>}
      {!info && !err && <p class="muted small">Checking…</p>}
      {info && (
        <div class="menu-list">
          {info.previous
            ? <button class="menu-item" id="verBack" onClick={() => askSwitchVersion('back', info)}><span class="menu-item-title">Roll back to {info.previous}</span><span class="muted small">Put the version before this one back. Your notes are not touched.</span></button>
            : <div class="small muted" id="verNoBack">There is no earlier version kept yet. One is kept each time you install an update.</div>}
          {info.forward && <button class="menu-item" id="verForward" onClick={() => askSwitchVersion('forward', info)}><span class="menu-item-title">Go forward to {info.forward}</span><span class="muted small">You rolled back from it. Put it back.</span></button>}
          <button class="menu-item" id="verHistory" onClick={history}><span class="menu-item-title">What changed in each version</span><span class="muted small">The version history</span></button>
        </div>
      )}
      <p class="muted small">Switching restarts the helper in its Terminal window for you and reloads this page. Unpushed changes are kept.</p>
      <div class="modal-actions"><button class="btn" onClick={close}>Close</button></div>
    </Modal>
  );
}

/* More menu, Earlier versions (the V3 server keeps every version of every note): look at one, and stage it as your current text.
   Nothing is written until you push, so it can still be changed or thrown away. */
const WHAT = { write: 'Saved', trash: 'Deleted', restore: 'Restored from the trash', import: 'Imported', undo: 'Put back by an undo' };
const when = ms => new Date(ms).toLocaleString(undefined, { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });
export function NoteHistoryDialog({ path }) {
  const [list, setList] = useState(null);
  const [err, setErr] = useState('');
  const [open, setOpen] = useState(null);         // { version, text }
  useEffect(() => {
    let live = true;
    S.vault.history(path).then(l => live && setList(l)).catch(e => live && setErr(e && e.message ? e.message : String(e)));
    return () => { live = false; };
  }, [path]);
  const look = async v => {
    try { setOpen({ version: v.version, text: await S.vault.versionText(path, v.version) }); }
    catch (e) { toast('Could not read that version: ' + (e && e.message ? e.message : e), true); }
  };
  const current = S.working.get(path);
  const use = () => {
    S.working.setText(path, open.text);
    touch();
    toast('Staged an earlier version of “' + basename(path).replace(/\.md$/i, '') + '”. Push changes to save it; until then you can still change it or discard it.');
    close();
  };
  return (
    <Modal title={'Earlier versions of ' + basename(path).replace(/\.md$/i, '')} onClose={close} wide focusFirst={false}>
      <p class="muted small" style="margin-top:0">The server keeps every version of every note it has ever held, so nothing a push overwrites is lost. Pick one to read it; “Use this version” stages it as your current text.</p>
      {err && <p class="small" style="color:var(--danger)">Could not read the history: {err}</p>}
      {!list && !err && <p class="muted">Looking…</p>}
      {list && list.length === 0 && <p class="muted">This note has no saved history yet.</p>}
      {list && list.length > 0 && (
        <ul class="trash-list" id="historyList">
          {list.map(v => (
            <li key={v.seq} class="trash-row" data-version={v.version}>
              <div><b>{when(v.mtime)}</b><div class="small muted">{WHAT[v.action] || v.action}{v.device ? ' · from ' + v.device : ''} · {v.size || 0} characters</div></div>
              <button class="btn btn-sm" data-look={v.version} onClick={() => look(v)}>{open && open.version === v.version ? 'Showing' : 'Look'}</button>
            </li>
          ))}
        </ul>
      )}
      {open && <pre class="hist-pre" id="historyText" style="max-height:260px;overflow:auto;white-space:pre-wrap;background:var(--surface-2);border:1px solid var(--border);border-radius:8px;padding:10px;font-size:13px">{open.text}</pre>}
      <div class="modal-actions">
        <button class="btn" onClick={close}>Close</button>
        <button class="btn btn-primary" id="historyUse" disabled={!open || open.text === current} onClick={use}>{open && open.text === current ? 'That is the current text' : 'Use this version'}</button>
      </div>
    </Modal>
  );
}
