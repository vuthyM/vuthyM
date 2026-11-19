import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'preact/hooks';
import { S, set, toast, getIndex } from './store.js';
import { poolsMap, addPoolTables, removePoolRow, saveCustomTable, snapshotInfo, claudeOn, claudeBusy, updateSetting, createNote, pageKinds } from './actions.js';
import { getGenState } from './genstate.js';
import { defaultDest, suggestName, genToNote } from '../core/templates.js';
import { GENS_BY_ID, fieldMeta } from '../core/generators.js';
import { TABLE_SYSTEM, STRENGTHS, campaignContext, liveHasSecrets, refillPrompt, tablePrompt, parseAnswer, parseTables, freshRows, POOLS_NOTE, TABLES_FOLDER } from '../core/pools.js';
import { Modal } from './common.jsx';
import { snapshotContext, describeSnapshot, SECRETS_HEADING } from '../core/snapshot.js';

const close = () => set({ dialog: null });

/* one row of an answer, to read and edit: it wraps and grows to show all of its text (it is one line of text, so Enter does not add a new line) */
function RowText({ value, onChange, label }) {
  const ref = useRef();
  const fit = () => { const t = ref.current; if (!t) return; t.style.height = 'auto'; t.style.height = (t.scrollHeight + t.offsetHeight - t.clientHeight) + 'px'; };
  useLayoutEffect(fit, [value]);
  useEffect(() => {
    if (!ref.current || typeof ResizeObserver === 'undefined') return;
    let w = ref.current.clientWidth;
    const ro = new ResizeObserver(() => { const nw = ref.current && ref.current.clientWidth; if (nw !== w) { w = nw; fit(); } });
    ro.observe(ref.current);
    return () => ro.disconnect();
  }, []);
  return <textarea ref={ref} class="ct-text" rows={1} value={value} aria-label={label} spellcheck
    onInput={e => onChange(e.currentTarget.value.replace(/\s*\n+\s*/g, ' '))}
    onKeyDown={e => { if (e.key === 'Enter') e.preventDefault(); }} />;
}

/* Claude writes rows for a generator's table ("refill"), or a whole new table to roll on ("make"). Nothing is sent until you press
   Send, the text that will be sent is one click away, and nothing is added until you tick the rows you want. */
