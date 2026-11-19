import { useState } from 'preact/hooks';
import { useApp, getIndex, toast } from './store.js';
import { clocksNow, saveClocks, tickClock, goto, wantsNewTab, setSection } from './actions.js';
import { CLOCK_SIZES, STANDINGS, standingLabel } from '../core/clocks.js';

/* a clock as a pie: the filled slices are the progress */
export function Pie({ filled, size, px = 88 }) {
  const r = 38, c = 44;
  const slices = Array.from({ length: size }, (_, i) => {
    const a0 = (i / size) * 2 * Math.PI - Math.PI / 2, a1 = ((i + 1) / size) * 2 * Math.PI - Math.PI / 2;
    const x0 = c + r * Math.cos(a0), y0 = c + r * Math.sin(a0), x1 = c + r * Math.cos(a1), y1 = c + r * Math.sin(a1);
    const d = size === 1 ? '' : 'M' + c + ',' + c + ' L' + x0.toFixed(2) + ',' + y0.toFixed(2) + ' A' + r + ',' + r + ' 0 ' + (1 / size > 0.5 ? 1 : 0) + ' 1 ' + x1.toFixed(2) + ',' + y1.toFixed(2) + ' Z';
    return <path key={i} d={d} class={i < filled ? 'pie-on' : 'pie-off'} />;
  });
  return <svg class={'pie' + (filled >= size ? ' full' : '')} viewBox="0 0 88 88" width={px} height={px} role="img" aria-label={filled + ' of ' + size + ' filled'}>{slices}<circle cx={c} cy={c} r={r} class="pie-ring" /></svg>;
}

/* the note a clock belongs to (a plot thread, say): its status is shown here, and the clock shows on that note's page */
function ClockLink({ c, idx, onSet }) {
  const note = c.link ? idx.resolve(c.link) : null;
  const status = note ? String((note.fm && (note.fm.status || note.fm.Status)) || '') : '';
  const names = [...(idx.byType.plot || []), ...idx.notes.filter(n => n.type !== 'plot')].map(n => n.name);
  const id = 'cl-' + c.name.replace(/\W+/g, '-');
  const commit = e => {
    const v = e.currentTarget.value.trim();
    if (!v) { onSet(''); return; }
    const n = idx.resolve(v);
    if (!n) { toast('There is no note called “' + v + '”. Pick one from the list.', true); e.currentTarget.value = c.link || ''; return; }
    onSet(n.name);
  };
  return (
    <div class="clock-link row-actions" style="gap:6px;align-items:center">
      <input id={id} class="clock-linkbox" list={id + '-list'} aria-label={'Note that ' + c.name + ' belongs to'} name="clock-link" title="The plot thread (or other note) this clock belongs to" placeholder="Belongs to… (a plot thread)" value={c.link || ''} onChange={commit} style="flex:1;min-width:150px" />
      <datalist id={id + '-list'}>{names.map(n => <option key={n} value={n} />)}</datalist>
      {note && <a href="#" class="small" data-clocknote={note.name} onClick={e => { e.preventDefault(); goto(note.path, { newTab: wantsNewTab(e) }); }}>Open</a>}
      {note && status && <span class={'pill status-' + status.toLowerCase()} data-clockstatus>{status}</span>}
      {c.link && !note && <span class="small cc-bad" title="No note has this name any more">missing note</span>}
    </div>
  );
}

