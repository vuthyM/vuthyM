import { useReducer, useState } from 'preact/hooks';
import { S, set, toast, useApp } from './store.js';
import { openSettings, askClaude, claudeOn, customTables, hiddenGens, noteRecentGen, saveCombo, deleteCombo } from './actions.js';
import { useTab } from './tabs.jsx';
import { expandPrompt, CLAUDE_SYSTEM } from '../core/claudeprompts.js';
import { CAT_VAR, rollAll, rerollField, fieldMeta, GENS_BY_ID } from '../core/generators.js';
import { GROUPS, BLURBS, MAX_PICKS, cleanPicks, picksTotal, buildSheet, sheetText, multiText } from '../core/genlayout.js';
import { rollTable } from '../core/pools.js';
import { rollExpr } from '../core/dice.js';
import { getGenState } from './genstate.js';
import { copyText, NameCheck } from './common.jsx';
import { suggestName } from '../core/templates.js';

/* Generate: a few quiet steps. Home asks what you need, in plain words. A group lists its generators. A generator is one page you can
   read aloud (a "handout"), with Roll again as the one obvious button. Tick several generators (and how many of each) to get them
   all on one page, and save a favourite set as a combo. */

const ICON_REFRESH = <svg viewBox="0 0 24 24" aria-hidden="true"><polyline points="23 4 23 10 17 10" /><polyline points="1 20 1 14 7 14" /><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" /></svg>;
const ICON_LOCK = <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="11" width="18" height="11" rx="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" /></svg>;
const ICON_UNLOCK = <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="11" width="18" height="11" rx="2" /><path d="M7 11V7a5 5 0 0 1 9.9-1" /></svg>;

const GROUP_OF = {};
GROUPS.forEach(gr => gr.gens.forEach(id => { GROUP_OF[id] = gr; }));
const ORDERED = GROUPS.flatMap(gr => gr.gens.map(id => GENS_BY_ID[id]).filter(Boolean));
const visibleOf = ids => { const h = hiddenGens(); return ids.map(id => GENS_BY_ID[id]).filter(g => g && !h.has(g.id)); };
const views = new Map();           // where each Generate tab was left (screen and picks), so coming back to it is not a step backwards
const known = id => !!GENS_BY_ID[id];
const usable = picks => { const h = hiddenGens(); return cleanPicks(picks, known, id => !h.has(id)); };
/* the rolls on the "pick several" page: copy k of a generator is instance "m<k>" */
const itemsOf = picks => picks.flatMap(p => Array.from({ length: p.qty }, (_, k) => ({ g: GENS_BY_ID[p.id], inst: 'm' + k, k, of: p.qty })));
const rollPicks = picks => itemsOf(picks).forEach(({ g, inst }) => rollAll(g, getGenState(g, inst)));

/* lock and reroll for the rows that make up one part of the page (the title, the lead line, a section) */
function Tools({ g, st, keys, label, force }) {
  if (!keys.length) return null;
  const locked = keys.every(k => st.locks[k]);
  return (
    <span class="gs-tools">
      <button class="mini" aria-pressed={locked} aria-label={(locked ? 'Unlock ' : 'Lock ') + label} title={(locked ? 'Unlock' : 'Lock') + ' this part (Roll again leaves it alone)'} onClick={() => { keys.forEach(k => { st.locks[k] = !locked; }); force(); }}>{locked ? ICON_LOCK : ICON_UNLOCK}</button>
      <button class="mini" aria-label={'Reroll ' + label} title="Reroll just this part" onClick={() => { keys.forEach(k => rerollField(g, st, k)); force(); }}>{ICON_REFRESH}</button>
    </span>
  );
}

function ListValue({ items }) {
  const short = items.every(x => String(x).length <= 52);
  return <ul class={'gs-list' + (short && items.length > 3 ? ' two' : '')}>{items.map((x, i) => <li key={i}>{x}</li>)}</ul>;
}

const NAME_GENS = new Set(['npc', 'villain', 'tavern', 'shop', 'settlement', 'festival']);   // the results that are named: the name checker looks at those

