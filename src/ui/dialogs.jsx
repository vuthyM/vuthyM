import { Palette } from './palette.jsx';
import { locationBody, LOCATION_KIND_LABELS, kindFor } from '../core/locations.js';
import { useState } from 'preact/hooks';
import { S, set, useApp, getIndex, toast } from './store.js';
import { addTemplate, createNote, createSession, nextSessionNumber, sessionPrefix, appendToPrep, goto, setDecision, runPush, closeReview, discardFromReview, resolveAll, openAssetTab, getCategories, addCategory, deleteCategory, moveNote, previewRename, renameNote, lastSessionInfo, importLastSession, pageKinds, subfoldersOf, turnIntoPage, linkToExisting , askUndoPush} from './actions.js';
import { TYPES, TYPE_ORDER, OTHER, fieldDefs, toStored, typeInfo, typeLabel } from '../core/schema.js';
import { today, basename, dirname } from '../core/util.js';
import { visibleItems } from '../core/push.js';
import { GENS_BY_ID } from '../core/generators.js';
import { defaultDest, suggestName, genToNote, genToPrep } from '../core/templates.js';
import { getGenState } from './genstate.js';
import { NameCheck, Modal, Asset, Markdown, copyText, FieldInput } from './common.jsx';
import { SESSION_TEMPLATES, templateById } from '../core/sessiontemplates.js';
import { AskClaude } from './claude.jsx';
import { TableDialog } from './claudetables.jsx';
import { SnapshotDialog } from './snapshot.jsx';
import { CloseoutDialog } from './session.jsx';
import { TidyDialog, OriginalDialog } from './tidy.jsx';
import { MonsterLibrary, StatBlockDialog } from './monsters.jsx';
import { StarterDialog, SampleDialog } from './starter.jsx';
import { headingOf } from '../core/rename.js';
import { SettingsRedirect, LeaveEdit, MenuDialog } from './settings.jsx';
import { TrashDialog, VersionDialog } from './safety.jsx';
import { ShortcutsDialog, PlayerSafeDialog } from './tools39.jsx';
import { ImproviseDialog } from './prep40.jsx';

const close = () => set({ dialog: null });

function Confirm({ d }) {
  return (
    <Modal title={d.title} onClose={close}>
      <p style="margin:0">{d.body}</p>
      <div class="modal-actions">
        <button class="btn" onClick={close}>Cancel</button>
        <button class={'btn ' + (d.danger ? 'btn-danger' : 'btn-primary')} onClick={() => { close(); d.onConfirm(); }}>{d.confirmLabel || 'Confirm'}</button>
      </div>
    </Modal>
  );
}

function NewNote({ type, within }) {
  const t = typeInfo(type);
  const idx = getIndex();
  const defs = fieldDefs(type).slice(0, 3);
  const [name, setName] = useState('');
  const [vals, setVals] = useState(within ? { region: within } : {});
  const submit = e => {
    e.preventDefault();
    if (!name.trim()) return;
    const fm = {};
    for (const f of defs) { const v = toStored(f, vals[f.key]); if (v !== undefined) fm[f.key] = v; }
    // a place starts with the headings that suit its kind (a tavern, a dungeon, a town...)
    const p = createNote(type, name.trim(), type === 'location' ? { fm, body: locationBody(vals.kind, name.trim()) } : { fm });
    close();
    goto(p);
  };
  return (
    <Modal title={'New ' + t.single.toLowerCase()} onClose={close}>
      <form onSubmit={submit}>
        <div class="field"><label class="lbl">Name</label><input id="newNoteName" name="note-title" value={name} onInput={e => setName(e.currentTarget.value)} required /><NameCheck name={name} /></div>
        {defs.map(f => (
          <div class="field" key={f.key}>
            <label class="lbl">{f.label}</label>
            {f.kind === 'links'
              ? <FieldInput field={f} value={vals[f.key] || ''} index={idx} onChange={v => setVals({ ...vals, [f.key]: v })} />
              : f.kind === 'select'
              ? <select value={vals[f.key] || ''} onChange={e => setVals({ ...vals, [f.key]: e.currentTarget.value })}><option value="">(none)</option>{f.options.map(o => <option key={o} value={o}>{o}</option>)}</select>
              : <input type={f.kind === 'number' ? 'number' : 'text'} list={f.kind === 'link' ? 'nn-' + f.key : (type === 'location' && f.key === 'kind' ? 'nn-kinds' : undefined)} value={vals[f.key] || ''} onInput={e => setVals({ ...vals, [f.key]: e.currentTarget.value })} />}
            {type === 'location' && f.key === 'kind' && <datalist id="nn-kinds">{LOCATION_KIND_LABELS.map(k => <option key={k} value={k} />)}</datalist>}
            {type === 'location' && f.key === 'kind' && <div class="small muted" id="nnKindHint" style="margin-top:3px">{kindFor(vals.kind) ? 'Starts with the headings for a ' + kindFor(vals.kind).label.toLowerCase() + '.' : 'Pick a kind (or type your own) and the page starts with headings that suit it.'}</div>}
            {f.kind === 'link' && <datalist id={'nn-' + f.key}>{(f.linkTypes || []).flatMap(lt => (idx.byType[lt] || []).map(n => <option key={n.path} value={n.name} />))}</datalist>}
          </div>
        ))}
        <div class="muted small">It is created in your working copy. Nothing is written to the vault until you push.</div>
        <div class="modal-actions"><button type="button" class="btn" onClick={close}>Cancel</button><button type="submit" class="btn btn-primary">Create</button></div>
      </form>
    </Modal>
  );
}

