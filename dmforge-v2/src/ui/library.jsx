import { useMemo, useState } from 'preact/hooks';
import { useApp, emit, toast } from './store.js';
import { renderMarkdown } from './render.js';
import { Dialogs } from './dialogs.jsx';
import { LevelUp } from './levelup.jsx';
import { pendingAsi } from '../core/levelup.js';
import { ItemsTab, CarryBox, ImportDialog } from './itemlibrary.jsx';
import { libLevelUp, libTab, libImportOpen, canImport } from './libraryactions.js';
import { closeLibrary, libNew, libEdit, libOpen, libBackToList, libSave, libDelete, libDuplicate, libToggleExamples, libMoveLoose, libRemoveExamples, libSet, libSetClass, libSetLevel, libSetMethod, libSetKind } from './libraryactions.js';
import { AB, ABN, SKILL_LIST, ALIGNMENTS, BACKGROUNDS, STANDARD_ARRAY, POINT_COST, PROMPTS, DSEC, DEPTH, secFor, fieldsFor, RESERVED_HEADINGS } from '../core/chardata.js';
import { derive, scores, bonuses, mod, signed, features, speciesTraits, originFeats, originFeatChoices, resources, spellInfo, slotsText, kitOf, gearList, fitSpells, characterMarkdown, pointsLeft, standardArrayProblem, rollScores, suggestScores, filledSections, fmtSpeed } from '../core/character.js';
import { searchSpells, levelName } from '../core/spells.js';
import { SRD_CREDIT } from '../core/monsters.js';

const STEP_NAMES = ['Class', 'Origin', 'Abilities', 'Spells', 'Equipment', 'Details', 'Review'];

function Md({ text }) {
  const html = useMemo(() => renderMarkdown(text), [text]);
  return <div class="md cc-md" dangerouslySetInnerHTML={{ __html: html }} />;
}
const firstLine = t => { const f = String(t).replace(/\|.*\|/g, ' ').replace(/\s+/g, ' ').trim(); const m = /^(.+?[.!?])(\s|$)/.exec(f); return m ? m[1] : f; };

/* ============ the screen ============ */
export function LibraryScreen() {
  const s = useApp();
  const L = s.lib;
  if (!L) return null;
  const title = L.view === 'edit' ? (L.path ? 'Edit character' : 'New ' + (L.c && L.c.kind === 'npc' ? 'NPC' : 'player character')) : L.view === 'sheet' ? 'Character' : 'Character Library';
  return (
    <div class="lib" id="library">
      <div class="lib-wrap">
        <div class="lib-top">
          <button class="btn btn-sm" id="libBack" onClick={closeLibrary}>← {L.back === 'app' && s.campaign ? 'Back to ' + s.campaign.name : 'Back to campaigns'}</button>
          {L.view !== 'list' && <button class="btn btn-sm btn-ghost" id="libToList" onClick={libBackToList}>Character Library</button>}
          <span class="spacer" style="flex:1" />
          <span class="muted small mono">{s.vault.name} / Character Library</span>
        </div>
        {L.view === 'list' && (
          <div class="cc-tabs lib-tabs" role="tablist" style="margin-bottom:14px">
            <button role="tab" id="libTabChars" aria-selected={L.tab !== 'items'} class={L.tab !== 'items' ? 'on' : ''} onClick={() => libTab('chars')}>Characters{L.list ? ' (' + L.list.filter(r => !r.example).length + ')' : ''}</button>
            <button role="tab" id="libTabItems" aria-selected={L.tab === 'items'} class={L.tab === 'items' ? 'on' : ''} onClick={() => libTab('items')}>Items{L.itemList ? ' (' + L.itemList.length + ')' : ''}</button>
          </div>
        )}
        {L.view === 'list' && L.tab !== 'items' && <LibraryList L={L} />}
        {L.view === 'list' && L.tab === 'items' && <ItemsTab L={L} />}
        {L.view === 'edit' && L.c && L.data && <Creator L={L} />}
        {L.view === 'levelup' && L.c && L.data && <LevelUp L={L} />}
        {L.view === 'sheet' && <CharacterView L={L} />}
        {!L.data && <p class="muted">Loading the SRD data…</p>}
        <p class="muted small cc-credit">{SRD_CREDIT}</p>
      </div>
      {L.imp && <ImportDialog L={L} campaign={s.campaign ? s.campaign.name : 'the campaign'} />}
      <Dialogs />
    </div>
  );
}

/* ============ the list ============ */
function CharCard({ r }) {
  const f = r.fm;
  return (
    <div class={'card cc-card' + (r.example ? ' cc-example' : '')} data-char={r.name}>
      <div class="row-actions" style="gap:6px"><span class={'pill' + ((f.kind || 'pc') === 'pc' ? ' pill-good' : '')}>{(f.kind || 'pc') === 'npc' ? 'NPC' : 'Player'}</span>{f.level ? <span class="pill">Level {f.level}</span> : null}{r.example && <span class="pill pill-warn">Example</span>}{!r.hasState && <span class="pill pill-warn" title="Not made in the creator: it can be viewed here and edited in Obsidian">plain note</span>}</div>
      <h3 style="margin:8px 0 2px"><a href="#" onClick={e => { e.preventDefault(); libOpen(r.path); }}>{r.name}</a></h3>
      <div class="muted small">{[f.species, f.class, f.subclass ? '(' + f.subclass + ')' : ''].filter(Boolean).join(' ') || 'Markdown file'}</div>
      {(f.hp || f.ac) ? <div class="small mono" style="margin-top:6px">{f.hp ? 'HP ' + f.hp : ''}{f.hp && f.ac ? ' · ' : ''}{f.ac ? 'AC ' + f.ac : ''}</div> : null}
      <div class="row-actions" style="margin-top:10px">
        <button class="btn btn-sm" data-open={r.name} onClick={() => libOpen(r.path)}>Open</button>
        <button class="btn btn-sm" data-edit={r.name} disabled={!r.hasState} onClick={() => libEdit(r.path)}>Edit</button>
        <button class="btn btn-sm" data-levelup={r.name} disabled={!r.hasState || Number(f.level) >= 20} title={r.hasState ? 'Take it up a level' : 'Only characters made in the creator can be levelled up'} onClick={() => libLevelUp(r.path)}>Level up</button>
        <button class="btn btn-sm" data-addcamp={r.name} title={canImport() ? 'Copy into the open campaign' : 'Open a campaign first'} onClick={() => libImportOpen('char', r.path)}>Add to campaign…</button>
        <button class="btn btn-sm btn-ghost" data-copy={r.name} disabled={!r.hasState} title={r.example ? 'Makes your own copy, outside Examples' : ''} onClick={() => libDuplicate(r.path)}>Copy</button>
        <button class="btn btn-sm btn-ghost btn-danger" data-delete={r.name} onClick={() => libDelete(r.path)}>Delete</button>
      </div>
    </div>
  );
}

