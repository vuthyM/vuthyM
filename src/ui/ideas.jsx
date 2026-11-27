/* The Workshop: a shelf of ideas, and one big page per idea. See core/ideas.js for how an idea is stored and ideasactions.js for saving. */
import { useEffect, useLayoutEffect, useRef, useState } from 'preact/hooks';
import { S, useApp } from './store.js';
import { Icon } from './icons.jsx';
import { PopMenu } from './popmenu.jsx';
import { Dialogs } from './dialogs.jsx';
import { SECTIONS, STATUSES, statusOf, filterShelf } from '../core/ideas.js';
import { SPARKS, promptFor, readiness } from '../core/ideaspark.js';
import {
  closeWorkshop, ideasSet, createIdea, openIdea, backToShelf, toggleSection, setField, setSecText, setRowField, setExtra, addRow, removeRow, moveRow, removeExtra,
  setStatus, setTags, saveNow, resolveIdeaConflict, askDeleteIdea, duplicateIdea, onIdeaStatus, rollInto, appendText, useReadyStatus,
} from './ideasactions.js';

const agoText = ms => {
  const s = Math.max(0, Math.round((Date.now() - ms) / 1000));
  return s < 8 ? 'just now' : s < 60 ? s + ' seconds ago' : s < 3600 ? Math.round(s / 60) + ' min ago' : Math.round(s / 3600) + ' h ago';
};

/* re-draws the part that uses it half a second after typing pauses (the checklist and the outline follow what you write, without redrawing the whole page per key) */
function useLive() {
  const [, tick] = useState(0);
  useEffect(() => {
    let t;
    const off = onIdeaStatus(() => { clearTimeout(t); t = setTimeout(() => tick(x => x + 1), 500); });
    return () => { off(); clearTimeout(t); };
  }, []);
}

/* a text box that grows with what is typed in it */
function Auto({ value, onInput, placeholder, id, rows = 3, class: cls = '', label }) {
  const ref = useRef();
  const fit = () => { const t = ref.current; if (t) { t.style.height = 'auto'; t.style.height = Math.min(t.scrollHeight + 2, 900) + 'px'; } };
  useLayoutEffect(fit, [value]);
  return <textarea ref={ref} id={id} class={'idea-ta ' + cls} rows={rows} value={value} placeholder={placeholder} aria-label={label} onInput={e => { onInput(e.currentTarget.value); fit(); }} />;
}

/* ================================================================ the screen */
export function IdeasScreen() {
  const s = useApp();
  const I = s.ideas;
  if (!I) return null;
  return <div class="ideas" id="ideas">{I.view === 'page' && I.model ? <IdeaPage I={I} /> : <Shelf I={I} />}<Dialogs /></div>;
}