function NewSession() {
  const [title, setTitle] = useState('');
  const [date, setDate] = useState(today());
  const [number, setNumber] = useState(nextSessionNumber());
  const [word, setWord] = useState(sessionPrefix());
  const prev = lastSessionInfo(null);
  const canImport = !!(prev.prev && prev.data && !prev.data.empty);
  const [imp, setImp] = useState(true);
  const submit = e => {
    e.preventDefault();
    const p = createSession({ title: title.trim(), date, number, word });
    let said = '';
    if (canImport && imp) { const r = importLastSession(p); if (r.ok) said = 'Brought in ' + r.parts + ' from ' + r.from + '. '; }
    if (said) toast(said + 'Push changes to save it.');
    close();
    goto(p);
  };
  return (
    <Modal title="New session" onClose={close}>
      <form onSubmit={submit}>
        <div style="display:grid;grid-template-columns:130px 90px 1fr;gap:10px 12px">
          <div class="field"><label class="lbl">Called</label><input id="nsWord" list="ns-words" value={word} onInput={e => setWord(e.currentTarget.value)} aria-label="What to call it" /><datalist id="ns-words"><option value="Session" /><option value="Episode" /><option value="Chapter" /><option value="Part" /></datalist></div>
          <div class="field"><label class="lbl">Number</label><input type="number" value={number} onInput={e => setNumber(e.currentTarget.value)} /></div>
          <div class="field"><label class="lbl">Date</label><input type="date" value={date} onInput={e => setDate(e.currentTarget.value)} /></div>
        </div>
        <div class="field"><label class="lbl">Title (optional)</label><input value={title} onInput={e => setTitle(e.currentTarget.value)} placeholder="The Ferry at Night" /></div>
        {canImport && <label class="set-opt" style="margin-bottom:8px"><input type="checkbox" id="nsImport" checked={imp} onChange={e => setImp(e.currentTarget.checked)} /> <span><strong>Bring in last session</strong> <span class="muted small">from {prev.prev.name}: {prev.parts}. It goes at the top of the prep, under “Last time”.</span></span></label>}
        <div class="modal-actions"><button type="button" class="btn" onClick={close}>Cancel</button><button type="submit" class="btn btn-primary">Create session</button></div>
      </form>
    </Modal>
  );
}

function Lightbox({ path }) {
  return <Modal title={path.split('/').pop()} wide onClose={close}><div class="lightbox"><Asset path={path} /></div><div class="modal-actions"><button class="btn" id="openAssetTab" onClick={() => { close(); openAssetTab(path); }}>Open as a map in a tab</button><button class="btn btn-primary" onClick={close}>Close</button></div></Modal>;
}

/* where a generated thing can be saved: the session prep, and/or a new note in any category (as many as you like) */
/* ---------- add a template to a session ---------- */
function AddTemplate({ d }) {
  const idx = getIndex();
  const [id, setId] = useState(SESSION_TEMPLATES[0].id);
  const tpl = templateById(id);
  const go = e => {
    e.preventDefault();
    close();
    if (d.insert) { d.insert(tpl.body); toast('Added the “' + tpl.name + '” template where your cursor was.'); } else addTemplate(d.path, id);
  };
  return (
    <Modal title="Add a template" onClose={close}>
      <form onSubmit={go}>
        <div class="muted small" style="margin-bottom:8px">A blank layout, added {d.insert ? 'where your cursor is' : 'in the right place in this note (under Prep)'}. Nothing is written to your vault until you push.</div>
        <div class="radio-row" role="radiogroup" aria-label="Template">
          {SESSION_TEMPLATES.map(t => (
            <label key={t.id} class={t.id === id ? 'on' : ''}><input type="radio" name="tpl" data-tpl={t.id} checked={t.id === id} onChange={() => setId(t.id)} /> <strong>{t.name}</strong></label>
          ))}
        </div>
        <div class="small muted" style="margin:8px 0">{tpl.blurb}</div>
        <div class="tpl-preview" aria-label="Preview"><Markdown body={tpl.body} index={idx} rev={0} /></div>
        <div class="modal-actions"><button type="button" class="btn" onClick={close}>Cancel</button><button type="submit" class="btn btn-primary" id="tplAdd">Add template</button></div>
      </form>
    </Modal>
  );
}