/* one result as a page. `multi` is true on the "pick several" page, where `inst` says which copy it is and `tag` names it. */
function Sheet({ g, inst, multi, tag, anchor }) {
  useApp();
  const st = getGenState(g, inst);
  const [, force] = useReducer(x => x + 1, 0);
  const sh = buildSheet(g, st);
  const roll = () => { rollAll(g, st); force(); };
  const refillable = g.fields.some(f => fieldMeta(g, f));
  return (
    <article class={'gs' + (multi ? ' gs-multi' : '')} aria-label={tag || g.name} data-gen={g.id} data-inst={inst || undefined} id={anchor}>
      {multi && <div class="gs-tag">{tag}</div>}
      {sh.kicker && (
        <div class="gs-kickrow">
          <div class="gs-kicker" data-part="kicker">{sh.kicker.text}</div>
          <Tools g={g} st={st} keys={sh.kicker.keys} label={sh.kicker.label} force={force} />
        </div>
      )}
      <div class="gs-titlerow">
        <h2 class="gs-title" data-part="title">{sh.title.text}</h2>
        <Tools g={g} st={st} keys={sh.title.keys} label={sh.title.label} force={force} />
        <button class={'btn gs-roll' + (multi ? '' : ' btn-primary')} id={multi ? undefined : 'genRoll'} onClick={roll}>{multi ? 'Roll this again' : 'Roll again'}</button>
      </div>
      {NAME_GENS.has(g.id) && <NameCheck name={suggestName(g, st.vals)} />}
      {g.opts && (
        <div class="gs-opts" role="group" aria-label="Options">
          {g.opts.map(o => (
            <label class="gs-opt" key={o.key}>
              <span>{o.label}</span>
              <select value={st.opts[o.key]} aria-label={(tag || g.name) + ' ' + o.label} onChange={e => { st.opts[o.key] = e.currentTarget.value; rollAll(g, st); force(); }}>
                {o.values.map(v => <option key={v} value={v}>{v}</option>)}
              </select>
            </label>
          ))}
        </div>
      )}
      {sh.lead && (
        <div class="gs-leadrow">
          <p class="gs-lead" data-part="lead">{sh.lead.text}</p>
          <Tools g={g} st={st} keys={sh.lead.keys} label={sh.lead.label} force={force} />
        </div>
      )}
      <div class="gs-sections">
        {sh.sections.map(x => (
          <section class={'gs-sec' + (x.muted ? ' muted' : '') + (st.locks[x.key] ? ' locked' : '')} key={x.key} data-field={x.key}>
            <div class="gs-lblrow"><h3 class="gs-lbl">{x.label}</h3><Tools g={g} st={st} keys={[x.key]} label={x.label} force={force} /></div>
            {x.hidden && !st.revealed[x.key]
              ? <button class="btn btn-sm" onClick={() => { st.revealed[x.key] = true; force(); }}>Reveal answer</button>
              : x.kind === 'list' ? <ListValue items={x.value} /> : <p class="gs-val">{x.value}</p>}
          </section>
        ))}
      </div>
      {g.desc && <div class="gs-note">{g.desc}</div>}
      <div class="gs-foot">
        <button class="btn" onClick={() => set({ dialog: { kind: 'save', gid: g.id, inst } })}>Save to campaign…</button>
        <button class="btn" onClick={() => copyText(sheetText(g, st), 'Copied ' + (tag || g.name))}>Copy</button>
        {!multi && claudeOn() && <button class="btn" data-claude="expand" onClick={() => askClaude({ title: 'Expand this ' + g.name.toLowerCase() + ' with Claude', system: CLAUDE_SYSTEM, prompt: expandPrompt(g, st.vals, S.campaign && S.campaign.name), autoSend: true })}>Expand with Claude</button>}
        {!multi && claudeOn() && refillable && <button class="btn" data-claude="refill" title="Have Claude write new rows for this generator's tables, so it repeats itself less" onClick={() => set({ dialog: { kind: 'claudeTable', mode: 'refill', gid: g.id } })}>Refill tables…</button>}
      </div>
    </article>
  );
}