/* ================================================================ the shelf */
function Shelf({ I }) {
  const [name, setName] = useState('');
  const list = I.list ? filterShelf(I.list, I.q, I.status) : null;
  const total = I.list ? I.list.length : 0;
  const nameRef = useRef();
  useEffect(() => { if (I.naming && nameRef.current) nameRef.current.focus(); }, [I.naming]);
  const make = () => { createIdea(name); setName(''); };
  return (
    <div class="ideas-wrap">
      <div class="ideas-top">
        <button class="btn btn-sm" id="ideasBack" onClick={closeWorkshop}>← {I.back === 'app' && S.campaign ? 'Back to ' + S.campaign.name : 'Back to campaigns'}</button>
        <span class="spacer" style="flex:1" />
        <span class="muted small mono">{S.vault.name} / Ideas</span>
      </div>
      <div class="ideas-head">
        <div>
          <h2 aria-level="1">Workshop</h2>
          <div class="muted small">A place for one-shots and campaign ideas, apart from any campaign. Write it all on one page; it saves by itself.</div>
        </div>
        <button class="btn btn-primary" id="ideaNew" onClick={() => ideasSet({ naming: !I.naming })}>+ New idea</button>
      </div>
      {I.naming && (
        <form class="idea-naming" id="ideaNaming" onSubmit={e => { e.preventDefault(); make(); }}>
          <input ref={nameRef} id="ideaNameInput" type="text" aria-label="Name of the idea" placeholder="Name it (you can change it any time): The Drowned Bell" value={name} onInput={e => setName(e.currentTarget.value)} onKeyDown={e => { if (e.key === 'Escape') ideasSet({ naming: false }); }} />
          <button class="btn btn-primary" id="ideaCreate" type="submit" disabled={!name.trim()}>Start writing</button>
          <button class="btn btn-ghost" type="button" onClick={() => ideasSet({ naming: false })}>Cancel</button>
        </form>
      )}
      {total > 0 && (
        <div class="idea-filter">
          <input id="ideaSearch" type="search" aria-label="Search ideas" placeholder="Search ideas" value={I.q} onInput={e => ideasSet({ q: e.currentTarget.value })} />
          <div class="idea-chips" role="group" aria-label="Show">
            <button class={"chip-btn" + (!I.status ? " on" : "")} onClick={() => ideasSet({ status: '' })}>All</button>
            {STATUSES.map(st => <button key={st.id} class={'chip-btn' + (I.status === st.id ? ' on' : '')} data-status={st.id} onClick={() => ideasSet({ status: I.status === st.id ? '' : st.id })}>{st.label}</button>)}
          </div>
        </div>
      )}
      {I.err && <div class="idea-warn" role="alert">{I.err}</div>}
      {list === null && <div class="muted" id="ideasLoading">Reading your ideas…</div>}
      {list && !total && !I.naming && (
        <div class="idea-empty" id="ideasEmpty">
          <h3>Nothing here yet</h3>
          <p>Each idea gets one big page: the premise, the hook, the cast, places, scenes, twists, endings and more, all in one place. Start with a single line if that is all you have; it can grow from there.</p>
          <button class="btn btn-primary" id="ideaNewEmpty" onClick={() => ideasSet({ naming: true })}>+ Start your first idea</button>
        </div>
      )}
      {list && total > 0 && !list.length && <div class="muted" id="ideasNone">No idea matches that.</div>}
      {list && list.length > 0 && (
        <div class="idea-grid" id="ideaGrid">
          {list.map((c, ci) => (
            <div key={c.path} class="idea-card" data-path={c.path}>
              <button class="idea-card-main" onClick={() => openIdea(c.path)} aria-label={'Open ' + c.title}>
                <div class="idea-card-top">
                  <span class={'idea-status st-' + c.status}>{statusOf(c.status).label}</span>
                  {I.drafts && I.drafts.has(c.path) && <span class="idea-unsaved" title="Changes on this device that have not reached the server yet">Not saved to the server</span>}
                </div>
                <div class="idea-card-title">{c.title}</div>
                <div class="idea-card-pitch">{c.pitch || <span class="muted">No pitch yet</span>}</div>
                <div class="idea-card-meta muted small">
                  {[c.tone, c.length, c.players ? c.players + ' players' : '', c.level ? 'level ' + c.level : ''].filter(Boolean).join(' · ') || ' '}
                </div>
                <div class="idea-card-counts small">
                  {c.cast} NPC{c.cast === 1 ? '' : 's'} · {c.places} place{c.places === 1 ? '' : 's'} · {c.scenes} scene{c.scenes === 1 ? '' : 's'} · {c.endings} ending{c.endings === 1 ? '' : 's'}
                </div>
                {c.tags.length > 0 && <div class="idea-card-tags">{c.tags.map(t => <span key={t} class="idea-tag">{t}</span>)}</div>}
              </button>
              <PopMenu id={'ideaMenu' + ci} title="More for this idea" btnClass="tb-icon idea-card-more">
                {({ close }) => <>
                  <button class="pop-item" role="menuitem" onClick={() => { close(); openIdea(c.path); }}>Open</button>
                  <button class="pop-item" role="menuitem" data-act="copy" onClick={() => { close(); duplicateIdea(c.path); }}>Make a copy</button>
                  <button class="pop-item danger" role="menuitem" data-act="delete" onClick={() => { close(); askDeleteIdea(c.path, c.title); }}>Delete…</button>
                </>}
              </PopMenu>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ================================================================ the page */
function SaveChip() {
  const [, tick] = useState(0);
  useEffect(() => onIdeaStatus(() => tick(x => x + 1)), []);
  useEffect(() => { const t = setInterval(() => tick(x => x + 1), 10000); return () => clearInterval(t); }, []);
  const I = S.ideas;
  if (!I) return null;
  const st = I.saveState;
  const secs = [15, 30, 60].includes(S.settings.ideasSaveSecs) ? S.settings.ideasSaveSecs : 30;
  const text = st === 'saving' ? 'Saving…'
    : st === 'dirty' ? 'Saves by itself every ' + secs + ' seconds'
    : st === 'offline' ? 'Offline: kept on this device, saves when the server is back'
    : st === 'conflict' ? 'Changed somewhere else: choose below'
    : st === 'error' ? 'Could not save: ' + (I.err || 'try again')
    : I.savedAt ? 'Saved ' + agoText(I.savedAt) : 'Saved';
  return (
    <span class={'idea-save st-' + st} id="ideaSaveState" role="status" aria-live="polite">
      <span class="idea-save-dot" aria-hidden="true" />{text}
      {(st === 'dirty' || st === 'offline' || st === 'error') && <button class="linkish" id="ideaSaveNow" onClick={saveNow}>Save now</button>}
    </span>
  );
}

function Conflict({ I }) {
  if (!I.conflict) return null;
  return (
    <div class="idea-warn" id="ideaConflict" role="alert">
      <b>{I.msg || 'This idea was changed somewhere else.'}</b> Nothing has been overwritten. What would you like to keep?
      <div class="row-actions" style="margin-top:8px;gap:8px">
        <button class="btn btn-sm" id="ideaKeepBoth" onClick={() => resolveIdeaConflict('both')}>Keep both</button>
        <button class="btn btn-sm" id="ideaKeepTheirs" onClick={() => resolveIdeaConflict('theirs')}>Use the other version</button>
        <button class="btn btn-sm btn-primary" id="ideaKeepMine" onClick={() => resolveIdeaConflict('mine')}>Keep mine</button>
      </div>
      <div class="muted small" style="margin-top:6px">“Keep both” saves yours as “… (my copy)” and opens the other version.</div>
    </div>
  );
}

function Outline({ I, defs }) {
  useLive();
  const m = I.model;
  const count = def => (def.kind === 'rows' ? m.sec[def.id].filter(r => Object.entries(r).some(([k, v]) => k !== '_id' && String(v).trim())).length : String(m.sec[def.id] || '').trim() ? 1 : 0);
  const jump = id => { const el = document.getElementById('sec-' + id); if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' }); };
  return (
    <nav class="idea-outline" aria-label="Sections">
      {defs.map(d => (
        <button key={d.id} class={'idea-out-item' + (count(d) ? ' has' : '')} data-jump={d.id} onClick={() => jump(d.id)}>
          <span class="idea-out-dot" aria-hidden="true" />{d.title}{d.kind === 'rows' && count(d) > 0 && <span class="idea-out-n">{count(d)}</span>}
        </button>
      ))}
      {m.extras.map(e => <button key={e._id} class="idea-out-item has" onClick={() => jump('x' + e._id)}><span class="idea-out-dot" aria-hidden="true" />{e.title}</button>)}
      {!I.showOptional && !count(SECTIONS.find(s => s.optional)) && <button class="idea-out-item add" id="ideaShowMaps" onClick={() => ideasSet({ showOptional: true })}>+ Maps</button>}
    </nav>
  );
}

function IdeaPage({ I }) {
  const m = I.model;
  const count = def => (def.kind === 'rows' ? m.sec[def.id].filter(r => Object.entries(r).some(([k, v]) => k !== '_id' && String(v).trim())).length : String(m.sec[def.id] || '').trim() ? 1 : 0);
  const jump = id => { const el = document.getElementById('sec-' + id); if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' }); };
  const defs = SECTIONS.filter(d => !d.optional || count(d) || I.showOptional);
  return (
    <div class="ideas-wrap idea-page-wrap">
      <div class="ideas-top idea-top">
        <button class="btn btn-sm" id="ideaToShelf" onClick={backToShelf}>← Workshop</button>
        <SaveChip />
        <span class="spacer" style="flex:1" />
        <PopMenu id="ideaMenuPage" title="More for this idea" btnClass="tb-icon">
          {({ close }) => <>
            <button class="pop-item" role="menuitem" id="ideaDup" onClick={() => { close(); duplicateIdea(I.path); }}>Make a copy</button>
            <button class="pop-item danger" role="menuitem" id="ideaDel" onClick={() => { close(); askDeleteIdea(I.path, m.title); }}>Delete…</button>
          </>}
        </PopMenu>
      </div>
      <Conflict I={I} />
      {I.msg && !I.conflict && <div class="idea-note" id="ideaMsg" role="status">{I.msg}</div>}
      <div class="idea-layout">
        <Outline I={I} defs={defs} />
        <div class="idea-main">
          <header class="idea-header">
            <input id="ideaTitle" class="idea-title" type="text" aria-label="Title" placeholder="Untitled idea" value={m.title} onInput={e => setField('title', e.currentTarget.value)} />
            <input id="ideaPitch" class="idea-pitch" type="text" aria-label="One-line pitch" placeholder="The pitch: one line that would make you want to play it" value={m.pitch} onInput={e => setField('pitch', e.currentTarget.value)} />
            <div class="idea-meta">
              <label>Status
                <select id="ideaStatus" value={m.status} onChange={e => setStatus(e.currentTarget.value)}>{STATUSES.map(st => <option key={st.id} value={st.id}>{st.label}</option>)}</select>
              </label>
              <label>Tone<input id="ideaTone" type="text" placeholder="Gothic comedy" value={m.tone} onInput={e => setField('tone', e.currentTarget.value)} /></label>
              <label>Length<input id="ideaLength" type="text" placeholder="3 to 4 hours" value={m.length} onInput={e => setField('length', e.currentTarget.value)} /></label>
              <label>Players<input id="ideaPlayers" type="text" inputMode="numeric" placeholder="4" value={m.players} onInput={e => setField('players', e.currentTarget.value)} class="narrow" /></label>
              <label>Level<input id="ideaLevel" type="text" inputMode="numeric" placeholder="3" value={m.level} onInput={e => setField('level', e.currentTarget.value)} class="narrow" /></label>
              <label class="wide">Tags<input id="ideaTags" type="text" placeholder="heist, horror, urban" value={m._tagsText !== undefined ? m._tagsText : m.tags.join(', ')} onInput={e => setTags(e.currentTarget.value)} /></label>
            </div>
          </header>
          <Ready I={I} />
          {defs.map(d => <Section key={d.id} def={d} I={I} />)}
          {m.extras.map(e => (
            <section key={e._id} class="idea-sec" id={'sec-x' + e._id}>
              <div class="idea-sec-head"><h3>{e.title}</h3><button class="btn btn-sm btn-ghost" onClick={() => removeExtra(e)} title="Remove this section from the idea">Remove</button></div>
              <div class="muted small idea-hint">A section you added yourself. It is kept exactly as you wrote it.</div>
              <Auto value={e.body} label={e.title} onInput={v => setExtra(e, 'body', v)} rows={1} />
            </section>
          ))}
        </div>
      </div>
    </div>
  );
}

const promptAt = new Map();
/* a question for a blank section; "Use it" puts it in the page (text sections) so you can answer under it */
function Prompt({ def, I }) {
  const [, force] = useState(0);
  const n = promptAt.get(def.id) || 0;
  const q = promptFor(def.id, n);
  if (!q) return null;
  return (
    <div class="idea-prompt" data-prompt={def.id}>
      <span class="idea-prompt-q">Stuck? {q}</span>
      <button class="linkish" onClick={() => { promptAt.set(def.id, n + 1); force(x => x + 1); }}>Another</button>
      {def.kind === 'text' && <button class="linkish" onClick={() => appendText(def.id, q + '\n')}>Use it</button>}
    </div>
  );
}

function SparkMenu({ def }) {
  const sparks = SPARKS[def.id];
  if (!sparks || !sparks.length) return null;
  if (sparks.length === 1) return <button class="btn btn-sm btn-ghost idea-spark" id={'spark-' + def.id} onClick={() => rollInto(def.id, sparks[0].id)} title="Roll one with the Generate tools"><Icon name="shuffle" size={15} /> Roll: {sparks[0].label.replace(/^An? /, '')}</button>;
  return (
    <PopMenu id={'spark-' + def.id} icon="shuffle" text="Roll one" title="Roll something with the Generate tools" btnClass="btn btn-sm btn-ghost idea-spark" align="right">
      {({ close }) => sparks.map(sp => <button key={sp.id} class="pop-item" role="menuitem" data-spark={sp.id} onClick={() => { close(); rollInto(def.id, sp.id); }}>{sp.label}</button>)}
    </PopMenu>
  );
}

/* is it ready to run? the checks that matter, and a few extras worth having */
function Ready({ I }) {
  useLive();
  const m = I.model;
  const r = readiness(m);
  const open = I.readyOpen !== false;
  const jump = c => { const el = document.getElementById(c.sec ? 'sec-' + c.sec : 'ideaPitch'); if (el) { el.scrollIntoView({ behavior: 'smooth', block: 'center' }); if (!c.sec) el.focus(); } };
  const pct = Math.round(r.done / r.total * 100);
  return (
    <section class={'idea-ready' + (r.ready ? ' ok' : '')} id="ideaReady" aria-label="Ready to run?">
      <button class="idea-ready-head" aria-expanded={open} onClick={() => ideasSet({ readyOpen: !open })}>
        <Icon name="chev" size={15} />
        <b>{r.ready ? 'Ready to run' : 'Ready to run?'}</b>
        <span class="idea-ready-n" id="ideaReadyN">{r.done} of {r.total}</span>
        <span class="idea-ready-bar" aria-hidden="true"><span style={'width:' + pct + '%'} /></span>
      </button>
      {open && (
        <div class="idea-ready-body">
          <ul>
            {r.checks.filter(c => c.must).map(c => (
              <li key={c.id} class={c.ok ? 'ok' : ''} data-check={c.id}>
                <span class="idea-check" aria-hidden="true">{c.ok ? '✓' : ''}</span>
                {c.ok ? <span>{c.label}</span> : <button class="linkish" onClick={() => jump(c)}>{c.label}</button>}
                {!c.ok && <span class="muted small"> {c.hint}</span>}
              </li>
            ))}
          </ul>
          <div class="muted small idea-ready-x">Nice to have: {r.checks.filter(c => !c.must).map(c => <span key={c.id} class={c.ok ? 'ok' : ''} data-check={c.id}>{c.ok ? '✓ ' : '○ '}{c.label.toLowerCase()}{'  '}</span>)}</div>
          {r.ready && m.status !== 'ready' && m.status !== 'played' && <div class="row-actions" style="margin-top:8px"><button class="btn btn-sm btn-primary" id="ideaMarkReady" onClick={useReadyStatus}>Mark as Ready to run</button></div>}
        </div>
      )}
    </section>
  );
}

function Section({ def, I }) {
  const m = I.model;
  const shut = !!I.collapsed[def.id];
  const rows = def.kind === 'rows' ? m.sec[def.id] : null;
  return (
    <section class={'idea-sec' + (shut ? ' shut' : '')} id={'sec-' + def.id} data-sec={def.id}>
      <div class="idea-sec-head">
        <button class="idea-sec-toggle" aria-expanded={!shut} onClick={() => toggleSection(def.id)}><Icon name="chev" size={15} /><h3>{def.title}</h3></button>
        {!shut && <SparkMenu def={def} />}
      </div>
      {!shut && <div class="muted small idea-hint">{def.hint}</div>}
      {!shut && (def.kind === 'text' ? !String(m.sec[def.id] || '').trim() : !m.sec[def.id].some(r => Object.entries(r).some(([k, v]) => k !== '_id' && String(v).trim()))) && <Prompt def={def} I={I} />}
      {!shut && def.kind === 'text' && <Auto id={'ta-' + def.id} value={m.sec[def.id]} label={def.title} rows={1} class={def.id === 'idea' ? 'tall' : ''} onInput={v => setSecText(def.id, v)} placeholder="Write here…" />}
      {!shut && rows && (
        <>
          <div class="idea-rows" id={'rows-' + def.id}>
            {rows.map((r, i) => <Row key={r._id} def={def} row={r} index={i} last={i === rows.length - 1} />)}
          </div>
          <button class="btn btn-sm idea-add" id={'add-' + def.id} onClick={() => addRow(def.id)}>+ Add {def.single}</button>
        </>
      )}
    </section>
  );
}

function Row({ def, row, index, last }) {
  const single = def.id === 'cast';
  const focusNext = e => {
    if (e.key !== 'Enter' || e.shiftKey || (e.target.tagName === 'TEXTAREA' && !e.target.classList.contains('cast-ta'))) return;
    e.preventDefault();
    const inputs = [...e.currentTarget.querySelectorAll('input, textarea')];
    const i = inputs.indexOf(e.target);
    if (i >= 0 && i < inputs.length - 1) inputs[i + 1].focus();
    else if (last) addRow(def.id);
  };
  return (
    <div class={'idea-row' + (single ? ' cast' : '') + (row._fresh ? ' fresh' : '')} data-row={index} onKeyDown={focusNext}>
      {def.order && <span class="idea-row-n" aria-hidden="true">{index + 1}</span>}
      <div class="idea-row-fields">
        {single ? (
          <>
            <input class="idea-row-name" type="text" aria-label={def.labels[0]} placeholder={def.labels[0]} value={row.name} onInput={e => setRowField(def.id, row, 'name', e.currentTarget.value)} />
            <Auto class="cast-ta" label={def.labels[1]} placeholder={def.labels[1]} rows={1} value={row.wants} onInput={v => setRowField(def.id, row, 'wants', v)} />
            <Auto class="cast-ta" label={def.labels[2]} placeholder={def.labels[2]} rows={1} value={row.secret} onInput={v => setRowField(def.id, row, 'secret', v)} />
            <Auto class="cast-ta" label={def.labels[3]} placeholder={def.labels[3]} rows={1} value={row.voice} onInput={v => setRowField(def.id, row, 'voice', v)} />
          </>
        ) : (
          <>
            <input class="idea-row-name" type="text" aria-label={def.labels[0]} placeholder={def.labels[0]} value={row.name} onInput={e => setRowField(def.id, row, 'name', e.currentTarget.value)} />
            <Auto class="idea-row-note" value={row.note} label={def.labels[1]} placeholder={def.labels[1]} rows={1} onInput={v => setRowField(def.id, row, 'note', v)} />
          </>
        )}
      </div>
      <div class="idea-row-acts">
        <button class="tb-icon" title="Move up" aria-label="Move up" disabled={index === 0} onClick={() => moveRow(def.id, row, -1)}><span aria-hidden="true">↑</span></button>
        <button class="tb-icon" title="Move down" aria-label="Move down" disabled={last} onClick={() => moveRow(def.id, row, 1)}><span aria-hidden="true">↓</span></button>
        <button class="tb-icon" title="Remove" aria-label="Remove" data-remove onClick={() => removeRow(def.id, row)}><Icon name="x" size={15} /></button>
      </div>
    </div>
  );
}
