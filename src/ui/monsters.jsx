import { useEffect, useMemo, useState } from 'preact/hooks';
import { S, set, useApp, getIndex, toast } from './store.js';
import { saveCombat, saveToBestiary, saveMonsterForm, deleteNote, goto } from './actions.js';
import * as C from '../core/combat.js';
import { loadSrd, srdLoaded, searchMonsters, monsterTypes, bestiaryNotes, noteMonster, combatSpec, statBlockMarkdown, crLabel, crXp, CR_STEPS, SRD_CREDIT } from '../core/monsters.js';
import { Modal, Markdown } from './common.jsx';
import { blankMonster, monsterToForm, checkForm, readForm, parseStatBlock, abMod, SIZES, ABILITIES } from '../core/custommonster.js';

const close = () => set({ dialog: null });
const LIMIT = 60;

/* the SRD set (unpacked on first use) and your Bestiary notes, as one list */
export function useMonsters() {
  const s = useApp();
  const [srd, setSrd] = useState(srdLoaded());
  const [err, setErr] = useState('');
  useEffect(() => {
    if (srd || s.settings.srdOn === false) return;
    loadSrd().then(setSrd).catch(e => setErr('Could not unpack the built-in monsters: ' + (e && e.message ? e.message : e)));
  }, [s.settings.srdOn]);
  const idx = getIndex();
  const mine = useMemo(() => bestiaryNotes(idx).map(noteMonster), [idx]);
  const all = useMemo(() => [...mine, ...(s.settings.srdOn === false || !srd ? [] : srd)], [mine, srd, s.settings.srdOn]);
  return { all, mine, loading: s.settings.srdOn !== false && !srd && !err, err };
}