export function ClocksPage() {
  const s = useApp();
  const idx = getIndex();
  const { clocks, standings } = clocksNow();
  const [name, setName] = useState('');
  const [size, setSize] = useState(6);
  const [fac, setFac] = useState('');
  const open = (p, e) => goto(p, { newTab: wantsNewTab(e) });
  const save = (c, st, said) => saveClocks(c, st, said);
  const setClock = (i, patch) => {
    const was = clocks[i];
    const next = clocks.map((x, k) => (k === i ? { ...x, ...patch } : x));
    const now = next[i];
    save(next, standings, patch.filled !== undefined && now.filled >= now.size && was.filled < was.size ? 'Clock filled: ' + now.name + ' (' + now.size + '/' + now.size + ')' : '');
    if (patch.filled !== undefined && now.filled >= now.size && was.filled < was.size) toast('“' + now.name + '” is full.');
  };
  const addClock = e => { e.preventDefault(); if (!name.trim()) return; if (save([...clocks, { name: name.trim(), filled: 0, size: +size, note: '' }], standings)) { setName(''); toast('Clock added. Push changes to save it.'); } };
  const factions = (idx.byType.faction || []).map(n => n.name);
  const tracked = new Set(standings.map(x => x.name.toLowerCase()));
  const untracked = factions.filter(f => !tracked.has(f.toLowerCase()));
  const setStanding = (i, patch) => {
    const next = standings.map((x, k) => (k === i ? { ...x, ...patch } : x));
    save(clocks, next, patch.value !== undefined && patch.value !== standings[i].value ? 'Standing with ' + next[i].name + ': ' + standingLabel(next[i].value) : '');
  };
  const addFaction = e => { e.preventDefault(); const n = fac || untracked[0]; if (!n) return; save(clocks, [...standings, { name: n, value: 0, note: '' }]); setFac(''); };
  return (
    <>
      <div class="page-head"><div><h2 aria-level="1">Clocks and standing</h2><div class="muted small">Threats that are ticking, and how the factions feel about the party. Saved in a note called “Clocks and Standing”.</div></div></div>
      <div class="card" id="clocksCard" style="margin-bottom:16px">
        <h3 style="margin:0 0 8px">Progress clocks</h3>
        {clocks.length === 0 && <p class="muted small" id="clocksNone" style="margin:0 0 8px">No clocks yet. A clock counts down something that is coming (the ritual, the siege, the patrol) in slices you fill as it gets closer.</p>}
        <div class="clock-grid">
          {clocks.map((c, i) => (
            <div key={i} class={'clock' + (c.filled >= c.size ? ' full' : '')} data-clock={c.name}>
              <Pie filled={c.filled} size={c.size} />
              <div class="clock-body">
                <input class="clock-name" aria-label={'Name of the clock ' + c.name} name="clock-name" value={c.name} onChange={e => setClock(i, { name: e.currentTarget.value.trim() || c.name })} />
                <div class="clock-ctl">
                  <button class="btn btn-sm" aria-label={'Take a slice off ' + c.name} disabled={c.filled <= 0} onClick={() => setClock(i, { filled: c.filled - 1 })}>−</button>
                  <span class="mono" data-filled>{c.filled}/{c.size}</span>
                  <button class="btn btn-sm btn-primary" aria-label={'Fill a slice of ' + c.name} disabled={c.filled >= c.size} onClick={() => setClock(i, { filled: c.filled + 1 })}>+</button>
                  <select aria-label={'Slices in ' + c.name} value={String(c.size)} onChange={e => setClock(i, { size: +e.currentTarget.value, filled: Math.min(c.filled, +e.currentTarget.value) })}>{[...new Set([...CLOCK_SIZES, c.size])].sort((a, b) => a - b).map(n => <option key={n} value={String(n)}>{n} slices</option>)}</select>
                  <button class="btn btn-sm btn-ghost" aria-label={'Remove the clock ' + c.name} onClick={() => save(clocks.filter((_, k) => k !== i), standings)}>Remove</button>
                </div>
                <ClockLink c={c} idx={idx} onSet={link => setClock(i, { link })} />
                <input class="clock-note" aria-label={'What happens when ' + c.name + ' is full'} name="clock-note" placeholder="What happens when it is full" value={c.note} onChange={e => setClock(i, { note: e.currentTarget.value })} />
              </div>
            </div>
          ))}
        </div>
        <form class="row-actions" onSubmit={addClock} style="margin-top:10px" id="clockAdd">
          <input id="clockName" name="clock-name-new" placeholder="New clock (the bells ring again)" value={name} onInput={e => setName(e.currentTarget.value)} style="flex:1;min-width:200px" />
          <select id="clockSize" aria-label="Slices" style="width:auto" value={String(size)} onChange={e => setSize(e.currentTarget.value)}>{CLOCK_SIZES.map(n => <option key={n} value={String(n)}>{n} slices</option>)}</select>
          <button class="btn btn-primary" id="clockAddBtn" type="submit" disabled={!name.trim()}>Add a clock</button>
        </form>
      </div>
      <div class="card" id="standingCard">
        <h3 style="margin:0 0 8px">Faction standing</h3>
        {standings.length === 0 && <p class="muted small" id="standingNone" style="margin:0 0 8px">No factions tracked yet. Add one below to say how it feels about the party, from hostile to allied.</p>}
        <ul class="stand-list">
          {standings.map((x, i) => {
            const note = idx.resolve(x.name);
            return (
              <li key={x.name} data-faction={x.name}>
                <div class="stand-name">{note ? <a href="#" onClick={e => { e.preventDefault(); open(note.path, e); }}>{x.name}</a> : x.name}</div>
                <select aria-label={'Standing with ' + x.name} class={'stand-sel v' + x.value} value={String(x.value)} onChange={e => setStanding(i, { value: +e.currentTarget.value })}>{STANDINGS.map(([v, l]) => <option key={v} value={String(v)}>{l} ({v > 0 ? '+' + v : v})</option>)}</select>
                <input class="stand-note" aria-label={'Note on ' + x.name} name="standing-note" placeholder="Why" value={x.note} onChange={e => setStanding(i, { note: e.currentTarget.value })} />
                <button class="btn btn-sm btn-ghost" aria-label={'Stop tracking ' + x.name} onClick={() => save(clocks, standings.filter((_, k) => k !== i))}>Remove</button>
              </li>
            );
          })}
        </ul>
        {untracked.length > 0 && (
          <form class="row-actions" onSubmit={addFaction} style="margin-top:10px" id="factionAdd">
            <select id="factionPick" aria-label="Faction to track" style="width:auto" value={fac || untracked[0]} onChange={e => setFac(e.currentTarget.value)}>{untracked.map(f => <option key={f} value={f}>{f}</option>)}</select>
            <button class="btn" id="factionAddBtn" type="submit">Track this faction</button>
          </form>
        )}
        {factions.length === 0 && <p class="small muted" style="margin:8px 0 0">Your Factions notes appear here to pick from.</p>}
      </div>
    </>
  );
}

