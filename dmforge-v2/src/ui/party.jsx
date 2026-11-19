import { useMemo, useState } from 'preact/hooks';
import { S, set, useApp, getIndex, toast } from './store.js';
import { SaveEncounterBar } from './prep40.jsx';
import { currentSessionPath, setCurrentSession, setNoteProp, setPresence, setEncounter, addMonstersToCombat, goto, setSection, wantsNewTab, spotlightNow, addSpotlight, undoSpotlight, spotlightHere } from './actions.js';
import { absentOf, partyRows, budgetFor, difficulty, fitCounts, TIER_LABELS } from '../core/party.js';
import { searchMonsters, crLabel, crXp } from '../core/monsters.js';
import { useMonsters } from './monsters.jsx';

const nf = n => Number(n).toLocaleString('en-US');

function Stat({ row, field, label, width = 64 }) {
  return <input class="pt-num" type="number" style={'width:' + width + 'px'} aria-label={label + ' for ' + row.name} data-pt={field} value={row[field] ?? ''} onChange={e => setNoteProp(row.path, field, e.currentTarget.value)} />;
}

export function PartyPage() {
  const s = useApp();
  const idx = getIndex();
  const sessions = idx.byType.session || [];
  const path = currentSessionPath();
  const session = idx.byPath.get(path);
  const absent = absentOf(session ? session.fm : {});
  const rows = partyRows(idx, absent);
  const here = rows.filter(r => r.here);
  const open = (p, e) => goto(p, { newTab: wantsNewTab(e) });
  const [money, setMoney] = useState(() => { try { return localStorage.getItem('dmforge:partymoney') === '1'; } catch (e) { return false; } });
  const toggleMoney = () => { const v = !money; setMoney(v); try { localStorage.setItem('dmforge:partymoney', v ? '1' : '0'); } catch (e) { /* storage unavailable */ } };
  return (
    <>
      <div class="page-head"><div><h2 aria-level="1">Party</h2><div class="muted">Who is here, their numbers, and how hard a fight is for them.</div></div>
        <button class="btn btn-sm" id="ptColumns" aria-pressed={money} title="Show or hide the Gold and XP columns" onClick={toggleMoney}>{money ? 'Hide gold and XP' : 'Show gold and XP'}</button>
      </div>
      <div class="card" id="partyCard" style="margin-bottom:16px">
        {rows.length === 0 ? (
          <p class="muted" style="margin:0">There are no player notes yet. Add your players under Players, with their level, hit points and armour class as properties.</p>
        ) : (
          <>
            <div class="pt-head">
              <h3 style="margin:0">The party</h3>
              {sessions.length > 0 && <label class="small">At <select id="ptSession" value={path} onChange={e => setCurrentSession(e.currentTarget.value)} style="width:auto;display:inline-block">{sessions.map(n => <option key={n.path} value={n.path}>{n.name}</option>)}</select></label>}
              <span class="muted small">{here.length} of {rows.length} here</span>
            </div>
            <div class="pt-scroll">
              <table class="pt-table">
                <thead><tr><th scope="col">Here</th><th scope="col">Character</th><th scope="col">Level</th><th scope="col">HP</th><th scope="col">AC</th><th scope="col" title="Passive Perception">PP</th>{money && <th scope="col">Gold</th>}{money && <th scope="col">XP</th>}</tr></thead>
                <tbody>
                  {rows.map(r => (
                    <tr key={r.path} class={r.here ? '' : 'away'} data-player={r.name}>
                      <td><input type="checkbox" checked={r.here} disabled={!session} aria-label={r.name + ' is here'} data-here={r.name} onChange={e => setPresence(path, r.name, e.currentTarget.checked)} /></td>
                      <th scope="row"><a href="#" onClick={e => { e.preventDefault(); open(r.path, e); }}>{r.name}</a></th>
                      <td><Stat row={r} field="level" label="Level" width={56} /></td>
                      <td><Stat row={r} field="hp" label="Max HP" /></td>
                      <td><Stat row={r} field="ac" label="AC" width={56} /></td>
                      <td><Stat row={r} field="perception" label="Passive Perception" width={56} /></td>
                      {money && <td><Stat row={r} field="gold" label="Gold" width={84} /></td>}
                      {money && <td><Stat row={r} field="xp" label="XP" width={84} /></td>}
                    </tr>
                  ))}
                </tbody>
                <tfoot><tr><th></th><th scope="row">Here tonight</th><td id="ptAvg">{here.filter(r => r.level).length ? 'avg ' + (here.reduce((a, r) => a + (r.level || 0), 0) / here.filter(r => r.level).length).toFixed(1) : ''}</td><td></td><td></td><td></td>{money && <td id="ptGold">{nf(here.reduce((a, r) => a + (r.gold || 0), 0))}</td>}{money && <td></td>}</tr></tfoot>
              </table>
            </div>
            <div class="small muted" style="margin-top:6px">{session ? 'Untick someone who is away: it is saved on ' + session.name + ' (an “absent” list in its properties), and they are left out of the budget below and of “Add the party” in Combat.' : 'Make a session note to record who was here.'} Numbers are saved on each player’s note.</div>
          </>
        )}
      </div>
      <SpotlightCard />
      <EncounterCard rows={here} />
    </>
  );
}

