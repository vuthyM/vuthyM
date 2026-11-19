import { useEffect, useMemo, useState } from 'preact/hooks';
import { S, set, getIndex, toast } from './store.js';
import { Modal, assetUrl, copyText } from './common.jsx';
import { openMapAt, goto, navTo } from './actions.js';
import { SHORTCUTS, keysText } from '../core/shortcuts.js';
import { playerSafe, removedSummary } from '../core/playersafe.js';
import { distancesFrom, travelText, PACES, isMapNote, parsePins, fmtDistance } from '../core/maps.js';
import { basename } from '../core/util.js';

const close = () => set({ dialog: null });

/* ? : every keyboard shortcut */
export function ShortcutsDialog() {
  return (
    <Modal title="Keyboard shortcuts" onClose={close} wide focusFirst={false}>
      <div class="sc-list" id="shortcutList">
        {SHORTCUTS.map(g => (
          <section key={g.group} class="sc-group">
            <h3>{g.group}</h3>
            {g.items.map(([k, what]) => (
              <div key={k} class="sc-row"><span class="sc-keys">{keysText(k).split(/\s{2}\/\s{2}/).map((x, i) => <span key={i}>{i > 0 && <span class="muted"> or </span>}<kbd>{x}</kbd></span>)}</span><span class="sc-what">{what}</span></div>
            ))}
          </section>
        ))}
      </div>
      <p class="muted small">Press <kbd>?</kbd> again to close this.</p>
      <div class="modal-actions"><button class="btn btn-primary" onClick={close}>Close</button></div>
    </Modal>
  );
}

const download = (name, text) => {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([text], { type: 'text/markdown;charset=utf-8' }));
  a.download = name.replace(/[\\/:*?"<>|]/g, '-') + '.md';
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
};

/* a copy of a note without the DM's secrets, to read out, paste or send */
export function PlayerSafeDialog({ d }) {
  const note = getIndex().byPath.get(d.path);
  const text = note ? S.working.get(note.path) : '';
  const [plain, setPlain] = useState(true);
  const r = useMemo(() => playerSafe(text || '', note ? note.name : '', { plainLinks: plain }), [text, plain]);
  if (!note) return null;
  const sum = removedSummary(r.removed);
  return (
    <Modal title={'Player-safe copy of ' + note.name} onClose={close} wide focusFirst={false}>
      <p class="small" id="psSummary" style="margin-top:0">{r.total || r.removed.comments ? <><span class="pill pill-good">Taken out</span> {sum}.</> : <span class="muted">Nothing needed taking out: no secrets, DM sections, DM callouts or secret pins were found. Read it through before you share it.</span>}</p>
      <textarea id="psText" readonly style="width:100%;min-height:320px;font-family:var(--font-mono);font-size:13px" value={r.text} />
      <label class="small" style="display:flex;gap:6px;align-items:center;margin:6px 0"><input id="psPlain" type="checkbox" style="width:auto" checked={plain} onChange={e => setPlain(e.currentTarget.checked)} /> Turn [[links]] into plain words</label>
      <p class="muted small" style="margin:0 0 6px">It takes out sections headed Secrets, Clues, For the DM and similar, callouts marked secret or DM, lines starting <b>Secret:</b>, secret map pins and comments. Your note is not changed. Always give it a quick read first.</p>
      <div class="modal-actions">
        <button class="btn" id="psDownload" onClick={() => { download(note.name + ' (players)', r.text); toast('Downloaded.'); }}>Download .md</button>
        <button class="btn btn-primary" id="psCopy" onClick={() => copyText(r.text, 'Copied the player-safe text')}>Copy</button>
        <button class="btn" onClick={close}>Close</button>
      </div>
    </Modal>
  );
}

/* On a place's page: how far it is from the other places pinned on the same map, and how long that takes */
export function TravelTimes({ place }) {
  const idx = getIndex();
  const maps = (idx.byType.map || []).filter(n => isMapNote(n) && parsePins(n.body).some(p => p.place && (idx.resolve(p.place) || {}).path === place.path));
  const [aspects, setAspects] = useState({});
  useEffect(() => {
    let live = true;
    for (const m of maps) {
      const image = idx.findAsset(String(m.fm.image));
      if (!image || aspects[m.path]) continue;
      assetUrl(image).then(u => { const im = new Image(); im.onload = () => { if (live && im.naturalHeight) setAspects(a => ({ ...a, [m.path]: im.naturalWidth / im.naturalHeight })); }; im.src = u; }).catch(() => {});
    }
    return () => { live = false; };
  }, [maps.map(m => m.path).join('|')]);
  const blocks = maps.map(m => {
    const aspect = aspects[m.path];
    if (!aspect) return null;
    const rows = distancesFrom(idx, place, m, aspect);
    if (!rows.length) return null;
    const scaled = rows.some(r => r.metres !== null);
    return { m, rows, scaled };
  }).filter(Boolean);
  if (!blocks.length) return null;
  return (
    <div class="travel" id="locTravel">
      {blocks.map(({ m, rows, scaled }) => (
        <div key={m.path} class="travel-map">
          <div class="small"><b>From here on {basename(String(m.fm.image))}</b>{!scaled && <span class="muted"> · this map has no scale yet, so there are no distances. Measure a line on it to set one.</span>}</div>
          {scaled && (
            <table class="travel-table" data-travelmap={basename(String(m.fm.image))}>
              <thead><tr><th>Place</th><th>Distance</th>{PACES.map(([k, label]) => <th key={k}>{label}</th>)}</tr></thead>
              <tbody>
                {rows.filter(r => r.metres !== null).slice(0, 12).map(r => (
                  <tr key={r.note.path} data-travelto={r.note.name}>
                    <td><a href="#" onClick={e => { e.preventDefault(); navTo(r.note.path, e); }}>{r.note.name}</a></td>
                    <td>{fmtDistance(r.metres)}</td>
                    {PACES.map(([k, , perHour]) => <td key={k} data-pace={k}>{travelText(r.metres, perHour)}</td>)}
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      ))}
      <div class="muted small">Straight-line distance. Foot is 4.8 km/h (3 mph), a horse twice that, eight hours of travel a day; roads and rivers change it.</div>
    </div>
  );
}

/* "Pin on a map…": choose a map and the place is armed on it, ready to click where it goes */
export function PinOnMap({ place }) {
  const idx = getIndex();
  const maps = (idx.byType.map || []).filter(isMapNote).map(n => ({ n, image: idx.findAsset(String(n.fm.image)) })).filter(x => x.image);
  const pinnedOn = new Set(maps.filter(x => parsePins(x.n.body).some(p => p.place && (idx.resolve(p.place) || {}).path === place.path)).map(x => x.image));
  const free = maps.filter(x => !pinnedOn.has(x.image));
  if (!free.length) return null;
  return (
    <select id="locPinOnMap" aria-label="Pin this place on a map" style="width:auto;max-width:260px" value="" onChange={e => { const im = e.currentTarget.value; if (im) { openMapAt(im, place.path, { arm: true }); } }}>
      <option value="">Pin on a map…</option>{free.map(x => <option key={x.image} value={x.image}>{basename(x.image)}</option>)}
    </select>
  );
}