function LibraryList({ L }) {
  const list = L.list;
  const q = L.q.trim().toLowerCase();
  const fits = r => (!q || r.name.toLowerCase().includes(q) || String(r.fm.class || '').toLowerCase().includes(q) || String(r.fm.species || '').toLowerCase().includes(q)) && (!L.kind || (r.fm.kind || 'pc') === L.kind);
  const mine = (list || []).filter(r => !r.example), examples = (list || []).filter(r => r.example);
  const shownMine = mine.filter(fits), shownEx = examples.filter(fits);
  return (
    <>
      <div class="page-head"><div><h2 aria-level="1">Character Library</h2><div class="muted small">Characters live in <span class="mono">Character Library/Characters</span> at the root of your vault, apart from any campaign. They are plain markdown files.</div></div></div>
      <div class="row-actions" style="margin-bottom:14px">
        <button class="btn btn-primary" id="libNewPc" disabled={!L.data} onClick={() => libNew('pc')}>＋ New player character</button>
        <button class="btn" id="libNewNpc" disabled={!L.data} onClick={() => libNew('npc')}>＋ New NPC</button>
        <input id="libSearch" style="flex:1 1 200px;max-width:280px;width:auto" placeholder="Search the library" aria-label="Search the library" value={L.q} onInput={e => { L.q = e.currentTarget.value; emit(); }} />
        {[['', 'All'], ['pc', 'Players'], ['npc', 'NPCs']].map(([k, label]) => <button key={k} class={'btn btn-sm' + (L.kind === k ? ' btn-primary' : '')} onClick={() => { L.kind = k; emit(); }}>{label}</button>)}
      </div>
      {L.err && <div class="note-err small">{L.err}</div>}
      {L.loose && L.loose.length > 0 && (
        <div class="cc-note" id="libLoose" style="margin:0 0 14px"><b>{L.loose.length} example character{L.loose.length === 1 ? '' : 's'} from the sample campaign {L.loose.length === 1 ? 'is' : 'are'} mixed in with your own.</b> <button class="btn btn-sm" id="libMoveLoose" style="margin-left:6px" onClick={libMoveLoose}>Move {L.loose.length === 1 ? 'it' : 'them'} into Examples</button><div class="small muted" style="margin-top:4px">Only files that are exactly as the sample wrote them are moved. Anything you changed, or made yourself, stays where it is.</div></div>
      )}
      {list === null && <p class="muted">Reading the library…</p>}
      {list && !mine.length && (
        <div class="empty"><h3>No characters of your own yet</h3><div>Make your first player character or NPC. You choose how much detail to go into: a quick NPC takes a minute, a main character can have a whole life story.</div></div>
      )}
      {list && mine.length > 0 && !shownMine.length && <p class="muted">Nothing of yours matches that search.</p>}
      <div class="cc-grid" id="libMine">{shownMine.map(r => <CharCard key={r.path} r={r} />)}</div>
      {examples.length > 0 && (
        <div class="cc-examples" id="libExamples">
          <div class="row-actions" style="align-items:center;margin-top:22px">
            <button class="btn btn-sm" id="libToggleExamples" aria-expanded={L.showExamples} onClick={libToggleExamples}>{L.showExamples ? '▾' : '▸'} Examples ({examples.length})</button>
            <span class="muted small">From the sample campaign, kept apart from your own characters.</span>
            <span style="flex:1" />
            <button class="btn btn-sm btn-ghost btn-danger" id="libRemoveExamples" onClick={libRemoveExamples}>Remove all examples</button>
          </div>
          {L.showExamples && (
            <>
              {!shownEx.length && <p class="muted small">No example matches that search.</p>}
              <div class="cc-grid" style="margin-top:10px">{shownEx.map(r => <CharCard key={r.path} r={r} />)}</div>
            </>
          )}
        </div>
      )}
    </>
  );
}

/* ============ a saved character ============ */
function CharacterView({ L }) {
  const c = L.c, data = L.data;
  return (
    <>
      <div class="page-head"><div><h2 aria-level="1">{c ? c.name : L.path.split('/').pop().replace(/\.md$/i, '')}</h2><div class="muted small mono">{L.path}</div></div>
        <div class="row-actions">
          {c && <button class="btn" id="libEditBtn" onClick={() => libEdit(L.path)}>Edit</button>}
          {c && <button class="btn" id="libLevelBtn" disabled={c.level >= 20} onClick={() => libLevelUp(L.path)}>Level up</button>}
          <button class="btn" id="libAddCamp" title={canImport() ? 'Copy into the open campaign' : 'Open a campaign first'} onClick={() => libImportOpen('char', L.path)}>Add to campaign…</button>
          {c && <button class="btn" id="libPrint" onClick={() => window.print()}>Print the sheet</button>}
          <button class="btn btn-ghost btn-danger" onClick={() => libDelete(L.path)}>Delete</button>
        </div>
      </div>
      {c && data ? (
        <>
          <div class="cc-tabs"><button class={L.sheet === 'sheet' ? 'on' : ''} onClick={() => { L.sheet = 'sheet'; emit(); }}>Sheet</button><button class={L.sheet === 'file' ? 'on' : ''} onClick={() => { L.sheet = 'file'; emit(); }}>The markdown file</button></div>
          {L.sheet === 'sheet' ? <Sheet c={c} data={data} /> : <pre class="cc-file">{L.text}</pre>}
        </>
      ) : <pre class="cc-file">{L.text}</pre>}
    </>
  );
}