function SaveGenerated({ gid, inst }) {
  const g = GENS_BY_ID[gid];
  const st = getGenState(g, inst);
  const idx = getIndex();
  const sessions = idx.byType.session || [];
  const kinds = pageKinds().filter(k => k.type !== 'player');
  const first = defaultDest(g);
  const [picked, setPicked] = useState(new Set([first === 'prep' ? 'prep' : first]));
  const [name, setName] = useState(suggestName(g, st.vals));
  const [session, setSession] = useState(sessions[0] ? sessions[0].path : 'new');
  const [fold, setFold] = useState(true);
  const toggle = id => { const n = new Set(picked); if (n.has(id)) n.delete(id); else n.add(id); setPicked(n); };
  const wantPrep = picked.has('prep');
  const noteTypes = kinds.filter(k => picked.has(k.type));
  const go = e => {
    e.preventDefault();
    if (!picked.size) return;
    const nm = name.trim() || g.name;
    const made = [];
    for (const k of noteTypes) {
      const n = genToNote(g, st, k.type, nm);
      made.push({ kind: k, path: createNote(k.type, nm, { fm: n.fm, body: n.body }) });
    }
    let target = null;
    if (wantPrep) {
      target = session;
      if (target === 'new') target = createSession({ title: '', date: today(), number: nextSessionNumber(), word: sessionPrefix() });
      const link = made.length ? basename(made[0].path).replace(/\.md$/i, '') : '';
      appendToPrep(target, genToPrep(g, st.vals, { fold, linkTo: link }));
    }
    close();
    const where = [wantPrep ? 'session prep' : null, ...made.map(m => 'a new ' + m.kind.label.toLowerCase() + ' note')].filter(Boolean);
    toast('Saved to ' + where.join(' and ') + '. Push changes to write ' + (where.length === 1 ? 'it' : 'them') + ' to your vault.');
    if (where.length === 1) goto(target || made[0].path);
  };
  const label = k => 'New ' + k.label.toLowerCase() + ' note' + (k.type === first ? ' (suggested)' : '');
  return (
    <Modal title={'Save this ' + g.name.toLowerCase() + ' to the campaign'} onClose={close}>
      <form onSubmit={go}>
        <div class="muted small" style="margin-bottom:8px">Choose one place or several. Each one is saved separately.</div>
        <div class="radio-row" role="group" aria-label="Where to save it">
          <label class={wantPrep ? 'on' : ''}><input type="checkbox" id="sgPrep" checked={wantPrep} onChange={() => toggle('prep')} /> Session prep (adds to a session note){first === 'prep' ? ' (suggested)' : ''}</label>
          {kinds.map(k => (
            <label key={k.type} class={picked.has(k.type) ? 'on' : ''}><input type="checkbox" data-kind={k.type} checked={picked.has(k.type)} onChange={() => toggle(k.type)} /> {label(k)}</label>
          ))}
        </div>
        {wantPrep && (
          <div class="field">
            <label class="lbl">Which session</label>
            <select value={session} onChange={e => setSession(e.currentTarget.value)}>
              {sessions.map(n => <option key={n.path} value={n.path}>{n.name}</option>)}
              <option value="new">(create a new session)</option>
            </select>
            <label class="small" style="display:flex;gap:8px;align-items:center;margin-top:8px"><input type="checkbox" id="sgFold" style="width:auto" checked={fold} onChange={e => setFold(e.currentTarget.checked)} /> Collapse it (a foldable callout), so it takes one line until opened</label>
          </div>
        )}
        {noteTypes.length > 0 && <div class="field"><label class="lbl">Note name</label><input id="sgName" name="note-title" value={name} onInput={e => setName(e.currentTarget.value)} required /><NameCheck name={name} /></div>}
        {wantPrep && noteTypes.length > 0 && <div class="muted small" style="margin-bottom:8px">The prep entry will link to the new note.</div>}
        <div class="modal-actions"><button type="button" class="btn" onClick={close}>Cancel</button><button type="submit" class="btn btn-primary" id="sgSave" disabled={!picked.size}>Save{picked.size > 1 ? ' to ' + picked.size + ' places' : ''}</button></div>
      </form>
    </Modal>
  );
}

/* Save everything on the "pick several" page in one go: each result gets a place (its usual one to begin with) and a name. */
function SaveAll({ items }) {
  const idx = getIndex();
  const sessions = idx.byType.session || [];
  const kinds = pageKinds().filter(k => k.type !== 'player');
  const kindOk = t => kinds.some(k => k.type === t);
  const rows0 = items.map((it, i) => {
    const g = GENS_BY_ID[it.gid], st = getGenState(g, it.inst);
    const d = defaultDest(g);
    return { i, g, st, on: true, dest: d !== 'prep' && kindOk(d) ? d : 'prep', name: suggestName(g, st.vals) };
  });
  const [rows, setRows] = useState(rows0);
  const [session, setSession] = useState(sessions[0] ? sessions[0].path : 'new');
  const [fold, setFold] = useState(true);
  const edit = (i, patch) => setRows(rows.map(r => (r.i === i ? { ...r, ...patch } : r)));
  const chosen = rows.filter(r => r.on && (r.dest === 'prep' || r.name.trim()));
  const wantPrep = chosen.some(r => r.dest === 'prep');
  const go = e => {
    e.preventDefault();
    if (!chosen.length) return;
    let target = null;
    const places = new Set();
    let notes = 0, prep = 0, last = null;
    for (const r of chosen) {
      if (r.dest === 'prep') {
        if (!target) { target = session; if (target === 'new') target = createSession({ title: '', date: today(), number: nextSessionNumber(), word: sessionPrefix() }); }
        appendToPrep(target, genToPrep(r.g, r.st.vals, { fold }));
        prep++; places.add('session prep');
      } else {
        const n = genToNote(r.g, r.st, r.dest, r.name.trim());
        last = createNote(r.dest, r.name.trim(), { fm: n.fm, body: n.body });
        notes++; places.add('new notes');
      }
    }
    close();
    toast('Saved ' + chosen.length + ' result' + (chosen.length === 1 ? '' : 's') + ' (' + [prep ? prep + ' to session prep' : '', notes ? notes + ' as new note' + (notes === 1 ? '' : 's') : ''].filter(Boolean).join(', ') + '). Push changes to write them to your vault.');
    if (chosen.length === 1) goto(target || last);
  };
  return (
    <Modal title={'Save these ' + items.length + ' results to the campaign'} onClose={close} wide>
      <form onSubmit={go}>
        <div class="muted small" style="margin-bottom:8px">Each one goes where it usually belongs (a tavern to Locations, an NPC to NPCs). Change a place, rename it, or untick what you do not want.</div>
        <div class="row-actions" style="margin-bottom:8px"><button type="button" class="btn btn-sm" id="saAllPrep" onClick={() => setRows(rows.map(r => ({ ...r, dest: 'prep' })))}>Put them all in session prep</button><button type="button" class="btn btn-sm" id="saUsual" onClick={() => setRows(rows0.map((r0, k) => ({ ...r0, on: rows[k].on, name: rows[k].name })))}>Back to the usual places</button></div>
        <div class="sa-list">
          {rows.map(r => (
            <div class={'sa-row' + (r.on ? '' : ' off')} key={r.i} data-sa-row={r.g.id}>
              <input type="checkbox" aria-label={'Save ' + r.g.name} checked={r.on} onChange={e => edit(r.i, { on: e.currentTarget.checked })} />
              <span class="sa-what">{r.g.name}</span>
              <select data-sa-dest aria-label={'Where to save the ' + r.g.name.toLowerCase()} value={r.dest} disabled={!r.on} onChange={e => edit(r.i, { dest: e.currentTarget.value })}>
                <option value="prep">Session prep</option>
                {kinds.map(k => <option key={k.type} value={k.type}>New {k.label.toLowerCase()} note</option>)}
              </select>
              {r.dest !== 'prep' ? <input class="sa-name" aria-label={'Name of the ' + r.g.name.toLowerCase() + ' note'} value={r.name} disabled={!r.on} onInput={e => edit(r.i, { name: e.currentTarget.value })} /> : <span class="muted small sa-name">goes into the prep as a foldable entry</span>}
            </div>
          ))}
        </div>
        {wantPrep && (
          <div class="field">
            <label class="lbl">Which session</label>
            <select id="saSession" value={session} onChange={e => setSession(e.currentTarget.value)}>
              {sessions.map(n => <option key={n.path} value={n.path}>{n.name}</option>)}
              <option value="new">(create a new session)</option>
            </select>
            <label class="small" style="display:flex;gap:8px;align-items:center;margin-top:8px"><input type="checkbox" style="width:auto" checked={fold} onChange={e => setFold(e.currentTarget.checked)} /> Collapse each one (a foldable callout)</label>
          </div>
        )}
        <div class="modal-actions"><button type="button" class="btn" onClick={close}>Cancel</button><button type="submit" class="btn btn-primary" id="saSave" disabled={!chosen.length}>Save {chosen.length || ''}</button></div>
      </form>
    </Modal>
  );
}

