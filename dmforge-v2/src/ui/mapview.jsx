import { useEffect, useRef, useState } from 'preact/hooks';
import { useApp, getIndex, set, toast } from './store.js';
import { assetUrl } from './common.jsx';
import { saveMap, openMapAt, goto, openAssetTab, jumpToLine } from './actions.js';
import { locationTree, hereOf } from '../core/locations.js';
import { parsePins, pinTitle, headingLine, placeOf, parseScale, metresBetween, scaleFromLine, fmtDistance, walkingTime, scaleFromMetres, mapNoteFor, mapsOfPlace } from '../core/maps.js';
import { subtitle } from './notes.jsx';
import { basename } from '../core/util.js';

const pct = (n, d) => Math.max(0, Math.min(100, (n / d) * 100));

/* a read-only look at a map with its pins (on a place's page); click it to open the map */
export function MapPreview({ image, pins, onOpen }) {
  const [url, setUrl] = useState(null);
  useEffect(() => { let live = true; assetUrl(image).then(u => { if (live) setUrl(u); }).catch(() => {}); return () => { live = false; }; }, [image]);
  return (
    <button class="map-preview" data-mappreview={basename(image)} onClick={onOpen} aria-label={'Open the map ' + basename(image)}>
      <span class="map-stage">{url ? <img src={url} alt={basename(image)} draggable={false} /> : <span class="muted small">…</span>}
        {pins.filter(p => !p.secret).map((p, i) => <i key={i} class="map-dot" style={'left:' + p.x + '%;top:' + p.y + '%'} title={pinTitle(p)} />)}</span>
    </button>
  );
}