/* ============ the sheet (also printed) ============ */
export function Sheet({ c, data }) {
  const dv = derive(data, c), si = dv.spells;
  const feats = features(data, c), traits = speciesTraits(data, c), origin = originFeats(data, c), res = resources(data, c), groups = filledSections(c);
  const cl = data.classes[c.cls];
  const gear = gearList(data, c), gp = kitOf(data, c).gp;
  return (
    <div class="cc-sheet lib-print">
      <h2>{c.name || 'Unnamed character'}</h2>
      <div class="cc-sub">Level {c.level} {c.species} {c.cls}{c.level >= 3 && c.sub ? ' (' + c.sub + ')' : ''} · {c.bg}{c.d.align ? ' · ' + c.d.align : ''}{c.kind === 'pc' && c.d.player ? ' · played by ' + c.d.player : ''}</div>
      <div class="cc-stats cc-stats-wide">
        <div><b>{dv.ac}</b><span>AC</span></div><div><b>{dv.hp}</b><span>HP</span></div><div><b>{signed(dv.init)}</b><span>Initiative</span></div><div><b>{fmtSpeed(dv.speed)}</b><span>Speed</span></div><div><b>{signed(dv.p)}</b><span>Proficiency</span></div><div><b>{dv.pp}</b><span>Passive Perc.</span></div>
      </div>
      <div class="cc-sheet-cols">
        <div>
          <h3>Abilities and saves</h3>
          <table class="cc-table">{dv.saves.map(x => <tr key={x.a}><td>{x.p ? '●' : '○'} {ABN[x.a]}</td><td class="mono">{dv.s[x.a]}</td><td class="mono">{signed(mod(dv.s[x.a]))}</td><td class="mono">save {signed(x.v)}</td></tr>)}</table>
          <h3>Skills</h3>
          <table class="cc-table">{dv.skills.map(x => <tr key={x.n}><td>{x.e ? '◉' : x.p ? '●' : '○'} {x.n} <span class="muted">({x.ab})</span>{x.e ? <span class="muted"> expertise</span> : null}</td><td class="mono">{signed(x.v)}</td></tr>)}</table>
          {si && <><h3>Spells</h3><div class="small">Save DC <b>{si.dc}</b> · Attack <b>{signed(si.atk)}</b> ({si.ab})<br />{slotsText(si)}</div>
            {c.cantrips.length > 0 && <div class="small"><b>Cantrips:</b> {c.cantrips.join(', ')}</div>}
            {c.prepared.length > 0 && <div class="small"><b>Prepared:</b> {c.prepared.join(', ')}</div>}</>}
          <h3>Equipment</h3>
          <div class="small">{[...gear, ...(gp ? [gp + ' GP'] : [])].join(', ') || 'Nothing'}</div>
          {(c.items || []).length > 0 && <><h3>Magic items</h3><div class="small" id="sheetMagic">{c.items.map(i => i.n + (i.req ? (i.attuned ? ' (attuned)' : ' (not attuned)') : '')).join(', ')}</div></>}
          <h3>Proficiencies</h3>
          <div class="small">{[cl.armor && cl.armor !== 'None' ? 'Armor: ' + cl.armor : '', cl.weapons ? 'Weapons: ' + cl.weapons : '', [cl.tools, (BACKGROUNDS[c.bg] || {}).tool].filter(Boolean).join('; ') ? 'Tools: ' + [cl.tools, (BACKGROUNDS[c.bg] || {}).tool].filter(Boolean).join('; ') : ''].filter(Boolean).map((t, i) => <div key={i}>{t}</div>)}</div>
        </div>
        <div>
          {res.length > 0 && <><h3>Class resources</h3><div class="small">{res.map(r => r[0] + ': ' + r[1]).join(' · ')}</div></>}
          <h3>Features</h3>
          {feats.map((f, i) => <div class="cc-feat" key={'f' + i}><b>{f.name}</b> <span class="muted mono">{f.from} {f.lvl}</span><div class="small">{firstLine(f.desc)}</div></div>)}
          {traits.map((t, i) => <div class="cc-feat" key={'t' + i}><b>{t.name}</b> <span class="muted mono">{c.species}</span><div class="small">{firstLine(t.desc)}</div></div>)}
          {origin.map((f, i) => <div class="cc-feat" key={'o' + i}><b>{f.name}</b> <span class="muted mono">Origin feat</span><div class="small">{firstLine(f.desc)}</div></div>)}
        </div>
      </div>
      {groups.length > 0 && (
        <div class="cc-page2">
          <div class="muted small cc-p2">Character details</div>
          {groups.map(g => <div key={g.title}><h3>{g.title}</h3>{g.rows.map((r, i) => <div class="small cc-row" key={i}>{r[0] && <b>{r[0]}{/[?…]$/.test(r[0]) ? '' : ':'} </b>}{r[1]}</div>)}</div>)}
        </div>
      )}
    </div>
  );
}

/* ============ the creator ============ */
function stepIds(c, data) { const cl = data.classes[c.cls]; return [0, 1, 2, ...(cl && cl.caster ? [3] : []), 4, 5, 6]; }

