import { useState } from 'preact/hooks';
import { S, set, toast, getIndex } from './store.js';
import { applyStarter, goto, addSampleToVault, sampleFiles, sampleCharacters, SAMPLE_FOLDER } from './actions.js';
import { emptyAnswers, buildStarter, TONES, PILLAR_LEVELS, SAFETY_TOOLS, ETIQUETTE, HOUSE_RULES, LENGTHS } from '../core/starter.js';
import { Modal } from './common.jsx';

const close = () => set({ dialog: null });
const toggle = (arr, v) => (arr.includes(v) ? arr.filter(x => x !== v) : [...arr, v]);
const STEPS = ['The campaign', 'The table', 'The players', 'Check and create'];

/* the session zero kit: four short steps, then it makes the notes (pending changes, like anything else) */
export function StarterDialog() {
  const [step, setStep] = useState(0);
  const [a, setA] = useState(() => emptyAnswers());
  const up = patch => setA({ ...a, ...patch });
  const plan = buildStarter(a);
  const setPlayer = (i, patch) => up({ players: a.players.map((p, k) => (k === i ? { ...p, ...patch } : p)) });
  const go = () => {
    const r = applyStarter(a);
    close();
    toast('Made ' + r.made.length + ' notes. Push changes to write them to your vault.');
    if (r.first) goto(r.first);
  };
  const last = step === STEPS.length - 1;
  return (
    <Modal title="Session zero kit" onClose={close} wide focusFirst={false}>
      <ol class="sz-steps" aria-label="Steps">{STEPS.map((t, i) => <li key={t} class={i === step ? 'on' : i < step ? 'done' : ''} aria-current={i === step ? 'step' : undefined}>{i + 1}. {t}</li>)}</ol>
      <div id="szStep" data-step={step}>
        {step === 0 && (
          <div class="stack">
            <p class="muted small" style="margin:0">A few questions about the campaign. Everything is optional, and you can change any of it later in the note it makes.</p>
            <div class="field"><label class="lbl" for="szPremise">The premise in a sentence or two</label><textarea id="szPremise" name="sz-premise" rows={2} value={a.premise} onInput={e => up({ premise: e.currentTarget.value })} placeholder="A frontier town where the temple bells vanished the night of the first frost." /></div>
            <div class="field"><label class="lbl" for="szSetting">Where it happens</label><input id="szSetting" name="sz-setting" value={a.setting} onInput={e => up({ setting: e.currentTarget.value })} placeholder="Greenhold and the river country" /></div>
            <div class="field"><div class="lbl">Tone <span class="muted small">(pick any)</span></div><div class="chips" role="group" aria-label="Tone">{TONES.map(t => <button key={t} type="button" class={'chip-btn' + (a.tones.includes(t) ? ' on' : '')} data-tone={t} aria-pressed={a.tones.includes(t)} onClick={() => up({ tones: toggle(a.tones, t) })}>{t}</button>)}</div></div>
            <div class="field"><div class="lbl">How much of each?</div>
              <div class="sz-pillars">{[['combat', 'Combat'], ['explore', 'Exploration'], ['social', 'Roleplay and social']].map(([k, l]) => <label key={k} class="small">{l} <select id={'szP-' + k} value={a.pillars[k]} onChange={e => up({ pillars: { ...a.pillars, [k]: e.currentTarget.value } })} style="width:auto;display:inline-block">{PILLAR_LEVELS.map(x => <option key={x} value={x}>{x}</option>)}</select></label>)}</div></div>
            <div class="sz-row"><label class="small">Starting level <input id="szLevel" type="number" min="1" max="20" value={a.level} onInput={e => up({ level: e.currentTarget.value })} style="width:70px" /></label>
              <label class="small">How long <select id="szLength" value={a.length} onChange={e => up({ length: e.currentTarget.value })} style="width:auto;display:inline-block">{LENGTHS.map(x => <option key={x} value={x}>{x}</option>)}</select></label></div>
          </div>
        )}
        {step === 1 && (
          <div class="stack">
            <div class="sz-row"><label class="small" style="flex:1">When you play <input id="szSchedule" name="sz-schedule" value={a.schedule} onInput={e => up({ schedule: e.currentTarget.value })} placeholder="Fortnightly, Tuesday 7pm" /></label>
              <label class="small">How long each time <input id="szLen" name="sz-sessionlen" value={a.sessionLength} onInput={e => up({ sessionLength: e.currentTarget.value })} placeholder="3 hours" style="width:120px" /></label></div>
            <div class="field"><label class="lbl" for="szLines">Lines: things you will not include <span class="muted small">(one per line)</span></label><textarea id="szLines" name="sz-lines" rows={2} value={a.lines} onInput={e => up({ lines: e.currentTarget.value })} /></div>
            <div class="field"><label class="lbl" for="szVeils">Veils: things that happen off-screen <span class="muted small">(one per line)</span></label><textarea id="szVeils" name="sz-veils" rows={2} value={a.veils} onInput={e => up({ veils: e.currentTarget.value })} /></div>
            <div class="field"><div class="lbl">Safety tools</div>{SAFETY_TOOLS.map(([id, label]) => <label class="set-opt" key={id}><input type="checkbox" data-tool={id} checked={a.tools.includes(id)} onChange={() => up({ tools: toggle(a.tools, id) })} /> <span>{label}</span></label>)}</div>
            <div class="field"><div class="lbl">How we play together</div>{ETIQUETTE.map(([id, label]) => <label class="set-opt" key={id}><input type="checkbox" data-etq={id} checked={a.etiquette.includes(id)} onChange={() => up({ etiquette: toggle(a.etiquette, id) })} /> <span>{label}</span></label>)}</div>
            <div class="field"><div class="lbl">House rules <span class="muted small">(tick any you want)</span></div>{HOUSE_RULES.map((r, i) => <label class="set-opt" key={r}><input type="checkbox" data-house={i} checked={a.houseRules.includes(r)} onChange={() => up({ houseRules: toggle(a.houseRules, r) })} /> <span>{r}</span></label>)}
              <textarea id="szCustom" name="sz-custom" rows={2} placeholder="Your own, one per line" value={a.customRules} onInput={e => up({ customRules: e.currentTarget.value })} style="margin-top:6px" /></div>
          </div>
        )}
        {step === 2 && (
          <div class="stack">
            <p class="muted small" style="margin:0">Add the players. Each becomes a note under Players with their level and class, and prompts for their backstory and hooks. The questionnaire to send them is made as well.</p>
            {a.players.map((p, i) => (
              <div class="sz-player" key={i} data-pl={i}>
                <input name="sz-player" aria-label={'Player ' + (i + 1) + ' real name'} placeholder="Player" value={p.player} onInput={e => setPlayer(i, { player: e.currentTarget.value })} />
                <input name="sz-character" aria-label={'Player ' + (i + 1) + ' character'} placeholder="Character" value={p.character} onInput={e => setPlayer(i, { character: e.currentTarget.value })} />
                <input name="sz-class" aria-label={'Player ' + (i + 1) + ' class'} placeholder="Class" value={p.cls} onInput={e => setPlayer(i, { cls: e.currentTarget.value })} style="max-width:140px" />
                <button type="button" class="btn btn-sm btn-ghost" aria-label={'Remove player ' + (i + 1)} disabled={a.players.length < 2} onClick={() => up({ players: a.players.filter((_, k) => k !== i) })}>Remove</button>
              </div>
            ))}
            <div><button type="button" class="btn btn-sm" id="szAddPlayer" disabled={a.players.length >= 10} onClick={() => up({ players: [...a.players, { player: '', character: '', cls: '' }] })}>+ Add a player</button></div>
            <div class="field"><label class="lbl" for="szThread">A first plot thread <span class="muted small">(optional: a title)</span></label><input id="szThread" name="sz-thread" value={a.thread} onInput={e => up({ thread: e.currentTarget.value })} placeholder="The missing bells" /></div>
            <label class="set-opt"><input type="checkbox" id="szSession1" checked={a.session1} onChange={e => up({ session1: e.currentTarget.checked })} /> <span><strong>Also make Session 1</strong> <span class="muted small">with a prep outline: a strong start, three scenes with times, secrets and clues, and what must happen.</span></span></label>
          </div>
        )}
        {step === 3 && (
          <div class="stack">
            <p style="margin:0">These notes will be made, as pending changes you can look over before pushing:</p>
            <ul id="szSummary" class="sz-sum">
              {plan.notes.map(n => <li key={n.kind + n.name}><strong>{n.name}</strong> <span class="muted small">{n.kind === 'root' ? 'in the campaign folder' : n.kind === 'player' ? 'player' : 'plot thread'}</span></li>)}
              {plan.session1 && <li><strong>Session 1</strong> <span class="muted small">with a prep outline</span></li>}
            </ul>
            <p class="muted small" style="margin:0">Nothing is written to your vault until you push. If a note with the same name already exists, the new one gets a number instead of replacing it.</p>
          </div>
        )}
      </div>
      <div class="modal-actions">
        <button type="button" class="btn" onClick={close}>Cancel</button>
        {step > 0 && <button type="button" class="btn" id="szBack" onClick={() => setStep(step - 1)}>Back</button>}
        {!last ? <button type="button" class="btn btn-primary" id="szNext" onClick={() => setStep(step + 1)}>Next</button> : <button type="button" class="btn btn-primary" id="szCreate" onClick={go}>Make these notes</button>}
      </div>
    </Modal>
  );
}

