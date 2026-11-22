import { useEffect, useState } from 'preact/hooks';
import { S, set, toast, useApp } from './store.js';
import { Modal } from './common.jsx';
import { atlasList, atlasPreview, atlasApply, goto } from './actions.js';

const close = () => set({ dialog: null });
const msg = e => (e && e.message ? e.message : String(e));
const plural = (n, w) => n + ' ' + w + (n === 1 ? '' : 's');

/* Menu, Import a dungeon from DMAtlas. DMAtlas keeps the picture and where the rooms are; DM Forge keeps what you write about them. */
export function AtlasDialog() {
  const s = useApp();
  const [phase, setPhase] = useState('loading');           // loading | list | preview | working | error
  const [data, setData] = useState(null);                  // { base, list }
  const [pre, setPre] = useState(null);                    // the preview of the one chosen
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState('');
  const load = () => {
    setPhase('loading'); setErr('');
    atlasList().then(d => { setData(d); setPhase('list'); }).catch(e => { setErr(msg(e)); setPhase('error'); });
  };
  useEffect(load, []);
  const pick = async id => {
    setBusy(id);
    try { setPre(await atlasPreview(id)); setPhase('preview'); }
    catch (e) { toast('Could not read that dungeon: ' + msg(e), true); }
    setBusy('');
  };
  const go = async () => {
    setPhase('working');
    try {
      const r = await atlasApply(pre);
      const p = pre.plan.summary;
      toast((p.noteIsNew ? 'Imported “' + pre.dungeon.name + '”' : 'Updated “' + pre.dungeon.name + '”') + ': ' + pre.text.replace(/\.$/, '') + '. Push changes to keep it; Discard all or Undo last push takes it back.');
      close();
      if (r.notePath) goto(r.notePath);
    } catch (e) { setErr(msg(e) + ' Nothing in your notes was changed.'); setPhase('error'); }
  };
  return (
    <Modal title="Import a dungeon from DMAtlas" onClose={close} wide focusFirst={false}>
      {phase === 'loading' && <p class="muted" id="atlasLoading">Asking DMAtlas what is published…</p>}
      {phase === 'working' && <p class="muted" id="atlasWorking">Fetching the pictures and preparing the notes…</p>}
      {phase === 'error' && (
        <div id="atlasError">
          <p style="margin-top:0"><span class="pill pill-bad">Could not import</span></p>
          <p class="small" id="atlasErrorText">{err}</p>
          <div class="modal-actions"><button class="btn" onClick={close}>Close</button><button class="btn btn-primary" id="atlasRetry" onClick={load}>Try again</button></div>
        </div>
      )}
      {phase === 'list' && data && (
        <>
          <p class="muted small" style="margin-top:0">DMAtlas draws the dungeon (the picture and where each room is). DM Forge keeps what you write: an import makes one note with a section for every room and a pin on the map for each, and importing again moves pins and renames headings but never touches your text. Published at <span class="mono">{data.base}</span>.</p>
          {data.list.length === 0 && <p id="atlasEmpty" class="muted">Nothing is published in DMAtlas yet. Publish a map there, then come back.</p>}
          {data.list.length > 0 && (
            <ul class="trash-list" id="atlasList">
              {data.list.map(d => (
                <li key={d.id} class="trash-row" data-atlas={d.id}>
                  <div><b>{d.name}</b> {d.path ? <span class="pill pill-good">Imported</span> : <span class="pill">New</span>}<div class="small muted">{plural(d.levels, 'level')} · {plural(d.rooms, 'room')}</div></div>
                  <button class="btn btn-sm" data-atlas-pick={d.id} disabled={!!busy} onClick={() => pick(d.id)}>{busy === d.id ? 'Reading…' : d.path ? 'Update…' : 'Import…'}</button>
                </li>
              ))}
            </ul>
          )}
          <div class="modal-actions"><button class="btn" onClick={close}>Close</button></div>
        </>
      )}
      {phase === 'preview' && pre && (
        <div id="atlasPlan">
          <p style="margin-top:0"><b>{pre.dungeon.name}</b> <span class="muted small">{plural(pre.plan.summary.levels, 'level')} · {plural(pre.plan.summary.rooms, 'room')}</span></p>
          <p id="atlasPlanText" style="margin:6px 0">{pre.plan.summary.nothing ? pre.text : 'This will make: ' + pre.text}</p>
          <ul class="small" style="margin:6px 0 10px;padding-left:18px">
            {pre.plan.summary.noteIsNew ? <li>A note called “{pre.plan.note.name}” in the Dungeons folder, with a section per room.</li> : <li>The note “{pre.plan.note.name}”: only room headings change; the text under them is never touched.</li>}
            <li>{pre.toFetch ? plural(pre.toFetch, 'picture') + ' to fetch from DMAtlas and store on this server.' : 'The pictures are already stored: nothing to download.'}</li>
            <li>A map with pins for {plural(pre.plan.maps.length, 'level')}; each pin opens its room’s section.</li>
            {pre.plan.summary.removedRooms > 0 && <li class="muted">Rooms DMAtlas no longer has are flagged “Removed in DMAtlas”, not deleted.</li>}
            <li>Secret rooms stay out of player-safe copies.</li>
          </ul>
          {pre.warnings.length > 0 && <div class="small" id="atlasWarnings" style="margin-bottom:8px"><span class="pill pill-warn">Skipped</span> {pre.warnings.slice(0, 5).join(' ')}</div>}
          <p class="muted small" style="margin:0 0 6px">Nothing is saved to your vault until you push, and Undo last push takes it back.</p>
          <div class="modal-actions"><button class="btn" id="atlasBack" onClick={() => { setPre(null); setPhase('list'); }}>Back</button><button class="btn btn-primary" id="atlasGo" disabled={pre.plan.summary.nothing} onClick={go}>{pre.plan.summary.nothing ? 'Nothing to import' : pre.plan.summary.noteIsNew ? 'Import' : 'Update'}</button></div>
        </div>
      )}
    </Modal>
  );
}