function Creator({ L }) {
  const c = L.c, data = L.data;
  const ids = stepIds(c, data);
  if (!ids.includes(L.step)) L.step = 4;
  const at = ids.indexOf(L.step);
  const go = i => { L.step = i; emit(); const el = document.getElementById('library'); if (el) el.scrollTo({ top: 0 }); };
  const body = [StepClass, StepOrigin, StepAbilities, StepSpells, StepEquip, StepDetails, StepReview][L.step];
  const Body = body;
  return (
    <>
      <div class="page-head">
        <div><h2 aria-level="1">{c.name || (c.kind === 'npc' ? 'New NPC' : 'New character')}</h2><div class="muted small">{L.path ? 'Editing ' + L.path : 'Not saved yet'}{L.dirty ? ' · unsaved changes' : ''}</div></div>
        <div class="row-actions"><button class="btn btn-primary" id="libSave" disabled={!c.name.trim()} title={c.name.trim() ? '' : 'Give the character a name first'} onClick={() => libSave({ stay: true })}>Save</button><button class="btn" id="libSaveClose" disabled={!c.name.trim()} onClick={() => libSave()}>Save and close</button></div>
      </div>
      <div class="cc-steps" role="tablist">{ids.map((i, k) => <button key={i} role="tab" aria-selected={L.step === i} data-step={STEP_NAMES[i]} class={'cc-step' + (L.step === i ? ' on' : k < at ? ' done' : '')} onClick={() => go(i)}>{k + 1}. {STEP_NAMES[i]}</button>)}</div>
      <div class="cc-layout">
        <div class="card cc-main">
          <Body L={L} c={c} data={data} />
          <div class="cc-bar">
            <button class="btn" id="ccBack" disabled={at === 0} onClick={() => go(ids[at - 1])}>← Back</button>
            {at < ids.length - 1 ? <button class="btn btn-primary" id="ccNext" onClick={() => go(ids[at + 1])}>Next: {STEP_NAMES[ids[at + 1]]} →</button> : <button class="btn btn-primary" id="ccFinish" disabled={!c.name.trim()} onClick={() => libSave()}>Save to the Character Library</button>}
          </div>
        </div>
        <SidePanel c={c} data={data} />
      </div>
    </>
  );
}

function SidePanel({ c, data }) {
  const dv = derive(data, c), si = dv.spells;
  return (
    <aside class="card cc-side" id="ccSide" aria-label="Live numbers">
      <div class="cc-name">{c.name || 'Unnamed'}</div>
      <div class="muted small">Level {c.level} {c.species} {c.cls}{c.level >= 3 && c.sub ? ' · ' + c.sub : ''}</div>
      <div class="cc-stats"><div><b id="ccHp">{dv.hp}</b><span>HP</span></div><div><b id="ccAc">{dv.ac}</b><span>AC</span></div><div><b>{signed(dv.init)}</b><span>Init</span></div><div><b>{fmtSpeed(dv.speed)}</b><span>Speed</span></div><div><b>{signed(dv.p)}</b><span>Prof</span></div></div>
      <div class="cc-abs">{AB.map(a => <div key={a}><span>{a.toUpperCase()}</span><b>{dv.s[a]}</b><i>{signed(mod(dv.s[a]))}</i></div>)}</div>
      <div class="small"><b>Saves</b> {dv.saves.filter(x => x.p).map(x => x.a + ' ' + signed(x.v)).join(', ')} · <b>Passive Perception</b> {dv.pp}</div>
      <div class="muted small" style="margin-top:2px">AC: {dv.acHow}</div>
      <div class="cc-skills">{dv.skills.map(x => <div key={x.n}><span class={'cc-dot' + (x.p ? ' p' : '')} />{x.n} <span class="muted">{signed(x.v)}</span></div>)}</div>
      {si && <div class="small" style="margin-top:8px"><b>Spells</b> DC {si.dc} · {signed(si.atk)}<br />{slotsText(si)}</div>}
    </aside>
  );
}

/* ---------- 1. class ---------- */
function StepClass({ L, c, data }) {
  const cl = data.classes[c.cls];
  const bgSkills = BACKGROUNDS[c.bg].skills;
  const picked = c.skills.filter(s => !bgSkills.includes(s));
  const feats = features(data, c);
  const res = resources(data, c);
  return (
    <>
      <h2>Class and level</h2>
      <div class="cc-two">
        <div><label class="lbl">Who is this?</label><div class="row-actions"><button class={'btn' + (c.kind === 'pc' ? ' btn-primary' : '')} data-kind="pc" onClick={() => libSetKind('pc')}>Player character</button><button class={'btn' + (c.kind === 'npc' ? ' btn-primary' : '')} data-kind="npc" onClick={() => libSetKind('npc')}>NPC</button></div></div>
        <div><label class="lbl" for="ccName">Name</label><input id="ccName" placeholder="Character name" value={c.name} onInput={e => libSet(x => { x.name = e.currentTarget.value; })} /></div>
      </div>
      <label class="lbl cc-gap">Class (SRD)</label>
      <div class="cc-opts">{Object.keys(data.classes).sort().map(k => <button key={k} class={'cc-opt' + (c.cls === k ? ' on' : '')} data-class={k} onClick={() => libSetClass(k)}><b>{k}</b><span>d{data.classes[k].hd} · {data.classes[k].saves.join('/')}{data.classes[k].caster ? ' · caster' : ''}</span></button>)}</div>
      <label class="lbl cc-gap">Level (1–20)</label>
      <div class="cc-levels">{Array.from({ length: 20 }, (_, i) => i + 1).map(n => <button key={n} data-level={n} class={c.level === n ? 'on' : ''} onClick={() => libSetLevel(n)}>{n}</button>)}</div>
      {c.level >= 3 && Object.keys(cl.subs).length > 0 && (
        <><label class="lbl cc-gap" for="ccSub">Subclass (from level 3)</label>
          <select id="ccSub" value={c.sub} onChange={e => libSet(x => { x.sub = e.currentTarget.value; })}>{Object.keys(cl.subs).map(s => <option key={s} value={s}>{s}</option>)}</select></>
      )}
      {c.level < 3 && <div class="muted small cc-gap">The subclass is chosen at level 3.</div>}
      <label class="lbl cc-gap">Class skills: choose {cl.skillN}</label>
      <div class="cc-chips">{cl.skills.map(sk => { const fromBg = bgSkills.includes(sk); return <button key={sk} data-skill={sk} class={'cc-chip' + (c.skills.includes(sk) ? ' on' : '')} disabled={fromBg} title={fromBg ? 'Already from your background' : ''} onClick={() => libSet(x => { if (x.skills.includes(sk)) x.skills = x.skills.filter(y => y !== sk); else if (x.skills.filter(y => !bgSkills.includes(y)).length < cl.skillN) x.skills = [...x.skills, sk]; else toast('You already chose ' + cl.skillN + '. Untick one first.'); })}>{sk}</button>; })}</div>
      <div class={'small ' + (picked.length === cl.skillN ? 'cc-good' : 'muted')} id="ccSkillCount">{picked.length} of {cl.skillN} chosen</div>
      <label class="lbl cc-gap">Features up to level {c.level}</label>
      {res.length > 0 && <div class="small muted" style="margin-bottom:4px">At this level: {res.map(r => r[0] + ' ' + r[1]).join(' · ')}</div>}
      {feats.map((f, i) => <details class="cc-feat" key={i}><summary><b>{f.name}</b> <span class="muted mono small">{f.from} {f.lvl}</span></summary><Md text={f.desc} /></details>)}
      <div class="cc-note">Hit points use the fixed average for each level. HP, proficiency, saves and spell slots update on the right as you change the level.</div>
    </>
  );
}

