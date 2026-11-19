import { set, S, toast } from './store.js';
import { startTour, claudeOn, openTab, setSection, wantsNewTab, isSampleCampaign, removeSampleCampaign, discardDraft, openSettings } from './actions.js';
import { Modal } from './common.jsx';
import { useEffect } from 'preact/hooks';

const close = () => set({ dialog: null });

/* Settings used to be a window. Anything that still asks for that window (a shortcut, a link, an older tab) lands on the Settings page instead. */
export function SettingsRedirect({ d }) {
  useEffect(() => { const cat = d && d.kind === 'claudeSettings' ? 'claude' : d && d.open === 'gens' ? 'library' : undefined; set({ dialog: null }); openSettings(cat, d && d.open); }, []);
  return null;
}

/* shown (in "Ask me first" mode) when you leave an editor that has unsaved text */
export function LeaveEdit({ d }) {
  return (
    <Modal title="Save your changes first?" onClose={close}>
      <p style="margin:0">You have unsaved changes to <strong>{d.name}</strong>.</p>
      <div class="modal-actions" style="flex-wrap:wrap">
        <button class="btn" id="leaveStay" onClick={close}>Keep editing</button>
        <button class="btn btn-danger" id="leaveDiscard" onClick={() => { close(); discardDraft(d.draft); d.proceed(); }}>Discard changes</button>
        <button class="btn btn-primary" id="leaveSave" onClick={() => { close(); d.draft.save({ auto: true }); d.proceed(); }}>Save and continue</button>
      </div>
    </Modal>
  );
}

/* the Menu: Settings, Claude (experimental) and the Version history */
export function MenuDialog() {
  const items = [
    { id: 'menuSettings', title: 'Settings', note: 'Colours and type, saving, sessions, Claude, updates and the trash', go: e => { close(); openSettings(undefined, '', e); } },
    { id: 'menuShortcuts', title: 'Keyboard shortcuts', note: 'Every shortcut in one list (or press ? anywhere)', go: () => set({ dialog: { kind: 'shortcuts' } }) },
    { id: 'menuTour', title: 'Take the tour', note: 'A two-minute look at what DM Forge does and where things are', go: () => startTour() },
    { id: 'menuStarter', title: 'Session zero kit', note: 'A few questions about the campaign and the table: it builds your first notes', go: () => set({ dialog: { kind: 'starter' } }) },
    ...(S.vault && S.vault.kind !== 'memory' ? [{ id: 'menuSample', title: 'Add the sample campaign to my vault', note: 'Ashfall, a complete campaign in a new folder (and example characters), to explore or learn from', go: () => set({ dialog: { kind: 'sample' } }) }] : []),
    ...(S.campaign && isSampleCampaign() ? [{ id: 'menuRemoveSample', title: 'Remove the sample campaign', note: 'Moves the sample notes you have not changed to your vault’s trash', go: () => set({ dialog: { kind: 'confirm', title: 'Remove the sample campaign?', body: 'The sample notes you have not changed move to your vault’s trash folder, and the campaign closes. Notes you added or changed stay where they are, and any unpushed changes here are dropped. Empty folders are left behind. The example characters in your Character Library are not touched (remove those there).', confirmLabel: 'Remove the sample', danger: true, onConfirm: async () => { const r = await removeSampleCampaign(); if (r.ok) toast('Removed ' + r.removed + ' sample notes' + (r.kept ? ' and kept ' + r.kept + ' you added or changed' : '') + '.'); else toast(r.error, true); } } }) }] : []),
    { id: 'menuHistory', title: 'Version history', note: 'What changed in every version', go: e => { close(); if (wantsNewTab(e)) openTab({ section: 'history' }); else setSection('history'); } },
  ];
  return (
    <Modal title="Menu" onClose={close} focusFirst={false}>
      <div class="menu-list">
        {items.map(i => (
          <button key={i.id} id={i.id} class="menu-item" onClick={i.go}>
            <span class="menu-item-title">{i.title}</span>
            <span class="muted small">{i.note}</span>
          </button>
        ))}
      </div>
      <div class="modal-actions"><button class="btn" onClick={close}>Close</button></div>
    </Modal>
  );
}