/* a tile for a group or a generator. A generator tile has a small tick box to pick it (and Ctrl/⌘-click ticks it too). */
function Tile({ title, blurb, cat, onClick, attrs, strong, pick }) {
  return (
    <div class="gen-tilewrap">
      <button class={'gen-tile' + (strong ? ' strong' : '') + (pick && pick.on ? ' picked' : '')} onClick={e => { if (pick && (e.ctrlKey || e.metaKey)) { e.preventDefault(); pick.toggle(); } else onClick(e); }} {...attrs}>
        <span class="gen-tile-t">{cat && <span class="dot" style={'background:var(' + CAT_VAR[cat] + ')'} />}{title}</span>
        {blurb && <span class="gen-tile-b">{blurb}</span>}
      </button>
      {pick && <label class="gen-pick" title={pick.on ? 'Picked: click to remove it' : 'Pick it, to roll it together with others'}><input type="checkbox" data-pick-box={pick.id} aria-label={'Pick ' + title} checked={pick.on} onChange={pick.toggle} /></label>}
    </div>
  );
}

/* what you have picked: each with how many, and what to do with them */
function Tray({ picks, setPicks, screen, onRoll }) {
  const [naming, setNaming] = useState(false);
  const [name, setName] = useState('');
  if (!picks.length) return null;
  const total = picksTotal(picks);
  const setQty = (id, d) => setPicks(picks.map(p => (p.id === id ? { ...p, qty: Math.max(1, Math.min(MAX_PICKS, p.qty + d)) } : p)));
  const saveIt = e => {
    e.preventDefault();
    if (!name.trim()) return;
    if (saveCombo(name, picks)) { toast('Saved the combo “' + name.trim() + '”. It is on the Generate home screen.'); setNaming(false); setName(''); }
  };
  return (
    <div class="gen-tray" id="genTray" role="region" aria-label="Picked generators">
      <div class="gen-tray-row">
        <span class="small muted">Picked ({total} of {MAX_PICKS}):</span>
        {picks.map(p => {
          const g = GENS_BY_ID[p.id];
          return (
            <span class="gen-pk" key={p.id} data-pk={p.id}>
              <b>{g.name}</b>
              <button type="button" class="pk-b" aria-label={'Fewer ' + g.name} disabled={p.qty <= 1} onClick={() => setQty(p.id, -1)}>−</button>
              <span class="pk-q" aria-label={p.qty + ' of ' + g.name}>{p.qty}</span>
              <button type="button" class="pk-b" aria-label={'More ' + g.name} disabled={total >= MAX_PICKS} onClick={() => setQty(p.id, 1)}>+</button>
              <button type="button" class="pk-b pk-x" aria-label={'Remove ' + g.name} onClick={() => setPicks(picks.filter(x => x.id !== p.id))}>✕</button>
            </span>
          );
        })}
      </div>
      <div class="gen-tray-row">
        {screen !== 'multi' && <button class="btn btn-primary" id="pickRoll" onClick={onRoll}>Roll {total === 1 ? 'it' : 'them'}</button>}
        <button class="btn" id="pickClear" onClick={() => setPicks([])}>Clear</button>
        {!naming && <button class="btn" id="pickCombo" onClick={() => setNaming(true)}>Save as a combo…</button>}
        {naming && (
          <form class="gen-combo-form" onSubmit={saveIt}>
            <input id="comboName" aria-label="Name for this combo" placeholder="Name it, e.g. A night at the inn" value={name} maxLength={40} onInput={e => setName(e.currentTarget.value)} />
            <button class="btn btn-primary" id="comboSave" type="submit" disabled={!name.trim()}>Save</button>
            <button class="btn" type="button" onClick={() => { setNaming(false); setName(''); }}>Cancel</button>
          </form>
        )}
      </div>
    </div>
  );
}