/* ---------- 2. origin ---------- */
function StepOrigin({ L, c, data }) {
  const bg = BACKGROUNDS[c.bg];
  const sp = data.species[c.species];
  const traits = speciesTraits(data, c);
  const choice = traits.find(t => /Lineage|Ancestry|Legacy/.test(t.name));
  return (
    <>
      <h2>Origin</h2>
      <label class="lbl">Species (SRD)</label>
      <div class="cc-opts">{Object.keys(data.species).sort().map(k => <button key={k} class={'cc-opt' + (c.species === k ? ' on' : '')} data-species={k} onClick={() => libSet(x => { x.species = k; x.speciesNote = ''; })}><b>{k}</b><span>{data.species[k].traits.slice(0, 3).map(t => t[0]).join(', ')}</span></button>)}</div>
      {sp && <div class="cc-box"><div class="small muted">{sp.size} · Speed {fmtSpeed(Math.round((parseInt(sp.speed, 10) || 30) * 0.3 * 10) / 10)}</div>
        {traits.map((t, i) => <details class="cc-feat" key={i}><summary><b>{t.name}</b> <span class="muted small">{firstLine(t.desc).slice(0, 110)}</span></summary><Md text={t.desc} /></details>)}
        {choice && <div class="cc-gap"><label class="lbl" for="ccSpNote">Your {choice.name.toLowerCase()} choice</label><input id="ccSpNote" placeholder="e.g. High Elf, Gold dragon, Hill Giant…" value={c.speciesNote} onInput={e => libSet(x => { x.speciesNote = e.currentTarget.value; })} /></div>}
        {c.species === 'Human' && (
          <div class="cc-two cc-gap">
            <div><label class="lbl" for="ccHumanSkill">Skillful: one extra skill</label><select id="ccHumanSkill" value={c.extraSkill} onChange={e => libSet(x => { x.extraSkill = e.currentTarget.value; })}><option value="">None yet</option>{SKILL_LIST.map(s => <option key={s} value={s}>{s}</option>)}</select></div>
            <div><label class="lbl" for="ccHumanFeat">Versatile: an extra Origin feat</label><select id="ccHumanFeat" value={c.extraFeat} onChange={e => libSet(x => { x.extraFeat = e.currentTarget.value; })}><option value="">None yet</option>{originFeatChoices(data).map(s => <option key={s} value={s}>{s}</option>)}</select></div>
          </div>
        )}
      </div>}
      <label class="lbl cc-gap">Background (SRD)</label>
      <div class="cc-opts">{Object.keys(BACKGROUNDS).map(k => <button key={k} class={'cc-opt' + (c.bg === k ? ' on' : '')} data-bg={k} onClick={() => libSet(x => { x.bg = k; x.bgA = BACKGROUNDS[k].ab[0]; x.bgB = BACKGROUNDS[k].ab[1]; x.skills = x.skills.filter(s => !BACKGROUNDS[k].skills.includes(s)); })}><b>{k}</b><span>{BACKGROUNDS[k].skills.join(', ')}</span></button>)}</div>
      <div class="cc-box">
        <b>{c.bg} gives you</b>
        <div class="small">Skills: {bg.skills.join(', ')} · Tool: {bg.tool} · Origin feat: <b>{bg.feat}</b></div>
        <label class="lbl cc-gap">Ability score bonus (from {bg.ab.join(', ')})</label>
        <div class="row-actions" style="align-items:center">
          <button class={'btn btn-sm' + (c.bgMode === '21' ? ' btn-primary' : '')} data-bgmode="21" onClick={() => libSet(x => { x.bgMode = '21'; })}>+2 and +1</button>
          <button class={'btn btn-sm' + (c.bgMode === '111' ? ' btn-primary' : '')} data-bgmode="111" onClick={() => libSet(x => { x.bgMode = '111'; })}>+1, +1, +1</button>
          {c.bgMode === '21' ? <>
            <span>+2 to</span><select id="ccBgA" style="width:auto" value={c.bgA} onChange={e => libSet(x => { x.bgA = e.currentTarget.value; })}>{bg.ab.map(a => <option key={a} value={a}>{a}</option>)}</select>
            <span>+1 to</span><select id="ccBgB" style="width:auto" value={c.bgB} onChange={e => libSet(x => { x.bgB = e.currentTarget.value; })}>{bg.ab.map(a => <option key={a} value={a}>{a}</option>)}</select>
          </> : <span class="muted small">one point to each of {bg.ab.join(', ')}</span>}
        </div>
        {c.bgMode === '21' && c.bgA === c.bgB && <div class="small cc-bad">Pick two different abilities.</div>}
      </div>
      <div class="cc-note">Species traits are from the SRD. The four backgrounds are written out here from the 2024 rules summary, so check them against your book.</div>
    </>
  );
}

