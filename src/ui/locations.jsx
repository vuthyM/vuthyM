import { useState } from 'preact/hooks';
import { useApp, getIndex, set, toast } from './store.js';
import { goto, navTo, createNote, saveNoteEdit, wantsNewTab, saveMap, openMapAt, openAssetTab, movePlace, setLinkProperty } from './actions.js';
import { mapsOfPlace, pinsOfPlace, parsePins } from '../core/maps.js';
import { MapPreview } from './mapview.jsx';
import { IMAGE_EXT, ext, basename } from '../core/util.js';
import { locationTree, hereOf, LOCATION_KIND_LABELS, kindFor, moveTargets, canMoveInto } from '../core/locations.js';
import { fieldDefs, toStored, getField } from '../core/schema.js';
import { PopulateBox } from './cast.jsx';
import { TravelTimes, PinOnMap } from './tools39.jsx';
import { suggestedCount } from '../core/cast.js';
import { subtitle } from './notes.jsx';

const npcLocation = () => fieldDefs('npc').find(f => f.key === 'location');
const link = (n, e) => { e.preventDefault(); navTo(n.path, e); };

/* Greenhold › The Cinder & Crown: the places this one sits inside, above its title */
export function LocationCrumbs({ note }) {
  useApp();
  const idx = getIndex();
  const up = locationTree(idx).ancestors(note);
  if (!up.length) return null;
  return (
    <nav class="loc-crumbs small" id="locCrumbs" aria-label="Where this place is">
      {up.map(p => <span key={p.path}><a href="#" data-crumb={p.name} onClick={e => link(p, e)}>{p.name}</a><span class="muted"> › </span></span>)}
      <span class="muted">{note.name}</span>
    </nav>
  );
}

function PersonCard({ p }) {
  return (
    <a href="#" class="loc-person" data-person={p.note.name} onClick={e => link(p.note, e)}>
      <b>{p.note.name}</b><span class="muted small">{subtitle(p.note) || 'NPC'}{p.where ? ' · at ' + p.where.name : ''}</span>
    </a>
  );
}