/* ---------- push review ---------- */
/* Lists which notes will change and nothing else: no text, no diff. The title, counts and
   buttons stay at the top while the list scrolls, so a push with hundreds of changes never
   leaves the Push button off-screen. */
const KIND = { create: 'New', update: 'Edited', delete: 'Deleted', move: 'Moved' };
const KIND_CLASS = { create: 'pill-good', update: 'pill-warn', delete: 'pill-bad', move: 'pill' };
const kindOf = it => (it.movedFrom ? 'move' : it.kind);
const rel = p => (S.campaign && p.startsWith(S.campaign.path + '/') ? p.slice(S.campaign.path.length + 1) : p);

const CONFLICT_TEXT = {
  changed: 'Changed in your vault since you opened the campaign (for example in Obsidian).',
  exists: 'A note with this name now exists in your vault.',
  missing: 'No longer exists in your vault.',
  srcchanged: 'The original note was changed in your vault after you opened the campaign.',
};
function options(it) {
  if (it.conflict === 'changed') return [...(typeof it.merged === 'string' ? [['merge', 'Keep both: my changes and the vault’s (they are in different places)']] : []), ['mine', 'Overwrite with my version'], ['disk', 'Keep the vault’s version'], ['skip', 'Decide later']];
  if (it.conflict === 'exists') return [['rename', 'Save mine as a new numbered note'], ['mine', 'Overwrite the existing note'], ['skip', 'Decide later']];
  if (it.conflict === 'srcchanged') return [['mine', 'Move my copy anyway'], ['skip', 'Decide later']];
  return [[it.kind === 'delete' ? 'disk' : 'mine', it.kind === 'delete' ? 'Nothing to delete, drop my change' : 'Recreate it with my version'], ...(it.kind === 'delete' ? [] : [['disk', 'Drop my change']]), ['skip', 'Decide later']];
}

function ReviewRow({ it, decision, busy }) {
  const k = kindOf(it);
  return (
    <div class={'rev-row' + (it.conflict ? ' has-conflict' : '')}>
      <div class="rev-head">
        <span class={'pill ' + KIND_CLASS[k]}>{KIND[k]}</span>
        <span class="path">{it.movedFrom ? <>{rel(it.movedFrom)} <span class="muted">→</span> {rel(it.path)}</> : rel(it.path)}</span>
        {!it.conflict && <label class="small incl"><input type="checkbox" style="width:auto" checked={decision !== 'skip'} disabled={busy} onChange={e => setDecision(it.path, e.currentTarget.checked ? 'mine' : 'skip')} /> Include</label>}
        <button class="btn btn-sm btn-ghost" disabled={busy} onClick={() => discardFromReview(it.path)}>Discard</button>
      </div>
      {it.conflict && (
        <div class="rev-conflict">
          <div><strong>{CONFLICT_TEXT[it.conflict]}</strong></div>
          <div class="row-actions" role="radiogroup" aria-label="How to resolve">
            {options(it).map(([v, label]) => <label key={v}><input type="radio" name={'r-' + it.path} checked={decision === v} onChange={() => setDecision(it.path, v)} /> {label}</label>)}
          </div>
        </div>
      )}
    </div>
  );
}

/* an error with technical details: the first paragraph is the explanation, the rest can be copied */
function ErrorText({ text }) {
  const [head, ...rest] = String(text).split('\n\n');
  const details = rest.join('\n\n');
  return (
    <div style="margin-top:4px">
      <div style="color:var(--danger)">{head}</div>
      {details && (
        <details style="margin-top:6px" open>
          <summary class="small muted" style="cursor:pointer">Technical details (send these if it keeps happening)</summary>
          <pre class="errdetail">{details}</pre>
          <button class="btn btn-sm" onClick={() => copyText(head + '\n\n' + details, 'Copied the details')}>Copy details</button>
        </details>
      )}
    </div>
  );
}