/* ---------- 3. abilities ---------- */
const METHODS = [['std', 'Standard array'], ['buy', 'Point buy'], ['roll', 'Roll 4d6, drop the lowest'], ['man', 'Manual']];
function StepAbilities({ L, c, data }) {
  const bon = bonuses(c), fin = scores(c);
  const problem = c.method === 'std' ? standardArrayProblem(c.base) : '';
  const left = pointsLeft(c.base);
  const owed = pendingAsi(data, c);
  return (
    <>
      <h2>Ability scores</h2>
      {owed.length > 0 && <div class="cc-note" id="ccAsiNote">At level {c.level} this class has {owed.length} ability score improvement{owed.length === 1 ? '' : 's'} (level {owed.map(x => x.lvl).join(', ')}). Choose {owed.length === 1 ? 'it' : 'them'} with <b>Level up</b> after you save: it asks for exactly that.</div>}
      <div class="row-actions">{METHODS.map(([k, label]) => <button key={k} data-method={k} class={'btn' + (c.method === k ? ' btn-primary' : '')} onClick={() => libSetMethod(k)}>{label}</button>)}</div>
      <table class="cc-table cc-abl">
        {AB.map((a, i) => (
          <tr key={a}>
            <td>{ABN[a]}</td>
            <td>
              {c.method === 'std' && <select data-ab={a} style="width:84px" value={c.base[a]} onChange={e => libSet(x => { x.base[a] = Number(e.currentTarget.value); })}>{STANDARD_ARRAY.slice().sort((p, q) => q - p).map(v => <option key={v} value={v}>{v}</option>)}</select>}
              {c.method === 'buy' && <span class="row-actions" style="align-items:center;gap:6px"><button class="btn btn-sm" data-pb={a + '-'} onClick={() => libSet(x => { const v = x.base[a] - 1; if (v >= 8) x.base[a] = v; })}>−</button><b class="mono" style="min-width:26px;text-align:center">{c.base[a]}</b><button class="btn btn-sm" data-pb={a + '+'} onClick={() => libSet(x => { const v = x.base[a] + 1; if (v > 15) return; if (pointsLeft(x.base) - (POINT_COST[v] - POINT_COST[x.base[a]]) < 0) { toast('Not enough points left.'); return; } x.base[a] = v; })}>＋</button><span class="muted small">cost {POINT_COST[c.base[a]]}</span></span>}
              {c.method === 'roll' && c.rolled && <span class="row-actions" style="align-items:center;gap:8px"><b class="mono" style="min-width:26px">{c.base[a]}</b><span class="muted small mono">{c.rolled[i].dice.map((d, k) => k === c.rolled[i].drop ? <s key={k}>{d} </s> : <span key={k}>{d} </span>)}</span>{i < 5 && <button class="btn btn-sm btn-ghost" title="Swap with the one below" onClick={() => libSet(x => { const b = AB[i + 1]; [x.base[a], x.base[b]] = [x.base[b], x.base[a]]; [x.rolled[i], x.rolled[i + 1]] = [x.rolled[i + 1], x.rolled[i]]; })}>⇅</button>}</span>}
              {c.method === 'man' && <input type="number" data-ab={a} min="3" max="20" style="width:84px" value={c.base[a]} onChange={e => libSet(x => { x.base[a] = Math.max(1, Math.min(30, Number(e.currentTarget.value) || 8)); })} />}
            </td>
          </tr>
        ))}
      </table>
      {c.method === 'buy' && <div class={'small ' + (left < 0 ? 'cc-bad' : 'cc-good')} id="ccPoints"><b>{left}</b> of 27 points left</div>}
      {c.method === 'roll' && <div class="row-actions cc-gap"><button class="btn btn-sm" id="ccReroll" onClick={() => libSet(x => { x.rolled = rollScores(); AB.forEach((a, i) => { x.base[a] = x.rolled[i].total; }); })}>🎲 Roll again</button></div>}
      {c.method === 'std' && <div class="row-actions cc-gap"><button class="btn btn-sm" id="ccSuggest" onClick={() => libSet(x => { x.base = suggestScores(data, x.cls); })}>Suggest for a {c.cls}</button></div>}
      {problem && <div class="small cc-bad">{problem}</div>}
      <label class="lbl cc-gap">With your {c.bg} bonus</label>
      <div class="cc-abs wide">{AB.map(a => <div key={a}><span>{a.toUpperCase()}</span><b>{fin[a]}</b><i>{signed(mod(fin[a]))}{bon[a] ? ' · +' + bon[a] + ' bg' : ''}</i></div>)}</div>
      <div class="cc-note">Primary ability for a {c.cls}: {data.classes[c.cls].primary}. Scores are capped at 20.</div>
    </>
  );
}

/* ---------- 4. spells ---------- */
function StepSpells({ L, c, data }) {
  const si = spellInfo(data, c);
  if (!si) return <p>This class does not cast spells.</p>;
  if (!L.spells) return <><h2>Spells</h2><p class="muted">Loading the SRD spells…</p></>;
  const mine = L.spells.filter(s => s.cl.includes(c.cls) && s.lv <= si.maxLvl);
  const shown = searchSpells(mine, { q: L.spellQ, level: L.spellLv });
  const levels = [...new Set(mine.map(s => s.lv))].sort((a, b) => a - b);
  const toggle = sp => libSet(x => {
    const list = sp.lv === 0 ? x.cantrips : x.prepared, cap = sp.lv === 0 ? si.cantrips : si.prepared;
    if (list.includes(sp.n)) { const i = list.indexOf(sp.n); list.splice(i, 1); } else if (list.length < cap) list.push(sp.n); else toast('That is the limit (' + cap + '). Untick one first.');
  });
  return (
    <>
      <h2>Spells</h2>
      <div class="cc-two">
        <div class="cc-box" style="margin:0"><b>{c.cls}</b> casts with <b>{si.ab}</b><div class="small">Spell save DC <b>{si.dc}</b> · Spell attack <b>{signed(si.atk)}</b></div></div>
        <div class="cc-box" style="margin:0"><b>Spell slots at level {c.level}</b><div class="small">{slotsText(si)}</div></div>
      </div>
      <div class="row-actions cc-gap" style="align-items:center">
        {si.cantrips > 0 && <span id="ccCantrips" class={c.cantrips.length === si.cantrips ? 'cc-good' : 'muted'}>Cantrips {c.cantrips.length}/{si.cantrips}</span>}
        <span id="ccPrepared" class={c.prepared.length === si.prepared ? 'cc-good' : 'muted'}>{c.cls === 'Wizard' ? 'Prepared (from your spellbook)' : 'Prepared'} {c.prepared.length}/{si.prepared}</span>
        <span style="flex:1" />
        <input id="ccSpellQ" style="width:170px" placeholder="Search spells" value={L.spellQ} onInput={e => { L.spellQ = e.currentTarget.value; emit(); }} />
        <select id="ccSpellLv" style="width:auto" value={L.spellLv} onChange={e => { L.spellLv = e.currentTarget.value; emit(); }}><option value="">All levels</option>{levels.map(l => <option key={l} value={l}>{l === 0 ? 'Cantrips' : 'Level ' + l}</option>)}</select>
      </div>
      <div class="cc-spells">{shown.map(sp => { const on = (sp.lv === 0 ? c.cantrips : c.prepared).includes(sp.n); return (
        <label key={sp.n} class={'cc-spell' + (on ? ' on' : '')} data-spell={sp.n}><input type="checkbox" checked={on} onChange={() => toggle(sp)} /><span class="cc-lvl">{sp.lv === 0 ? 'C' : 'L' + sp.lv}</span><b>{sp.n}</b><span class="muted small">{sp.sc}{sp.cn ? ' · conc.' : ''}</span></label>
      ); })}{!shown.length && <div class="muted">No spells match.</div>}</div>
      <div class="cc-note">{mine.length} SRD spells for this class and the slot levels you have. Each pick becomes a link, so it opens as a spell card in a campaign.</div>
    </>
  );
}

