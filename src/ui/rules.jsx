import { useEffect, useMemo, useState } from 'preact/hooks';
import { useApp, getIndex, toast, set } from './store.js';
import { saveSpellToNotes, goto } from './actions.js';
import { loadSpells, spellsLoaded, searchSpells, spellMarkdown, levelName, SCHOOLS, SPELL_CLASSES, SRD_CREDIT } from '../core/spells.js';
import { CONDITION_RULES } from '../core/rules.js';
import { Markdown } from './common.jsx';

const LIMIT = 80;

function Spells() {
  const [list, setList] = useState(spellsLoaded());
  const [err, setErr] = useState('');
  const [q, setQ] = useState('');
  const [level, setLevel] = useState('');
  const [school, setSchool] = useState('');
  const [cls, setCls] = useState('');
  const [conc, setConc] = useState(false);
  const [rit, setRit] = useState(false);
  const [sel, setSel] = useState('');
  useEffect(() => { if (!list) loadSpells().then(setList).catch(e => setErr('Could not unpack the spells: ' + (e && e.message ? e.message : e))); }, []);
  const found = useMemo(() => (list ? searchSpells(list, { q, level, school, cls, concentration: conc, ritual: rit }) : []), [list, q, level, school, cls, conc, rit]);
  const sp = list && list.find(x => x.key === sel);
  const md = useMemo(() => (sp ? spellMarkdown(sp) : ''), [sp]);
  const idx = getIndex();
  const keep = () => { saveSpellToNotes(sp); toast('Saved “' + sp.n + '” to your Spells notes. Push changes to write it to your vault.'); };
  return (
    <div class="ml" id="spellsTab">
      <div class="ml-side">
        <input id="spSearch" type="search" placeholder="Search spells by name or text" aria-label="Search spells" value={q} onInput={e => setQ(e.currentTarget.value)} />
        <div class="ml-filters">
          <label class="small">Level <select id="spLevel" value={level} onChange={e => setLevel(e.currentTarget.value)}><option value="">any</option>{[0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map(l => <option key={l} value={l}>{levelName(l)}</option>)}</select></label>
          <label class="small">School <select id="spSchool" value={school} onChange={e => setSchool(e.currentTarget.value)}><option value="">any</option>{SCHOOLS.map(x => <option key={x} value={x}>{x}</option>)}</select></label>
          <label class="small">Class <select id="spClass" value={cls} onChange={e => setCls(e.currentTarget.value)}><option value="">any</option>{SPELL_CLASSES.map(x => <option key={x} value={x}>{x}</option>)}</select></label>
          <label class="small"><input type="checkbox" id="spConc" checked={conc} onChange={e => setConc(e.currentTarget.checked)} /> Concentration</label>
          <label class="small"><input type="checkbox" id="spRitual" checked={rit} onChange={e => setRit(e.currentTarget.checked)} /> Ritual</label>
        </div>
        <div class="small muted" id="spCount">{!list ? 'Unpacking the spells…' : found.length + ' of ' + list.length}</div>
        {err && <div class="claude-error small" role="alert">{err}</div>}
        <ul class="ml-list" id="spList">
          {found.slice(0, LIMIT).map(x => (
            <li key={x.key}><button class={'ml-item' + (x.key === sel ? ' on' : '')} data-spell={x.key} onClick={() => setSel(x.key)}>
              <span class="ml-name">{x.n}{x.cn && <span class="pill" style="margin-left:6px">C</span>}{x.ri && <span class="pill" style="margin-left:4px">R</span>}</span>
              <span class="muted small">{levelName(x.lv)} · {x.sc}{x.cl.length ? ' · ' + x.cl.join(', ') : ''}</span>
            </button></li>
          ))}
          {found.length > LIMIT && <li class="small muted" style="padding:6px">Showing the first {LIMIT}. Search or filter to narrow it down.</li>}
          {list && !found.length && <li class="small muted" style="padding:6px">No spell matches that.</li>}
        </ul>
      </div>
      <div class="ml-main">
        {sp ? (
          <>
            <h4 style="margin:0 0 6px" id="spTitle">{sp.n}</h4>
            <div class="ml-actions"><button class="btn" id="spKeep" title="Make an editable note in your Spells category" onClick={keep}>Save to my notes</button>{sp.dm && <span class="small muted">Damage {sp.dm}{sp.sv ? ' · ' + sp.sv + ' save' : ''}</span>}</div>
            <div class="ml-block" id="spBlock"><Markdown body={md} index={idx} rev={0} /></div>
          </>
        ) : <p class="muted" id="spHint">Pick a spell on the left to read it. Dice in a spell are buttons that roll.</p>}
        <p class="small muted" id="spCredit" style="margin-top:12px">{SRD_CREDIT}</p>
      </div>
    </div>
  );
}

function Conditions() {
  return (
    <div id="condTab">
      <p class="muted small" style="margin-top:0">Short reminders of what each condition does, written for DM Forge from the 2024 rules. In combat, hover a condition for the same text. The book has the exact wording.</p>
      <dl class="cond-list" id="condList">
        {Object.entries(CONDITION_RULES).map(([k, v]) => <div key={k} data-cond={k}><dt>{k}</dt><dd>{v}</dd></div>)}
      </dl>
    </div>
  );
}

export function RulesPage() {
  const [tab, setTab] = useState('spells');
  return (
    <>
      <div class="page-head"><div><h2 aria-level="1">Rules</h2><div class="muted small">Spells and conditions, to hand while you play.</div></div></div>
      <div class="seg" role="tablist" aria-label="Rules" style="display:flex;gap:6px;margin-bottom:12px">
        <button role="tab" id="tabSpells" aria-selected={tab === 'spells'} class={'chip-btn' + (tab === 'spells' ? ' on' : '')} onClick={() => setTab('spells')}>Spells</button>
        <button role="tab" id="tabConds" aria-selected={tab === 'conds'} class={'chip-btn' + (tab === 'conds' ? ' on' : '')} onClick={() => setTab('conds')}>Conditions</button>
      </div>
      <div class="card">{tab === 'spells' ? <Spells /> : <Conditions />}</div>
    </>
  );
}
