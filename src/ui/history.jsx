import { useMemo, useState } from 'preact/hooks';
import { CHANGELOG, BEFORE_V2, KINDS } from '../core/changelog.js';

const KIND_CLASS = { new: 'pill-good', improved: 'pill-warn', fixed: 'pill-bad' };

function matches(r, ql, kind) {
  const hay = r.version + ' ' + r.title + ' ' + (r.note || '');
  const titleHit = ql && hay.toLowerCase().includes(ql);
  const changes = r.changes.filter(([k, t]) => (kind === 'all' || k === kind) && (!ql || titleHit || t.toLowerCase().includes(ql)));
  return changes;
}

function Release({ r, open, onToggle, here, changes }) {
  const counts = { new: 0, improved: 0, fixed: 0 };
  r.changes.forEach(([k]) => { counts[k]++; });
  return (
    <section class={'rel' + (open ? ' open' : '')} data-version={r.version} aria-label={'Version ' + r.version}>
      <button type="button" class="rel-head" aria-expanded={open} onClick={onToggle}>
        <span class="rel-caret" aria-hidden="true">{open ? '▾' : '▸'}</span>
        <span class="rel-ver">{r.version}</span>
        <span class="rel-title">{r.title}</span>
        {r.status === 'experimental' && <span class="pill pill-warn" title="A trial: it can be switched off or rolled back">Experimental</span>}
        {r.status === 'rolled-back' && <span class="pill pill-bad" title="It was tried and taken out; it stays here for the record">Rolled back</span>}
        {here && <span class="pill pill-good" title="The version you are running">You are here</span>}
        <span class="rel-meta small muted">{r.date}{' · '}{Object.keys(KINDS).filter(k => counts[k]).map(k => counts[k] + ' ' + KINDS[k].toLowerCase()).join(', ')}</span>
      </button>
      {open && (
        <div class="rel-body">
          {r.note && <div class="small muted rel-note">{r.note}</div>}
          <ul class="rel-list">
            {changes.map(([k, t], i) => <li key={i}><span class={'pill ' + KIND_CLASS[k]}>{KINDS[k]}</span><span>{t}</span></li>)}
          </ul>
        </div>
      )}
    </section>
  );
}

export function HistoryPage() {
  const [q, setQ] = useState('');
  const [kind, setKind] = useState('all');
  const [open, setOpen] = useState(() => ({ [CHANGELOG[0].version]: true }));
  const ql = q.trim().toLowerCase();
  const filtering = !!ql || kind !== 'all';
  const rows = useMemo(() => CHANGELOG.map(r => ({ r, changes: matches(r, ql, kind) })).filter(x => !filtering || x.changes.length), [ql, kind]);
  const before = useMemo(() => BEFORE_V2.map(r => ({ r, changes: matches(r, ql, kind) })).filter(x => !filtering || x.changes.length), [ql, kind]);
  const total = CHANGELOG.reduce((n, r) => n + r.changes.length, 0) + BEFORE_V2.reduce((n, r) => n + r.changes.length, 0);
  const isOpen = v => (filtering ? true : !!open[v]);
  const toggle = v => setOpen({ ...open, [v]: !open[v] });
  const setAll = on => { const m = {}; [...CHANGELOG, ...BEFORE_V2].forEach(r => { m[r.version] = on; }); setOpen(m); };
  return (
    <>
      <div class="page-head">
        <div>
          <h2 aria-level="1">Version history</h2>
          <div class="muted small" id="histStats">You are on {__DMF_VERSION__}. {CHANGELOG.length} releases of V2, {total} changes, and what came before.</div>
        </div>
        <div class="row-actions">
          <button class="btn btn-sm" id="histExpand" onClick={() => setAll(true)}>Expand all</button>
          <button class="btn btn-sm" id="histCollapse" onClick={() => setAll(false)}>Collapse all</button>
        </div>
      </div>
      <div class="hist-tools">
        <input id="histSearch" type="search" value={q} onInput={e => setQ(e.currentTarget.value)} placeholder="Search every change (for example: graph, push, tabs)" aria-label="Search the version history" />
        <div class="chips" role="group" aria-label="Kind of change">
          {[['all', 'All'], ...Object.entries(KINDS)].map(([k, l]) => (
            <button key={k} type="button" class={'chip-btn' + (kind === k ? ' on' : '')} data-kind={k} aria-pressed={kind === k} onClick={() => setKind(k)}>{l}</button>
          ))}
        </div>
      </div>
      <div class="rel-list-wrap">
        {rows.map(x => <Release key={x.r.version} r={x.r} changes={x.changes} open={isOpen(x.r.version)} onToggle={() => toggle(x.r.version)} here={x.r.version === __DMF_VERSION__} />)}
        {before.length > 0 && <h3 class="rel-group">Before V2</h3>}
        {before.map(x => <Release key={x.r.version} r={x.r} changes={x.changes} open={isOpen(x.r.version)} onToggle={() => toggle(x.r.version)} here={false} />)}
        {!rows.length && !before.length && <div class="muted small" style="padding:8px">Nothing in the history matches “{q}”.</div>}
      </div>
    </>
  );
}