/* ---------- 5. equipment ---------- */
function StepEquip({ L, c, data }) {
  const cl = data.classes[c.cls];
  const dv = derive(data, c);
  const [gearText, setGearText] = useState('');
  const addGear = () => { const t = gearText.trim(); if (!t) return; libSet(x => { x.gear = [...x.gear, t]; }); setGearText(''); };
  const names = [...data.armor.map(a => a.n), ...data.weapons.map(w => w.n)];
  return (
    <>
      <h2>Equipment</h2>
      <div class="cc-opts cc-kits">{cl.kits.map(k => <button key={k.id} class={'cc-opt' + (c.kit === k.id ? ' on' : '')} data-kit={k.id} onClick={() => libSet(x => { x.kit = k.id; })}><b>Option {k.id}{k.items.length ? ': ' + c.cls + ' starting kit' : ': take the gold'}</b><span>{k.items.length ? k.items.join(', ') + ', ' + k.gp + ' GP' : k.gp + ' GP to spend on your own gear'}</span></button>)}</div>
      <div class="row-actions cc-gap" style="align-items:baseline"><span class="muted">Armor Class with this choice:</span><b style="font-size:20px" id="ccAcEquip">{dv.ac}</b><span class="muted small">{dv.acHow}</span></div>
      <label class="lbl cc-gap" for="ccGear">Add more gear</label>
      <div class="row-actions"><input id="ccGear" list="ccGearList" style="flex:1 1 240px;width:auto" placeholder="Longsword, Plate Armor, a coil of rope…" value={gearText} onInput={e => setGearText(e.currentTarget.value)} onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addGear(); } }} /><datalist id="ccGearList">{names.map(n => <option key={n} value={n} />)}</datalist><button class="btn" id="ccGearAdd" onClick={addGear}>＋ Add</button></div>
      {c.gear.length > 0 && <div class="cc-chips cc-gap">{c.gear.map((g, i) => <span class="cc-chip on" key={i}>{g} <button class="cc-x" aria-label={'Remove ' + g} onClick={() => libSet(x => { x.gear = x.gear.filter((_, j) => j !== i); })}>×</button></span>)}</div>}
      <CarryBox L={L} c={c} />
      <div class="cc-note">Weapons and armour from the SRD, or anything you type. Armour you add changes the Armor Class above. Magic items come from your Items library; ones that give an Armor Class bonus count once the character is attuned.</div>
    </>
  );
}