/* the form for a custom monster. `start` is the form to begin with; onSave gets the finished form, onCancel throws it away. */
function MonsterEditor({ start, editing, onSave, onCancel }) {
  const [f, setF] = useState(start);
  const [paste, setPaste] = useState('');
  const [note, setNote] = useState('');
  const [tried, setTried] = useState(false);
  const errs = checkForm(f);
  const bad = Object.keys(errs).length > 0;
  const up = (k, v) => setF(x => ({ ...x, [k]: v }));
  const upAb = (i, v) => setF(x => ({ ...x, ab: x.ab.map((a, j) => (j === i ? v.replace(/[^\d]/g, '').slice(0, 2) : a)) }));
  const fill = () => {
    const r = parseStatBlock(paste);
    if (!r.count) { setNote('Could not find anything to read there. Paste the whole stat block: the name, then lines like “AC 15” and “HP 7 (2d6)”.'); return; }
    setF(x => ({ ...x, ...r.fields }));
    setNote('Filled in ' + r.count + ' field' + (r.count === 1 ? '' : 's') + (r.missing.length ? '. Still to fill in: ' + r.missing.map(k => ({ name: 'name', ac: 'armour class', hp: 'hit points', cr: 'challenge rating' }[k])).join(', ') : '') + '. Check them over before you save.');
  };
  const save = e => { e.preventDefault(); setTried(true); if (!bad) onSave(f); };
  const err = k => (tried || f[k]) && errs[k] ? <div class="small me-err" data-err={k}>{errs[k]}</div> : null;
  const text = (k, label, props = {}) => <label class="me-f"><span class="lbl">{label}</span><input id={'me-' + k} value={f[k]} onInput={e => up(k, e.currentTarget.value)} {...props} />{err(k)}</label>;
  const area = (k, label, hint) => <label class="me-f me-wide"><span class="lbl">{label}</span><textarea id={'me-' + k} rows="4" value={f[k]} placeholder={hint} onInput={e => up(k, e.currentTarget.value)} /></label>;
  return (
    <form class="me" id="monsterEditor" onSubmit={save}>
      <div class="me-head"><h4 style="margin:0">{editing ? 'Edit ' + start.name : 'New monster'}</h4><span class="small muted">Saved as a note in your Bestiary, so Obsidian has it too. Feet are shown in metres.</span></div>
      <details class="me-paste" id="mePasteBox" open={!editing && !start.name}>
        <summary>Paste a stat block</summary>
        <textarea id="mePaste" rows="7" placeholder={'Paste from a book or your notes, for example:\nGoblin Warrior\nSmall Humanoid, Chaotic Neutral\nAC 15  HP 10 (3d6)  Speed 30 ft.\n...'} value={paste} onInput={e => setPaste(e.currentTarget.value)} />
        <div class="row-actions"><button type="button" class="btn btn-sm" id="mePasteFill" disabled={!paste.trim()} onClick={fill}>Fill in the form</button>{note && <span class="small" id="mePasteNote" role="status">{note}</span>}</div>
      </details>
      <div class="me-grid">
        {text('name', 'Name', { autoFocus: !start.name, name: 'monster-name' })}
        <label class="me-f"><span class="lbl">Size</span><select id="me-size" value={f.size} onChange={e => up('size', e.currentTarget.value)}>{SIZES.map(z => <option key={z} value={z}>{z}</option>)}</select></label>
        {text('type', 'Type', { placeholder: 'beast, humanoid (goblinoid)…' })}
        {text('align', 'Alignment', { placeholder: 'unaligned, chaotic evil…' })}
        {text('ac', 'Armour class', { inputMode: 'numeric' })}
        {text('acd', 'Armour note', { placeholder: 'leather armour, shield' })}
        {text('hp', 'Hit points', { inputMode: 'numeric' })}
        {text('hd', 'Hit dice', { placeholder: '3d6+3 (to roll HP)' })}
        {text('ini', 'Initiative bonus', { placeholder: 'from Dex', inputMode: 'numeric' })}
        <label class="me-f"><span class="lbl">Challenge rating</span><select id="me-cr" value={f.cr} onChange={e => up('cr', e.currentTarget.value)}>{CR_STEPS.map(c => <option key={c} value={crLabel(c)}>{crLabel(c)}</option>)}</select>{err('cr')}</label>
        {text('speed', 'Speed', { placeholder: '9 m, fly 18 m' })}
      </div>
      <div class="me-abs" role="group" aria-label="Ability scores">
        {ABILITIES.map((a, i) => <label key={a} class="me-ab"><span class="lbl">{a}</span><input id={'me-ab' + i} inputMode="numeric" value={f.ab[i]} onInput={e => upAb(i, e.currentTarget.value)} /><span class="small muted">{(abMod(f.ab[i]) >= 0 ? '+' : '−') + Math.abs(abMod(f.ab[i]))}</span></label>)}
      </div>
      <details class="me-more" open={!!(f.sv || f.sk || f.dv || f.dr || f.di || f.ci || f.se || f.ln)}>
        <summary>Saves, skills, resistances, senses and languages</summary>
        <div class="me-grid">
          {text('sv', 'Saving throws', { placeholder: 'Dex +4' })}
          {text('sk', 'Skills', { placeholder: 'Stealth +6' })}
          {text('dv', 'Damage vulnerabilities')}
          {text('dr', 'Damage resistances')}
          {text('di', 'Damage immunities')}
          {text('ci', 'Condition immunities')}
          {text('se', 'Senses', { placeholder: 'Darkvision 18 m; Passive Perception 9' })}
          {text('ln', 'Languages', { placeholder: 'Common, Goblin' })}
        </div>
      </details>
      <div class="me-areas">
        {area('tr', 'Traits', '**Nimble Escape.** The goblin can Disengage as a bonus action.')}
        {area('act', 'Actions', '**Scimitar.** Melee: +4 to hit, reach 1.5 m. Hit: 5 (1d6 + 2) slashing damage.')}
        {area('ba', 'Bonus actions')}
        {area('re', 'Reactions')}
        {area('la', 'Legendary actions', '**Tail Swipe (Costs 2 Actions).** …')}
      </div>
      <div class="small muted">One ability per paragraph, written <b>**Name.** what it does</b>.</div>
      {tried && bad && <div class="claude-error small" role="alert" id="meErrors">{Object.values(errs).join(' ')}</div>}
      <div class="modal-actions"><button type="button" class="btn" id="meCancel" onClick={onCancel}>Cancel</button><button type="submit" class="btn btn-primary" id="meSave">{editing ? 'Save changes' : 'Save monster'}</button></div>
    </form>
  );
}