const RESULT = { written: 'Written', deleted: 'Moved to .trash', skipped: 'Skipped (still pending)', 'kept-disk': 'Kept the vault’s version', error: 'Failed' };
const plural = (n, w) => n + ' ' + w + (n === 1 ? '' : 's');

function PushReview() {
  const s = useApp();
  const r = s.review;
  if (r.results) {
    const count = st => r.results.filter(x => x.status === st).length;
    const bad = count('error');
    const problems = r.results.filter(x => x.status === 'error' || x.status === 'skipped');
    return (
      <Modal title={bad ? 'Pushed with problems' : 'Pushed to your vault'} wide cls="review" onClose={closeReview}>
        <div class="rev-top">
          <div class="rev-summary">
            {count('written') > 0 && <span class="pill pill-good">{count('written')} written</span>}
            {count('deleted') > 0 && <span class="pill pill-good">{count('deleted')} moved to .trash</span>}
            {count('kept-disk') > 0 && <span class="pill">{count('kept-disk')} kept as in the vault</span>}
            {count('skipped') > 0 && <span class="pill pill-warn">{count('skipped')} skipped</span>}
            {bad > 0 && <span class="pill pill-bad">{bad} failed</span>}
          </div>
          <div class="modal-actions">
            {S.vault && S.vault.undoInfo && s.undo && count('written') + count('deleted') > 0 && <button class="btn" id="pushUndo" title="Put every note this push changed back as it was" onClick={() => { closeReview(); askUndoPush(); }}>Undo this push</button>}
            <button class="btn btn-primary" id="pushDone" onClick={closeReview}>Done</button>
          </div>
        </div>
        <div class="rev-list">
          {problems.length === 0 && <div class="muted small">Everything went through.</div>}
          {problems.length > 0 && <div class="muted small" style="margin-bottom:8px">Nothing is lost: anything that failed or was skipped is still in your pending changes. Fix the cause and press Push changes again.</div>}
          {problems.map(x => (
            <div key={x.path} class="small" style="padding:6px 0;border-top:1px solid var(--border)">
              <div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap"><span class="mono" style="overflow-wrap:anywhere">{x.path}</span><span class={'pill ' + (x.status === 'error' ? 'pill-bad' : 'pill-warn')}>{x.status === 'error' ? (x.op === 'trash' ? 'Failed to move to .trash' : x.op === 'write' ? 'Failed to save' : 'Failed') : RESULT[x.status]}</span></div>
              {x.error && <ErrorText text={x.error} />}
            </div>
          ))}
        </div>
      </Modal>
    );
  }
  const items = visibleItems(r.items);
  const conflicts = items.filter(it => it.conflict);
  const rest = items.filter(it => !it.conflict);
  const undecided = conflicts.filter(it => !r.decisions[it.path]).length;
  const willWrite = items.filter(it => { const d = r.decisions[it.path]; return d === 'mine' || d === 'rename' || d === 'disk' || d === 'merge'; }).length;
  const by = k => items.filter(it => kindOf(it) === k).length;
  return (
    <Modal title="Push changes to your vault" wide cls="review" onClose={closeReview}>
      <div class="rev-top">
        <div class="rev-summary">
          {by('create') > 0 && <span class="pill pill-good">{by('create')} new</span>}
          {by('update') > 0 && <span class="pill pill-warn">{by('update')} edited</span>}
          {by('move') > 0 && <span class="pill">{by('move')} moved</span>}
          {by('delete') > 0 && <span class="pill pill-bad">{by('delete')} deleted</span>}
          {conflicts.length > 0 && <span class="pill pill-bad">{conflicts.length} need{conflicts.length === 1 ? 's' : ''} a decision</span>}
        </div>
        <div class="modal-actions">
          <button class="btn" onClick={closeReview} disabled={r.busy}>Cancel</button>
          <button class="btn btn-primary" id="confirmPush" disabled={r.busy || undecided > 0 || !willWrite} onClick={runPush}>{r.busy ? 'Writing…' : 'Push ' + plural(willWrite, 'change')}</button>
        </div>
      </div>
      <p class="muted small rev-note">Nothing has been written yet. Deleted notes go to the vault’s <span class="mono">.trash</span> folder.{undecided > 0 ? ' Resolve the notes marked below before pushing.' : ''}</p>
      <div class="rev-list">
        {conflicts.length > 1 && (
          <div class="row-actions" style="margin-bottom:10px">
            <button class="btn btn-sm" disabled={r.busy} onClick={() => resolveAll('mine')}>Resolve all with my version</button>
            <button class="btn btn-sm" disabled={r.busy} onClick={() => resolveAll('vault')}>Resolve all by keeping the vault’s</button>
          </div>
        )}
        {conflicts.map(it => <ReviewRow key={it.path} it={it} decision={r.decisions[it.path]} busy={r.busy} />)}
        {rest.map(it => <ReviewRow key={it.path} it={it} decision={r.decisions[it.path]} busy={r.busy} />)}
      </div>
    </Modal>
  );
}