/* ---------- 6. details ---------- */
function StepDetails({ L, c, data }) {
  const dep = (() => { const ids = secFor(c.kind).filter(x => c.sections.includes(x.id)).map(x => x.id).join(); for (const [k, v] of Object.entries(DEPTH)) if (secFor(c.kind).filter(x => v.includes(x.id)).map(x => x.id).join() === ids) return k; return 'custom'; })();
  const shown = secFor(c.kind).filter(x => c.sections.includes(x.id));
  const avail = secFor(c.kind).filter(x => !c.sections.includes(x.id));
  const [cname, setCname] = useState('');
  const setPreset = k => libSet(x => { x.sections = secFor(x.kind).filter(s => DEPTH[k].includes(s.id)).map(s => s.id); L.depthMore = k === 'deep' ? Object.fromEntries(DSEC.map(s => [s.id, true])) : {}; });
  const val = k => c.d[k] || '';
  const setVal = (k, v) => libSet(x => { x.d[k] = v; });
  const field = f => {
    const label = <label class="lbl" for={'cd-' + f.k}>{f.l}{f.roll && <> <a href="#" class="cc-suggest" data-suggest={f.k} onClick={e => { e.preventDefault(); const arr = PROMPTS[f.k]; setVal(f.k, arr[Math.floor(Math.random() * arr.length)]); }}>🎲 suggest</a></>}</label>;
    if (f.type === 'align') return <div key={f.k}>{label}<select id={'cd-' + f.k} value={val(f.k)} onChange={e => setVal(f.k, e.currentTarget.value)}>{ALIGNMENTS.map(a => <option key={a} value={a}>{a}</option>)}</select></div>;
    if (f.type === 'area') return <div key={f.k} class="cc-full">{label}<textarea id={'cd-' + f.k} data-detail={f.k} placeholder={f.ph || ''} style={'min-height:' + (f.tall ? 130 : 56) + 'px'} value={val(f.k)} onInput={e => setVal(f.k, e.currentTarget.value)} /></div>;
    return <div key={f.k}>{label}<input id={'cd-' + f.k} data-detail={f.k} placeholder={f.ph || ''} value={val(f.k)} onInput={e => setVal(f.k, e.currentTarget.value)} /></div>;
  };
  return (
    <>
      <h2>Details</h2>
      <div class="muted small">Go as deep as suits you. A quick NPC can stop at the basics; a main character can have a full life story. Empty sections are never written to the file.</div>
      <label class="lbl cc-gap">How much detail?</label>
      <div class="cc-opts cc-depth">{[['quick', 'Quick', 'just the basics'], ['std', 'Standard', '+ appearance, personality'], ['deep', 'Deep', 'everything']].map(([k, t, sub]) => <button key={k} data-depth={k} class={'cc-opt' + (dep === k ? ' on' : '')} onClick={() => setPreset(k)}><b>{t}</b><span>{sub}</span></button>)}{dep === 'custom' && <span class="pill">Custom mix</span>}</div>
      {shown.map(sec => {
        const fs = fieldsFor(c.kind, sec), all = fs.filter(f => f.k !== 'align');
        const done = all.filter(f => String(c.d[f.k] || '').trim()).length;
        const more = !!L.depthMore[sec.id], vis = fs.filter(f => f.lv === 1 || more), hidden = fs.length - fs.filter(f => f.lv === 1).length;
        const col = !!L.collapsed[sec.id];
        return (
          <div class="card cc-sec" key={sec.id} data-section={sec.id}>
            <div class="cc-sec-head" onClick={() => { L.collapsed[sec.id] = !col; emit(); }}>
              <b>{col ? '▸' : '▾'} {sec.t}</b><span class="muted small">{sec.h}</span><span style="flex:1" />
              {all.length > 0 && <span class={'pill' + (done ? ' pill-good' : '')}>{done}/{all.length} filled</span>}
              {sec.id !== 'basics' && <button class="btn btn-sm btn-ghost" aria-label={'Remove ' + sec.t} data-remove={sec.id} onClick={e => { e.stopPropagation(); libSet(x => { x.sections = x.sections.filter(i => i !== sec.id); }); }}>×</button>}
            </div>
            {!col && <div class="cc-sec-body"><div class="cc-two">{vis.map(field)}</div>
              {hidden > 0 && <button class="btn btn-sm btn-ghost" data-more={sec.id} style="margin-top:8px" onClick={() => { L.depthMore[sec.id] = !more; emit(); }}>{more ? '− Show fewer fields' : '＋ Show ' + hidden + ' more field' + (hidden > 1 ? 's' : '')}</button>}</div>}
          </div>
        );
      })}
      {(c.custom || []).map((cu, i) => (
        <div class="card cc-sec" key={'cu' + i} data-custom={cu.title}>
          <div class="cc-sec-head"><b>{cu.title}</b><span class="pill">your own section</span><span style="flex:1" /><button class="btn btn-sm btn-ghost" aria-label={'Remove ' + cu.title} onClick={() => libSet(x => { x.custom = x.custom.filter((_, j) => j !== i); })}>×</button></div>
          <div class="cc-sec-body"><textarea placeholder="Anything you like. It is saved under this heading." value={cu.text} onInput={e => libSet(x => { x.custom[i].text = e.currentTarget.value; })} /></div>
        </div>
      ))}
      <label class="lbl cc-gap">Add a section</label>
      <div class="row-actions" style="align-items:center">
        {avail.map(sec => <button key={sec.id} class="btn btn-sm btn-ghost cc-add" data-add={sec.id} onClick={() => libSet(x => { x.sections = [...x.sections, sec.id]; })}>＋ {sec.t}</button>)}
        {!avail.length && <span class="muted small">All sections are on.</span>}
        <span style="flex:1" />
        <input id="ccCustomName" style="width:210px" placeholder="Your own heading, e.g. Pets" value={cname} onInput={e => setCname(e.currentTarget.value)} />
        <button class="btn btn-sm" id="ccCustomAdd" onClick={() => {
          const t = cname.replace(/\s+/g, ' ').replace(/[#\[\]]/g, '').trim();
          if (!t) { toast('Type a heading first.', true); return; }
          if (RESERVED_HEADINGS.includes(t) || c.custom.some(x => x.title === t)) { toast('There is already a section called “' + t + '”.', true); return; }
          libSet(x => { x.custom = [...x.custom, { title: t, text: '' }]; }); setCname('');
        }}>＋ Add</button>
      </div>
      <div class="cc-note">Backstory and relationship text can link to notes in your vault, like [[Old Haldor]]. Images are left out on purpose: markdown files only.</div>
    </>
  );
}

/* ---------- 7. review ---------- */
function StepReview({ L, c, data }) {
  const text = characterMarkdown(data, c);
  const problems = [];
  const cl = data.classes[c.cls];
  const picked = c.skills.filter(s => !BACKGROUNDS[c.bg].skills.includes(s)).length;
  if (!c.name.trim()) problems.push('Give the character a name (step 1).');
  if (picked < cl.skillN) problems.push('Choose ' + (cl.skillN - picked) + ' more class skill' + (cl.skillN - picked === 1 ? '' : 's') + ' (step 1).');
  if (c.method === 'std' && standardArrayProblem(c.base)) problems.push(standardArrayProblem(c.base));
  if (c.method === 'buy' && pointsLeft(c.base) < 0) problems.push('Point buy is over budget (step 3).');
  const si = spellInfo(data, c);
  if (si && c.cantrips.length < si.cantrips) problems.push('You can still pick ' + (si.cantrips - c.cantrips.length) + ' cantrip' + (si.cantrips - c.cantrips.length === 1 ? '' : 's') + ' (step 4).');
  if (si && c.prepared.length < si.prepared) problems.push('You can still pick ' + (si.prepared - c.prepared.length) + ' prepared spell' + (si.prepared - c.prepared.length === 1 ? '' : 's') + ' (step 4).');
  return (
    <>
      <h2>Review</h2>
      {problems.length > 0 && <div class="cc-note" id="ccProblems"><b>Still to do, if you like:</b><ul style="margin:4px 0 0 18px;padding:0">{problems.map(p => <li key={p}>{p}</li>)}</ul>You can save anyway and come back to it.</div>}
      <div class="cc-tabs"><button class={L.sheet === 'sheet' ? 'on' : ''} onClick={() => { L.sheet = 'sheet'; emit(); }}>Sheet</button><button class={L.sheet === 'file' ? 'on' : ''} id="ccFileTab" onClick={() => { L.sheet = 'file'; emit(); }}>The markdown file</button></div>
      {L.sheet === 'file' ? <><div class="muted small" style="margin-bottom:6px">This is what is written to <span class="mono">Character Library/Characters/{c.name || 'Name'}.md</span>:</div><pre class="cc-file" id="ccFile">{text}</pre></> : <Sheet c={c} data={data} />}
      <div class="row-actions cc-gap"><button class="btn" onClick={() => window.print()}>Print the sheet</button></div>
    </>
  );
}
