import { useLayoutEffect, useRef, useState } from 'preact/hooks';
import { S, set, useApp, getIndex, toast } from './store.js';
import { saveCombat, undoCombat, logCombatToSession, goto, currentSessionPath, addMonstersToCombat } from './actions.js';
import { useMonsters } from './monsters.jsx';
import { absentOf } from '../core/party.js';
import * as C from '../core/combat.js';
import { fieldDefs, getField } from '../core/schema.js';
import { Empty, Modal } from './common.jsx';

const num = v => { const n = Number(v); return Number.isFinite(n) ? n : 0; };
const isNumeric = v => v !== '' && v !== '-' && v !== '+' && Number.isFinite(Number(v));

function playerStat(note, key) {
  const f = fieldDefs('player').find(x => x.key === key);
  const v = f ? getField(note, f).value : '';
  return v === '' ? null : num(v);
}

/* death saving throws for a player at 0 hit points */
function DeathSaves({ c, st }) {
  const d = c.ds || { s: 0, f: 0 };
  const state = C.deathState(c);
  const go = k => { C.deathSave(st, c.id, k); saveCombat(); };
  const dots = (n, kind) => [0, 1, 2].map(i => <span key={i} class={'dot' + (i < n ? ' on ' + kind : '')} aria-hidden="true" />);
  return (
    <div class="c-death" data-death={c.id} role="group" aria-label={'Death saves for ' + c.name}>
      <strong class="small">{state === 'dead' ? 'Dead' : state === 'stable' ? 'Stable' : 'Dying'}</strong>
      <span class="small" aria-label={d.s + ' successes'}>Saves {dots(d.s, 'good')}</span>
      <span class="small" aria-label={d.f + ' failures'}>Fails {dots(d.f, 'bad')}</span>
      {state === 'dying' && <>
        <button class="btn btn-sm" data-ds="success" onClick={() => go('success')}>Success</button>
        <button class="btn btn-sm" data-ds="fail" onClick={() => go('fail')}>Fail</button>
        <button class="btn btn-sm" data-ds="crit" title="Damage while at 0 hit points, or a critical hit: two failures" onClick={() => go('crit')}>Hit (2 fails)</button>
        <button class="btn btn-sm" data-ds="nat20" title="A natural 20 on a death save: back up with 1 hit point" onClick={() => go('nat20')}>Natural 20</button>
      </>}
      <button class="btn btn-sm btn-ghost" data-ds="reset" onClick={() => go('reset')}>Reset</button>
    </div>
  );
}