function EncounterCard({ rows }) {
  const s = useApp();
  const { all, loading } = useMonsters();
  const [q, setQ] = useState('');
  const [extraN, setExtraN] = useState(0);
  const [extraLvl, setExtraLvl] = useState(1);
  const list = s.encounter || [];
  const byKey = useMemo(() => new Map(all.map(m => [m.key, m])), [all]);
  const items = list.map(e => ({ ...e, m: byKey.get(e.key) })).filter(e => e.m);
  const missing = list.length - items.length;
  const levels = [...rows.filter(r => r.level).map(r => r.level), ...Array.from({ length: Math.max(0, Math.min(10, Math.floor(+extraN) || 0)) }, () => +extraLvl || 1)];
  const noLevel = rows.filter(r => !r.level);
  const b = budgetFor(levels);
  const total = items.reduce((a, e) => a + crXp(e.m.cr) * e.qty, 0);
  const diff = difficulty(total, b);
  const hits = q.trim() ? searchMonsters(all, { q }).slice(0, 8) : [];
  const setQty = (key, qty) => setEncounter(qty <= 0 ? list.filter(e => e.key !== key) : list.map(e => (e.key === key ? { ...e, qty: Math.min(30, qty) } : e)));
  const add = key => { const have = list.find(e => e.key === key); if (have) setQty(key, have.qty + 1); else setEncounter([...list, { key, qty: 1 }]); };
  const max = Math.max(b.high * 1.15, total, 1);
  const send = () => {
    const n = addMonstersToCombat(items.map(e => ({ m: e.m, qty: e.qty })));
    toast('Added ' + n + ' creature' + (n === 1 ? '' : 's') + ' to the fight, with initiative rolled.');
    setSection('combat');
  };
  return (
    <div class="card" id="encounterCard">
      <h3 style="margin:0 0 4px">Encounter budget <span class="muted small">(2024 rules)</span></h3>
      <div class="small" id="ebParty">{b.n ? <><strong>{b.n}</strong> {b.n === 1 ? 'character' : 'characters'}, {levels.length ? 'level ' + [...new Set(levels)].sort((a, c) => a - c).join(', ') : ''}</> : 'Nobody with a level is here yet.'}</div>
      {noLevel.length > 0 && (
        <div class="eb-nolevel small" id="ebNoLevel" role="group" aria-label="Characters with no level">
          <span>Set a level so {noLevel.length === 1 ? 'this character counts' : 'these characters count'} (saved on their note):</span>
          {noLevel.map(r => <label key={r.path}>{r.name} <input type="number" min="1" max="20" data-nolevel={r.name} aria-label={'Level of ' + r.name} placeholder="level" onChange={e => setNoteProp(r.path, 'level', e.currentTarget.value)} style="width:70px" /></label>)}
        </div>
      )}
      <div class="eb-extra small">
        <label>Extra characters <input id="ebExtraN" type="number" min="0" max="10" value={extraN} onInput={e => setExtraN(e.currentTarget.value)} style="width:60px" /></label>
        <label>of level <input id="ebExtraL" type="number" min="1" max="20" value={extraLvl} onInput={e => setExtraLvl(e.currentTarget.value)} style="width:60px" /></label>
        <span class="muted">for a guest, or players with no note</span>
      </div>
      <div class="eb-tiers" id="ebTiers">
        {['low', 'moderate', 'high'].map(t => <div key={t} class={'eb-tier' + (diff.tier === t ? ' on' : '')} data-tier={t}><span class="muted small">{TIER_LABELS[t]}</span><strong>{nf(b[t])}</strong></div>)}
      </div>
      <div class="eb-bar" aria-hidden="true">
        <i class={'eb-fill t-' + diff.tier} style={'width:' + Math.min(100, (total / max) * 100) + '%'} />
        {['low', 'moderate', 'high'].map(t => <b key={t} class="eb-mark" style={'left:' + Math.min(100, (b[t] / max) * 100) + '%'} />)}
      </div>
      <div class="eb-total" id="ebTotal"><strong>{nf(total)}</strong> XP of monsters: <span class={'eb-diff t-' + diff.tier} id="ebDiff">{diff.label}</span>{diff.tier === 'over' && <span class="muted small"> (more than the High budget of {nf(b.high)})</span>}</div>
      <div class="field" style="margin-top:10px">
        <label class="lbl" for="ebSearch">Add a monster</label>
        <input id="ebSearch" type="search" placeholder={loading ? 'Unpacking the monsters…' : 'Search by name or type'} value={q} onInput={e => setQ(e.currentTarget.value)} />
        {hits.length > 0 && (
          <ul class="eb-hits" id="ebHits">
            {hits.map(m => { const xp = crXp(m.cr), f = fitCounts(xp, b); return (
              <li key={m.key}><button class="eb-hit" data-add={m.key} onClick={() => add(m.key)}>
                <span><strong>{m.n}</strong> <span class="muted small">CR {crLabel(m.cr)} · {nf(xp)} XP{m.mine ? ' · mine' : ''}</span></span>
                {b.n > 0 && <span class="muted small">fits: {f.low} low · {f.moderate} moderate · {f.high} high</span>}
              </button></li>
            ); })}
          </ul>
        )}
      </div>
      {items.length > 0 ? (
        <table class="pt-table" id="ebList" style="margin-top:8px">
          <thead><tr><th scope="col">Monster</th><th scope="col">CR</th><th scope="col">XP each</th><th scope="col">How many</th><th scope="col">XP</th><th scope="col"></th></tr></thead>
          <tbody>{items.map(e => (
            <tr key={e.key} data-eb={e.key}>
              <th scope="row">{e.m.n}</th><td>{crLabel(e.m.cr)}</td><td>{nf(crXp(e.m.cr))}</td>
              <td class="eb-qty"><button class="mini" aria-label={'One fewer ' + e.m.n} onClick={() => setQty(e.key, e.qty - 1)}>−</button><span data-qty>{e.qty}</span><button class="mini" aria-label={'One more ' + e.m.n} onClick={() => setQty(e.key, e.qty + 1)}>+</button></td>
              <td>{nf(crXp(e.m.cr) * e.qty)}</td>
              <td><button class="btn btn-sm btn-ghost" aria-label={'Remove ' + e.m.n} onClick={() => setQty(e.key, 0)}>Remove</button></td>
            </tr>
          ))}</tbody>
        </table>
      ) : <p class="muted small" id="ebEmpty" style="margin:8px 0 0">No monsters yet. Search above and press one to add it.</p>}
      {missing > 0 && <div class="small muted" style="margin-top:6px">{missing} saved {missing === 1 ? 'monster is' : 'monsters are'} not available now (its note was removed, or the built-in monsters are off in Settings).</div>}
      <div class="row-actions" style="margin-top:10px">
        <button class="btn btn-primary" id="ebSend" disabled={!items.length} onClick={send}>Send to combat</button>
        <button class="btn" id="ebClear" disabled={!list.length} onClick={() => setEncounter([])}>Clear</button>
        <button class="btn btn-ghost" onClick={() => set({ dialog: { kind: 'monsters' } })}>Monster library…</button>
      </div>
      <SaveEncounterBar items={items} />
      <p class="small muted" style="margin:10px 0 0">2024 rules: add up the monsters’ XP and compare it with the party’s budget (each character’s number for their level, added together); there is no multiplier for how many monsters there are. The table is from the 2024 Dungeon Master’s Guide as transcribed by a secondary source, so check it against your book. Lair, legendary and special monsters can be harder than their XP says.</p>
    </div>
  );
}