function Home({ go, picks, togglePick, setPicks, openCombo }) {
  const [q, setQ] = useState('');
  const ql = q.trim().toLowerCase();
  const shown = visibleOf(ORDERED.map(g => g.id));
  const hits = ql ? shown.filter(g => (g.name + ' ' + g.cat + ' ' + (g.kw || '')).toLowerCase().includes(ql)) : [];
  const open = g => go({ screen: 'gen', gid: g.id, group: GROUP_OF[g.id].id });
  const surprise = () => { if (!shown.length) return; const g = shown[Math.floor(Math.random() * shown.length)]; rollAll(g, getGenState(g)); open(g); };
  const groups = GROUPS.filter(gr => visibleOf(gr.gens).length);
  const recent = visibleOf(S.settings.recentGens || []);
  const combos = (S.settings.combos || []).filter(c => usable(c.picks).length);
  const pickOf = g => ({ id: g.id, on: picks.some(p => p.id === g.id), toggle: () => togglePick(g.id) });
  return (
    <div class="gen-home">
      <h2 class="gen-q">What do the players need right now?</h2>
      <div class="gen-find"><input id="genFind" type="search" placeholder="…or find a generator by name" aria-label="Find a generator" value={q} onInput={e => setQ(e.currentTarget.value)}
        onKeyDown={e => { if (e.key === 'Enter' && hits[0]) open(hits[0]); if (e.key === 'Escape') setQ(''); }} /></div>
      <Tray picks={picks} setPicks={setPicks} screen="home" onRoll={() => openCombo(picks)} />
      {ql ? (
        <div class="gen-tiles">
          {hits.map(g => <Tile key={g.id} title={g.name} blurb={BLURBS[g.id]} cat={g.cat} attrs={{ 'data-pick': g.id }} pick={pickOf(g)} onClick={() => open(g)} />)}
          {!hits.length && <div class="muted" style="padding:6px 2px">No generator matches “{q}”.</div>}
        </div>
      ) : (
        <>
          {recent.length > 0 && (
            <div class="gen-recent" aria-label="Used recently"><span class="muted small">Recently:</span> {recent.map(g => <button key={g.id} class="chip" data-recent={g.id} onClick={() => open(g)}>{g.name}</button>)}</div>
          )}
          {combos.length > 0 && (
            <div class="gen-recent gen-combos" aria-label="Combos"><span class="muted small">Combos:</span> {combos.map(c => (
              <span class="combo" key={c.id}>
                <button class="chip" data-combo={c.id} title={c.picks.map(p => (GENS_BY_ID[p.id] ? GENS_BY_ID[p.id].name + (p.qty > 1 ? ' ×' + p.qty : '') : '')).filter(Boolean).join(', ')} onClick={() => openCombo(c.picks)}>{c.name}</button>
                <button class="combo-x" data-combo-del={c.id} aria-label={'Delete the combo ' + c.name} title="Delete this combo" onClick={() => set({ dialog: { kind: 'confirm', title: 'Delete this combo?', body: '“' + c.name + '” will be removed from the Generate home screen.', confirmLabel: 'Delete combo', danger: true, onConfirm: () => deleteCombo(c.id) } })}>✕</button>
              </span>
            ))}</div>
          )}
          {groups.length ? (
            <div class="gen-tiles">
              {groups.map(gr => <Tile key={gr.id} title={gr.title} blurb={visibleOf(gr.gens).map(g => g.name).join(', ')} cat={gr.cat} attrs={{ 'data-group': gr.id }} onClick={() => go({ screen: 'group', group: gr.id })} />)}
              <Tile title="Just surprise me" blurb="A random thing" attrs={{ id: 'genSurprise' }} onClick={surprise} />
            </div>
          ) : (
            <div class="gen-empty" id="genNone">Every generator is switched off. <button class="linkish" onClick={() => openSettings('library', 'gens')}>Choose which ones to show</button></div>
          )}
          <div class="gen-more">
            <button class="linkish" id="genTools" onClick={() => go({ screen: 'tools' })}>Dice and my tables</button>
            <span class="sep" aria-hidden="true"> · </span>
            <button class="linkish" id="genChoose" onClick={() => openSettings('library', 'gens')}>Choose which generators show</button>
          </div>
        </>
      )}
    </div>
  );
}

function Group({ gr, go, picks, togglePick, setPicks, openCombo }) {
  return (
    <div class="gen-home">
      <h2 class="gen-q">{gr.title}</h2>
      <Tray picks={picks} setPicks={setPicks} screen="group" onRoll={() => openCombo(picks)} />
      <div class="gen-tiles">
        {visibleOf(gr.gens).map(g => <Tile key={g.id} title={g.name} blurb={BLURBS[g.id]} attrs={{ 'data-pick': g.id }} pick={{ id: g.id, on: picks.some(p => p.id === g.id), toggle: () => togglePick(g.id) }} onClick={() => go({ screen: 'gen', gid: g.id, group: gr.id })} />)}
      </div>
      <div class="small muted" style="margin-top:10px">Tick a few to roll them together: a tavern and a shop, say. Ctrl/⌘-click a tile ticks it too.</div>
    </div>
  );
}