/* reaction, legendary actions, recharge and per-day abilities, a note, and the stat block */
function Extras({ c, st }) {
  const save = fn => { fn(); saveCombat(); };
  const uses = c.uses || [];
  return (
    <div class="c-extra">
      <button class="cond" data-reaction={c.id} aria-pressed={!!c.reaction} title="Tick when this creature has used its reaction this round. It comes back at the start of its turn." onClick={() => save(() => C.toggleReaction(st, c.id))}>Reaction used</button>
      {c.leg && (
        <span class="c-leg" data-leg={c.id}>
          <span class="small">Legendary {c.leg.n}/{c.leg.max}</span>
          <button class="mini" aria-label={'Use a legendary action of ' + c.name} onClick={() => save(() => C.legendary(st, c.id, -1))}>−</button>
          <button class="mini" aria-label={'Give back a legendary action of ' + c.name} onClick={() => save(() => C.legendary(st, c.id, +1))}>+</button>
        </span>
      )}
      {uses.map((u, i) => u.kind === 'recharge' ? (
        <span key={i} class="c-use" data-use={c.id + ':' + i}>
          <button class="cond" aria-pressed={!u.left} title={u.left ? 'Ready. Press when used.' : 'Spent. Press to mark it ready, or roll.'} onClick={() => save(() => C.useAbility(st, c.id, i))}>{u.name.replace(/\s*\(.*$/, '')} {u.left ? 'ready' : 'spent'}</button>
          {!u.left && <button class="mini" data-recharge={c.id + ':' + i} title={'Roll a d6: ' + u.n + ' or more recharges it'} onClick={() => { const r = C.rollRecharge(st, c.id, i); saveCombat(); toast(u.name.replace(/\s*\(.*$/, '') + ': rolled ' + r + (r >= u.n ? ', recharged!' : ', still spent.')); }}>d6</button>}
        </span>
      ) : (
        <span key={i} class="c-use" data-use={c.id + ':' + i}>
          <button class="cond" aria-pressed={u.left === 0} title="Press when used" onClick={() => save(() => C.useAbility(st, c.id, i, -1))}>{u.name.replace(/\s*\(.*$/, '')} {u.left}/{u.n}</button>
          <button class="mini" aria-label={'Give back one use of ' + u.name} onClick={() => save(() => C.useAbility(st, c.id, i, +1))}>+</button>
        </span>
      ))}
      {c.mon && <button class="btn btn-sm btn-ghost" data-statblock={c.id} onClick={() => set({ dialog: { kind: 'statblock', key: c.mon, name: c.name } })}>Stat block</button>}
      <input class="c-note" type="text" maxlength="200" placeholder="Note (concentrating on…)" aria-label={'Note for ' + c.name} value={c.note || ''} onInput={e => { C.setNote(st, c.id, e.currentTarget.value); saveCombat(); }} />
    </div>
  );
}

/* How much of each row is shown. 'focus' (the default): the creature whose turn it is has everything open, the others are one line plus
   the amount box; the chevron opens any row. 'all' shows everything on every row, as before. Remembered in this browser. */
const ROWS_KEY = 'dmforge:combat-rows';
export const rowsMode = () => { try { return localStorage.getItem(ROWS_KEY) === 'all' ? 'all' : 'focus'; } catch (e) { return 'focus'; } };
function setRowsMode(m) { try { localStorage.setItem(ROWS_KEY, m); } catch (e) { /* storage unavailable */ } set({}); }

/* Initiative is a text box with its own arrow-key handling (not type=number) so the
   caret can be put back after the row moves. Every valid value re-sorts the list at once. */
function CombatRow({ c, active, typed, mode }) {
  const [amt, setAmt] = useState('');
  const [draft, setDraft] = useState(null);
  const [open, setOpen] = useState(false);
  const st = S.combat;
  const expanded = mode === 'all' || active || open;
  const pct = c.maxHp ? Math.max(0, Math.min(100, Math.round((c.hp / c.maxHp) * 100))) : 0;
  const apply = fn => { const a = num(amt); if (!a) return; fn(st, c.id, a); setAmt(''); saveCombat(); };
  const setInit = v => { typed(c.id); C.setInit(st, c.id, v); saveCombat(); };
  const onInit = e => {
    const v = e.currentTarget.value;
    setDraft(v);
    if (isNumeric(v)) setInit(v);
  };
  const onKey = e => {
    if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
      e.preventDefault();
      const cur = isNumeric(draft ?? '') ? Number(draft) : c.init;
      const next = cur + (e.key === 'ArrowUp' ? 1 : -1) * (e.shiftKey ? 5 : 1);
      setDraft(String(next));
      setInit(next);
    } else if (e.key === 'Enter') e.currentTarget.blur();
  };
  const lockedOpen = mode === 'all' || active;
  return (
    <div class={'c-row' + (active ? ' turn' : '') + (C.isDown(c) ? ' down' : '') + (expanded ? ' open' : '')} data-cid={c.id}>
      <div class="c-initcol">
        <input class="c-init" type="text" inputmode="numeric" autocomplete="off" data-init={c.id} value={draft ?? c.init}
          aria-label={'Initiative for ' + c.name + ' (up and down arrows change it)'}
          onFocus={e => e.currentTarget.select()} onInput={onInit} onKeyDown={onKey} onBlur={() => setDraft(null)} />
      </div>
      <div class="c-main">
        <div class="c-name">
          <span data-peek={c.name}>{c.name}</span>
          {c.pc && <span class="pill pill-good">PC</span>}
          {c.ac != null && <span class="pill">AC {c.ac}</span>}
          {!c.pc && <button class="mini roll" title={'Roll initiative for ' + c.name + (c.bonus ? ' (d20 ' + (c.bonus > 0 ? '+' : '') + c.bonus + ')' : ' (d20)')} aria-label={'Roll initiative for ' + c.name}
            onClick={() => { typed(null); C.rollFor(st, c.id); saveCombat(); }}>
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2.5 3.5 7.5v9l8.5 5 8.5-5v-9z" /><path d="M12 2.5v19M3.5 7.5 12 12l8.5-4.5" /></svg>
          </button>}
          {C.isDown(c) && <span class="pill pill-bad">{C.deathState(c) === 'dead' ? 'Dead' : 'Down'}</span>}
          {c.temp > 0 && <span class="pill" data-temp={c.id}>+{c.temp} temp</span>}
          {c.conds.map(k => <span key={k} class="pill pill-warn" data-rule={k} tabIndex={0}>{k}</span>)}
          {!expanded && c.reaction && <span class="pill" title="Has used its reaction this round">Reaction used</span>}
          {!expanded && c.note && <span class="c-note-line small muted" title={c.note}>{c.note}</span>}
        </div>
        <div class="c-hp">
          <span class="mono">{c.hp}/{c.maxHp}</span>
          <div class="hpbar"><i class={pct <= 25 ? 'crit' : pct <= 50 ? 'low' : ''} style={'width:' + pct + '%'} /></div>
          <input type="number" min="0" placeholder="amt" aria-label={'Amount for ' + c.name} value={amt} onInput={e => setAmt(e.currentTarget.value)}
            onKeyDown={e => { if (e.key === 'Enter') apply(C.damage); }} />
          <button class="btn btn-sm btn-danger" onClick={() => apply(C.damage)}>Damage</button>
          <button class="btn btn-sm" onClick={() => apply(C.heal)}>Heal</button>
        </div>
        {C.deathState(c) && <DeathSaves c={c} st={st} />}
        {expanded && (
          <div class="c-more">
            <Extras c={c} st={st} />
            <div class="c-more-row">
              <button class="btn btn-sm" data-temp-btn={c.id} title="Temporary hit points from the amount box: you keep the larger number, and damage uses them first" onClick={() => apply(C.setTemp)}>Temp HP</button>
              {c.temp > 0 && <button class="btn btn-sm btn-ghost" aria-label={'Clear the temporary hit points of ' + c.name} onClick={() => { C.clearTemp(st, c.id); saveCombat(); }}>Clear temp</button>}
              <details class="c-conds">
                <summary class="small muted">Conditions{c.conds.length ? ' (' + c.conds.length + ')' : ''}</summary>
                <div class="cond-row">
                  {C.CONDITIONS.map(k => <button key={k} class="cond" data-rule={k} aria-pressed={c.conds.includes(k)} onClick={() => { C.toggleCondition(st, c.id, k); saveCombat(); }}>{k}</button>)}
                </div>
              </details>
              <button class="btn btn-sm btn-ghost c-remove" aria-label={'Remove ' + c.name} onClick={() => { C.removeCombatant(st, c.id); saveCombat(); }}>Remove</button>
            </div>
          </div>
        )}
      </div>
      <button class="mini c-toggle" aria-expanded={expanded} aria-label={(expanded ? 'Hide' : 'Show') + ' the other controls for ' + c.name} title={lockedOpen ? 'Open while it is this creature’s turn' : (expanded ? 'Hide the other controls' : 'Reaction, note, conditions, temp HP, stat block, remove')} disabled={lockedOpen} onClick={() => setOpen(!open)}>
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 9l6 6 6-6" /></svg>
      </button>
    </div>
  );
}

const reducedMotion = () => { try { return window.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (e) { return false; } };

/* Rows slide to their new place when initiative changes (FLIP: note where every row is
   before the update reaches the page, then animate from there). Typing keeps working because
   the box that was being edited is given focus and its caret back after the row moves. */
function CombatList({ st }) {
  const ref = useRef();
  const typedId = useRef(null);
  const typed = id => { typedId.current = id; };
  const before = new Map();
  const order = [];
  const box = ref.current;
  if (box && box.offsetParent !== null) {
    const base = box.getBoundingClientRect().top;
    box.querySelectorAll('[data-cid]').forEach(el => { before.set(el.dataset.cid, el.getBoundingClientRect().top - base); order.push(el.dataset.cid); });
  }
  useLayoutEffect(() => {
    const root = ref.current;
    if (!root || root.offsetParent === null) return;
    const base = root.getBoundingClientRect().top;
    const id = typedId.current;
    if (id) {
      typedId.current = null;
      const inp = root.querySelector('[data-init="' + id + '"]');
      const now = [...root.querySelectorAll('[data-cid]')].map(el => el.dataset.cid);
      if (inp && now.indexOf(id) !== order.indexOf(id)) {
        // the row was moved in the page, which can leave the browser's focus on nothing even though
        // activeElement still says otherwise: focus it again, with the caret after what was typed
        inp.blur();
        inp.focus({ preventScroll: true });
        const n = inp.value.length;
        try { inp.setSelectionRange(n, n); } catch (e) { /* not supported */ }
      }
    }
    if (reducedMotion()) return;
    root.querySelectorAll('[data-cid]').forEach(el => {
      const old = before.get(el.dataset.cid);
      if (old === undefined || !el.animate) return;
      const dy = old - (el.getBoundingClientRect().top - base);
      if (Math.abs(dy) < 2) return;
      el.classList.add('moving');
      const a = el.animate([{ transform: 'translateY(' + dy + 'px)' }, { transform: 'translateY(0)' }], { duration: 280, easing: 'cubic-bezier(.2,.8,.2,1)' });
      a.onfinish = a.oncancel = () => el.classList.remove('moving');
    });
  });
  return (
    <div ref={ref} class="c-list" id="combatList">
      {st.combatants.map((c, i) => <CombatRow key={c.id} c={c} active={i === st.turn} typed={typed} mode={rowsMode()} />)}
    </div>
  );
}

/* the players who are here tonight (the session's absent list leaves some out) */
function partyHere() {
  const idx = getIndex();
  const sess = idx.byPath.get(currentSessionPath());
  const away = new Set(absentOf(sess ? sess.fm : {}).map(a => a.toLowerCase()));
  return (idx.byType.player || []).filter(p => !away.has(p.name.toLowerCase()));
}
function addPartyToFight() {
  const st = S.combat;
  let n = 0;
  for (const p of partyHere()) {
    if (st.combatants.some(c => c.pc && c.name === p.name)) continue;
    const hp = playerStat(p, 'hp') ?? 1;
    const bonus = playerStat(p, 'init') || 0;
    C.addCombatant(st, { name: p.name, init: 'roll', bonus, hp, maxHp: hp, ac: playerStat(p, 'ac'), pc: true });
    n++;
  }
  saveCombat();
  return n;
}

function AddPanel() {
  const [tab, setTab] = useState('party');                    // party | monsters | custom
  const [f, setF] = useState({ name: '', count: 1, init: '', bonus: '', hp: 10, ac: '' });
  const players = partyHere();
  const addParty = () => {
    const n = addPartyToFight();
    toast(n ? 'Added ' + n + ' player' + (n === 1 ? '' : 's') + ' with rolled initiative.' : 'Everyone from the Players folder is already in the fight.');
  };
  const addWith = init => {
    if (!f.name.trim()) return;
    C.addCombatant(S.combat, { name: f.name.trim(), count: num(f.count) || 1, init, bonus: num(f.bonus), hp: num(f.hp) || 1, maxHp: num(f.hp) || 1, ac: f.ac === '' ? null : num(f.ac), pc: false });
    setF({ ...f, name: '', init: '' });
    saveCombat();
  };
  const submit = e => { e.preventDefault(); addWith('roll'); };
  const hasInit = isNumeric(f.init);
  const many = num(f.count) > 1;
  const tabs = [['party', 'Party', 'addTabParty'], ['monsters', 'Monsters', 'addTabMonsters'], ['custom', 'Custom', 'addTabCustom']];
  return (
    <div class="card stack add-panel">
      <div class="add-tabs" role="tablist" aria-label="What to add to the fight">
        {tabs.map(([k, label, id]) => <button key={k} role="tab" id={id} aria-selected={tab === k} class={tab === k ? 'on' : ''} onClick={() => setTab(k)}>{label}</button>)}
      </div>
      <div hidden={tab !== 'party'} class="stack">
        <p class="muted small" style="margin:0">{players.length ? players.length + ' player' + (players.length === 1 ? ' is' : 's are') + ' here tonight.' : 'There are no players here yet.'}</p>
        <button class="btn btn-primary" onClick={addParty} disabled={!players.length}>Add the party{players.length ? ' (' + players.length + ')' : ''}</button>
        <p class="muted small" style="margin:0">Untick anyone who is away on the Party page.</p>
      </div>
      <div hidden={tab !== 'monsters'} class="stack">
        <p class="muted small" style="margin:0">The SRD monsters and your own Bestiary notes.</p>
        <button class="btn" id="openLibrary" onClick={() => set({ dialog: { kind: 'monsters' } })}>Monster library…</button>
      </div>
      <form hidden={tab !== 'custom'} onSubmit={submit} class="stack">
        <div><label class="lbl" for="addName">Name</label><input id="addName" value={f.name} onInput={e => setF({ ...f, name: e.currentTarget.value })} placeholder="Goblin" /></div>
        <div class="add-grid">
          <div><label class="lbl">Qty</label><input type="number" min="1" value={f.count} onInput={e => setF({ ...f, count: e.currentTarget.value })} /></div>
          <div><label class="lbl">HP</label><input type="number" min="1" value={f.hp} onInput={e => setF({ ...f, hp: e.currentTarget.value })} /></div>
          <div><label class="lbl">AC</label><input type="number" value={f.ac} onInput={e => setF({ ...f, ac: e.currentTarget.value })} /></div>
          <div><label class="lbl">Init</label><input type="number" value={f.bonus} placeholder="+0" onInput={e => setF({ ...f, bonus: e.currentTarget.value })} /></div>
        </div>
        <button class="btn btn-primary" type="submit" id="addRoll">Add and roll initiative{many ? ' for each' : ''}</button>
        <div class="or-row">
          <input type="text" inputmode="numeric" placeholder="or type an initiative" aria-label="Initiative to use instead of rolling" value={f.init} onInput={e => setF({ ...f, init: e.currentTarget.value })} />
          <button class="btn" type="button" id="addSet" disabled={!hasInit || !f.name.trim()} onClick={() => addWith(num(f.init))}>Add with this</button>
        </div>
        <div class="muted small">Each creature gets its own d20 roll plus the bonus. Change any number later and the list re-sorts as you type. Defeated foes are skipped when you advance the turn.</div>
      </form>
    </div>
  );
}

function EndDialog() {
  const s = useApp();
  const idx = getIndex();
  const sessions = idx.byType.session || [];
  const [target, setTarget] = useState(s.combatTarget && idx.byPath.get(s.combatTarget) ? s.combatTarget : (sessions[0] ? sessions[0].path : ''));
  const [log, setLog] = useState(!!sessions.length);
  const close = () => set({ dialog: null });
  const askDelete = () => set({ dialog: { kind: 'confirm', title: 'Delete this combat?', body: 'The tracker is cleared and nothing is added to your session notes. This cannot be undone. To keep a record, choose “End combat” instead.', confirmLabel: 'Delete combat', danger: true, onConfirm: deleteCombat } });
  const end = () => {
    if (log && target) { logCombatToSession(target); toast('Combat summary and the round-by-round log added to the session note. Push changes to save it.'); }
    S.combat = null;
    saveCombat();
    close();
    if (log && target) goto(target);
  };
  return (
    <Modal title="End combat" onClose={close}>
      {sessions.length ? (
        <>
          <label class="small" style="display:flex;gap:8px;align-items:center;margin-bottom:10px"><input type="checkbox" style="width:auto" checked={log} onChange={e => setLog(e.currentTarget.checked)} /> Add a summary to a session note</label>
          {log && <div class="field"><label class="lbl">Session</label><select value={target} onChange={e => setTarget(e.currentTarget.value)}>{sessions.map(n => <option key={n.path} value={n.path}>{n.name}</option>)}</select></div>}
        </>
      ) : <p class="muted small" style="margin:0 0 10px">There are no session notes yet, so there is nowhere to log this. Create a session first if you want a record.</p>}
      <div class="modal-actions" style="flex-wrap:wrap"><button class="btn btn-danger" id="deleteCombat" title="Throw the fight away without saving anything" style="margin-right:auto" onClick={askDelete}>Delete instead…</button><button class="btn" onClick={close}>Keep fighting</button><button class="btn btn-primary" id="endCombatGo" onClick={end}>End combat</button></div>
    </Modal>
  );
}

export function deleteCombat() {
  S.combat = null;
  saveCombat();
  toast('Combat deleted.');
}

/* the round-by-round log, live: a heading for each turn, and your own lines */
function CombatLog({ st }) {
  const s = useApp();
  const idx = getIndex();
  const sessions = idx.byType.session || [];
  const [text, setText] = useState('');
  const [target, setTarget] = useState(s.combatTarget && idx.byPath.get(s.combatTarget) ? s.combatTarget : (currentSessionPath() || (sessions[0] ? sessions[0].path : '')));
  const groups = C.logGroups(st);
  const addNote = () => { if (!text.trim()) return; C.addLogNote(st, text); setText(''); saveCombat(); };
  const save = () => { if (target && logCombatToSession(target)) toast('Saved the summary and the log so far to ' + (idx.byPath.get(target) || { name: 'the session' }).name + '. Push changes to write it.'); };
  const quietOf = r => r.turns.filter(t => !t.events.length && t.name).map(t => t.name);
  return (
    <div class="card stack" id="combatLog">
      <h3>Combat log</h3>
      <div class="cl-list" id="clList" tabIndex={0} aria-label="Combat log, by round">
        {groups.length === 0 && <p class="muted small" style="margin:0">Nothing yet. Once the fight begins (the first turn, hit point change or condition), every change is written here by round and turn.</p>}
        {groups.map(r => (
          <div key={r.r} class="cl-round" data-round={r.r}>
            <div class="cl-rh">Round {r.r}</div>
            {r.init && <div class="small muted">{r.init}</div>}
            {r.turns.filter(t => t.events.length).map((t, i) => (
              <div key={i} class="cl-turn"><div class="cl-th">▶ {t.name || 'Before the first turn'}</div><ul>{t.events.map((e, k) => <li key={k}>{e}</li>)}</ul></div>
            ))}
            {quietOf(r).length > 0 && <div class="small muted">Nothing logged: {quietOf(r).join(', ')}</div>}
          </div>
        ))}
      </div>
      <div class="cl-add"><input id="clNote" type="text" placeholder="Add a note to the log" aria-label="Add a note to the combat log" maxlength="300" value={text} onInput={e => setText(e.currentTarget.value)} onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addNote(); } }} /><button class="btn btn-sm" id="clAdd" disabled={!text.trim()} onClick={addNote}>Add</button></div>
      {sessions.length > 0 && (
        <div class="cl-save">
          <select id="clSession" aria-label="Session to save the log to" value={target} onChange={e => setTarget(e.currentTarget.value)}>{sessions.map(n => <option key={n.path} value={n.path}>{n.name}</option>)}</select>
          <button class="btn btn-sm" id="clSave" title="Writes the summary and this log into that session note now (End combat does it too). Doing it again updates it." onClick={save}>Save to session now</button>
        </div>
      )}
      <div class="muted small">Each line says whose turn it was. Undo takes a line out of the log too. End combat saves all of this in the session note, folded.</div>
    </div>
  );
}