/* ---------- turn selected words into a page ---------- */
function PageFrom({ d }) {
  const kinds = pageKinds();
  const [name, setName] = useState(d.selected);
  const [type, setType] = useState(d.type || (kinds[0] && kinds[0].type));
  const [sub, setSub] = useState('');
  const [link, setLink] = useState(!!d.replace);
  const [open, setOpen] = useState(false);
  const kind = kinds.find(k => k.type === type);
  const subs = kind ? subfoldersOf(kind.folder) : [];
  const go = e => {
    e.preventDefault();
    close();
    turnIntoPage({ selected: d.selected, type, sub, name, replace: link ? d.replace : null, open });
  };
  return (
    <Modal title={'Turn “' + (d.selected.length > 34 ? d.selected.slice(0, 33) + '…' : d.selected) + '” into a page'} onClose={close}>
      <form onSubmit={go}>
        <div class="field"><label class="lbl">Page name</label><input id="pfName" name="note-title" value={name} onInput={e => setName(e.currentTarget.value)} required /><NameCheck name={name} /></div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px 12px">
          <div class="field"><label class="lbl">What kind of page</label>
            <select id="pfType" value={type} onChange={e => { setType(e.currentTarget.value); setSub(''); }}>{kinds.map(k => <option key={k.type} value={k.type}>{k.label}</option>)}</select>
          </div>
          <div class="field"><label class="lbl">Folder inside {kind ? kind.folder : 'it'} (optional)</label>
            <input id="pfSub" list="pf-subs" value={sub} onInput={e => setSub(e.currentTarget.value)} placeholder="e.g. Villains" autofocus={!!d.focusSub} />
            <datalist id="pf-subs">{subs.map(x => <option key={x} value={x} />)}</datalist>
          </div>
        </div>
        {d.replace && <label class="small" style="display:flex;gap:8px;align-items:center;margin-bottom:8px"><input type="checkbox" style="width:auto" checked={link} onChange={e => setLink(e.currentTarget.checked)} /> Replace the selected words with a link to the new page</label>}
        <label class="small" style="display:flex;gap:8px;align-items:center"><input type="checkbox" style="width:auto" checked={open} onChange={e => setOpen(e.currentTarget.checked)} /> Open the new page afterwards</label>
        <div class="muted small" style="margin-top:10px">The page is created in your working copy. Nothing is written to your vault until you push.</div>
        <div class="modal-actions"><button type="button" class="btn" onClick={close}>Cancel</button><button type="submit" class="btn btn-primary" id="pfGo">Create page</button></div>
      </form>
    </Modal>
  );
}

/* ---------- link selected words to a note that already exists ---------- */
function LinkExisting({ d }) {
  const idx = getIndex();
  const [q, setQ] = useState('');
  const [pick, setPick] = useState(null);
  const [alias, setAlias] = useState(false);
  const ql = q.trim().toLowerCase();
  const list = idx.notes.filter(n => !ql || n.name.toLowerCase().includes(ql))
    .sort((a, b) => (b.name.toLowerCase().startsWith(ql) ? 1 : 0) - (a.name.toLowerCase().startsWith(ql) ? 1 : 0) || a.name.localeCompare(b.name)).slice(0, 12);
  const chosen = pick && idx.byPath.get(pick);
  const differs = chosen && chosen.name.toLowerCase() !== d.selected.toLowerCase();
  const go = e => { e.preventDefault(); if (!chosen) return; close(); linkToExisting({ selected: d.selected, targetPath: chosen.path, replace: d.replace, alias: alias && differs }); };
  return (
    <Modal title={'Link “' + (d.selected.length > 34 ? d.selected.slice(0, 33) + '…' : d.selected) + '” to a note'} onClose={close}>
      <form onSubmit={go}>
        <div class="field"><label class="lbl">Find the note</label><input id="leSearch" type="search" value={q} onInput={e => { setQ(e.currentTarget.value); setPick(null); }} placeholder="Start typing a name" /></div>
        <div class="le-list" role="listbox" aria-label="Notes">
          {list.map(n => (
            <button type="button" key={n.path} role="option" aria-selected={pick === n.path} class={'le-row' + (pick === n.path ? ' on' : '')} onClick={() => setPick(n.path)}>
              <strong>{n.name}</strong><span class="small muted"> · {n.type === 'root' || n.type === 'other' ? 'Other' : typeLabel(n.type)}</span>
            </button>
          ))}
          {!list.length && <div class="muted small" style="padding:8px">No note has that name.</div>}
        </div>
        {differs && <label class="small" style="display:flex;gap:8px;align-items:center;margin-top:10px"><input id="leAlias" type="checkbox" style="width:auto" checked={alias} onChange={e => setAlias(e.currentTarget.checked)} /> Remember “{d.selected}” as another name for {chosen.name}, so it is found later</label>}
        <div class="modal-actions"><button type="button" class="btn" onClick={close}>Cancel</button><button type="submit" class="btn btn-primary" id="leGo" disabled={!chosen}>Link</button></div>
      </form>
    </Modal>
  );
}

/* ---------- move a note to another category ---------- */
function MoveNote({ path }) {
  const idx = getIndex();
  const n = idx.byPath.get(path);
  const cats = getCategories().filter(c => !n || c.folder !== n.top);
  const builtins = TYPE_ORDER.filter(t => !cats.some(c => c.type === t) && !(n && n.type === t) && t !== 'map');
  const [dest, setDest] = useState(cats[0] ? cats[0].type : builtins[0] || '');
  if (!n) return null;
  const go = e => {
    e.preventDefault();
    if (!dest) return;
    const np = moveNote(path, dest);
    close();
    if (np) goto(np);
  };
  return (
    <Modal title={'Move “' + n.name + '”'} onClose={close}>
      <form onSubmit={go}>
        <div class="field">
          <label class="lbl">Move to</label>
          <select id="moveDest" value={dest} onChange={e => setDest(e.currentTarget.value)}>
            {cats.map(c => <option key={c.folder} value={c.type}>{c.folder}{c.label !== c.folder ? ' (' + c.label + ')' : ''}</option>)}
            {builtins.length > 0 && <optgroup label="New category">{builtins.map(t => <option key={t} value={t}>{TYPES[t].label}</option>)}</optgroup>}
          </select>
        </div>
        <div class="muted small">Now in <span class="mono">{n.rel.includes('/') ? dirname(n.rel) : '(campaign folder)'}</span>. Links to this note keep working because they use its name. The file is moved in your vault when you push.</div>
        <div class="modal-actions"><button type="button" class="btn" onClick={close}>Cancel</button><button type="submit" class="btn btn-primary" id="moveGo" disabled={!dest}>Move note</button></div>
      </form>
    </Modal>
  );
}