/* the picks, all rolled, one under another */
function Multi({ picks, setPicks, onRollAll }) {
  useApp();
  const [rev, bump] = useReducer(x => x + 1, 0);
  const items = itemsOf(picks);
  const tagOf = it => (it.of > 1 ? it.g.name + ' ' + (it.k + 1) : it.g.name);
  const anchor = it => 'ms-' + it.g.id + '-' + it.k;
  const copyAll = () => copyText(multiText(items.map(it => ({ g: it.g, st: getGenState(it.g, it.inst) }))), 'Copied all ' + items.length);
  return (
    <div class="gen-multi" data-rev={rev}>
      <h2 class="gen-q">Your {items.length === 1 ? 'pick' : items.length + ' picks'}</h2>
      <Tray picks={picks} setPicks={setPicks} screen="multi" />
      <div class="gen-jump" aria-label="Jump to">{items.map(it => <button key={anchor(it)} class="chip" data-jump={anchor(it)} onClick={() => { const el = document.getElementById(anchor(it)); if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' }); }}>{tagOf(it)}</button>)}</div>
      <div class="gen-multi-bar">
        <button class="btn btn-primary" id="multiRoll" onClick={() => { onRollAll(); bump(); }}>Roll all again</button>
        <button class="btn" id="multiSave" onClick={() => set({ dialog: { kind: 'saveAll', items: items.map(it => ({ gid: it.g.id, inst: it.inst })) } })}>Save all to campaign…</button>
        <button class="btn" id="multiCopy" onClick={copyAll}>Copy all</button>
      </div>
      {!items.length && <div class="gen-empty">Nothing is picked. Go back and tick some generators.</div>}
      {items.map(it => <Sheet key={anchor(it)} g={it.g} inst={it.inst} multi tag={tagOf(it)} anchor={anchor(it)} />)}
    </div>
  );
}

/* the tables you asked Claude to write: roll on one */
function TablesCard() {
  useApp();
  const tables = customTables();
  const [pick, setPick] = useState('');
  const [res, setRes] = useState(null);
  const cur = tables.find(t => t.path === pick) || tables[0];
  return (
    <article class="widget" aria-label="My tables" data-gen="tables">
      <div class="w-head"><span class="cat-dot" style="background:var(--fg-muted)" /><h3>My tables</h3><span class="w-cat">Tools</span></div>
      <div class="w-desc">Tables Claude wrote for you, saved in your vault. Pick one and roll.</div>
      {cur ? (
        <>
          <div class="dice-row">
            <select id="tblPick" aria-label="Table" value={cur.path} onChange={e => { setPick(e.currentTarget.value); setRes(null); }}>{tables.map(t => <option key={t.path} value={t.path}>{t.name} (d{t.rows.length})</option>)}</select>
            <button class="btn btn-primary" id="tblRoll" onClick={() => setRes(rollTable(cur))}>Roll</button>
          </div>
          <div class="dice-result">{res ? <><div class="dice-total mono" id="tblN">{res.n}</div><div id="tblText" style="text-align:center">{res.text}</div></> : <div class="muted">Roll to see what comes up.</div>}</div>
        </>
      ) : <div class="muted small" style="margin:8px 0">None yet.</div>}
      {claudeOn() && <div class="w-foot"><button class="btn btn-sm" id="tblMake" onClick={() => set({ dialog: { kind: 'claudeTable', mode: 'make' } })}>Make a table with Claude…</button></div>}
    </article>
  );
}

function DiceCard() {
  const [expr, setExpr] = useState('');
  const [last, setLast] = useState(null);
  const [log, setLog] = useState([]);
  const roll = e => {
    const r = rollExpr(e);
    if (!r) { toast('Try something like 2d6+3 or 4d6kh3', true); return; }
    setLast(r);
    setLog([r, ...log].slice(0, 8));
  };
  const B = (label, e) => <button key={e} class="btn" onClick={() => roll(e)} data-expr={e}>{label}</button>;
  return (
    <article class="widget" aria-label="Dice" data-gen="dice">
      <div class="w-head"><span class="cat-dot" style="background:var(--fg-muted)" /><h3>Dice</h3><span class="w-cat">Tools</span></div>
      <div class="w-desc">Tap a die, or type an expression like 2d6+3 or 4d6kh3.</div>
      <div class="dice-grid">
        {B('d4', 'd4')}{B('d6', 'd6')}{B('d8', 'd8')}
        {B('d10', 'd10')}{B('d12', 'd12')}{B('d20', 'd20')}
        {B('d100', 'd100')}{B('Advantage', '2d20kh1')}{B('Disadvantage', '2d20kl1')}
      </div>
      <form class="dice-row" onSubmit={e => { e.preventDefault(); roll(expr); }}>
        <input value={expr} placeholder="2d6+3" aria-label="Dice expression" onInput={e => setExpr(e.currentTarget.value)} />
        <button class="btn btn-primary" type="submit">Roll</button>
      </form>
      <div class="dice-result">
        {last ? (
          <>
            <div class="dice-total mono" id="diceTotal">{last.total}</div>
            <div class="dice-detail mono">{last.detail}</div>
            {last.note && <span class={'pill ' + (last.note === 'Natural 20' ? 'pill-good' : 'pill-bad')} style="margin-top:6px">{last.note}</span>}
          </>
        ) : <div class="muted">Roll a die to start.</div>}
      </div>
      {log.length > 1 && <ul class="dice-log">{log.slice(1, 7).map((x, i) => <li key={i}><span class="mono">{x.expr}</span><span class="mono">{x.total}</span></li>)}</ul>}
    </article>
  );
}

export function GeneratePage() {
  useApp();
  const tab = useTab();
  const [mem, setMem] = useState(() => views.get(tab.id) || { view: { screen: 'home' }, picks: [] });
  const update = fn => setMem(prev => { const next = fn(prev); views.set(tab.id, next); return next; });
  const go = v => { update(m => ({ ...m, view: v })); if (v.screen === 'gen' && v.gid) noteRecentGen(v.gid); };
  const picks = usable(mem.picks);
  const setPicks = list => update(m => ({ ...m, picks: usable(typeof list === 'function' ? list(m.picks) : list) }));
  const togglePick = id => update(m => {
    const cur = usable(m.picks);
    if (cur.some(p => p.id === id)) return { ...m, picks: cur.filter(p => p.id !== id) };
    if (picksTotal(cur) >= MAX_PICKS) { toast('Up to ' + MAX_PICKS + ' at once. Remove one first.', true); return { ...m, picks: cur }; }
    return { ...m, picks: usable([...cur, { id, qty: 1 }]) };
  });
  /* roll a set of picks (the tray, or a combo) and show them on the one page */
  const openCombo = list => {
    const use = usable(list);
    if (!use.length) return;
    rollPicks(use);
    update(m => ({ ...m, picks: use, view: { screen: 'multi' } }));
  };
  const view = mem.view;
  const gr = view.group && GROUPS.find(x => x.id === view.group);
  const g = view.gid && GENS_BY_ID[view.gid];
  const crumbs = [<button key="h" class="linkish" id="genHome" onClick={() => go({ screen: 'home' })}>Generate</button>];
  if (view.screen === 'tools') crumbs.push(<span key="t">Dice and my tables</span>);
  if (view.screen === 'multi') crumbs.push(<span key="m">Picked together</span>);
  if (gr && (view.screen === 'group' || view.screen === 'gen')) crumbs.push(view.screen === 'group' ? <span key="g">{gr.title}</span> : <button key="g" class="linkish" onClick={() => go({ screen: 'group', group: gr.id })}>{gr.title}</button>);
  if (view.screen === 'gen' && g) crumbs.push(<span key="n">{g.name}</span>);
  return (
    <div class="gen">
      {view.screen !== 'home' && (
        <nav class="gen-crumbs" aria-label="Where you are">
          {crumbs.flatMap((c, i) => (i ? [<span key={'s' + i} class="sep" aria-hidden="true">›</span>, c] : [c]))}
        </nav>
      )}
      {view.screen === 'home' && <Home go={go} picks={picks} togglePick={togglePick} setPicks={setPicks} openCombo={openCombo} />}
      {view.screen === 'group' && gr && <Group gr={gr} go={go} picks={picks} togglePick={togglePick} setPicks={setPicks} openCombo={openCombo} />}
      {view.screen === 'gen' && g && <Sheet g={g} />}
      {view.screen === 'multi' && <Multi picks={picks} setPicks={setPicks} onRollAll={() => rollPicks(picks)} />}
      {view.screen === 'tools' && (
        <div class="gen-grid gen-tools">
          <DiceCard />
          {(claudeOn() || customTables().length > 0) && <TablesCard />}
        </div>
      )}
    </div>
  );
}