function SidePanel({ st }) {
  const [tab, setTab] = useState('add');
  const n = (st.log || []).filter(e => e.kind !== 'turn' && e.kind !== 'init').length;
  return (
    <aside class="combat-side" id="combatSide">
      <div class="seg" role="tablist" aria-label="Add to the fight, or the log">
        <button role="tab" id="tabAdd" aria-selected={tab === 'add'} class={'chip-btn' + (tab === 'add' ? ' on' : '')} onClick={() => setTab('add')}>Add</button>
        <button role="tab" id="tabLog" aria-selected={tab === 'log'} class={'chip-btn' + (tab === 'log' ? ' on' : '')} onClick={() => setTab('log')}>Log{n ? ' (' + n + ')' : ''}</button>
      </div>
      {tab === 'add' ? <AddPanel /> : <CombatLog st={st} />}
    </aside>
  );
}

/* after Next turn, bring the creature whose turn it is into view (rows leave room for the pinned bar above them) */
function showActive(st) {
  const c = st.combatants[st.turn];
  if (!c) return;
  requestAnimationFrame(() => {
    const el = document.querySelector('[data-cid="' + c.id + '"]');
    if (el && el.scrollIntoView) { try { el.scrollIntoView({ block: 'nearest', behavior: reducedMotion() ? 'auto' : 'smooth' }); } catch (e) { el.scrollIntoView(); } }
  });
}