/* the sample campaign, added to the vault as its own folder (the practice campaign needs no vault, so it is hidden there) */
export function SampleDialog() {
  const [folder, setFolder] = useState(SAMPLE_FOLDER);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [done, setDone] = useState(null);
  const [chars, setChars] = useState(false);
  const n = sampleFiles().length, nc = sampleCharacters().length;
  const go = async e => {
    if (e && e.preventDefault) e.preventDefault();
    setBusy(true); setErr('');
    const r = await addSampleToVault(folder, { characters: chars });
    setBusy(false);
    if (r.ok) setDone(r); else setErr(r.error);
  };
  return (
    <Modal title="Add the sample campaign to your vault" onClose={close}>
      {done ? (
        <div id="sampleDone">
          <p style="margin-top:0">Added <strong>{done.written}</strong> notes to a new folder called <strong>{done.folder}</strong> in your vault. It is Ashfall, a complete campaign (NPCs, players, places, factions, plot threads, six sessions, items, a Bestiary, clocks and a cheat sheet) to explore or to learn from.{done.characters > 0 && <> {done.characters} example characters were added to your Character Library, in their own <strong>Examples</strong> section (Tools, Characters), apart from your own.</>} Remove it all later from the Menu (Remove the sample campaign).</p>
          <p class="muted small">It is a separate campaign: open <strong>Switch campaign</strong> (bottom of the sidebar) and choose it. Your own notes were not touched.</p>
          <div class="modal-actions"><button class="btn btn-primary" id="sampleClose" onClick={close}>Done</button></div>
        </div>
      ) : (
        <form onSubmit={go}>
          <p style="margin-top:0">This writes {n} notes into a <strong>new folder</strong> in your vault, so you have a whole campaign to look around in. It never writes into a folder that already has something in it, and it does not touch your own notes. For a try-out that saves nothing at all, use the practice campaign from the start screen.</p>
          <div class="field"><label class="lbl" for="sampleFolder">Folder name</label><input id="sampleFolder" name="sample-folder" value={folder} onInput={e => setFolder(e.currentTarget.value)} /></div>
          <label class="small" style="display:flex;gap:8px;align-items:flex-start;margin-bottom:10px"><input type="checkbox" id="sampleChars" style="width:auto;margin-top:3px" checked={chars} onChange={e => setChars(e.currentTarget.checked)} /><span>Also add {nc} example characters to your Character Library, in their own Examples section apart from your own (levels 1 to 20, players and NPCs).</span></label>
          {err && <div class="claude-error small" id="sampleError" role="alert">{err}</div>}
          <div class="modal-actions"><button type="button" class="btn" onClick={close}>Cancel</button><button type="submit" class="btn btn-primary" id="sampleGo" disabled={busy || !folder.trim()}>{busy ? 'Writing…' : 'Add the sample campaign'}</button></div>
        </form>
      )}
    </Modal>
  );
}