/* ---------- add and delete categories ---------- */
function Categories() {
  const s = useApp();
  const [name, setName] = useState('');
  const [kind, setKind] = useState('plain');
  const [removing, setRemoving] = useState(null);
  const cats = getCategories();
  const add = e => {
    e.preventDefault();
    if (addCategory(name, kind)) { setName(''); close(); }
  };
  if (removing) return <RemoveCategory cat={removing} others={cats.filter(c => c.folder !== removing.folder)} onBack={() => setRemoving(null)} />;
  return (
    <Modal title="Categories" onClose={close}>
      <p class="muted small" style="margin:0 0 12px">A category is a folder in your campaign. Add one for anything you keep track of, such as Bestiary, Lore or Handouts.</p>
      <form onSubmit={add} class="stack" style="margin-bottom:16px">
        <div class="field" style="margin:0"><label class="lbl">New category</label><input id="catName" value={name} onInput={e => setName(e.currentTarget.value)} placeholder="Bestiary" /></div>
        <div class="field" style="margin:0">
          <label class="lbl">What it holds</label>
          <select id="catKind" value={kind} onChange={e => setKind(e.currentTarget.value)}>
            <option value="plain">Plain notes</option>
            {TYPE_ORDER.filter(t => t !== 'map').map(t => <option key={t} value={t}>{TYPES[t].label} (with their usual properties)</option>)}
          </select>
        </div>
        <div><button class="btn btn-primary" type="submit" id="catAdd" disabled={!name.trim()}>Add category</button></div>
      </form>
      <label class="lbl">Your categories</label>
      <div class="cat-list">
        {cats.map(c => (
          <div key={c.folder} class="cat-row">
            <span><strong>{c.folder}</strong> <span class="muted small">{c.custom ? 'plain notes' : c.label.toLowerCase()} · {c.count} note{c.count === 1 ? '' : 's'}</span></span>
            <button class="btn btn-sm btn-ghost btn-danger" aria-label={'Delete the ' + c.folder + ' category'} onClick={() => setRemoving(c)}>Delete…</button>
          </div>
        ))}
        {!cats.length && <div class="muted small">No categories yet.</div>}
      </div>
      <div class="modal-actions"><button class="btn btn-primary" onClick={close}>Done</button></div>
    </Modal>
  );
}

function RemoveCategory({ cat, others, onBack }) {
  const [mode, setMode] = useState(cat.count && others.length ? 'move' : 'delete');
  const [dest, setDest] = useState(others[0] ? others[0].type : '');
  const ok = !cat.count || mode === 'delete' || !!dest;
  const go = () => { deleteCategory(cat.folder, { mode, dest }); close(); };
  return (
    <Modal title={'Delete the “' + cat.folder + '” category'} onClose={close}>
      {cat.count ? (
        <>
          <p style="margin:0 0 10px">It holds {cat.count} note{cat.count === 1 ? '' : 's'}. What should happen to them?</p>
          <div class="radio-row" role="radiogroup" aria-label="What to do with its notes">
            <label class={mode === 'move' ? 'on' : ''}><input type="radio" name="rm" checked={mode === 'move'} disabled={!others.length} onChange={() => setMode('move')} /> Keep them: move them to another category</label>
            {mode === 'move' && (
              <select id="rmDest" value={dest} onChange={e => setDest(e.currentTarget.value)} style="margin:2px 0 4px">
                {others.map(c => <option key={c.folder} value={c.type}>{c.folder}</option>)}
              </select>
            )}
            <label class={mode === 'delete' ? 'on' : ''}><input type="radio" name="rm" checked={mode === 'delete'} onChange={() => setMode('delete')} /> Delete them too (they go to <span class="mono">.trash</span> when you push)</label>
          </div>
        </>
      ) : <p style="margin:0 0 10px">It is empty, so nothing else changes.</p>}
      <div class="muted small">The folder itself stays in your vault; it is just no longer a category here. Nothing is written until you push.</div>
      <div class="modal-actions"><button class="btn" onClick={onBack}>Back</button><button class="btn btn-danger" id="rmGo" disabled={!ok} onClick={go}>Delete category</button></div>
    </Modal>
  );
}

export function Dialogs() {
  const s = useApp();
  const d = s.dialog;
  return (
    <>
      {d && d.kind === 'confirm' && <Confirm d={d} />}
      {d && d.kind === 'new' && <NewNote type={d.type} within={d.within} />}
      {d && d.kind === 'newSession' && <NewSession />}
      {d && d.kind === 'lightbox' && <Lightbox path={d.path} />}
      {d && d.kind === 'save' && <SaveGenerated gid={d.gid} inst={d.inst} />}
      {d && d.kind === 'saveAll' && <SaveAll items={d.items} />}
      {d && d.kind === 'template' && <AddTemplate d={d} />}
      {d && d.kind === 'claude' && <AskClaude d={d} />}
      {d && d.kind === 'claudeSettings' && <SettingsRedirect d={d} />}
      {d && d.kind === 'claudeTable' && <TableDialog d={d} />}
      {d && d.kind === 'snapshot' && <SnapshotDialog />}
      {d && d.kind === 'closeout' && <CloseoutDialog path={d.path} />}
      {d && d.kind === 'tidy' && <TidyDialog path={d.path} />}
      {d && d.kind === 'tidyOriginal' && <OriginalDialog path={d.path} />}
      {d && d.kind === 'monsters' && <MonsterLibrary />}
      {d && d.kind === 'rename' && <RenameNote path={d.path} />}
      {d && d.kind === 'starter' && <StarterDialog />}
      {d && d.kind === 'sample' && <SampleDialog />}
      {d && d.kind === 'statblock' && <StatBlockDialog k={d.key} name={d.name} />}
      {d && d.kind === 'palette' && <Palette />}
      {d && d.kind === 'settings' && <SettingsRedirect d={d} />}
      {d && d.kind === 'menu' && <MenuDialog />}
      {d && d.kind === 'trash' && <TrashDialog />}
      {d && d.kind === 'shortcuts' && <ShortcutsDialog />}
      {d && d.kind === 'improv' && <ImproviseDialog d={d} />}
      {d && d.kind === 'playersafe' && <PlayerSafeDialog d={d} />}
      {d && d.kind === 'version' && <VersionDialog />}
      {d && d.kind === 'leaveEdit' && <LeaveEdit d={d} />}
      {d && d.kind === 'move' && <MoveNote path={d.path} />}
      {d && d.kind === 'pageFrom' && <PageFrom d={d} />}
      {d && d.kind === 'linkExisting' && <LinkExisting d={d} />}
      {d && d.kind === 'categories' && <Categories />}
      {s.review && <PushReview />}
    </>
  );
}