/* no fight yet: if monsters are lined up on the Party page, start straight from them */
function EmptyCombat({ start }) {
  const s = useApp();
  const { all } = useMonsters();
  const byKey = new Map(all.map(m => [m.key, m]));
  const items = (s.encounter || []).map(e => ({ m: byKey.get(e.key), qty: e.qty })).filter(x => x.m);
  const players = partyHere();
  const startAll = () => {
    start();
    addPartyToFight();
    const n = addMonstersToCombat(items);
    toast('Started the fight with the party and ' + n + ' creature' + (n === 1 ? '' : 's') + ', initiative rolled.');
  };
  return (
    <>
      <div class="page-head"><div><h2 aria-level="1">Combat</h2><div class="muted">No fight in progress</div></div></div>
      <div class="combat-empty card" id="combatEmpty">
        <h3>Ready when you are</h3>
        {items.length > 0 ? (
          <>
            <p class="muted" style="margin:6px 0 0">The encounter you lined up on the Party page is waiting:</p>
            <div class="combat-lined" id="combatLined">{items.map(x => <span key={x.m.key}><strong>{x.qty}</strong> {x.m.n}</span>)}</div>
            <div class="row-actions" style="justify-content:center;margin-top:18px">
              <button class="btn btn-primary" id="startAll" disabled={!players.length && !items.length} onClick={startAll}>Start with the party and this encounter</button>
            </div>
            <div style="margin-top:10px"><button class="btn btn-ghost" id="startEmpty" onClick={start}>Start combat with nobody in it</button></div>
          </>
        ) : (
          <>
            <p class="muted" style="margin:6px 0 0">Start a tracker, add the party from your Players notes, then add the monsters.</p>
            <div style="margin-top:18px"><button class="btn btn-primary" id="startEmpty" onClick={start}>Start combat</button></div>
          </>
        )}
      </div>
    </>
  );
}

