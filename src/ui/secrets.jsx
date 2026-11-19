import { useState } from 'preact/hooks';
import { useApp, getIndex, toast } from './store.js';
import { secretsNow, setSecretRevealed, addSecretTo, currentSessionPath, goto, wantsNewTab } from './actions.js';
import { needsClues, CLUES_WANTED } from '../core/secrets.js';
import { Inline, plainInline } from './common.jsx';

/* every secret in your session and plot notes, what the players could find to learn it, and whether they have */
export function SecretsPage() {
  const s = useApp();
  const idx = getIndex();
  const groups = secretsNow();
  const [hide, setHide] = useState(true);
  const [text, setText] = useState('');
  const [clues, setClues] = useState('');
  const sessions = (idx.byType.session || []);
  const plots = (idx.byType.plot || []);
  const [target, setTarget] = useState(currentSessionPath() || (sessions[0] ? sessions[0].path : ''));
  const open = (p, e) => goto(p, { newTab: wantsNewTab(e) });
  const all = groups.flatMap(g => g.items);
  const left = all.filter(x => !x.done).length;
  const thin = all.filter(needsClues).length;
  const add = e => {
    e.preventDefault();
    if (!text.trim() || !target) return;
    if (addSecretTo(target, text, clues.split(/;|\n/).map(x => x.trim()).filter(Boolean))) { setText(''); setClues(''); toast('Added. Push changes to save it in the note.'); }
  };
  const tick = (g, it) => { if (setSecretRevealed(g.path, it.raw, !it.done)) toast(it.done ? 'Marked as not yet revealed.' : 'Marked as revealed, and added to the session log.'); };
  return (
    <>
      <div class="page-head"><div><h2 aria-level="1">Secrets and clues</h2><div class="muted small">What the players could learn, and where they can find it. {all.length ? left + ' of ' + all.length + ' still hidden' + (thin ? ' · ' + thin + ' with fewer than ' + CLUES_WANTED + ' ways to find them' : '') + '.' : ''}</div></div>
        <label class="small"><input type="checkbox" id="secHide" checked={hide} onChange={e => setHide(e.currentTarget.checked)} /> Hide the ones already revealed</label></div>
      <div class="card" style="margin-bottom:16px">
        <form onSubmit={add} id="secAddForm">
          <div class="field"><label class="lbl" for="secText">A secret or truth</label><input id="secText" name="secret-text" value={text} onInput={e => setText(e.currentTarget.value)} placeholder="The ferryman sold the bells" /></div>
          <div class="field"><label class="lbl" for="secClues">Where the players could find it <span class="muted small">(separate with ;)</span></label><input id="secClues" name="secret-clues" value={clues} onInput={e => setClues(e.currentTarget.value)} placeholder="Old Tam's ledger; Calder's confession; the missing rope" /></div>
          <div class="row-actions">
            <label class="small">Add it to <select id="secTarget" value={target} onChange={e => setTarget(e.currentTarget.value)} style="width:auto;display:inline-block"><optgroup label="Sessions">{sessions.map(n => <option key={n.path} value={n.path}>{n.name}</option>)}</optgroup>{plots.length > 0 && <optgroup label="Plot threads">{plots.map(n => <option key={n.path} value={n.path}>{n.name}</option>)}</optgroup>}</select></label>
            <button class="btn btn-primary" id="secAdd" type="submit" disabled={!text.trim() || !target}>Add</button>
          </div>
        </form>
        <p class="small muted" style="margin:8px 0 0">Secrets are tasks under “## Secrets and clues” in a session or plot thread note, so you can also write them in Obsidian. Three ways to find each one is a good number.</p>
      </div>
      {groups.length === 0 && <div class="card muted" id="secNone">No secrets yet. Add one above, or write them as tasks under “## Secrets and clues” in a session note.</div>}
      {groups.map(g => {
        const items = g.items.filter(it => !(hide && it.done));
        if (!items.length) return null;
        return (
          <div class="card" key={g.path} style="margin-bottom:12px" data-sec-note={g.name}>
            <h3 style="margin:0 0 6px"><a href="#" onClick={e => { e.preventDefault(); open(g.path, e); }}>{g.name}</a> <span class="muted small">{g.type === 'plot' ? 'plot thread' : 'session'}</span></h3>
            <ul class="sec-list">
              {items.map(it => (
                <li key={it.raw} class={it.done ? 'done' : ''} data-secret={it.secret}>
                  <label class="set-opt"><input type="checkbox" checked={it.done} aria-label={'Revealed: ' + plainInline(it.secret)} onChange={() => tick(g, it)} /> <span><strong><Inline text={it.secret} /></strong>{it.revealedIn && <span class="muted small"> · revealed in {it.revealedIn}</span>}</span></label>
                  <div class="sec-clues">{it.clues.map((c, i) => <span key={i} class="chip-link"><Inline text={c} /></span>)}{needsClues(it) && <span class="sec-warn small" data-thin>{it.clues.length} of {CLUES_WANTED} ways to find it</span>}</div>
                </li>
              ))}
            </ul>
          </div>
        );
      })}
    </>
  );
}