export function MonsterLibrary() {
  const { all, mine, loading, err } = useMonsters();
  const [q, setQ] = useState('');
  const [crMin, setCrMin] = useState('');
  const [crMax, setCrMax] = useState('');
  const [type, setType] = useState('');
  const [sel, setSel] = useState('');
  const [count, setCount] = useState(1);
  const [roll, setRoll] = useState(false);
  const [ed, setEd] = useState(null);                 // the monster editor: { start, path } while it is open
  const [sure, setSure] = useState(false);            // asked "really delete?"
  const list = useMemo(() => searchMonsters(all, { q, crMin: crMin === '' ? null : +crMin, crMax: crMax === '' ? null : +crMax, type }), [all, q, crMin, crMax, type]);
  const types = useMemo(() => monsterTypes(all), [all]);
  const m = all.find(x => x.key === sel) || null;
  const md = useMemo(() => (m ? statBlockMarkdown(m) : ''), [m]);
  const idx = getIndex();
  const add = () => {
    if (!m || !S.combat) return;
    const n = Math.max(1, Math.min(30, Math.floor(+count) || 1));
    const spec = combatSpec(m, { roll });
    if (m.src === 'note' && m.hp === null) toast('“' + m.n + '” has no HP in its note, so it starts with 1.', true);
    if (roll && n > 1) {                                   // each one gets its own roll of the dice
      for (let i = 0; i < n; i++) { const sp = combatSpec(m, { roll: true }); C.addCombatant(S.combat, { ...sp, name: m.n + ' ' + (i + 1), init: 'roll', count: 1 }); }
    } else C.addCombatant(S.combat, { ...spec, count: n, init: 'roll' });
    saveCombat();
    toast('Added ' + (n > 1 ? n + ' × ' : '') + m.n + ' to the fight, with initiative rolled.');
  };
  const own = m && m.src === 'note' ? readForm(m.text || '') : null;       // made with the form, and not changed since: it can be edited with the form
  const openNew = () => setEd({ start: blankMonster(), path: null });
  const openCopy = () => setEd({ start: monsterToForm(m), path: null });
  const openEdit = () => setEd({ start: own.form, path: m.path });
  const saved = form => { const p = saveMonsterForm(form, ed.path); toast((ed.path ? 'Changed' : 'Saved') + ' “' + form.name.trim() + '”. Push changes to write it to your vault.'); setEd(null); setSel('note:' + p); };
  const del = () => { deleteNote(m.path); toast('Deleted “' + m.n + '”. Push changes to remove it from your vault (it goes to the vault’s trash).'); setSure(false); setSel(''); };
  const keep = () => { const p = saveToBestiary(m); toast('Saved “' + m.n + '” to the Bestiary. Push changes to write it to your vault.'); setSel('note:' + p); };
  return (
    <Modal title="Monster library" onClose={close} wide focusFirst={false}>
      <div class="ml">
        <div class="ml-side">
          <button class="btn btn-primary" id="mlNew" onClick={openNew}>＋ New monster</button>
          <input id="mlSearch" type="search" placeholder="Search by name or type" aria-label="Search monsters" value={q} onInput={e => setQ(e.currentTarget.value)} autoFocus />
          <div class="ml-filters">
            <label class="small">CR from <select id="mlCrMin" value={crMin} onChange={e => setCrMin(e.currentTarget.value)}><option value="">any</option>{CR_STEPS.map(c => <option key={c} value={c}>{crLabel(c)}</option>)}</select></label>
            <label class="small">to <select id="mlCrMax" value={crMax} onChange={e => setCrMax(e.currentTarget.value)}><option value="">any</option>{CR_STEPS.map(c => <option key={c} value={c}>{crLabel(c)}</option>)}</select></label>
            <label class="small">Type <select id="mlType" value={type} onChange={e => setType(e.currentTarget.value)}><option value="">any</option>{types.map(t => <option key={t} value={t}>{t}</option>)}</select></label>
          </div>
          <div class="small muted" id="mlCount">{loading ? 'Unpacking the built-in monsters…' : list.length + ' of ' + all.length + (mine.length ? ' (' + mine.length + ' of them yours)' : '')}</div>
          {err && <div class="claude-error small" role="alert">{err}</div>}
          <ul class="ml-list" id="mlList">
            {list.slice(0, LIMIT).map(x => (
              <li key={x.key}><button class={'ml-item' + (x.key === sel ? ' on' : '')} data-mon={x.key} onClick={() => { setSel(x.key); setSure(false); setEd(null); }}>
                <span class="ml-name">{x.n}{x.mine && <span class="pill pill-good" style="margin-left:6px">Mine</span>}</span>
                <span class="muted small">CR {crLabel(x.cr)}{x.t ? ' · ' + x.t : ''}{x.ac != null ? ' · AC ' + x.ac : ''}{x.hp != null ? ' · HP ' + x.hp : ''}</span>
              </button></li>
            ))}
            {list.length > LIMIT && <li class="small muted" style="padding:6px">Showing the first {LIMIT}. Search or filter to narrow it down.</li>}
            {!list.length && !loading && <li class="small muted" style="padding:6px">No monster matches that.</li>}
          </ul>
        </div>
        <div class="ml-main">
          {ed ? <MonsterEditor key={ed.path || 'new'} start={ed.start} editing={!!ed.path} onSave={saved} onCancel={() => setEd(null)} /> : m ? (
            <>
              <h4 style="margin:0 0 6px" id="mlTitle">{m.n}</h4>
              <div class="ml-actions">
                <label class="small">How many <input id="mlHowMany" type="number" min="1" max="30" value={count} onInput={e => setCount(e.currentTarget.value)} style="width:70px" /></label>
                <label class="set-opt small"><input type="checkbox" id="mlRoll" checked={roll} onChange={e => setRoll(e.currentTarget.checked)} /> <span>Roll HP{m.hd ? ' (' + m.hd + ')' : ''} instead of the average</span></label>
                <button class="btn btn-primary" id="mlAdd" disabled={!S.combat} title={S.combat ? '' : 'Start a combat first'} onClick={add}>Add to the fight</button>
                {m.src === 'srd' ? <button class="btn" id="mlKeep" title="Make an editable copy in your Bestiary category" onClick={keep}>Save to Bestiary</button> : <button class="btn" id="mlOpen" onClick={() => { close(); goto(m.path); }}>Open the note</button>}
                <button class="btn" id="mlCopy" title="Start a new monster from this one, and change what you like" onClick={openCopy}>Copy and edit…</button>
                {own && !own.edited && <button class="btn" id="mlEdit" onClick={openEdit}>Edit</button>}
                {m.src === 'note' && (sure ? <span class="ml-sure small"><b>Delete “{m.n}”?</b> <button class="btn btn-sm btn-danger" id="mlDeleteYes" onClick={del}>Yes, delete</button> <button class="btn btn-sm" id="mlDeleteNo" onClick={() => setSure(false)}>No</button></span> : <button class="btn btn-ghost" id="mlDelete" onClick={() => setSure(true)}>Delete</button>)}
              </div>
              {!S.combat && <div class="small" style="color:var(--accent-text,var(--accent))">Start a combat first, then add monsters to it.</div>}
              {m.src === 'note' && own && own.edited && <div class="small muted" id="mlEditedNote">This note was changed outside the form, so open it to edit. “Copy and edit” still works.</div>}
              <div class="ml-block" id="mlBlock"><Markdown body={md} index={idx} rev={0} /></div>
            </>
          ) : <p class="muted" id="mlHint">Pick a monster on the left to see its stat block.</p>}
          {all.some(x => x.src === 'srd') && <p class="small muted" id="mlCredit" style="margin-top:12px">{SRD_CREDIT}</p>}
        </div>
      </div>
      <div class="modal-actions"><button class="btn btn-primary" onClick={close}>Done</button></div>
    </Modal>
  );
}

/* the stat block of a creature in the fight */
export function StatBlockDialog({ k, name }) {
  const [m, setM] = useState(null);
  const [missing, setMissing] = useState(false);
  const idx = getIndex();
  useEffect(() => {
    if (String(k).startsWith('note:')) {
      const n = idx.byPath.get(String(k).slice(5));
      if (n) setM(noteMonster(n)); else setMissing(true);
    } else loadSrd().then(list => { const f = list.find(x => x.key === k); if (f) setM(f); else setMissing(true); }).catch(() => setMissing(true));
  }, [k]);
  return (
    <Modal title={name || (m && m.n) || 'Stat block'} onClose={close} wide focusFirst={false}>
      {m ? <div class="ml-block" id="sbBlock"><Markdown body={statBlockMarkdown(m)} index={idx} rev={0} /></div> : missing ? <p class="muted">That stat block is not available any more.</p> : <p class="muted">Loading…</p>}
      {m && m.src === 'srd' && <p class="small muted">{SRD_CREDIT}</p>}
      <div class="modal-actions"><button class="btn btn-primary" onClick={close}>Close</button></div>
    </Modal>
  );
}