/* Rename: the file name, the title heading inside it, and the links in other notes */
function RenameNote({ path }) {
  const idx = getIndex();
  const n = idx.byPath.get(path);
  const close = () => set({ dialog: null });
  const oldTitle = n ? headingOf(n.body || '') : '';
  const [name, setName] = useState(n ? n.name : '');
  const [title, setTitle] = useState(oldTitle);
  const [follow, setFollow] = useState(!!oldTitle && oldTitle.toLowerCase() === (n ? n.name.toLowerCase() : ''));   // the heading follows the name while they were the same
  const [links, setLinks] = useState(true);
  const [alias, setAlias] = useState(false);
  if (!n) return <Modal title="Rename" onClose={close}><p>That note is not there any more.</p><div class="modal-actions"><button class="btn" onClick={close}>Close</button></div></Modal>;
  const shownTitle = follow ? name : title;
  const plan = previewRename(path, { name, title: oldTitle ? shownTitle : null, updateLinks: links, keepAlias: alias });
  const go = e => {
    if (e && e.preventDefault) e.preventDefault();
    if (!plan.ok) return;
    const r = renameNote(path, { name, title: oldTitle ? shownTitle : null, updateLinks: links, keepAlias: alias });
    if (!r.ok) { toast(r.error || 'Could not rename it.', true); return; }
    close();
    const bits = [];
    if (r.renamed) bits.push('Renamed to “' + r.newName + '”');
    if (r.retitled) bits.push(r.renamed ? 'the heading changed too' : 'Changed the heading');
    if (r.noteCount) bits.push('updated ' + r.linkCount + ' link' + (r.linkCount === 1 ? '' : 's') + ' in ' + r.noteCount + ' other note' + (r.noteCount === 1 ? '' : 's'));
    toast(bits.join(', ') + '. Push changes to rename the file in your vault.');
  };
  // how many links elsewhere would change, whatever the checkbox says (so the label can tell you)
  const all = previewRename(path, { name, title: null, updateLinks: true });
  const inOthers = all.ok ? all.edits.reduce((a, e) => a + e.count, 0) : 0;
  const notesWith = all.ok ? all.edits.length : 0;
  return (
    <Modal title={'Rename “' + n.name + '”'} onClose={close}>
      <form onSubmit={go}>
        <div class="field"><label class="lbl" for="renameName">File name</label><input id="renameName" name="note-file" value={name} onInput={e => setName(e.currentTarget.value)} autoFocus onFocus={e => e.currentTarget.select()} /><NameCheck name={name === n.name ? '' : name} exclude={path} /></div>
        {oldTitle && (
          <div class="field">
            <label class="lbl" for="renameTitle">Title at the top of the note <span class="muted small">(the first # heading)</span></label>
            <input id="renameTitle" name="note-title" value={shownTitle} onInput={e => { setFollow(false); setTitle(e.currentTarget.value); }} />
            {follow && <div class="small muted">It follows the file name, because they were the same. Type here to change it separately.</div>}
          </div>
        )}
        {plan.renamed && (
          <div class="set-group" style="margin-top:10px">
            <label class="set-opt"><input type="checkbox" id="renameLinks" checked={links} onChange={e => setLinks(e.currentTarget.checked)} /> <span><strong>Update the links to it</strong> <span class="muted small">{inOthers ? inOthers + ' link' + (inOthers === 1 ? '' : 's') + ' in ' + notesWith + ' other note' + (notesWith === 1 ? '' : 's') : 'no other note links to it'}. Without this, those links will point at nothing.</span></span></label>
            <label class="set-opt"><input type="checkbox" id="renameAlias" checked={alias} disabled={!links || !inOthers} onChange={e => setAlias(e.currentTarget.checked)} /> <span><strong>Keep showing the old name in those links</strong> <span class="muted small">(they become [[{plan.newName}|{plan.oldName}]])</span></span></label>
          </div>
        )}
        {plan.ok && plan.renamed && <div class="small muted" id="renamePath" style="margin-top:8px">The file becomes <code>{plan.newPath.split('/').slice(-2).join('/')}</code>. It is a pending change until you push.</div>}
        {plan.error && <div class="claude-error small" id="renameError" role="alert" style="margin-top:8px">{plan.error}</div>}
        <div class="modal-actions"><button type="button" class="btn" onClick={close}>Cancel</button><button type="submit" class="btn btn-primary" id="renameGo" disabled={!plan.ok}>Rename</button></div>
      </form>
    </Modal>
  );
}