export function MapViewer({ path }) {
  const s = useApp();
  const idx = getIndex();
  const note = mapNoteFor(idx, path);
  const pins = note ? parsePins(note.body) : [];
  const place = note ? placeOf(idx, note) : null;
  const scale = note && note.fm && note.fm.scale ? parseScale(String(note.fm.scale)) : null;
  const tree = locationTree(idx);
  const stage = useRef(), imgRef = useRef();
  const [url, setUrl] = useState(null);
  const [mode, setMode] = useState('view');                // view | add | measure
  const [zoom, setZoom] = useState(1);
  const [sel, setSel] = useState(-1);
  const [draft, setDraft] = useState(null);                // { x, y, name, secret }
  const [armed, setArmed] = useState('');                  // a place waiting to be put on the map
  const [measure, setMeasure] = useState([]);              // up to two points { x, y }
  const [labels, setLabels] = useState(true);
  const [player, setPlayer] = useState(false);
  const [drag, setDrag] = useState(null);                  // { i, x, y }
  const [real, setReal] = useState('');
  const [dims, setDims] = useState({ w: 800, h: 500 });
  useEffect(() => {
    const el = stage.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(() => setDims(d => (Math.abs(d.w - el.clientWidth) > 2 || Math.abs(d.h - el.clientHeight) > 2 ? { w: el.clientWidth, h: el.clientHeight } : d)));
    ro.observe(el);
    return () => ro.disconnect();
  }, [url]);
  useEffect(() => { let live = true; setUrl(null); assetUrl(path).then(u => { if (live) setUrl(u); }).catch(() => {}); return () => { live = false; }; }, [path]);

  // opened from a place's page: show its pin
  useEffect(() => {
    const f = s.mapFocus;
    if (!f || f.image !== path) return;
    if (f.arm) { const pn = idx.byPath.get(f.place); setMode('add'); setArmed(pn ? pn.name : f.place); set({ mapFocus: null }); return; }
    if (!pins.length) return;
    const i = pins.findIndex(p => p.place && (idx.resolve(p.place) || {}).path === f.place);
    if (i >= 0) { setSel(i); setMode('view'); }
    set({ mapFocus: null });
  }, [s.mapFocus, pins.length]);

  const save = change => saveMap(path, change);
  const savePins = next => save({ pins: next });
  const locations = idx.byType.location || [];
  const pinnedPaths = new Set(pins.map(p => (p.place && idx.resolve(p.place) ? idx.resolve(p.place).path : '')));
  const candidates = (place ? [...tree.descendants(place)] : locations).filter(l => !pinnedPaths.has(l.path));
  const aspect = () => { const im = imgRef.current; return im && im.clientHeight ? im.clientWidth / im.clientHeight : 1; };
  const at = e => { const r = stage.current.getBoundingClientRect(); return { x: Math.round(pct(e.clientX - r.left, r.width) * 10) / 10, y: Math.round(pct(e.clientY - r.top, r.height) * 10) / 10 }; };
  const visible = pins.map((p, i) => ({ p, i })).filter(({ p }) => !(player && p.secret));
  const pinAt = i => (drag && drag.i === i ? { ...pins[i], x: drag.x, y: drag.y } : pins[i]);

  // names are shown unless they would sit on top of another (the selected pin's name always wins); hovering shows any of them
  const shownLabels = new Set();
  if (labels) {
    const placed = [];
    for (const { i } of [...visible].sort((a, b) => (b.i === sel) - (a.i === sel))) {
      const q = pinAt(i), t = pinTitle(q);
      const r = { x: (q.x / 100) * dims.w + 16, y: (q.y / 100) * dims.h - 10, w: t.length * 7 + 16, h: 20 };
      if (i === sel || !placed.some(o => r.x < o.x + o.w && r.x + r.w > o.x && r.y < o.y + o.h && r.y + r.h > o.y)) { placed.push(r); shownLabels.add(i); }
    }
  }
  const clickMap = e => {
    if (drag) return;
    const pt = at(e);
    if (mode === 'add') {
      if (armed) { savePins([...pins, { x: pt.x, y: pt.y, place: armed, label: '', secret: false, note: '' }]); toast(armed + ' pinned.'); setArmed(''); return; }
      setDraft({ ...pt, name: '', secret: false }); setSel(-1);
    } else if (mode === 'measure') setMeasure(m => (m.length >= 2 ? [pt] : [...m, pt]));
    else setSel(-1);
  };
  const addDraft = e => {
    e.preventDefault();
    const n = draft.name.trim();
    if (!n) return;
    const l = idx.resolve(n);
    savePins([...pins, { x: draft.x, y: draft.y, place: l && l.type === 'location' ? l.name : '', label: l && l.type === 'location' ? '' : n, secret: draft.secret, note: '' }]);
    setDraft(null);
  };
  // pins: click selects (or picks a measuring point), dragging moves
  const down = (e, i) => {
    e.stopPropagation();
    const sx = e.clientX, sy = e.clientY;
    let moved = false;
    const r = stage.current.getBoundingClientRect();
    const mv = ev => {
      if (!moved && Math.hypot(ev.clientX - sx, ev.clientY - sy) < 4) return;
      moved = true;
      setDrag({ i, x: Math.round(pct(ev.clientX - r.left, r.width) * 10) / 10, y: Math.round(pct(ev.clientY - r.top, r.height) * 10) / 10 });
    };
    const up = ev => {
      window.removeEventListener('pointermove', mv); window.removeEventListener('pointerup', up);
      if (moved) {
        const x = Math.round(pct(ev.clientX - r.left, r.width) * 10) / 10, y = Math.round(pct(ev.clientY - r.top, r.height) * 10) / 10;
        savePins(pins.map((p, k) => (k === i ? { ...p, x, y } : p)));
        setDrag(null); setSel(i);
      } else if (mode === 'measure') setMeasure(m => (m.length >= 2 ? [{ x: pins[i].x, y: pins[i].y }] : [...m, { x: pins[i].x, y: pins[i].y }]));
      else { setSel(i); setDraft(null); }
    };
    window.addEventListener('pointermove', mv); window.addEventListener('pointerup', up);
  };
  /* a pin that points at a section ([[Rift Keep#2.1. The Hall]]) opens that note at the section */
  const openPin = pin => {
    const target = pin && pin.place ? idx.resolve(pin.place) : null;
    if (!target) return;
    goto(target.path, { newTab: true });
    const line = pin.heading ? headingLine(target.body, pin.heading) : -1;
    if (line >= 0) jumpToLine(target.path, line);
  };
  const patchPin = (i, patch) => savePins(pins.map((p, k) => (k === i ? { ...p, ...patch } : p)));
  const removePin = i => { savePins(pins.filter((_, k) => k !== i)); setSel(-1); };
  const cur = sel >= 0 ? pins[sel] : null;
  const curPlace = cur && cur.place ? idx.resolve(cur.place) : null;
  const curMaps = curPlace ? mapsOfPlace(idx, curPlace) : [];
  const up = place ? tree.ancestors(place).slice().reverse().map(a => ({ a, m: mapsOfPlace(idx, a)[0] })).find(x => x.m) : null;
  const dist = measure.length === 2 ? metresBetween(measure[0], measure[1], scale, aspect()) : null;
  const setScale = e => {
    e.preventDefault();
    const r = parseScale(real);
    if (!r || measure.length < 2) { toast('Type a distance such as 5 km, 300 m or 2 mi.', true); return; }
    const w = scaleFromLine(measure[0], measure[1], aspect(), r.metres);
    if (!w) { toast('Pick two different points first.', true); return; }
    save({ scale: scaleFromMetres(w) });
    setReal('');
    toast('Scale saved: the picture is about ' + scaleFromMetres(w) + ' wide.');
  };
  const here = curPlace ? hereOf(idx, curPlace, tree) : null;

  return (
    <div class="map-view" id="mapView">
      <div class="map-bar" role="toolbar" aria-label="Map tools">
        <button class={'btn btn-sm' + (mode === 'add' ? ' btn-primary' : '')} id="mapAdd" aria-pressed={mode === 'add'} onClick={() => { setMode(mode === 'add' ? 'view' : 'add'); setDraft(null); setArmed(''); }}>＋ Pin places</button>
        <button class={'btn btn-sm' + (mode === 'measure' ? ' btn-primary' : '')} id="mapMeasure" aria-pressed={mode === 'measure'} onClick={() => { setMode(mode === 'measure' ? 'view' : 'measure'); setMeasure([]); }}>Measure</button>
        <button class={'btn btn-sm' + (labels ? ' on' : '')} id="mapLabels" aria-pressed={labels} onClick={() => setLabels(!labels)}>Labels</button>
        <button class={'btn btn-sm' + (player ? ' btn-primary' : '')} id="mapPlayer" aria-pressed={player} title="Hide the pins you marked secret, for showing the map to the table" onClick={() => setPlayer(!player)}>Player view</button>
        <span class="spacer" style="flex:1" />
        <button class="btn btn-sm" id="mapZoomOut" aria-label="Zoom out" disabled={zoom <= 1} onClick={() => setZoom(z => Math.max(1, z - 0.5))}>−</button>
        <span class="mono small" id="mapZoomText">{Math.round(zoom * 100)}%</span>
        <button class="btn btn-sm" id="mapZoomIn" aria-label="Zoom in" disabled={zoom >= 4} onClick={() => setZoom(z => Math.min(4, z + 0.5))}>＋</button>
      </div>
      {mode === 'add' && <div class="map-hint small" id="mapHint">{armed ? 'Click the map to put ' + armed + ' there.' : 'Click the map to drop a pin, or pick a place below and then click where it goes.'}</div>}
      {mode === 'measure' && <div class="map-hint small" id="mapHint">Click two points (or two pins) to measure between them.</div>}
      <div class="map-layout">
        <div class="map-scroll" id="mapScroll">
          <div class={'map-stage mode-' + mode} id="mapStage" ref={stage} style={'width:' + zoom * 100 + '%'} onClick={clickMap}>
            {url ? <img ref={imgRef} src={url} alt={basename(path)} draggable={false} /> : <div class="muted" style="padding:40px">Loading the map…</div>}
            {measure.length > 0 && (
              <svg class="map-lines" aria-hidden="true">
                {measure.length === 2 && <line x1={measure[0].x + '%'} y1={measure[0].y + '%'} x2={measure[1].x + '%'} y2={measure[1].y + '%'} />}
                {measure.map((m, k) => <circle key={k} cx={m.x + '%'} cy={m.y + '%'} r="5" />)}
              </svg>
            )}
            {visible.map(({ p: raw, i }) => {
              const p = pinAt(i);
              const linked = p.place && idx.resolve(p.place);
              const hasMap = linked && mapsOfPlace(idx, linked).length > 0;
              return (
                <button key={i} class={'map-pin' + (p.secret ? ' secret' : '') + (sel === i ? ' on' : '') + (hasMap ? ' has-map' : '') + (p.place && !linked ? ' missing' : '')} data-pin={pinTitle(p)} title={pinTitle(p)} style={'left:' + p.x + '%;top:' + p.y + '%'} onPointerDown={e => down(e, i)} onClick={e => e.stopPropagation()} onDblClick={e => { e.stopPropagation(); openPin(p); }} aria-label={pinTitle(p) + (p.secret ? ' (secret)' : '')}>
                  <i />{labels && <span class={'map-pin-label' + (shownLabels.has(i) ? '' : ' lbl-off')}>{pinTitle(p)}</span>}
                </button>
              );
            })}
            {draft && <span class="map-pin draft" style={'left:' + draft.x + '%;top:' + draft.y + '%'}><i /></span>}
          </div>
        </div>
        <aside class="map-side card" id="mapSide">
          <div class="map-head">
            {up && <button class="btn btn-sm" id="mapUp" onClick={() => openAssetTab(up.m.image)}>◂ Map of {up.a.name}</button>}
            <div class="small muted" style="margin:4px 0 2px">This map shows</div>
            <PlaceBox idx={idx} value={place ? place.name : ''} onSet={name => save({ place: name })} />
            <div class="small muted" id="mapScale" style="margin-top:6px">{scale ? 'Scale: the picture is about ' + fmtDistance(scale.metres) + ' wide.' : 'No scale yet. Measure a distance you know to set one.'}</div>
          </div>

          {draft && (
            <form class="map-form" id="mapDraft" onSubmit={addDraft}>
              <b>New pin</b>
              <input id="mapDraftName" list="map-places" aria-label="Place or label" placeholder="A place, or a label" value={draft.name} onInput={e => setDraft({ ...draft, name: e.currentTarget.value })} autoFocus />
              <label class="small" style="display:flex;gap:6px;align-items:center"><input type="checkbox" style="width:auto" checked={draft.secret} onChange={e => setDraft({ ...draft, secret: e.currentTarget.checked })} /> Secret (hidden in Player view)</label>
              <div class="row-actions"><button class="btn btn-sm btn-primary" id="mapDraftAdd" type="submit" disabled={!draft.name.trim()}>Add pin</button><button class="btn btn-sm" type="button" onClick={() => setDraft(null)}>Cancel</button></div>
            </form>
          )}
          <datalist id="map-places">{locations.map(l => <option key={l.path} value={l.name} />)}</datalist>

          {mode === 'add' && candidates.length > 0 && !draft && (
            <div class="map-todo" id="mapTodo">
              <div class="small muted">{place ? 'Inside ' + place.name + ', not on this map yet' : 'Places not on this map yet'}</div>
              <div class="chips">{candidates.slice(0, 40).map(l => <button key={l.path} class={'chip-link' + (armed === l.name ? ' on' : '')} data-arm={l.name} onClick={() => setArmed(armed === l.name ? '' : l.name)}>{l.name}</button>)}</div>
            </div>
          )}

          {mode === 'measure' && (
            <div class="map-measure" id="mapMeasureBox">
              {measure.length < 2 && <div class="small muted">{measure.length === 0 ? 'Pick the first point.' : 'Pick the second point.'}</div>}
              {measure.length === 2 && scale && (
                <div id="mapDist"><b>{fmtDistance(dist)}</b>{walkingTime(dist) ? <div class="small muted">{walkingTime(dist)}</div> : null}</div>
              )}
              {measure.length === 2 && (
                <form class="map-form" id="mapScaleForm" onSubmit={setScale}>
                  <label class="small muted" for="mapReal">{scale ? 'Wrong? Say how far this line really is' : 'How far is this line really?'}</label>
                  <div class="row-actions"><input id="mapReal" placeholder="5 km, 300 m, 2 mi" value={real} onInput={e => setReal(e.currentTarget.value)} style="flex:1;min-width:0" /><button class="btn btn-sm" id="mapScaleSet" type="submit" disabled={!real.trim()}>Set scale</button></div>
                </form>
              )}
            </div>
          )}

          {cur && !drag && (
            <div class="map-card" id="mapCard">
              <div class="map-card-title">
                {curPlace ? <a href="#" onClick={e => { e.preventDefault(); openPin(cur); }}><b>{cur.heading || cur.place}</b></a> : <b>{cur.place || cur.label}</b>}
                {cur.secret && <span class="pill pill-warn">Secret</span>}
              </div>
              {curPlace && <div class="small muted">{cur.heading ? 'In ' + curPlace.name : subtitle(curPlace) || 'Place'}{here && here.people.length ? ' · ' + here.people.length + ' people here' : ''}</div>}
              {cur.place && !curPlace && <div class="small cc-bad">No place has this name any more.</div>}
              <div class="row-actions" style="margin-top:8px">
                {curPlace && <button class="btn btn-sm" id="mapOpenPlace" onClick={() => openPin(cur)}>{cur.heading ? 'Open the room' : 'Open the place'}</button>}
                {curMaps.length > 0 && <button class="btn btn-sm btn-primary" id="mapOpenMap" onClick={() => openAssetTab(curMaps[0].image)}>Open its map</button>}
                <button class="btn btn-sm" id="mapSecret" onClick={() => patchPin(sel, { secret: !cur.secret })}>{cur.secret ? 'Make it public' : 'Mark secret'}</button>
                <button class="btn btn-sm btn-ghost btn-danger" id="mapRemove" onClick={() => removePin(sel)}>Remove pin</button>
              </div>
              <label class="lbl" for="mapPinNote" style="margin-top:8px">Note on this pin</label>
              <input id="mapPinNote" value={cur.note} placeholder="Only you see this" onChange={e => patchPin(sel, { note: e.currentTarget.value })} />
              <div class="small muted" style="margin-top:6px">Drag a pin to move it.</div>
            </div>
          )}

          <div class="map-list">
            <div class="small muted" style="margin-bottom:4px">Pins ({visible.length})</div>
            {visible.length === 0 && <div class="small muted">None yet. Choose “Pin places”, then click the map.</div>}
            {visible.map(({ p, i }) => <button key={i} class={'map-list-row' + (sel === i ? ' on' : '')} data-pinrow={pinTitle(p)} onClick={() => { setSel(i); setDraft(null); }}>{pinTitle(p)}{p.secret ? <span class="muted small"> · secret</span> : null}</button>)}
          </div>
        </aside>
      </div>
    </div>
  );
}

/* "this map shows": a place */
function PlaceBox({ idx, value, onSet }) {
  const [v, setV] = useState(value);
  useEffect(() => setV(value), [value]);
  const commit = () => {
    const t = v.trim();
    if (t === value) return;
    if (!t) { onSet(''); return; }
    const n = idx.resolve(t);
    if (!n || n.type !== 'location') { toast('There is no place called “' + t + '”.', true); setV(value); return; }
    onSet(n.name);
  };
  return (
    <>
      <input id="mapPlace" list="map-place-list" aria-label="The place this map shows" placeholder="A place (so it can find this map)" value={v} onInput={e => setV(e.currentTarget.value)} onChange={commit} onBlur={commit} />
      <datalist id="map-place-list">{(idx.byType.location || []).map(l => <option key={l.path} value={l.name} />)}</datalist>
    </>
  );
}