/* the clocks that belong to this note (a plot thread, for example), on its page: tick them without leaving it */
export function NoteClocks({ note, idx }) {
  useApp();
  const mine = clocksNow().clocks.filter(c => c.link && (idx.resolve(c.link) || {}).path === note.path);
  if (!mine.length) return null;
  return (
    <div class="note-clocks" id="noteClocks" aria-label="Clocks for this note">
      {mine.map(c => (
        <div key={c.name} class={'note-clock' + (c.filled >= c.size ? ' full' : '')} data-noteclock={c.name}>
          <Pie filled={c.filled} size={c.size} px={52} />
          <div class="nc-body">
            <div class="nc-name">{c.name}</div>
            <div class="nc-ctl">
              <button class="btn btn-sm" aria-label={'Take a slice off ' + c.name} disabled={c.filled <= 0} onClick={() => tickClock(c.name, -1)}>−</button>
              <span class="mono" data-filled>{c.filled}/{c.size}</span>
              <button class="btn btn-sm btn-primary" aria-label={'Fill a slice of ' + c.name} disabled={c.filled >= c.size} onClick={() => tickClock(c.name, 1)}>+</button>
            </div>
            {c.note && <div class="small muted nc-note">When full: {c.note}</div>}
          </div>
        </div>
      ))}
      <a href="#" class="small nc-all" onClick={e => { e.preventDefault(); setSection('clocks'); }}>All clocks</a>
    </div>
  );
}