/* who has had a moment lately: log a line with the Spotlight tag naming a player, or press + Moment here */
function SpotlightCard() {
  const s = useApp();
  const sp = spotlightNow();
  const [what, setWhat] = useState('');
  const [open, setOpen] = useState(() => !!(sp && sp.rows.some(r => r.count === 0 && !r.away)));       // open when someone is quiet, decided once: it no longer folds itself shut when the last quiet player gets a moment
  if (!sp || !sp.rows.length) return null;
  const where = n => (n < 0 ? 'none yet' : n === 0 ? 'this session' : n === 1 ? '1 session ago' : n + ' sessions ago');
  const add = name => { if (addSpotlight(name, what)) { toast('Logged a spotlight moment for ' + name + '.'); setWhat(''); } else toast('There is no session note to log to yet.', true); };
  const undo = name => {
    const r = undoSpotlight(name);
    if (r) toast('Took back the moment' + (name ? ' for ' + name : '') + ': ' + r.text.slice(0, 60) + (r.text.length > 60 ? '…' : ''));
  };
  const hereAll = spotlightHere();
  return (
    <details class="card spot-card" id="spotlightCard" open={open} onToggle={e => setOpen(e.currentTarget.open)} style="margin-bottom:16px">
      <summary><h3 style="margin:0;display:inline">Spotlight <span class="muted small">(the last {sp.sessions} {sp.sessions === 1 ? 'session' : 'sessions'})</span></h3></summary>
      <div style="height:10px" />
      <p class="muted small" style="margin:0 0 8px">Moments you have logged with the Spotlight tag. The quiet ones are at the top.</p>
      <div class="field spot-input" style="margin-bottom:6px"><input id="spotWhat" name="spot-what" aria-label="What happened (optional)" placeholder="What happened (optional), then press + Moment" value={what} onInput={e => setWhat(e.currentTarget.value)} /><button class="btn btn-sm" id="spotUndo" disabled={!hereAll} title="Take back the newest moment logged to this session" onClick={() => undo()}>Undo last moment</button></div>
      {sp.rows.map(r => (
        <div key={r.path} class={'spot-row' + (r.count === 0 && !r.away ? ' quiet' : '')} data-spot={r.name}>
          <strong style="min-width:140px">{r.name}</strong>
          <span class="spot-dots" aria-label={r.count + ' moments'}>{r.count ? '\u25CF'.repeat(Math.min(r.count, 10)) : '\u25CB'}</span>
          <span class="muted small">{r.count} · latest: {where(r.last)}{r.away ? ' · away' : ''}</span>
          <span class="spot-btns"><button class="btn btn-sm" data-spot-add={r.name} onClick={() => add(r.name)}>+ Moment</button><button class="btn btn-sm btn-ghost" data-spot-undo={r.name} aria-label={'Take back the last moment for ' + r.name} title={spotlightHere(r.name) ? 'Take back the last moment for ' + r.name : 'No moment for ' + r.name + ' in this session to take back'} disabled={!spotlightHere(r.name)} onClick={() => undo(r.name)}>−</button></span>
        </div>
      ))}
    </details>
  );
}