/* a place's own page: what is inside it, who is here, and what else in the campaign points at it */
export function LocationPanel({ note }) {
  const s = useApp();
  const idx = getIndex();
  const tree = locationTree(idx);
  const kids = tree.children(note);
  const here = hereOf(idx, note, tree);
  const [who, setWho] = useState('');
  const [pick, setPick] = useState('');
  const addPlace = () => set({ dialog: { kind: 'new', type: 'location', within: note.name } });
  const addPerson = e => {
    e.preventDefault();
    const n = who.trim();
    if (!n) return;
    createNote('npc', n, { fm: { location: toStored(npcLocation(), note.name) } });
    setWho('');
    toast('Added ' + n + ' here. Push changes to save it.');
  };
  const putHere = name => {
    const n = idx.resolve(name);
    if (!n) return;
    setLinkProperty(n.path, 'npc', 'location', note.name);
    setPick('');
    toast(n.name + ' is now at ' + note.name + '.');
  };
  const myMaps = mapsOfPlace(idx, note);
  const pinned = pinsOfPlace(idx, note);
  const taken = new Set(myMaps.map(m => m.image));
  const pictures = s.files.filter(p => IMAGE_EXT.includes(ext(p)) && !taken.has(p));
  const parent = tree.parentNote(note);
  const targets = moveTargets(idx, tree, note);
  const ancestorPaths = new Set(tree.ancestors(note).map(a => a.path));
  const kidPaths = new Set(kids.map(k => k.path));
  const adoptable = (idx.byType.location || []).filter(x => x.path !== note.path && !ancestorPaths.has(x.path) && !kidPaths.has(x.path)).sort((a, b) => a.name.localeCompare(b.name));
  const moveTo = e => {
    const v = e.currentTarget.value;
    if (v === (parent ? parent.name : '')) return;
    if (movePlace(note.path, v)) toast(v ? note.name + ' is now inside ' + v + '.' : note.name + ' is now a top-level place.');
    else toast('A place cannot go inside itself or something inside it.', true);
  };
  const adopt = e => {
    const name = e.currentTarget.value;
    if (!name) return;
    const x = idx.resolve(name);
    if (x && movePlace(x.path, note.name)) toast(x.name + ' is now inside ' + note.name + '.');
    else toast('That would put a place inside itself.', true);
  };
  const hereSet = new Set(here.people.map(p => p.note.path));
  const movable = (idx.byType.npc || []).filter(n => !hereSet.has(n.path));
  const count = (n, label) => (n ? n + ' ' + label + (n === 1 ? '' : 's') : '');
  const mentioned = [...here.kept.map(n => ['Items kept here', n]), ...here.factions.map(n => ['Factions', n]), ...here.threads.map(n => ['Plot threads', n]), ...here.mentionedPeople.map(n => ['Also mentioned by', n]), ...here.others.map(n => ['Other notes', n])];
  const groups = [...new Set(mentioned.map(m => m[0]))];
  return (
    <div class="loc-panel" id="locPanel">
      <div class="loc-move row-actions" id="locMove">
        <label class="small muted" for="locMoveTo">This place is inside</label>
        <select id="locMoveTo" aria-label="Move this place inside another" style="width:auto;max-width:300px" value={parent ? parent.name : ''} onChange={moveTo}>
          <option value="">Nothing (a top-level place)</option>
          {targets.map(({ note: t, depth }) => <option key={t.path} value={t.name}>{'\u00a0\u00a0'.repeat(depth) + t.name}</option>)}
        </select>
      </div>
      <section class="loc-sec" id="locInside">
        <div class="loc-head"><h3>Places inside {kids.length ? <span class="muted small">({kids.length})</span> : null}</h3>
          <span class="row-actions" style="gap:6px">
            {adoptable.length > 0 && (
              <select id="locAddExisting" aria-label="Move an existing place inside this one" style="width:auto;max-width:240px" value="" onChange={adopt}>
                <option value="">Move an existing place in…</option>{adoptable.map(x => <option key={x.path} value={x.name}>{x.name}</option>)}
              </select>
            )}
            <button class="btn btn-sm" id="locAddPlace" onClick={addPlace}>＋ Add a place inside</button>
          </span></div>
        {kids.length === 0 && <p class="muted small" style="margin:0">Nothing inside yet. A town can hold its shops, an inn, a temple; a dungeon can hold its areas. Each one is a note of its own.</p>}
        {kids.length > 0 && (
          <div class="loc-kids">
            {kids.map(c => {
              const n = tree.children(c).length;
              return (
                <a href="#" key={c.path} class="loc-kid" data-kid={c.name} onClick={e => link(c, e)}>
                  <b>{c.name}</b><span class="muted small">{subtitle(c) || 'Place'}{n ? ' · ' + count(n, 'place') + ' inside' : ''}</span>
                </a>
              );
            })}
          </div>
        )}
      </section>

      <section class="loc-sec" id="locMap">
        <div class="loc-head"><h3>Map</h3>
          <PinOnMap place={note} />
          {pictures.length > 0 && (
            <select id="locPickMap" aria-label="Use a picture as this place's map" style="width:auto;max-width:260px" value="" onChange={e => { const p = e.currentTarget.value; if (p) { saveMap(p, { place: note.name }); toast(basename(p) + ' is now the map of ' + note.name + '.'); } }}>
              <option value="">{myMaps.length ? 'Add another map…' : 'Use a picture as its map…'}</option>{pictures.map(p => <option key={p} value={p}>{basename(p)}</option>)}
            </select>
          )}
        </div>
        {myMaps.length === 0 && pinned.length === 0 && <p class="muted small" style="margin:0">{pictures.length ? 'No map yet. Choose a picture from your campaign above (or add images to the Maps folder).' : 'No map yet. Add an image to your Maps folder and it can become this place\'s map.'}</p>}
        {myMaps.map(m => (
          <div key={m.image} class="loc-map">
            <MapPreview image={m.image} pins={parsePins(m.note.body)} onOpen={() => openAssetTab(m.image)} />
            <div class="small"><b>{basename(m.image)}</b> <span class="muted">· {parsePins(m.note.body).length} pins</span> <button class="btn btn-sm" data-openmap={basename(m.image)} onClick={() => openAssetTab(m.image)}>Open the map</button></div>
          </div>
        ))}
        {pinned.length > 0 && <div class="small loc-group" id="locPinned"><span class="muted">Pinned on:</span> {pinned.map(x => <a href="#" key={x.image + x.pin.x} class="chip-link" data-pinnedon={basename(x.image)} onClick={e => { e.preventDefault(); openMapAt(x.image, note.path); }}>{basename(x.image)}</a>)}</div>}
        <TravelTimes place={note} />
      </section>

      <section class="loc-sec" id="locHere">
        <div class="loc-head"><h3>Who is here {here.people.length ? <span class="muted small">({here.people.length})</span> : null}</h3></div>
        {here.people.length === 0 && <p class="muted small" style="margin:0 0 8px">Nobody is placed here yet. People appear when their Location property points at this place{kids.length ? ' (or at somewhere inside it)' : ''}.</p>}
        {here.people.length > 0 && here.people.length <= 12 && (
          <div class="loc-people">{here.people.map(p => <PersonCard key={p.note.path} p={p} />)}</div>
        )}
        {here.people.length > 12 && (
          <div class="loc-people-groups" id="locPeopleGroups">
            {[...new Set(here.people.map(p => (p.where ? p.where.name : '')))].sort((a, b) => (a === '' ? -1 : b === '' ? 1 : a.localeCompare(b))).map(w => {
              const list = here.people.filter(p => (p.where ? p.where.name : '') === w);
              return (
                <details key={w} class="loc-pgroup" open={w === ''} data-pgroup={w || 'here'}>
                  <summary><b>{w || 'Right here'}</b> <span class="badge">{list.length}</span></summary>
                  <div class="loc-people">{list.map(p => <PersonCard key={p.note.path} p={p} />)}</div>
                </details>
              );
            })}
          </div>
        )}
        <div class="loc-populate"><PopulateBox key={note.path} place={note} count={suggestedCount(String(getField(note, fieldDefs('location').find(f => f.key === 'kind') || { key: 'kind' }).value || ''), kids.length > 0)} /></div>
        <form class="row-actions loc-add" onSubmit={addPerson}>
          <input id="locPersonName" aria-label="Name of a new person here" name="loc-person" placeholder="Add a new person here…" value={who} onInput={e => setWho(e.currentTarget.value)} style="flex:1;min-width:160px" />
          <button class="btn btn-sm" id="locAddPerson" type="submit" disabled={!who.trim()}>Add</button>
          {movable.length > 0 && (
            <select id="locPutHere" aria-label="Put an existing NPC here" style="width:auto;max-width:240px" value={pick} onChange={e => putHere(e.currentTarget.value)}>
              <option value="">Put an existing NPC here…</option>{movable.map(n => <option key={n.path} value={n.name}>{n.name}</option>)}
            </select>
          )}
        </form>
      </section>

      {(here.lastSession || groups.length > 0) && (
        <section class="loc-sec" id="locElsewhere">
          <div class="loc-head"><h3>Elsewhere in the campaign</h3></div>
          {here.lastSession && (
            <p class="small" id="locLastSession" style="margin:0 0 8px">Last in play: <a href="#" onClick={e => link(here.lastSession, e)}>{here.lastSession.name}</a>{here.lastSession.sdate ? <span class="muted"> ({here.lastSession.sdate})</span> : null}{here.lastVia ? <span class="muted"> at {here.lastVia.name}</span> : null}
              {here.sessions.length > 1 ? <span class="muted"> · mentioned in {here.sessions.length} sessions</span> : null}</p>
          )}
          {groups.map(g => (
            <div key={g} class="loc-group small"><span class="muted">{g}:</span> {mentioned.filter(m => m[0] === g).map(m => <a href="#" key={m[1].path} class="chip-link" onClick={e => link(m[1], e)}>{m[1].name}</a>)}</div>
          ))}
        </section>
      )}
    </div>
  );
}