export function TableDialog({ d }) {
  const make = d.mode === 'make';
  const g = make ? null : GENS_BY_ID[d.gid];
  const fields = make ? [] : g.fields.filter(f => fieldMeta(g, f));
  const idx = getIndex();
  const [chosen, setChosen] = useState(() => new Set(fields.length ? [fields[0].key] : []));
  const [count, setCount] = useState(5);
  const [die, setDie] = useState(12);
  const [desc, setDesc] = useState('');
  const [direction, setDirection] = useState('');
  const [bias, setBias] = useState(true);
  const [busy, setBusy] = useState(false);
  const [secs, setSecs] = useState(0);
  const [error, setError] = useState('');
  const [result, setResult] = useState(null);       // make: { rows: [{ text, on }], dropped, asked };  refill: { tables: [{ key, label, rows, dropped }] }
  const [title, setTitle] = useState('');
  // refill only: also make a note (a new NPC, a new location...) from the rows, with the name of the thing you are looking at
  const kinds = make ? [] : pageKinds().filter(k => k.type !== 'player');
  const st0 = make ? null : getGenState(g);
  const dd = make ? '' : defaultDest(g);
  const [rowsOn, setRowsOn] = useState(true);
  const [noteOn, setNoteOn] = useState(false);
  const [noteKind, setNoteKind] = useState(kinds.some(k => k.type === dd) ? dd : (kinds[0] ? kinds[0].type : ''));
  const [noteName, setNoteName] = useState(make ? '' : suggestName(g, st0.vals));
  const [usePick, setUsePick] = useState({});            // per table: the row chosen for the note ('' keeps the one rolled on the page)
  const picked = fields.filter(f => chosen.has(f.key));
  const mineOf = key => ((poolsMap()[g.id + '/' + key] || {}).rows || []);
  const snap = snapshotInfo();                       // the campaign snapshot, if one has been made
  const [src, setSrc] = useState(snap ? 'snapshot' : 'live');
  const [secrets, setSecrets] = useState(true);
  const strength = S.settings.inspireStrength || 'strong';
  const useSnap = bias && src === 'snapshot' && !!snap;
  const hasSecrets = useSnap ? !!(snap.snap && Object.keys(snap.snap.sections).some(k => k.toLowerCase().startsWith('secrets'))) : liveHasSecrets(idx);
  const context = useMemo(() => (!bias ? '' : useSnap ? snapshotContext(snap.text, { secrets }) : campaignContext(idx, S.campaign, { secrets })), [bias, useSnap, secrets, snap ? snap.text.length : 0, S.dataRev]);
  const mineSig = picked.map(f => mineOf(f.key).length).join(',');
  const prompt = useMemo(() => {
    if (make) return tablePrompt({ description: desc || '(describe the table)', die, context, strength });
    if (!picked.length) return '(tick at least one table)';
    return refillPrompt({ gen: g.name, tables: picked.map(f => ({ key: f.key, label: f.label, samples: fieldMeta(g, f).samples, mine: mineOf(f.key) })), count, context, direction, strength });
  }, [make, desc, die, context, strength, [...chosen].join(), count, direction, mineSig]);

  useEffect(() => {
    if (!busy) return;
    setSecs(0);
    const t = setInterval(() => setSecs(x => x + 1), 1000);
    return () => clearInterval(t);
  }, [busy]);

  const busyClaude = claudeBusy();
  const ready = !busyClaude && (make ? desc.trim().length > 2 : picked.length > 0);
  const toggle = key => { const n = new Set(chosen); if (n.has(key)) n.delete(key); else n.add(key); setChosen(n); setResult(null); };
  const send = async e => {
    if (e && e.preventDefault) e.preventDefault();
    if (busy || !ready) return;
    setBusy(true); setError(''); setResult(null);
    try {
      const answer = await S.vault.claudeAsk(prompt, TABLE_SYSTEM);
      if (make) {
        const parsed = parseAnswer(answer);
        const { rows, dropped } = freshRows(parsed.rows, []);
        if (!rows.length) throw new Error('Claude answered, but no usable rows came back. Try again.');
        setTitle(parsed.title || (desc.trim().slice(0, 60)));
        setResult({ rows: rows.map(text => ({ text, on: true })), dropped, asked: die });
      } else {
        const got = parseTables(answer, picked.map(f => f.key));
        const tables = picked.map(f => {
          const { rows, dropped } = freshRows(got[f.key] || [], [...mineOf(f.key), ...fieldMeta(g, f).samples]);
          return { key: f.key, field: f, label: f.label, rows: rows.map(text => ({ text, on: true })), dropped };
        });
        if (!tables.some(t => t.rows.length)) throw new Error('Claude answered, but no usable rows came back. Try again.');
        setResult({ tables });
      }
    } catch (err) { setError(err.message); }
    setBusy(false);
  };
  const editRow = (ti, i, patch) => setResult({ ...result, tables: result.tables.map((t, a) => (a === ti ? { ...t, rows: t.rows.map((r, j) => (j === i ? { ...r, ...patch } : r)) } : t)) });
  const editMake = (i, patch) => setResult({ ...result, rows: result.rows.map((r, j) => (j === i ? { ...r, ...patch } : r)) });
  const chosenMake = result && make ? result.rows.filter(r => r.on && r.text.trim()) : [];
  const chosenTables = result && !make ? result.tables.map(t => ({ ...t, keep: t.rows.filter(r => r.on && r.text.trim()).map(r => r.text.trim()) })) : [];
  const total = make ? chosenMake.length : chosenTables.reduce((n, t) => n + t.keep.length, 0);
  /* the one row used in the note for a table: the one picked, else the first ticked, and only a ticked row counts */
  const useFor = t => { const k = t.keep; const p = usePick[t.key]; if (p === '') return ''; return p && k.includes(p) ? p : (k[0] || ''); };
  const noteReady = !make && noteOn && !!noteKind && noteName.trim().length > 0;
  const canSave = make ? total > 0 : ((rowsOn && total > 0) || noteReady);
  const save = () => {
    if (!canSave) return;
    if (make) {
      saveCustomTable(title.trim() || 'Table', chosenMake.map(r => r.text.trim()));
      toast('Saved the table to “' + TABLES_FOLDER + '”. Push to write it to your vault.');
    } else {
      const said = [];
      if (rowsOn && total > 0) {
        addPoolTables(g, chosenTables.map(t => ({ field: t.field, rows: t.keep })));
        const n = chosenTables.filter(t => t.keep.length).length;
        said.push('Added ' + total + ' row' + (total === 1 ? '' : 's') + ' to ' + (n === 1 ? g.name + ' · ' + chosenTables.find(t => t.keep.length).label : n + ' ' + g.name + ' tables'));
      }
      if (noteReady) {
        const st = getGenState(g);
        const vals = { ...st.vals };
        for (const t of chosenTables) {
          const row = useFor(t);
          if (!row) continue;
          vals[t.key] = Array.isArray(vals[t.key]) ? [row, ...vals[t.key].slice(1)] : row;
        }
        const n = genToNote(g, { vals, opts: st.opts }, noteKind, noteName.trim());
        createNote(noteKind, noteName.trim(), { fm: n.fm, body: n.body });
        said.push('Made the ' + (kinds.find(k => k.type === noteKind) || { label: 'note' }).label.toLowerCase() + ' note “' + noteName.trim() + '”');
      }
      toast(said.join(' and ') + '. Push to write ' + (said.length > 1 ? 'them' : 'it') + ' to your vault.');
    }
    close();
  };
  const setAll = (ti, on) => setResult({ ...result, tables: result.tables.map((t, a) => (a === ti ? { ...t, rows: t.rows.map(r => ({ ...r, on })) } : t)) });

  return (
    <Modal title={make ? 'Make a table with Claude' : 'Refill “' + g.name + '” with Claude'} onClose={close} wide focusFirst>
      <form onSubmit={send}>
        {make ? (
          <>
            <label class="lbl" for="ctDesc">What is the table for?</label>
            <input id="ctDesc" value={desc} onInput={e => setDesc(e.currentTarget.value)} placeholder="e.g. things found in a drowned chapel" disabled={busy} />
            <div class="ct-row"><label class="small">Rolled with <select id="ctDie" value={String(die)} onChange={e => setDie(+e.currentTarget.value)} disabled={busy} style="width:auto;display:inline-block">{[6, 8, 10, 12, 20, 100].map(n => <option key={n} value={String(n)}>d{n}</option>)}</select></label></div>
          </>
        ) : (
          <>
            <div class="row-actions" style="align-items:center;margin-bottom:4px">
              <span class="lbl" style="margin:0">Tables to refill</span>
              <button type="button" class="linkish small" id="ctAll" disabled={busy} onClick={() => { setChosen(new Set(fields.map(f => f.key))); setResult(null); }}>Select all</button>
              <button type="button" class="linkish small" id="ctNone" disabled={busy} onClick={() => { setChosen(new Set()); setResult(null); }}>None</button>
            </div>
            <div class="ct-fields" role="group" aria-label="Tables to refill">
              {fields.map(f => {
                const n = mineOf(f.key).length;
                return <label key={f.key} class={'ct-field' + (chosen.has(f.key) ? ' on' : '')}><input type="checkbox" data-ct-field={f.key} checked={chosen.has(f.key)} disabled={busy} onChange={() => toggle(f.key)} /> {f.label}{n > 0 && <span class="muted small"> · {n} yours</span>}</label>;
              })}
            </div>
            <div class="ct-row">
              <label class="small">New rows for each table <select id="ctCount" value={String(count)} onChange={e => setCount(+e.currentTarget.value)} disabled={busy} style="width:auto;display:inline-block">{[5, 10, 20, 30, 50].map(n => <option key={n} value={String(n)}>{n}</option>)}</select></label>
              <span class="small muted" id="ctTotal">{picked.length ? picked.length + ' table' + (picked.length === 1 ? '' : 's') + ' × ' + count + ' = up to ' + picked.length * count + ' rows, in one request' : 'Tick at least one table'}</span>
            </div>
            {picked.length * count > 150 && <div class="small" style="color:var(--warn,var(--accent));margin-top:4px" id="ctBig">That is a lot for one answer and may take a minute or two. Fewer rows per table is quicker.</div>}
            <label class="lbl" for="ctDir" style="margin-top:8px">Anything in particular? <span class="muted small">(optional)</span></label>
            <input id="ctDir" value={direction} onInput={e => setDirection(e.currentTarget.value)} placeholder="e.g. more rural, less grimdark" disabled={busy} />
            <div class="small muted" style="margin-top:4px">Rows are mixed in with the built-in ones when you roll.</div>
            {picked.length === 1 && mineOf(picked[0].key).length > 0 && (
              <details class="ct-mine"><summary class="small muted">Your {mineOf(picked[0].key).length} rows</summary>
                <ul class="ct-list">{mineOf(picked[0].key).map((r, i) => <li key={r + i}><span>{r}</span><button type="button" class="cs-icon" aria-label={'Remove ' + r} title="Remove this row" onClick={() => removePoolRow(g.id + '/' + picked[0].key, i)}>✕</button></li>)}</ul>
              </details>
            )}
          </>
        )}
        <label class="set-opt ct-bias" style="margin-top:10px">
          <input type="checkbox" id="ctBias" checked={bias} onChange={e => setBias(e.currentTarget.checked)} disabled={busy} />
          <span><strong>Use my campaign as inspiration</strong> <span class="muted small">{useSnap ? 'Sends your campaign snapshot' : 'Sends the overview and the names and first lines of your NPCs, locations, factions and plot threads'} ({context.length.toLocaleString()} characters), so the rows suit your world. Turn it off for generic rows.</span></span>
        </label>
        {bias && (
          <div class="ct-src" id="ctStrengthRow">
            <label class="small">How strongly <select id="ctStrength" value={strength} disabled={!!busy} onChange={e => updateSetting('inspireStrength', e.currentTarget.value)} style="width:auto;display:inline-block">{STRENGTHS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select> <span class="muted">{strength === 'max' ? 'every row names a person, place or thread from your campaign' : strength === 'strong' ? 'at least two rows in three name something from your campaign' : 'the campaign only colours the rows'}</span></label>
            {(!snap || src === 'live') && hasSecrets && <label class="small"><input type="checkbox" id="ctSecretsLive" checked={secrets} disabled={!!busy} onChange={e => setSecrets(e.currentTarget.checked)} /> Include the DM-only secrets from my notes</label>}
          </div>
        )}
        {bias && snap && (
          <div class="ct-src" id="ctSrcRow">
            <label class="small"><input type="radio" name="ctsrc" id="ctSrcSnap" checked={src === 'snapshot'} disabled={!!busy} onChange={() => setSrc('snapshot')} /> Use the snapshot <span class="muted">({describeSnapshot(snap.snap, snap.cmp)})</span></label>
            <label class="small"><input type="radio" name="ctsrc" id="ctSrcLive" checked={src === 'live'} disabled={!!busy} onChange={() => setSrc('live')} /> Build from my notes now</label>
            {src === 'snapshot' && hasSecrets && <label class="small"><input type="checkbox" id="ctSecrets" checked={secrets} disabled={!!busy} onChange={e => setSecrets(e.currentTarget.checked)} /> Include the DM-only secrets</label>}
            {src === 'snapshot' && snap.cmp && snap.cmp.worth && <span class="small" id="ctStale" style="color:var(--accent-text,var(--accent))">The campaign has moved on since it was made. You can refresh it in Menu, Settings.</span>}
          </div>
        )}
        {bias && !snap && claudeOn() && <div class="small muted" id="ctNoSnap" style="margin-top:4px">Tip: a campaign snapshot (Settings, Claude) gives Claude a fuller picture than names and first lines.</div>}
        <details class="claude-sent" id="ctSent" style="margin-top:8px">
          <summary class="small muted">What will be sent to Claude ({prompt.length.toLocaleString()} characters)</summary>
          <pre class="claude-report" id="ctPrompt" style="white-space:pre-wrap">{prompt}</pre>
        </details>
        {busyClaude && <div class="small" id="ctBusy" style="margin-top:8px;color:var(--accent-text,var(--accent))">Claude is busy making the campaign snapshot. You can send this when it finishes (progress is at the top).</div>}
        <div class="modal-actions" style="margin-top:10px">
          <button type="button" class="btn" onClick={close}>Close</button>
          <button type="submit" class="btn btn-primary" id="ctSend" disabled={busy || !ready}>{busy ? 'Waiting for Claude… ' + secs + 's' : result || error ? 'Ask again' : 'Send to Claude'}</button>
        </div>
      </form>
      {error && <div class="claude-error small" id="ctError" role="alert">{error}</div>}
      {result && make && (
        <div id="ctResult" style="margin-top:12px">
          <div class="field"><label class="lbl" for="ctTitle">Name of the table</label><input id="ctTitle" value={title} onInput={e => setTitle(e.currentTarget.value)} /></div>
          <label class="lbl">Tick the rows to keep <span class="muted small">(you can edit any of them)</span></label>
          <ul class="ct-review">
            {result.rows.map((r, i) => (
              <li key={i}>
                <input type="checkbox" aria-label={'Keep row ' + (i + 1)} checked={r.on} onChange={e => editMake(i, { on: e.currentTarget.checked })} />
                <span class="ct-n mono">{i + 1}</span>
                <RowText value={r.text} onChange={v => editMake(i, { text: v })} label={'Row ' + (i + 1)} />
              </li>
            ))}
          </ul>
          {result.dropped > 0 && <div class="small muted">{result.dropped} repeat{result.dropped === 1 ? ' was' : 's were'} left out.</div>}
          {total !== result.asked && <div class="small muted">A d{result.asked} table wants {result.asked} rows; you have {total} ticked.</div>}
          <div class="row-actions" style="margin-top:8px">
            <button type="button" class="btn btn-primary" id="ctSave" disabled={!total} onClick={save}>Save the table</button>
            <button type="button" class="btn btn-sm" onClick={() => setResult({ ...result, rows: result.rows.map(r => ({ ...r, on: !total })) })}>{total ? 'Untick all' : 'Tick all'}</button>
          </div>
          <div class="small muted" style="margin-top:6px">Saved as a note in “{TABLES_FOLDER}” in your campaign folder. It is a pending change until you push.</div>
        </div>
      )}
      {result && !make && (
        <div id="ctResult" style="margin-top:12px">
          <label class="lbl">Tick the rows to add <span class="muted small">(you can edit any of them)</span></label>
          {result.tables.map((t, ti) => (
            <section class="ct-table" key={t.key} data-ct-table={t.key}>
              <div class="row-actions" style="align-items:center"><h4 class="ct-th">{t.label}</h4><span class="small muted">{t.rows.filter(r => r.on).length} of {t.rows.length} ticked{t.dropped > 0 ? ' · ' + t.dropped + ' repeat' + (t.dropped === 1 ? '' : 's') + ' left out' : ''}</span><button type="button" class="linkish small" onClick={() => setAll(ti, !t.rows.some(r => r.on))}>{t.rows.some(r => r.on) ? 'untick all' : 'tick all'}</button></div>
              {t.rows.length ? (
                <ul class="ct-review">
                  {t.rows.map((r, i) => (
                    <li key={i}>
                      <input type="checkbox" aria-label={'Keep ' + t.label + ' row ' + (i + 1)} checked={r.on} onChange={e => editRow(ti, i, { on: e.currentTarget.checked })} />
                      <RowText value={r.text} onChange={v => editRow(ti, i, { text: v })} label={t.label + ' row ' + (i + 1)} />
                    </li>
                  ))}
                </ul>
              ) : <div class="small muted" style="padding:4px 0">Claude gave no new rows for this table. Ask again, or try fewer tables at once.</div>}
            </section>
          ))}
          <div class="ct-note" id="ctNoteBox">
            <label class="set-opt"><input type="checkbox" id="ctRowsOn" checked={rowsOn} onChange={e => setRowsOn(e.currentTarget.checked)} /><span><strong>Add the rows to the {g.name}'s tables</strong> <span class="muted small">so they turn up when you roll. Saved in your “{POOLS_NOTE}” note.</span></span></label>
            <label class="set-opt"><input type="checkbox" id="ctNoteOn" checked={noteOn} disabled={!kinds.length} onChange={e => setNoteOn(e.currentTarget.checked)} /><span><strong>Also make a note from these</strong> <span class="muted small">a new note in your campaign with the {g.name.toLowerCase()} you are looking at ({st0 ? suggestName(g, st0.vals) : ''}), using one row you pick for each table.</span></span></label>
            {noteOn && (
              <div class="ct-notefields" id="ctNoteFields">
                <div class="row-actions" style="align-items:center">
                  <label class="small">Category <select id="ctNoteKind" value={noteKind} onChange={e => setNoteKind(e.currentTarget.value)} style="width:auto;display:inline-block">{kinds.map(k => <option key={k.type} value={k.type}>{k.plural}</option>)}</select></label>
                  <label class="small" style="flex:1;min-width:200px">Name <input id="ctNoteName" value={noteName} onInput={e => setNoteName(e.currentTarget.value)} /></label>
                </div>
                {chosenTables.filter(t => t.keep.length).map(t => (
                  <label class="small ct-use" key={t.key}>{t.label} for the note <select data-ct-use={t.key} value={useFor(t)} onChange={e => setUsePick({ ...usePick, [t.key]: e.currentTarget.value })}>
                    <option value="">Keep the one on the page ({String(Array.isArray(st0.vals[t.key]) ? st0.vals[t.key][0] : st0.vals[t.key]).slice(0, 60)})</option>
                    {t.keep.map(r => <option key={r} value={r}>{r.length > 90 ? r.slice(0, 89) + '…' : r}</option>)}
                  </select></label>
                ))}
                {!noteName.trim() && <div class="small" style="color:var(--accent-text,var(--accent))">Give the note a name.</div>}
              </div>
            )}
          </div>
          <div class="row-actions" style="margin-top:8px">
            <button type="button" class="btn btn-primary" id="ctSave" disabled={!canSave} onClick={save}>{[rowsOn && total > 0 ? 'Add ' + total + ' row' + (total === 1 ? '' : 's') + (chosenTables.filter(t => t.keep.length).length > 1 ? ' to ' + chosenTables.filter(t => t.keep.length).length + ' tables' : '') : '', noteReady ? 'Make the note' : ''].filter(Boolean).join(' and ') || 'Nothing to save'}</button>
          </div>
          <div class="small muted" style="margin-top:6px">Both are pending changes until you push.</div>
        </div>
      )}
    </Modal>
  );
}