export function CombatPage() {
  const s = useApp();
  const st = s.combat;
  const start = () => { S.combat = C.newCombat(); saveCombat(); };
  if (!st) return <EmptyCombat start={start} />;
  const cur = st.combatants[st.turn];
  const foes = st.combatants.filter(c => !c.pc).length;
  return (
    <>
      <div class="page-head combat-bar" id="combatBar">
        <div><h2 aria-level="1">Combat</h2><div class="muted small" id="combatTurn">Round <span class="round-badge">{st.round}</span>{cur ? <>{' · '}<span class="combat-who">{cur.name + '’s turn'}</span></> : ''}</div></div>
        <div class="row-actions">
          <button class="btn btn-primary" id="nextTurn" disabled={!st.combatants.length} onClick={() => { C.nextTurn(st); saveCombat(); showActive(st); }}>Next turn →</button>
          <button class="btn" id="undoCombat" title="Take back the last change to the fight" disabled={!s.combatHist.length} onClick={() => undoCombat()}>Undo</button>
          <button class="btn" id="rollFoes" disabled={!foes} onClick={() => { const n = C.rollEnemies(st); saveCombat(); toast('Rolled initiative for ' + n + ' enem' + (n === 1 ? 'y' : 'ies') + '.'); }}>Roll for enemies</button>
          <button class="btn" id="endCombat" onClick={() => set({ dialog: { kind: 'endCombat' } })}>End combat…</button>
        </div>
      </div>
      <div class="combat-grid">
        <div>
          {st.combatants.length > 1 && <div class="c-listbar"><button class="btn btn-sm btn-ghost" id="combatRowsToggle" title={rowsMode() === 'all' ? 'Show only the current turn in full; the other rows open with their chevron' : 'Show every control on every row'} onClick={() => setRowsMode(rowsMode() === 'all' ? 'focus' : 'all')}>{rowsMode() === 'all' ? 'Focus on the current turn' : 'Show all details'}</button></div>}
          {st.combatants.length ? <CombatList st={st} /> : <Empty title="Nobody is in the fight yet">Add the party or a monster on the right.</Empty>}
        </div>
        <SidePanel st={st} />
      </div>
      {s.dialog && s.dialog.kind === 'endCombat' && <EndDialog />}
    </>
  );
}
