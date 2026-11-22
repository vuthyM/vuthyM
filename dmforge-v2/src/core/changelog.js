/* Version history, newest first. Every build adds one entry at the top (a test checks that the first entry matches the
   VERSION file). Each change is [kind, text] where kind is 'new', 'improved' or 'fixed'.
   Builds before 2.1.0 did not show a number, so they are labelled by order. Numbers that were never released are not listed.
   An entry can have status: 'experimental' (a demo) or 'rolled-back' (it was tried and taken out). Entries are never deleted. */

export const KINDS = { new: 'New', improved: 'Improved', fixed: 'Fixed' };

export const CHANGELOG = [
  {
    version: '2.55.2', date: '2026-11-22', title: 'The server updater copes with a locked-down server',
    changes: [
      ['fixed', 'The automatic update refused to run on a server with its allowed host names set (DMFORGE_HOSTS), because its database copy went through the web address. It now copies the database directly with SQLite\'s own backup, which is safe while the app is running and keeps the last 20 copies as data/backups/pre-update-*.db.'],
      ['fixed', 'The server now always answers requests the machine makes to itself (localhost, 127.0.0.1), even when DMFORGE_HOSTS is set, so commands run on the server itself keep working.'],
    ],
  },
  {
    version: '2.55.1', date: '2026-11-22', title: 'The server updates itself',
    changes: [
      ['new', 'On your own server, DM Forge can now install new versions by itself within about a minute of one being released: it checks GitHub every minute (it only reaches out, nothing is opened), copies the database first, builds the new version while the old one keeps running, swaps it, and waits for it to be healthy. If the build fails or the new version does not come up healthy, the old version is put back and that release is skipped. ./update.sh --status shows what is running; the log is update.log. See deploy/DEPLOY-V3.md.'],
    ],
  },
  {
    version: '2.55.0', date: '2026-11-22', title: 'Combat: the creature whose turn it is gets everything, the rest stay to a line',
    changes: [
      ['improved', 'During a fight, the creature whose turn it is has all its controls open (reaction, legendary actions, recharge, note, temp HP, conditions, stat block, remove). Every other creature is two lines: name, AC and conditions, then hit points with the amount box and Damage and Heal. A chevron on a row opens it when you need it. About a third of the buttons that used to be on screen.'],
      ['improved', 'What matters stays visible without opening a row: conditions, temp HP, "Reaction used", the note ("Concentrating on Bless"), and death saves for a player at 0. The current turn is plainly marked, and Next turn moves the open controls along.'],
      ['new', '"Show all details" above the list opens every row (the old layout); it is remembered in this browser.'],
      ['improved', 'The roll-initiative button sits beside the name instead of under the number, and Temp HP and Remove moved inside the open controls.'],
    ],
  },
  {
    version: '2.54.0', date: '2026-11-22', title: 'Prepared encounters you did not get to move to the next session',
    changes: [
      ['new', 'Running a prepared encounter in Combat now writes a dated line inside it ("Ran in combat: 2026-11-22"), so the note shows what was used. Its card shows "Ran …" and the button becomes "Run again".'],
      ['new', 'Encounters that were never run can be moved on. Each one has "Move to next session", and the Wrap up mode of the session page lists everything that was not run with one button, "Move to <next session>". The callout moves with its notes; if there is no next session yet, a new one is made (the pinned session and the log box stay where they were). Nothing is written until you push, so Discard all undoes it.'],
    ],
  },
  {
    version: '2.53.1', date: '2026-11-22', title: 'Move your settings to another device or to the server',
    changes: [
      ['new', 'Settings, Data: "Save my settings…" writes your theme, fonts, layout, favourites, list views, folder-to-type guesses and where you left off to one small file, and "Bring my settings in…" reads it on another device, browser or server. Settings that belong to one vault and campaign follow you to the new vault name. Notes, unpushed changes, a fight in progress and the timer are not part of it.'],
    ],
  },
  {
    version: '2.53.0', date: '2026-11-22', title: 'V3 preview: run DM Forge from your server',
    changes: [
      ['new', 'DM Forge can now be served from a small server on your own machine (a mini PC with Docker, reached over Tailscale) instead of from your Mac. The campaign lives in a database there, with every earlier version of every note kept, a nightly copy of the database and a nightly plain-Markdown copy of the whole campaign. See deploy/DEPLOY-V3.md. Folder mode and the Mac helper work exactly as before.'],
      ['new', 'Work with no connection. Everything you open is saved on the device, so the app and the campaign open with the server down (use the HTTPS address). Your edits stay as unpushed changes, the top bar says Offline, and it says so by itself when the server is back.'],
      ['new', 'Changes made on another device show up here without a reload (for notes you have not touched). A note you have unpushed changes on is never replaced: the push review flags it, as before.'],
      ['new', 'The server refuses to overwrite a note that changed since the version you started from, whatever the timing. Your change stays waiting and nothing is lost.'],
      ['improved', 'Settings no longer offers helper-only update and roll-back buttons when you are on the server; they explain how the server is updated instead.'],
    ],
  },
  {
    version: '2.52.0', date: '2026-11-19', title: 'A calmer top bar and a session page that puts the note first',
    changes: [
      ['new', 'The session page has three modes, Prep, Run and Wrap up, and shows only the buttons for the one you are in. Prep: Import last session, the cast, the prep check and prepared encounters. Run: Go live, Run combat and the Live panel. Wrap up: Tidy notes and Close out (the main button). The mode picks itself (a session you have not played is Prep, going Live, a fight or the running timer is Run, a session with a log is Wrap up) and you can switch it with the tabs under the title; your choice is remembered for that session.'],
      ['improved', 'The note comes first. Properties, the outline, links, "mentioned in" and the file path are folded under one "Details" line; the cast is a one-line "Cast: 4 players, 2 NPCs, 1 place" you open when you want it; the empty "no prepared encounters" hint is gone. The notes now start about a third of the way down the window instead of below the fold.'],
      ['improved', 'Opening a session gives the note the whole page. The session list and the "Sessions" heading step aside, with "← All sessions" at the top to go back (also while editing). The title line shows the date and session number instead of the file path.'],
      ['improved', 'The top bar is quieter: search, back and forward, the timer / dice / log tools, one "View" menu, and Push. The cheat sheet, the campaign snapshot, the layout choices (with Table mode) and light / dark (or follow your Mac) moved into View. Push goes quiet when there is nothing to push and fills in when there is.'],
      ['improved', 'A calmer look, same warm identity: the thick accent stripes on one side of callouts, quotes, notes and selected rows are gone (a faint tint and a hairline instead), the boxes on the session page lose their borders, and quiet buttons and labels are a touch darker so they stay readable.'],
      ['fixed', 'On a phone-sized window the top bar could push the page sideways when there were changes to push; it now fits.'],
    ],
  },
  {
    version: '2.51.2', date: '2026-11-15', title: 'No Table rules in the Session prep template',
    changes: [
      ['improved', 'The "Session prep" template (Add template) no longer has a "Table rules" block: it starts with MUST HAPPEN, then Locations, the State tracker and the NPC heading. Sessions you already made keep whatever they have.'],
    ],
  },
  {
    version: '2.51.1', date: '2026-11-15', title: '"Appears in" means what you set',
    changes: [
      ['fixed', 'The "Appears in" filter and grouping on Plot threads also counted any place a thread\'s text merely mentioned, so a thread that talks about a town showed up under it even though it does not happen there. Now only the places on the thread\'s "Appears in" property count, in the filter chips, in the grouping and in "Plot threads here" on a place.'],
      ['new', 'So you do not lose the shortcut, a plot thread\'s page offers the places its text mentions as "＋ Place" buttons under "Mentions": one click adds that place to "Appears in".'],
    ],
  },
  {
    version: '2.51.0', date: '2026-11-15', title: 'Where a plot thread appears: filter and group by location',
    changes: [
      ['new', 'Plot threads have an "Appears in" property: the places the thread happens, one or several, set the same way as "Seeded by" (chips, with suggestions from your locations, saved as a list of [[links]] in the properties). The places a thread\'s text already links to with [[double brackets]] count too, so threads you have already written work without filling anything in.'],
      ['new', 'The Plot threads list has an "Appears in" row of filter chips, with how many threads each place has. It combines with the status and "Seeded by" chips.'],
      ['new', 'A "Group by" choice on the Plot threads list: Location arranges the threads under each place, A to Z, with "Not tied to a place" last. A thread that appears in several places is listed under each. Groups fold up, searching opens them, and your choice is remembered.'],
      ['new', 'A place\'s page lists the plot threads that appear there ("Plot threads here"), and a thread\'s page shows where it appears, as links.'],
    ],
  },
  {
    version: '2.50.0', date: '2026-11-14', title: 'Your own monsters, and a Monster library button',
    changes: [
      ['new', 'A Monsters button in the sidebar (under Reference), and Ctrl+K "Monster library", open the library from anywhere, not only from Combat. You can star it to pin it to the top.'],
      ['new', 'Make your own monsters. "+ New monster" in the library opens a form: name, size, type, alignment, armour class, hit points and hit dice, initiative, challenge rating, speed, the six ability scores (with their modifiers), saves, skills, resistances, senses, languages, and boxes for traits, actions, bonus actions, reactions and legendary actions. It is saved as a note in your Bestiary folder (made if there is none) with properties and a stat block in the same layout as the built-in ones, so it shows in the library, in Combat and in Obsidian.'],
      ['new', '"Copy and edit…" on any monster, built-in or your own, starts a new monster from it (a tougher goblin from Goblin Warrior, say). The built-in one is never changed.'],
      ['new', '"Paste a stat block" in the form reads text from a book or your notes (the 2024 layout and the older one) and fills in the name, size, type, AC, HP, speed, scores, senses, challenge rating, traits and actions. Feet become metres. It tells you what it filled in and what is still missing, and nothing is saved until you press Save.'],
      ['new', 'Edit and Delete for your own monsters in the library. Edit reopens the form exactly as it was made (the form is kept in a hidden comment at the end of the note). If you changed the note by hand in Obsidian, Edit is off so the form cannot overwrite your changes, and "Open the note" is there instead. Delete asks first and moves the note to the vault\'s trash when you push.'],
      ['fixed', 'A pop-up menu (the layout menu, say) could close the moment it opened if the sidebar happened to scroll a focused button into view. Scrolling the sidebar no longer closes it.'],
      ['improved', 'A Bestiary note with "hd" (hit dice) in its properties can now roll its HP in Combat, like the built-in monsters.'],
    ],
  },
  {
    version: '2.49.0', date: '2026-11-14', title: 'Who seeded a plot thread',
    changes: [
      ['new', 'Plot threads have a "Seeded by" property: the NPCs, factions and player characters that planted the thread (one or several). In the editor they are chips you can remove, with a box that suggests names from your own notes (Enter, a comma, or leaving the box adds one). On the thread they show as links. It is stored as a list of [[links]] in the note\'s properties, so Obsidian shows and follows them; "planted by" and "started by" are read as well.'],
      ['new', 'An NPC, faction or player page lists the threads it seeded ("Seeded threads"), so a player\'s page shows which threads came from their backstory. It updates the moment you change a thread.'],
      ['new', 'The Plot threads list has a "Seeded by" row of filter chips (with a count for each), so you can see everything the Ember Court started, or everything one player\'s backstory brought in. The New plot thread form has the field too.'],
      ['improved', 'The Ashfall demo and sample campaign now have seeders on their threads, to look at.'],
    ],
  },
  {
    version: '2.48.0', date: '2026-11-14', title: 'Settings is a page, seven typefaces, editable encounters, Spotlight undo',
    changes: [
      ['new', 'Settings is now a page, not a long window. Categories run down the left (Appearance, Layout and sidebar, Writing and saving, Sessions, Library and lists, Claude, Data and updates) and one category shows at a time on the right. A search box finds an option wherever it is (try "sidebar", "font" or "claude"). Switches and side-by-side choices replace the stacks of radio buttons, the descriptions are one line with the long version under "More", and options that only matter when something is on (the sidebar delay, how many changes to keep) appear only then. Every option keeps what it does and the value you had.'],
      ['new', 'Seven typeface sets, in Settings, Appearance: Today (Fraunces, the default), Manuscript (Cinzel), Storybook (Alegreya), Clear and Bookish (Literata with Atkinson Hyperlegible), Warm and Bold (Young Serif), Clean (Plus Jakarta Sans with Inter) and Modern with Character (Bricolage Grotesque). Each card shows its own letters. The choice applies at once and is remembered in this browser. Every font is built into the app, so all of them work offline and with Brave Shields on.'],
      ['new', 'Prepared encounters can be edited in place: Edit on the card opens the name and the creatures, with one more or one fewer, a number you can type, a different creature, Remove, and an Add box that suggests creatures from your library. Save changes writes it into the session note (as a pending change); Cancel or Esc throws the edit away. Your own notes inside the encounter callout and its fold marker are kept.'],
      ['new', 'Spotlight: each player has a "−" that takes back their newest moment in the current session, and "Undo last moment" takes back the newest one of anyone\'s. No more Discard changes (which threw away everything else) just to take one moment off.'],
      ['improved', 'Claude (experimental), Undo last push, the Trash, Version and Check for an update moved from the Menu into Settings (Claude, and Data and updates). The Menu is now just Settings and the help and learning items. Colours (light, dark or follow the Mac) and the window layout can also be chosen in Settings; the buttons in the top bar are still there. Ctrl+K "Settings" and the old links all land on the page, and Ctrl/⌘-click opens it in a new tab.'],
      ['fixed', 'Pressing "Jump to it" made the page scroll to that line again every time you edited the note, added an NPC to the cast, or left the session and came back. A jump now happens once, and one that is a minute old is ignored.'],
      ['fixed', 'Adding an NPC to a session scrolled the page down every time (after you had used "Jump to it"; the same cause). It no longer moves the page.'],
      ['fixed', 'The Spotlight card folded itself shut when the last quiet player got a moment, so the next click landed on a closed card. It now stays as you left it.'],
    ],
  },
  {
    version: '2.47.4', date: '2026-11-14', title: 'The session you are running, pinned in the sidebar; "Where you left off" tells the truth',
    changes: [
      ['new', 'The session you are running is pinned in the sidebar, under Combat, one click from anywhere. It is the session the log box points at (the newest, unless you chose another, or went Live on one), and it follows when you create a new session. Long names are cut to fit, with the full name on hover, and it shows as an icon in the narrow column and in the phone drawer.'],
      ['improved', 'A new session becomes the current one straight away, so the log box and the pinned entry point at it.'],
      ['fixed', 'If you added something to a session (a scene from the timer, say), did not push, and undid it, "Where you left off" still described the change that was undone. Undoing or discarding a change now takes its entry with it (Undo my edits, Discard all, discarding in the push review, keeping the vault\'s version), a push keeps it as history, and an entry is only shown while its line is still in the note.'],
    ],
  },
  {
    version: '2.47.3', date: '2026-11-14', title: 'Only one session is live at a time',
    changes: [
      ['fixed', 'Pressing Live on one session turned Live on for every session. Now one session is live at a time: the Live button and panel show only on that session, and pressing Live on another session moves Live to it. Going live also points the log box at that session. The quick switcher\'s "Live mode" command works on the session you have open. Which session is live is remembered for the campaign.'],
    ],
  },
  {
    version: '2.47.2', date: '2026-11-14', title: 'Formatting shows in Live and the task lists',
    changes: [
      ['fixed', 'If a MUST HAPPEN item (or a secret, a log line or a task) had formatting in the note, such as **bold** or _italics_, the Live panel showed the raw ** and _ marks. They now show as bold, italics and code, the same as in the note. The same fix is in What am I forgetting?, the Secrets card and the recent lines in the log box. Screen readers get the plain words, without the marks.'],
    ],
  },
  {
    version: '2.47.1', date: '2026-11-14', title: 'Tidy notes: tried against the real Claude Code',
    changes: [
      ['fixed', 'The Tidy notes check no longer flags a word as "not in your notes" when your notes had it in lower case and the tidy version capitalised it (arcana, Arcana). Found by trying Tidy notes against the real Claude Code.'],
      ['fixed', 'Pressing Escape in the very first moment after a window opens now closes it. The key was ignored for about a frame, which a person cannot hit but automatic testing did.'],
      ['improved', 'Tidy notes was tried against the real Claude Code on rough, lower-case, abbreviated notes: it organised them by scene, linked the right people and places, labelled loot, decisions and rulings, kept every number, put the secret under the DM heading, and left promises and hooks for the app to keep.'],
    ],
  },
  {
    version: '2.47.0', date: '2026-11-14', title: 'Tidy notes: your rough session notes, organised, with your original kept',
    changes: [
      ['new', 'Tidy notes, on every session note beside Close out. After a session it takes the rough notes you typed at the table (the log lines, and any notes sections you choose) and writes them up in order of play, grouped by scene, with names linked. Claude keeps your wording where it is clear and adds nothing. You review your notes and the tidy version side by side, edit if you like, and Apply.'],
      ['new', 'Your notes exactly as you typed them are kept at the bottom of the note in a hidden comment (it does not show in Obsidian\'s reading view, is left out of player-safe copies, and is not counted for links or tags). Show my original, Put back my original and Tidy again are on the strip under the title. Tidying again starts from your original plus anything typed since.'],
      ['new', 'A check before you apply: every name, number and link from your notes must be in the tidy version. If some are missing, Apply waits until you have looked (or put them back). Anything in the tidy version that is not in your notes is highlighted. If a secret ends up outside the "Secrets (DM only)" part, you are warned that players could see it.'],
      ['new', 'Tidy without Claude: fixes the formatting and puts the log in order as a timeline, with nothing reworded. Secret lines go to the DM part.'],
      ['improved', 'Prep, the players\' Recap, combat summaries and everything else DM Forge wrote are never touched. Open promises and hooks stay as tasks in a small log block, so What am I forgetting?, Close out and Import last session keep working. Close out now reads the tidy version.'],
      ['improved', 'On a session note, Open in Obsidian moved into the ⋯ menu to make room for Tidy notes… on the same row. Other notes keep the Obsidian button.'],
      ['improved', 'Lines you type while Claude is working are kept (they are added to the end of the tidy version and to the original). A long night is tidied in parts, one after the other, and put together with all the secrets under one heading.'],
    ],
  },
  {
    version: '2.46.0', date: '2026-11-13', title: 'Ready for a real night: keep both, safer names, clearer failures',
    changes: [
      ['new', 'Keep both. If a note was changed in your vault (in Obsidian, say) while you were also changing it here, and the two changes are in different places, the push review now offers "Keep both: my changes and the vault\'s". It is never chosen for you. If both of you changed the same spot, you still get the careful choices (overwrite, keep the vault\'s, decide later).'],
      ['fixed', 'A push no longer tells you a note "no longer exists in your vault" when the real problem is that the helper stopped. It now says it cannot reach the helper, that your changes are kept, and what to do. Opening the new link brings the unpushed changes back.'],
      ['fixed', 'A name that is taken by something that is not a note (a folder called "Bob.md") is flagged in the push review, with "save as a new numbered note", instead of stopping the whole push with "Not found".'],
      ['fixed', 'A new note whose name differs from an existing one only in capital letters is saved under a new numbered name. On a Mac those are the same file, and the new note would have replaced the old one.'],
      ['fixed', 'Note names no longer start with a dot (a dot file is hidden, so the note vanished when the campaign was read back), accented letters are stored in one form so a Mac and Obsidian agree, and names are limited by bytes (a Mac allows 255), so a long name in Japanese or with emoji can no longer fail to save.'],
      ['fixed', 'Closing the tab right after a push could bring back "unpushed" changes next time that had already been pushed. Unpushed changes are now saved to the browser the moment the page is hidden or a push finishes, and anything that already matches your vault is dropped when they come back.'],
      ['fixed', 'On a phone-width window the Rules page scrolled sideways because of the long licence web address. Long text now breaks anywhere.'],
      ['improved', 'A large test suite for a whole game night: SUNDAY-CHECKLIST.md lists the few things only your Mac, Brave and real vault can confirm.'],
    ],
  },
  {
    version: '2.45.0', date: '2026-11-13', title: 'Combat starts on the top initiative, metric only, Party and Combat pinned, and a polish pass',
    changes: [
      ['fixed', 'Combat now starts with the highest initiative. Adding the party one at a time used to leave the turn with whoever was added first, even if they rolled lowest, so the fight began at the bottom of the list. Until the fight has begun, whoever is on top has the turn; once it has, a late arrival or a changed number no longer steals it.'],
      ['improved', 'In the Combat bar the creature\'s name and "’s turn" are one phrase in one style, instead of a large name and small trailing words.'],
      ['improved', 'Metric only. The Units setting, the Imperial button on the cheat sheet, and every imperial setting are gone: distances, speeds and weights are always metres, kilometres and kilograms, including everything rolled in Generate and everything from the monster, spell, item and character libraries. An old saved "imperial" setting is ignored. (A map scale you typed in miles or feet in a note is still read correctly.)'],
      ['improved', 'Party and Combat are pinned under Overview, always visible, so Combat is one click from anywhere. They are no longer inside the Table group.'],
      ['improved', 'Polish from the design review. Every task checkbox is named by its task and is bigger; each page title is a level-1 heading; the quick switcher input has a name and a visible focus ring; the sidebar stars are bigger and reachable with Tab (Enter pins); ghost buttons ("Remove", "Close") have an outline so they look like buttons; the outline links and expanders are easier to hit.'],
      ['fixed', 'Contrast: dark-mode placeholders, the "things to look at" pill, and the count badge on the active page now pass 4.5:1. Spotlight no longer says "last last session". The theme fade is 0.3 seconds instead of 3, and the bouncy easing on the theme toggle is gone.'],
    ],
  },
  {
    version: '2.44.0', date: '2026-11-12', title: 'The tool island: timer, dice and log in one pill',
    changes: [
      ['new', 'The timer, dice and quick log now share one pill in the top bar. Press one and the pill grows to hold it, the search box and the buttons beside it make room, and the tool opens inside it instead of in a window of its own. One tool at a time: pressing another swaps to it. Escape, or pressing the open tool again, closes it. A running timer keeps its time showing in the closed pill.'],
      ['new', 'It closes the moment the mouse moves away, unless you pin it: a pin button in the pill keeps it open until you close it. It also stays while you are partway through a line or choosing from a list, and logging a line no longer risks closing it when the top bar shifts. Option+L and Option+D still open the log and the dice (they stay until the mouse has been on them and leaves).'],
      ['improved', 'The cheat sheet has its own separate button beside the pill and opens as its panel, as before. On narrow windows the pill is hidden and the tools open as floating boxes from the bottom bar, as before.'],
    ],
  },
  {
    version: '2.43.0', date: '2026-11-12', title: 'A colour for each campaign, and bigger where it counts',
    changes: [
      ['new', 'Campaign colours. Settings has "Colour of this campaign": Gold (the default), Ember, Frost, Moss, Arcane and Crimson. The buttons, links, the active page and the focus ring take the colour, in both the light and the dark theme, and each campaign remembers its own. Ctrl+K has "Campaign colour: …" too.'],
      ['improved', 'Bigger where it counts. In Combat the round number and whose turn it is lead the bar, initiative numbers are larger, and Next turn is a bigger button. Live clocks are drawn as dials with larger counts, and note titles are larger.'],
      ['fixed', 'Contrast. The gold in the light theme is a shade deeper, so white text on buttons, the active page and the count badges now reads at 4.5:1 or better, and gold links on white and cream pass too. Every colour option is held to the same rule in both themes.'],
    ],
  },
  {
    version: '2.42.0', date: '2026-11-12', title: 'A session page made for the table, and a clearer top bar',
    changes: [
      ['improved', 'Live comes first. Turn it on and the panel sits at the top of the session, right under the title, with the cast chips under it; Properties, "Where you left off" and the prep check follow. It is a two-by-two grid with room for each part: clock names wrap instead of being cut off, the tick boxes line up with their text, the clock + and − buttons are bigger, and each Reveal button names the secret it reveals.'],
      ['improved', 'The session\'s buttons are in two groups. Edit, Pin, Live and Run combat are together on the left. Import last session, Close out, Obsidian and the ⋯ menu are on the right, quieter, and drop to their own line together on a narrow page. "Open in Obsidian" is now just "Obsidian" (its tooltip still says the whole thing).'],
      ['improved', 'The top bar. The magnifier beside the search box is gone, because it did the same job as Ctrl+K and the search box now says so. The "Nothing to push" button is at full contrast instead of faded, and when changes are waiting the Push button has a dot as well as the count.'],
    ],
  },
  {
    version: '2.41.3', date: '2026-11-12', title: 'Menus no longer open under the sidebar',
    changes: [
      ['fixed', 'The ⋯ menu on a note (and the other small menus) could open to the left and end up behind the sidebar, cut off, when its button had wrapped onto a line of its own at the left edge. Every such menu now opens on whichever side has room, so it is always fully on screen.'],
    ],
  },
  {
    version: '2.41.2', date: '2026-11-12', title: 'Sidebar: type any delay you like',
    changes: [
      ['improved', 'The sidebar\'s "Opens after" setting is now a box instead of a short list: type the wait any way you like (0.5, .25, 1/2, 1 1/2, 750ms, 2 seconds), from 0 (straight away) to 10 seconds. Something that is not a time is refused and your last setting is kept.'],
    ],
  },
  {
    version: '2.41.1', date: '2026-11-12', title: 'Sidebar: a quicker half-second delay',
    changes: [
      ['improved', 'The auto-hide sidebar can now open after half a second as well as 1, 2 or 3 seconds (Menu, Settings, Sidebar, "Opens after"). The default is still 2 seconds.'],
    ],
  },
  {
    version: '2.41.0', date: '2026-11-12', title: 'A sidebar that hides until you point at it',
    changes: [
      ['new', 'Auto-hide sidebar. The pin button at the top right of the sidebar (or Menu, Settings, Sidebar) turns it on: the sidebar shrinks to a narrow column of icons with a little groove on its edge, and the page gets the room. Rest the mouse on it for 2 seconds (1 or 3 in Settings) and it opens over the page, without moving anything; it closes half a second after the mouse leaves. It stays open while its campaign menu or a dialog is showing, and Ctrl/⌘+B opens or closes it at once. Your choice is remembered. On narrow windows the drawer is used as before.'],
    ],
  },
  {
    version: '2.40.0', date: '2026-11-11', title: 'Sessions at the table and in prep: live panel, improvised NPCs, prep check, prepared encounters',
    changes: [
      ['new', 'Live. A Live button on every session opens a panel on its own page: the MUST HAPPEN list (tick as they come up), the clocks (move a slice either way), the secrets still hidden (one-click Reveal, which logs it), your open plot threads, and a box to log a line. It closes the same way. Ctrl+K has "Live mode" too.'],
      ['new', 'Improvise an NPC. From the Live panel, the cast strip, the quick log or Ctrl+K: roll a name, race, role, look, voice, quirk, want and secret, roll again until you like them, pick where they are, and Save makes the NPC note, adds them to the session\'s cast and logs that the party met them.'],
      ['new', 'Create from the quick log. Type @name or [[name in the log box, and when no note matches it offers "Create … as an NPC / place / item". An NPC goes to the first place the session mentions. Enter on its own still just adds your line; only an arrow-key choice or a click creates.'],
      ['new', 'Outline for a session: a collapsible list of its sections that jumps to each one, folds or opens every callout, and moves a section up or down with its text (no cutting and pasting).'],
      ['new', 'Prep check on a session: what is not ready yet (no MUST HAPPEN list, no NPCs linked, NPCs or places with no description, NPCs not placed anywhere, encounter monsters that are not in the library, last session\'s carry-over not brought in), with a one-click fix where there is one.'],
      ['new', 'Who is likely there. On the cast strip, each place the session mentions lists the people placed there who are not in the cast yet (one click adds them), plus what is kept there and who is based there.'],
      ['new', 'Prepared encounters. On the Party page, line up monsters as before, then name the encounter and Save to session. It is written into the session as a collapsed callout. The session lists each prepared encounter with how hard it is for the party that is here, and Run in Combat adds its monsters to the fight with initiative rolled (or open it in the budget, or remove it).'],
      ['new', 'Four more session templates in Add template: Dungeon crawl, Intrigue and social, Travel and exploration, and One-shot.'],
    ],
  },
  {
    version: '2.39.0', date: '2026-11-11', title: 'Table mode, player-safe copies, a shortcut list, and travel times between places',
    changes: [
      ['new', 'Table mode. Layout menu (or Ctrl+K), Table mode: three panes with the current session big on the left, the Party page top right and the NPC list bottom right. On the session\'s cast strip, a player chip opens that player in the party pane and an NPC or place chip opens in the NPC pane, so the session never moves.'],
      ['new', 'Player-safe copy. A note\'s More menu, "Player-safe copy…", shows the note without the DM\'s secrets: sections headed Secrets, Clues, For the DM and the like, callouts marked secret or DM, "Secret:" lines, secret map pins and comments. It says what it took out, turns [[links]] into plain words (optional), and gives you Copy or Download .md. Your note is not changed.'],
      ['new', 'Keyboard shortcuts. Press ? anywhere (not in a text box) for the full list, written with ⌘ and ⌥ on a Mac. It is also in the Menu and the quick switcher.'],
      ['new', 'Pin on a map. A place\'s page has "Pin on a map…": pick a map and it opens with the place ready, so one click on the picture puts the pin there.'],
      ['new', 'Travel times. A place pinned on a map with a scale now lists every other place on that map, nearest first, with the straight-line distance and how long it takes on foot (4.8 km/h) and on a horse, in hours or days of eight hours\' travel.'],
    ],
  },
  {
    version: '2.38.0', date: '2026-11-11', title: 'Undo a push, a trash you can open, and rolling versions back and forward from the Menu',
    changes: [
      ['new', 'Undo last push. After a push, "Undo this push" (also in the Menu and Ctrl+K) puts every note that push changed back as it was: edited notes go back, notes it created move to your vault\'s trash, notes it deleted come back. If you changed a note again after the push (here or in Obsidian) it tells you which, and changes nothing until you say "Undo anyway". The helper keeps the last 10 pushes, in its own folder outside your vault, so Obsidian Sync never copies them. This needs the helper.'],
      ['new', 'Trash. Menu, Trash lists the notes you deleted from this campaign, where they were and their file date, with a Restore button for each. A note comes back to the same place, or as "name (restored)" if something is there now. Works with the helper, a vault you opened in the browser, and the demo.'],
      ['new', 'Version, in the Menu (with the helper). It shows the version you are on, a Roll back button for the one before, and after a roll back a Go forward button to return. DM Forge swaps its files, restarts the helper in the same Terminal window and reloads the page for you; your notes and unpushed changes are kept. Typing `forward` in the helper window does the same.'],
    ],
  },
  {
    version: '2.37.0', date: '2026-11-11', title: 'Sessions know their cast: a cast strip, add an NPC, populate a place, duplicate a note',
    changes: [
      ['new', 'Cast strip on every session: the party, the NPCs the session links to and the places it mentions, as chips. Click one to read it in the other pane (two columns turn on for you) while the session keeps the focus; Ctrl/⌘-click opens it in a new tab and Shift-click opens it in place. That is the quick way to flip between a session, a player and an NPC at the table.'],
      ['new', 'Add an NPC to a session: the strip\'s "+ Add an NPC" lists matching NPCs as you type and puts a link under the session\'s cast heading (the first heading with NPC, cast or people in it, such as "NPC\'s appearing in this episode"; a Cast heading is added if there is none). Type a new name and it makes the NPC for you, placed at the place you choose (the first place the session mentions by default).'],
      ['new', 'Populate this place: on a place\'s page, roll a handful of people (a tavern gets four, a town six, a shop two, or pick how many), re-roll any one, untick the ones you do not want, and Add makes them NPC notes placed there. Names already in your campaign are never rolled.'],
      ['new', 'Duplicate a note: Duplicate in the note\'s More menu (or the quick switcher) makes "Name (copy)" beside the original, with its title heading renamed, and opens it. A second copy is numbered. Handy for a stat block or a shop you want to reuse.'],
      ['fixed', 'The session list is newest first again. The new sort menu had put sessions in A to Z order; they now default to "Newest session first" and offer the other orders too.'],
      ['fixed', 'On a phone the back, forward and history buttons are tucked away so the top bar no longer scrolls sideways.'],
    ],
  },
  {
    version: '2.36.0', date: '2026-11-11', title: 'Finding things in a big campaign: quick switcher, back and forward, sort and filter, bulk edits',
    changes: [
      ['new', 'Quick switcher: press Ctrl+K (⌘K on a Mac), or the magnifier button beside the search box, and type. It finds notes (by name or text) and runs actions: go to any page, roll dice, log a line, open the cheat sheet, push, check for an update, change the layout, open the map of any place. If a name matches no note it offers to create an NPC, location, faction, plot thread or item with that name and opens it. Up and down to choose, Enter to open, Ctrl/⌘+Enter for a new tab. With nothing typed it shows your recent notes.'],
      ['new', 'Back and forward. Each tab remembers where it has been: the arrows at the top left (or Ctrl/⌘+[ and ]) go back and forward through notes and pages, and the history button lists the last dozen notes you opened, newest first.'],
      ['new', 'Sort and filter chips on every list. Sort by name, by recently edited (notes with unpushed changes count as just now) or by not touched for longest, which is handy for spotting neglected NPCs. Filter chips come from the list\'s own choices with counts: NPC status, plot thread status, item rarity, location type. Your choice is remembered for each list in each campaign.'],
      ['new', 'Bulk edits on every list. "Select several" now works on NPCs, locations, plot threads, items, players and the rest: tick notes (or All) and set their status or rarity, set their faction, move them to a place (or inside a place, for locations), add or remove a tag, or delete them. Everything stays a pending change until you push.'],
    ],
  },
  {
    version: '2.35.0', date: '2026-11-10', title: 'Big lists fold up by town: NPCs, factions and items',
    changes: [
      ['new', 'NPCs fold up by town. Once the NPC list is long enough (more than 20 by default; Menu, Settings, "Fold NPCs, factions and items up by town" changes that, or sets it to always or never) it groups itself by where they live, with every group folded up except the one holding the NPC you have open and any with unpushed changes. A group is the town: the nearest place, going outwards, whose Type is a town, city or village (otherwise the outermost place). Each group header shows how many people are in it, and each person says which place inside the town they are at.'],
      ['new', 'Group by: Automatic, Town, Exact place, Faction (NPCs) or one long list, with Collapse all and Expand all. Searching opens every group that has a match. What you opened and closed is remembered for each campaign. NPCs with no place are in "Not placed anywhere" at the bottom.'],
      ['new', 'Getting NPCs into places. An NPC\'s page has "Lives in", a list of your places. Drag an NPC onto a group\'s header to move them there (onto "Not placed anywhere" to clear it). "Select several" ticks a number of NPCs and moves them all to one place. If an unplaced NPC\'s own text mentions a place (a [[link]]), the list offers "Place at …" for them, and "Accept all suggestions" does the whole group in one click. The Overview says how many NPCs are not in a place yet, with a button that takes you to them.'],
      ['new', 'Factions and items work the same way: factions have a new "Based in" property and items a "Kept at", and their lists fold up by town like the NPCs. A place\'s page lists the items kept there.'],
      ['improved', 'A place with a crowd (more than 12 people) folds them up too: the people right there are shown, and each place inside it is a folded group with a count.'],
      ['improved', 'Placing something now edits the property or inline line the note already uses ("Location", "home", "**Location:** [[…]]"), so notes written in Obsidian either way stay consistent. Place names with numbers in them ("Route 66") no longer confuse the writer.'],
      ['fixed', 'The empty NPC page said "Select a npc"; it now says "Select an NPC".'],
    ],
  },
  {
    version: '2.34.0', date: '2026-11-09', title: 'Move places into other places',
    changes: [
      ['new', 'Places that already exist can now be moved inside other places, three ways. On a place\'s page, "This place is inside" is a list: choose where it goes, or Nothing to make it a top-level place. On the page of the place that should hold it, "Move an existing place in…" lists the places that are not inside it yet. And in the Locations list you can drag a place onto another to put it inside, or onto the "Drop here to make it a top-level place" strip that appears while you drag.'],
      ['new', 'A place can never be put inside itself or anything inside it (that would make a loop): those choices are not offered, and a drop on them does nothing. Everything moves with its place, so the places inside a moved town go with it.'],
      ['improved', 'Moving changes the one property that holds it, under the name the note already uses ("Within", or "parent", "located in"…), so there is never a second, competing copy. "Put an existing NPC here" on a place\'s page does the same for the NPC\'s Location.'],
    ],
  },
  {
    version: '2.33.0', date: '2026-11-09', title: 'Maps with pins: places on the map, maps inside maps, distances',
    changes: [
      ['new', 'Pin places on a map. On the Maps page each picture has an "Open as a map" button (and says how many pins it has). In the map view, "Pin places" lists the places inside the map\'s place that are not on it yet: pick one, click where it goes. Or click anywhere and name a place or just a label. Drag a pin to move it, give it a note, mark it secret or remove it. Works on any picture: downloaded maps, drawings, SVGs, with zoom for big ones.'],
      ['new', 'Click a pin to see the place (its kind, how many people are there), open its page, or open its own map. A map can say which place it shows ("This map shows"), so a pin for Greenhold on a region map opens the town map, and the town map has a "◂ Map of …" button back up: maps inside maps, following the places inside places.'],
      ['new', 'A place\'s own page now has a Map section: a small map with its pins that opens the full map, "Pinned on" links that open the map with that place\'s pin selected, and a list to choose a picture as the place\'s map.'],
      ['new', 'Measure and scale. Measure between two points or pins; tell it how far the line really is once and the map keeps its scale, then every measurement shows a distance in metric (or imperial, as in Settings) and a walking time. Player view hides the pins you marked secret, for showing the map to the table.'],
      ['new', 'The pins are saved in a small note beside the picture (type map, an image property, and a Pins list), so there is nothing to sync: a pin is a line with its position and a [[link]] to the place, and renaming a place updates its pins. Nothing is written until you push, like any note.'],
      ['fixed', 'Going somewhere from a tab that was showing a picture (a search result, the sidebar) did nothing: the tab stayed stuck on the picture. It now turns back into an ordinary page.'],
      ['improved', 'The demo campaign\'s three maps are pinned, with Greenhold\'s map leading down to the Weir\'s and the chapel\'s.'],
    ],
  },
  {
    version: '2.32.0', date: '2026-11-09', title: 'Places inside places, who is here, and a starting page for each kind of place',
    changes: [
      ['new', 'Sublocations. A place can sit inside another (a shop in a town, a room in a dungeon, a cave behind a weir) through its "Within" property, which was "Region" before and still reads that name, "parent", "located in", "inside" and "part of". The Locations list is now a tree, with each place indented under the one it is in and a note of how many are inside it. Filtering turns it back into a plain list.'],
      ['new', 'A place shows where it is: a trail of links (Greenhold › The Weir › The Hollow Reach) above its title, and a "Places inside" section with a button, "Add a place inside", that starts a new place already set to be within this one. Places can nest as deep as you like; a loop (A inside B inside A) is cut rather than followed.'],
      ['new', 'Who is here. A place\'s page lists the NPCs whose Location points at it or at anything inside it (saying where, for the nested ones), the last session that mentioned it or something inside it, and the factions, plot threads and other people that mention it. You can add a new person straight into the place, or pick an existing NPC to put there (it changes just their Location). It all comes from your notes; nothing extra is stored.'],
      ['new', 'Starting pages by kind of place. New Location now has a Type list: Town or city, Village or hamlet, Tavern or inn, Shop or market stall, Temple or shrine, Castle or fort, Dungeon or keyed area, Wilderness or region, Landmark or ruin, Building or room. Pick one and the page starts with the headings that suit it (a tavern gets Food, drink and prices, Rooms and Regulars and gossip; a dungeon gets numbered Rooms). Type anything else and you get the old plain page.'],
    ],
  },
  {
    version: '2.31.0', date: '2026-11-03', title: 'Clocks that belong to plot threads, odd clock sizes, tidier dropdowns',
    changes: [
      ['new', 'A clock can belong to a note, such as a plot thread. On the Clocks page each clock has a "Belongs to…" box (pick a plot thread, or any note); the thread\'s status (Active, Dormant, Resolved) shows next to the clock. On the note\'s own page its clocks appear under the Properties, with a picture of the clock and − / + buttons, so you can tick it without leaving the thread. A thread can have several clocks.'],
      ['new', 'The link is a plain [[link]] in the clock\'s line in the "Clocks and Standing" note, so it shows up as a link and a backlink in Obsidian too, and renaming the thread updates it. There is still only one copy of each clock, so the two places can never disagree. Nothing changes the thread\'s status when a clock fills.'],
      ['new', 'Clocks can have 2, 3, 4, 5, 6, 7, 8, 9, 10 or 12 slices (it was 4, 6, 8, 10 and 12). Clocks you already have are not changed.'],
      ['improved', 'Every dropdown now has the same arrow, set in from the right edge, with room so long text never runs under it. Before, they used the browser\'s own arrow, tight against the edge and different from one browser to the next.'],
    ],
  },
  {
    version: '2.30.2', date: '2026-11-03', title: 'Update from inside the app, and DM Forge reopens your last campaign',
    changes: [
      ['new', 'DM Forge remembers the campaign you were last in and goes straight back into it when it starts, instead of showing the campaign list. A short note says what it did. Switch campaign still takes you to the list and stays there. If the folder has been moved or renamed, the list shows quietly. Turn it off in Menu, Settings, "Open the campaign I was last in".'],
      ['new', 'You can now update without the Terminal. Download the new DM-Forge-V2.zip as usual; when you come back to DM Forge a bar offers "Install and restart" (the helper looks in your Downloads folder). It installs the zip, restarts the helper in its own window on the same link, and reloads the page. Your unpushed changes are kept, the old version is kept for rolling back, and the zip goes to the Trash.'],
      ['new', 'Menu, "Check for an update" does the same on request, and says plainly when there is nothing newer. "Not now" hides the bar for that version.'],
      ['improved', 'Typing update in the Terminal still works exactly as before; use whichever you like. The first update to this version still needs the Terminal (or closing and starting again), because the helper you are running does not know about this yet.'],
    ],
  },
  {
    version: '2.30.1', date: '2026-11-02', title: 'Double-click between parts of a note to add a line',
    changes: [
      ['new', 'Double-click the empty space between two parts of a note (for example between "Recap" and "Session log" on a session) to add a line right there, without going into Edit. Under a bullet list it adds a bullet; anywhere else it adds a paragraph. Enter adds it, Shift+Enter makes a new line inside it, Esc cancels. Double-clicking under the last part adds one at the end.'],
    ],
  },
  {
    version: '2.30.0', date: '2026-11-02', title: 'Level up, an item library with a builder, and copying into a campaign',
    changes: [
      ['new', 'Level up: a "Level up" button on every library character made in the creator. It shows what the new level gives (features, proficiency bonus, spell slots), asks for exactly the choices that level needs, and shows the sheet before and after: hit points (the average, a roll, or the number you rolled at the table), an ability score improvement or feat (up to 20; an Epic Boon can go past it), Expertise, and new spells. You can go up several levels at once. Nothing is saved until you confirm.'],
      ['new', 'The character file now records those choices ("Level 4: +2 Str", expertise, rolled hit points) and the numbers follow: scores, hit points, skill bonuses with Expertise, spell save DC and slots. Dwarves now add their extra hit point each level.'],
      ['new', 'Characters made at level 4 or above in the creator are owed their ability score improvements; the creator says so and Level up asks for them.'],
      ['new', 'Character Library has two tabs, Characters and Items. Items live in "Character Library/Items" as plain markdown notes (type item, rarity, attunement, charges, and an AC bonus in the properties) that read normally in Obsidian.'],
      ['new', 'The item builder: name, kind, which weapon or armour, rarity, attunement (and who), attack and damage bonus, Armor Class bonus, extra damage, charges and how they recharge, a description, named extra properties, and a For the DM section (curse, history, hook). A live preview shows the note as it will be read.'],
      ['new', 'Start an item three ways: from scratch, from the 265 SRD 5.2.1 magic items (search by name, kind and rarity; weapon and armour variants are folded into one entry with a "applies to" choice), or from the random Magic Item generator, which opens in the builder to be changed. Nothing is saved until you press Save.'],
      ['new', 'A character can carry library items (Equipment step). Items that need attunement show a checkbox and a count out of three; an item with an Armor Class bonus raises the character\'s Armor Class once attuned (straight away if it needs no attunement). The sheet and the file list them as links.'],
      ['new', '"Add to campaign" on any library character or item copies it into the campaign you have open, as pending changes in the right folder (NPCs, Players or Items): as a player it appears in the Party table with its level, hit points and Armor Class. It can bring along the magic items a character carries (skipping ones the campaign already has). The copy is an ordinary note that remembers its source in a "library" property; the library file is left alone.'],
    ],
  },
  {
    version: '2.29.0', date: '2026-11-02', title: 'A calmer, roomier look: new sidebar, Favourites, warm dark mode',
    changes: [
      ['new', 'A new sidebar with four groups (Story, World, Table, Reference) and icons. Only one group is open at a time, so it never needs scrolling; the one holding the page you are on opens by itself. Counts are dimmed, and Characters (your library) sits below on its own.'],
      ['new', 'Favourites: star any page (or a single note, from its ... menu) or drag it into the Favourites section at the top of the sidebar. It stays in its own group as well. Drag to reorder; the x unpins. Kept per campaign in this browser.'],
      ['new', 'Dark mode now has two styles, in Menu, Settings: Warm (the new default, softer on the eyes) and the earlier Blue-grey. Both fade in like before.'],
      ['improved', 'The top bar is icon-only (hover for the name) with a Push button that is always readable: "Nothing to push" when idle, "Push 3 changes" when not. The campaign name opens a small menu to switch campaign, reload, or edit the folder mapping.'],
      ['improved', 'Overview now leads with your next session (its title, scenes and a timer, with Open and New buttons) instead of tiles of numbers. "What am I forgetting?" stays right under it.'],
      ['improved', 'A note has one clear Edit button; everything else (rename, move, pin, delete, Ask Claude, reformat and so on) is in a ... menu, links are in a Links menu, and Properties fold away.'],
      ['improved', 'Graph: big campaigns open around their most-linked note instead of a hairball; only the main notes are named (and names never overlap); the filters live behind a Filters button, so the picture gets the whole width.'],
      ['improved', 'Combat: an Add panel with Party, Monsters and Custom tabs, and a proper empty state with what to do first. Party: Gold and XP columns are hidden until you ask for them, and Spotlight is folded into a section.'],
      ['improved', 'Narrow windows: the sidebar becomes a slide-in drawer (menu button at the top left) and, on a phone, the table tools move to a bar at the bottom.'],
      ['improved', 'More room and clearer type everywhere: larger, steadier spacing, text never smaller than 13 px, and a comfortable reading width for notes.'],
      ['fixed', 'The guided tour card could cover the thing it was describing or run off the edge of the window. It now measures itself, sits below, above or beside what it points at, and stays inside the window at any size. Steps that point into a folded sidebar group highlight the group.'],
    ],
  },
  {
    version: '2.28.3', date: '2026-11-02', title: 'Sample and example content is kept apart from your own',
    changes: [
      ['improved', 'The example characters from the sample campaign now go in their own folder, "Character Library/Examples", never among your own characters. The Character Library shows yours first, then a collapsed "Examples (10)" section with a "Remove all examples" button (they go to the vault\'s trash). An example you edit stays an example; a copy of one is yours.'],
      ['improved', 'If example characters from the earlier version are already mixed in with yours, the library notices them and offers "Move them into Examples". Only files that are exactly as the sample wrote them are moved; one you changed, or made yourself with the same name, is never touched.'],
      ['improved', 'In the sample dialog, "Also add example characters" now starts off, so nothing lands in your Character Library unless you ask.'],
      ['new', 'Menu, "Remove the sample campaign" (only shown inside the sample): moves the sample\'s notes that you have not changed to the vault\'s trash. Notes you added or changed stay. The sample\'s own note carries a "dmforge_sample" property to mark it. Empty folders are left behind, because the helper only moves notes.'],
    ],
  },
  {
    version: '2.28.2', date: '2026-11-02', title: 'The full Ashfall campaign in "Add the sample campaign to my vault"',
    changes: [
      ['improved', 'Menu, "Add the sample campaign to my vault" now writes the whole Ashfall showcase campaign into a new folder in your real vault: 16 NPCs, 4 players, places, factions, plot threads, six sessions (one played with a log and Close out, one ready to run), items, a Bestiary, clocks and faction standing, a cheat sheet, your own generator rows and tables. It is already sorted into categories, so it opens without asking. The map pictures stay in the practice demo (the helper only writes notes). Before, it wrote a much smaller campaign.'],
      ['new', 'The same dialog can also add ten example characters to your Character Library (levels 1 to 20, players and NPCs). A character that is already in your library is never replaced, and the campaign still goes into a new folder only.'],
    ],
  },
  {
    version: '2.28.1', date: '2026-11-02', title: 'A fully loaded demo campaign',
    changes: [
      ['improved', 'The demo vault (Try the demo vault) is now a complete, lived-in campaign, so every part of DM Forge has something to show. Ashfall has 16 NPCs, 4 players with their numbers, 9 places, 5 factions, 7 plot threads, 6 sessions, 9 items, 3 maps, and a Bestiary of 6 creatures. It opens straight into the campaign, with nothing left over from last time.'],
      ['improved', 'It is set up for the tools: Session 13 has a live log (reveals, rulings, decisions, promises, hooks, loot, spotlight moments), the players\' recap, your recap and "Next time" from Close out, and an absent player; Session 14 is ready to run, with must-happen items, scenes for the timer, secrets with and without enough clues, and encounters. "What am I forgetting?" has quiet threads and NPCs, the Party page has a spotlight gap, the Clocks page has four clocks and five factions, and a fight is already lined up in the encounter budget (three cultists and a Chapel Warden).'],
      ['improved', 'Also in the demo: your own cheat sheet cards, your own generator rows, two rolled tables, and a Character Library with ten finished characters (levels 1 to 20, casters, a Warlock, an Archmage), some with full backstories and some as quick NPCs.'],
    ],
  },
  {
    version: '2.28.0', date: '2026-11-02', title: 'Character Library and the character creator',
    changes: [
      ['new', 'Character Library: a place for player characters and NPCs that belongs to no campaign. It lives in "Character Library/Characters" at the root of your vault, one plain markdown file per character. Open it from the campaign picker (the "Character Library" button) or from inside a campaign (Tools, Characters). Search it, filter players and NPCs, open a sheet, edit, copy or delete (deleted files go to your vault\'s trash folder).'],
      ['new', 'Character creator, in seven steps with the numbers updating beside you: Class (all 12 SRD classes, level 1 to 20, subclass from level 3, class skills, every feature up to your level), Origin (the 9 SRD species with their traits, the 4 SRD backgrounds, the background\'s ability bonus, and the Human skill and feat), Abilities (standard array, point buy, 4d6 drop the lowest, or manual), Spells (casters only: cantrips and prepared spells picked from the 339 SRD spells, limited to your class, your slots and the counts in the class table), Equipment (the real starting kits, or the gold, plus any gear you add: armour changes your Armor Class), Details and Review.'],
      ['new', 'The numbers come from the SRD tables, not from memory: hit points (the fixed average), Armor Class (armour, shield, and Unarmored Defense for Barbarians and Monks), proficiency, saving throws, skills, passive Perception, spell save DC and attack, spell slots (including Warlock Pact Magic), and the class\'s per-level numbers such as Rages and Sneak Attack. Speed and sizes are metric.'],
      ['new', 'Details, as deep as you like: Quick (just the basics), Standard (adds appearance and personality) or Deep (adds backstory, family tree, timeline, relationships, ties to the other PCs, hooks for your DM, notes). A PC gets "Bonds with the other PCs" and "Hooks for your DM"; an NPC gets "Running this NPC" (what they want, what they know, their secret, how to play them). Each section has a few main fields and "show more fields". The dice button next to trait, ideal, bond, flaw, fears, quirks, goal, voice and mannerisms suggests one from a table. You can add sections of your own. Sections you leave empty are never written.'],
      ['new', 'The file is plain markdown that reads well in Obsidian: properties (class, level, HP, AC, ability scores, passive Perception) and a character sheet with its features, spells and equipment. The details sections are read back from the text, so something you change in Obsidian is what the creator shows next time. A hidden comment at the end holds the picks the creator needs. A markdown file you made by hand is listed and can be viewed, but not edited in the creator.'],
      ['new', 'The sheet can be printed (Print the sheet): the stats and features on the first page, the details after them.'],
    ],
  },
  {
    version: '2.27.0', date: '2026-11-02', title: 'Import last session',
    changes: [
      ['new', 'Import last session: what Close out saved in the previous session (your recap, the "Next time" tasks, any must-happen items not yet done, promises and hooks you logged, and the secrets the players have not found yet) can now be brought into the next session with one click. There is an "Import last session" button on every session note, and the New session window has a "Bring in last session" box (ticked when there is something to bring in) that does it as the session is made. It writes a "Last time" section just before the Prep: "Previously, in [[Session 12]]" with the recap, "To carry over" as tasks you can tick, and "Secrets still hidden". If the previous session was not closed out, it falls back to the players\' recap, and then to the log.'],
      ['new', 'Pressing it again refreshes the section instead of repeating it: the recap is updated, and tasks you ticked or added yourself are kept. A task done in the newer session no longer shows as waiting on the Overview, even though the older session still lists it.'],
    ],
  },
  {
    version: '2.26.0', date: '2026-11-02', title: 'Session zero kit, a guided tour, and a sample campaign',
    changes: [
      ['new', 'Session zero kit (Menu, or the start card on the Overview): four short steps (the campaign, the table, the players, check and create) that turn a few answers into your first notes. The campaign: premise, setting, tone, how much combat, exploration and roleplay, starting level and length. The table: when you play, lines and veils, safety tools (X-card, pause, check-ins, script change tools), how you play together, and house rules to tick. The players: each becomes a note under Players with their class, level and prompts for backstory and hooks. It makes a "Session Zero" note, a questionnaire to send your players, a first plot thread, and Session 1 with a prep outline (a strong start, three scenes with times for the session timer, secrets and clues, and what must happen). Everything is a pending change until you push; a note that already exists is never replaced.'],
      ['new', 'Guided tour (Menu, "Take the tour", or the start card): fifteen short stops that light up the sidebar, search, a note, the log, dice, the timer, Generate, Combat, the party and encounter budget, secrets and clocks, "What am I forgetting?", Snapshot and Claude, and Push. Arrow keys move through it and Esc leaves it.'],
      ['new', 'Sample campaign: Menu, "Add the sample campaign to my vault" writes a complete small campaign (NPCs, players, places, a faction, plot threads and two sessions) into a new folder in your vault, to explore or learn from. It never writes into a folder that already has something in it and never touches your own notes. For a try-out that saves nothing at all, "Try the demo vault" on the start screen is the practice campaign, now labelled as one, and its Overview says nothing is saved.'],
      ['new', 'A start card on the Overview for anyone new (the tour, the session zero kit, the sample campaign), which you can hide.'],
    ],
  },
  {
    version: '2.25.0', date: '2026-11-02', title: 'Secrets and clues, spotlight, clocks and standing, and a name checker',
    changes: [
      ['new', 'Secrets and clues (Tools, Secrets): everything the players could learn, and where they could find it. Secrets are tasks under "## Secrets and clues" in a session or plot thread note ("- [ ] The ferryman sold the bells \u2014 Old Tam\'s ledger; the missing rope"), so you can write them in Obsidian too, or add them from the page. It warns when a secret has fewer than three ways to be found. Tick one when the players learn it: it is marked "revealed in" that session in the note, and a Reveal line is added to the session log. The Overview\'s "What am I forgetting?" now lists secrets not yet revealed.'],
      ['new', 'Spotlight: a new Spotlight tag in the log box (Alt+7). Log a line with it that names a player, and the Party page\'s Spotlight card counts moments per player over the last four sessions, quietest first, with a "+ Moment" button on each. Anyone who is away is not called quiet, and the Overview says who has had no spotlight lately (once you use the tag).'],
      ['new', 'Clocks and standing (Tools, Clocks): progress clocks as pies (4 to 12 slices, +/\u2212, and what happens when it is full), and faction standing from Hostile to Allied for any of your Factions. They are kept in a plain note, "Clocks and Standing", that you can read and edit in Obsidian. A clock filling and a change of standing are added to the session log.'],
      ['new', 'Name checker: when you name a new note, save a generated result, rename a note, or look at a generated NPC, tavern, shop, villain, settlement or festival, DM Forge tells you if the name is already used, or if the first name, the family name or a close spelling matches another NPC, player, place, faction, thread or item, with links to them. Titles such as Captain and Old are ignored.'],
    ],
  },
  {
    version: '2.24.0', date: '2026-11-02', title: 'Rename notes, a dice roller, a session timer, quick-peek, and rules and spells',
    changes: [
      ['new', 'Rename any note: "Rename…" on a note (or F2, or double-click its title, or right-click a [[link]] and choose "Rename this note…"). You can change the file name, the title heading inside the note (it follows the file name while they match, or change it on its own), and the links to it. Every [[link]] to the note in every other note follows the new name, in the text and in properties, including [[Name|words]], [[Name#Heading]] and embeds, and nothing inside code is touched. A preview says how many links in how many notes will change, and you can keep the old words showing in those links ([[New|Old]]). Names another note already has, names with only capital letters changed, and characters a file name cannot have are caught first. It is a pending change like any other: pushing renames the file in your vault.'],
      ['new', 'Dice: a Dice button in the top bar (Option+D on a Mac, Alt+D elsewhere) opens a floating roller: d4 to d100 in one click, how many and a modifier, advantage or disadvantage on a d20, and a box for any expression (2d6+3, 4d6kh3, d20+5, 1d8+1d6+2). It shows a big total with the breakdown, marks a natural 20 or 1, keeps a history (also in the browser), and can add a roll to the session log.'],
      ['new', 'Dice written in a note are buttons: "2d6 + 5" in a stat block or spell, a bare d20, and the bonus after "Attack Roll:" (as d20+9). Click to roll; Shift-click for advantage, Alt-click for disadvantage. Code and headings are left alone.'],
      ['new', 'Session timer: a clock chip in the top bar. Start, pause and reset it, and it reminds you to take a break every 30, 45, 60 or 90 minutes (or never). Plan scenes as tasks under "## Scenes" in the session note ("- [ ] The ambush (20 min)") or add them from the timer; "Done" ticks the scene, notes how long it took, and adds a line to the session log. It shows how many scenes are done, how much is planned and left, and whether you are ahead or behind.'],
      ['new', 'Quick-peek: hover (or tab to) a [[link]] and a small card shows what the note is: its kind, key properties and the start of its text, without leaving the page. In a fight, hovering a creature\'s name shows its note, and hovering a condition shows what it does.'],
      ['new', 'Rules (Tools, Rules): all 339 spells of the 2024 SRD (5.2.1, CC-BY 4.0), searchable by name or text and filtered by level, school, class, concentration and ritual, with distances in metres if that is your setting; dice in a spell are buttons. "Save to my notes" makes an editable note in a Spells category. The Conditions tab, and the hover text in combat, give a short reminder of each condition, written for DM Forge from the 2024 rules (check the book for exact wording).'],
    ],
  },
  {
    version: '2.23.1', date: '2026-11-01', title: 'Password managers, again: this time for real',
    changes: [
      ['fixed', 'Bitwarden\'s menu ("No items to show", "New login") was still appearing on the log box. Two causes, both fixed. The log field\'s id contained the word "login" once lower-cased (logInput), which is what Bitwarden looks for, so it is now a neutral id, name and label. And the "ignore me" marks were being added just after a field appeared, which is too late for extensions that decide once when a field first shows up: they are now put on the field when it is created, before it reaches the page, for every text box, search box and dropdown in the app.'],
    ],
  },
  {
    version: '2.23.0', date: '2026-11-01', title: 'A round-by-round combat log, pinned combat controls, and tidier fields',
    changes: [
      ['new', 'Combat log: every change in a fight is written down as it happens, by round and by whose turn it is: damage and healing (with before and after, temporary hit points absorbed, who dropped), conditions, death saves, reactions, legendary actions, recharge rolls and per-day uses, creatures joining and leaving, and changed initiative. The Log tab beside "Add to the fight" shows it live, with a heading for each turn, turns where nothing happened joined on one line, and a box to add your own line ("The dragon used Frightful Presence"). Each line says whose turn it was.'],
      ['new', 'End combat now saves the whole log in the session note as a folded callout ("Combat log") under the final summary, instead of only who is left standing. "Save to session now" (in the Log tab) does it mid-fight, and doing it again updates the same block. Undo takes a line out of the log too. A fight saved by an older version still works.'],
      ['improved', 'Combat controls stay put: the bar with the round and whose turn it is, Next turn, Undo, Roll for enemies and End combat stays at the top as you scroll, and the Add / Log panel on the right stays in view. Next turn scrolls to the creature whose turn it is. Delete combat has moved into the End combat window ("Delete instead…"), where it cannot be hit by accident.'],
      ['improved', 'Party: editing a player\'s level, HP, AC, passive perception, gold or XP now changes the number where it already is on their sheet: a property is updated as a property, and a line like "Level:: 5" or "**HP:** 38" in the text is edited in place (keeping words such as "5th" or "gp"). A property is only added when the sheet has the value nowhere. Players with no level are asked for it right in the encounter budget card.'],
      ['fixed', 'The encounter budget\'s "No monsters yet" label and its bar picked up the dashed empty-state box style and overlapped the section below. They are plain now.'],
      ['fixed', 'Password managers (Bitwarden, 1Password, LastPass, Dashlane) no longer attach their menu to DM Forge\'s fields, such as the log box. Every text field, search box and dropdown is marked to be ignored, including those in dialogs opened later; none of them is a login.'],
    ],
  },
  {
    version: '2.22.0', date: '2026-11-01', title: 'The party, who is here, and how hard a fight is',
    changes: [
      ['new', 'A Party page (Tools, Party): each player with their level, max HP, AC, passive perception, gold and XP, all editable in place and saved as properties on their note (the player properties gain Passive Perception, Gold and XP). Pick a session and untick whoever was away: that is saved on the session note as an "absent" list, and the footer shows the gold and the average level of those who are here.'],
      ['new', 'Encounter budget, on the Party page, using the 2024 rules: the budget is each character\'s number for their level (Low, Moderate, High), added up for the people who are here. Search any monster (the built-in ones or your Bestiary), add as many as you like, and it totals their XP and says whether the fight is Low, Moderate, High or beyond High, with a bar. Each search result shows how many of that monster fit each tier. You can add extra characters for a guest or a player with no note.'],
      ['new', '"Send to combat" puts the whole encounter in the fight with initiative rolled for each. The encounter is remembered when you leave the page or close it. "Add the party" in Combat now leaves out anyone marked as away.'],
      ['improved', 'The per-character table is the one in the 2024 Dungeon Master\'s Guide, which is not in the free SRD. It was transcribed from a secondary source (and cross-checked against the figures in several others), so check it against your book; it is one small table in src/core/party.js.'],
    ],
  },
  {
    version: '2.21.0', date: '2026-11-01', title: 'A monster library, and a better combat tracker',
    changes: [
      ['new', 'Monster library (Combat, "Monster library…"): all 331 creatures from the 2024 System Reference Document (SRD 5.2.1) come with DM Forge, and so do any notes of your own in a Bestiary, Monsters or Creatures folder (marked "Mine"). Search by name or type, filter by challenge rating and type, read the full stat block (in metres, if that is your setting) and add any number of them to the fight in one click, with initiative rolled for each. Tick "Roll HP" to roll each one\'s hit dice instead of using the average.'],
      ['new', '"Save to Bestiary" makes an editable note from an SRD monster (properties for CR, AC, HP, initiative and the stat block), in a Bestiary category that is made if you have none. It is then yours: it shows in the library, and adding it to a fight uses its properties. A note with "AC 15" or "HP 22" in its text works too.'],
      ['new', 'The creatures in a fight can show their stat block (a "Stat block" button on the row). Dragons and other creatures from the library come with their legendary actions counted (they refill when the creature\'s turn begins) and their recharge and per-day abilities as buttons (with a d6 roll for recharge).'],
      ['new', 'Combat: temporary hit points (damage uses them first; they do not stack), death saves for a player at 0 hit points (success, fail, a hit for two fails, natural 20, reset; three of either settles it), a Reaction used marker that clears at the start of that creature\'s turn, a note on each creature ("Concentrating on Bless"), and Undo for the last change to the fight (several quick changes count as one).'],
      ['improved', 'Exhaustion and Petrified are in the list of conditions. A fight is restored when you reopen the page, and DM Forge now says so. Healing a player who is at 0 brings them back up and clears the death saves.'],
      ['improved', 'Settings, "Monster library": switch the built-in monsters off if you only want your own. The credit the SRD licence asks for is shown with the built-in monsters and on the saved notes.'],
    ],
  },
  {
    version: '2.20.0', date: '2026-11-01', title: 'What am I forgetting?',
    changes: [
      ['new', 'A new card at the top of the Overview, "What am I forgetting?". It needs no Claude; it reads your vault. It lists what is waiting for you (unticked MUST HAPPEN items and "Next time" tasks from your latest sessions, and any promises or hooks you logged and have not ticked off), the active plot threads that no session has mentioned for a while (with their next step), and the living NPCs who have appeared before but not lately, most important first (by how many notes link to them).'],
      ['new', 'Tick a task on the card and it is ticked in the note it came from (the log, the Next time list, or both if they are the same promise). "Add to <session> prep" writes the whole card as a "Before we start" checklist at the end of that session\'s Prep (once; doing it again changes nothing).'],
      ['new', 'Settings, "What am I forgetting?": how many sessions without a mention before a thread or NPC counts as neglected (2 to 6, 3 to begin with). A note counts as mentioned in a session when that session\'s note links to it or names it.'],
    ],
  },
  {
    version: '2.19.0', date: '2026-11-01', title: 'Log the session as you play, and close it out afterwards',
    changes: [
      ['new', 'Log: a button in the top bar (and Option+L on a Mac, Alt+L elsewhere) opens a small box that floats over whatever you are looking at, so combat and notes stay in view. Type what just happened and press Enter: it is added to the end of a "Session log" section in the session note as a timestamped line, and the box stays ready for the next one. It logs to the newest session, or any session you pick in the box (it remembers your choice).'],
      ['new', 'Tags: Reveal, Loot, Decision, Ruling, Promise and Hook (click one, or Alt plus 1 to 6, before pressing Enter). They are written as #tags in the line. Promise and Hook lines become tasks ("- [ ]"), so you can tick them off in DM Forge or Obsidian.'],
      ['new', 'Type @ and a few letters to link a note: the matching notes appear, and Enter writes the [[link]]. Undo last takes back the line you just added. Lines are pending changes like any other, and they are kept in the browser, so a refresh does not lose them; push when you finish.'],
      ['new', 'Close out…, on any session note: after the session, Claude reads your log, your notes (and your combat summaries) and proposes a recap for you, updates to the plot threads and NPCs that moved (a new status and a line that links back to the session), and loose ends, promises and hooks to carry to next time. If the note has a players\' recap, it also lists where that differs from your log. You tick what you want and edit anything; nothing is changed until you press Apply. It runs in the background, with a pill in the top bar like the snapshot.'],
      ['new', 'Your recap is saved under "DM recap", the carry-over as tasks under "Next time", and the differences under "Recap check", each in a marked block that is updated (not repeated) if you close out again. The players\' own Recap section is never touched. "Just tidy the log" does a plain version with no Claude: the log becomes the recap, and open promises and hooks become the next-time tasks.'],
    ],
  },
  {
    version: '2.18.0', date: '2026-10-29', title: 'A Snapshot button that is always in the top bar',
    changes: [
      ['new', 'The top bar now always has a Snapshot button, just left of Layout. Press it to make the campaign snapshot, or to refresh it once there is one, without going through Settings. It shows a small dot when the snapshot is worth refreshing, and hovering over it says when the snapshot was made and what has changed. It is greyed out, with a note, when Claude is off. While a snapshot is being made the button gives way to the progress pill, and comes back when it is done.'],
    ],
  },
  {
    version: '2.17.3', date: '2026-10-28', title: 'Turn refilled rows into a note',
    changes: [
      ['new', 'When you review what Claude wrote for a refill, you can now also make a note from it, in any category (NPCs, Locations, Factions, and so on). Tick "Also make a note from these", choose the category and a name, and the note is the sheet that is on the page, with one row picked for each table you refilled (the first one you ticked, or any other you choose, or keep the one on the page). It works for every generator, and the name starts as the name on the sheet.'],
      ['new', 'The two choices are separate: "Add the rows to the generator\'s tables" (ticked to begin with) and "Also make a note from these" (not ticked). Do either or both. A note with a name that already exists is numbered rather than replaced. Both are pending changes until you push.'],
      ['improved', 'Why the name was not saved with the rows: Name is not a table, it is made fresh from the NPC\'s race each time, so the refill only fills tables like Quirk, Voice and Wants. The new note carries the name from the page.'],
    ],
  },
  {
    version: '2.17.2', date: '2026-10-28', title: 'Long rows wrap when you review what Claude wrote',
    changes: [
      ['fixed', 'In the refill and make-a-table windows, a long row ran off the edge of its box, so you had to scroll sideways inside it to read the end. Each row now wraps onto as many lines as it needs, grows and shrinks as you edit it, and still lets you change the text (Enter does not add a new line, since a row is one line of text).'],
    ],
  },
  {
    version: '2.17.1', date: '2026-10-28', title: 'The snapshot runs in the background, and the campaign shows through much more',
    changes: [
      ['new', 'The snapshot is made in the background: press Send and the window closes, and you carry on using DM Forge. A pill in the top bar, just left of Layout, shows how it is getting on ("Snapshot · Reading part 2 of 3 · 1:23"). When it is done it turns into "Snapshot ready: review", which opens the answer to read, edit and save (or throw away). If it fails the pill goes red and opens the reason, with Try again. You can stop it from the window.'],
      ['improved', 'Claude answers one thing at a time, so while the snapshot is being made the other Claude buttons (Ask Claude, Expand, Refill, Make a table) say Claude is busy and wait, instead of failing. Notes you change while it reads count as changed afterwards, so the "worth refreshing" hint stays honest.'],
      ['improved', 'Stronger campaign inspiration: the question now says the campaign is the most important part, and by default asks for at least two rows in three to name or refer to a specific person, place, faction, thread or event from your campaign, spread around, and not to follow the generic examples. A new "How strongly" choice in the refill and make-a-table windows has Light touch, Strong (the default) and Very strong, where every row must name something from your campaign. It is remembered.'],
      ['improved', 'Much richer campaign context when it is built from your notes (no snapshot needed): the overview, where the story is now (the latest session recaps), the plot threads with their status and next steps, your player characters, and for each person, faction and place who they are, what they want and who they are tied to. DM-only text (a Secret, Hidden or DM section) comes too, with a box to leave it out.'],
      ['improved', 'New rows now start at 5 instead of 20.'],
    ],
  },
  {
    version: '2.17.0', date: '2026-10-27', title: 'Pick several generators, refill several tables, and a campaign snapshot',
    changes: [
      ['new', 'Pick several generators at once: every generator tile has a small tick box (and Ctrl/⌘-click ticks it too). A "Picked" bar collects what you tick, even from different groups, with a ×1 to ×3... stepper for each (three NPCs in a crowd) and a cap of 8 sheets in all. "Roll them" puts every result on one page, one under another, in the order you picked, with chips at the top that jump to each one. Every sheet keeps its own lock, reroll and options; "Roll all again" rerolls the lot (locks respected) and "Roll this again" just one.'],
      ['new', 'Save all to campaign…: one window lists every result with where it usually belongs (a tavern to Locations, an NPC to NPCs), a name for each, and a tick to leave one out. "Put them all in session prep" sends everything to a session as foldable entries. Copy all puts every result on the clipboard.'],
      ['new', 'Combos: save what you have picked as a one-tap set ("Save as a combo…"), such as A night at the inn = a Tavern, two NPCs and Rumors. Combos sit on the Generate home screen with a ✕ to delete (it asks first), are saved in Settings, and a generator you have switched off is simply left out. Three starters are there to begin with: A night at the inn, Market day, Trouble on the road.'],
      ['new', 'Refill several tables at once: the refill window now has a tick for each of a generator\'s tables (and Select all). They go in one request and come back as one review list with a section per table; tick the rows you want and they are all saved together. It says how many rows that will be at most, and warns when the request is very big.'],
      ['new', 'Campaign snapshot: Menu, Settings, "Campaign snapshot" has "Make a snapshot…". Claude reads your notes once and writes a summary of about 1,500 words (premise and tone, where the story is, open threads, factions, key people, places, recent sessions, and the DM-only secrets in their own section), saved as the note "Campaign Snapshot" in your campaign so you can read and edit it in Obsidian. A big campaign is read in parts and joined. You see what will be sent, and edit the answer, before saving.'],
      ['new', 'The snapshot tells you how far the campaign has moved on: "Made 4 days ago · 3 notes changed, 1 new", and a "worth refreshing" hint when 5 or more notes (or 15%) have changed, or any session note has. It only refreshes when you press Refresh.'],
      ['improved', '"Use my campaign as inspiration" can now use the snapshot (it does, once there is one) or build from your notes live, with a switch to leave the secrets out. It also says when the snapshot looks out of date.'],
      ['fixed', 'The "Recently" chips on the Generate home screen showed as plain grey boxes; they now look like the rest of the screen.'],
    ],
  },
  {
    version: '2.16.1', date: '2026-10-26', title: 'Generate: choose which generators show, and a stricter check of the new screen',
    changes: [
      ['new', 'Choose which generators show: Menu, Settings, "Generators shown on the Generate screen" (or the link at the bottom of the Generate home screen) has a tick box for each of the 24, with Show all and Hide all, and one switch per group. The ones you switch off disappear from Generate, from the search and from "Just surprise me", and a group with nothing left disappears too. It is saved in Settings, so you do not have to set it again. Nothing is deleted.'],
      ['new', 'Recently: the Generate home screen shows the generators you opened last (up to six, newest first) as one-tap chips, for when you are at the table and want the same ones again.'],
      ['fixed', 'The small line above a title (for example "Human · Mercenary") could not be locked, so Roll again still changed it even with everything else locked. It now has its own lock and reroll like every other part.'],
      ['fixed', 'On the light theme, the small gold text (the labels, the line above a title, the links) was too faint to read comfortably. It is now a darker gold there (and still bright on the dark theme).'],
      ['improved', 'The Save, Copy and Expand buttons are back to sitting at the end of the page (they were meant to stay in view as you scroll, but that left part of the text peeking out below them). Roll again stays at the top.'],
      ['improved', 'Tested far harder: every one of the 24 generators, every part, option and button; hostile text in the search box and in Claude-table rows (scripts, images, huge lines, broken notes); 150 rolls in a row; every page at four window sizes in both themes; keyboard use; panes and pinned tabs; and 700 random clicks.'],
    ],
  },
  {
    version: '2.16.0', date: '2026-10-26', title: 'Generate, rebuilt: quiet, guided, and readable',
    changes: [
      ['new', 'Generate starts with one question, "What do the players need right now?", and five plain tiles: Someone to talk to, Somewhere to go, Something to find, Trouble, A reason to care (plus Just surprise me). A tile lists that group\'s generators, each with a one-line description, and a small box finds a generator by name. Dice and your tables are one quiet step away ("Dice and my tables").'],
      ['new', 'A result is now a page you could read aloud, not a card: a small line saying what it is, the name as a title, a lead paragraph, then headed sections with the label above the text. A shop opens with its first impression and hours; an NPC with their look; a trap with what it does.'],
      ['fixed', 'Long text no longer squeezes into a narrow column with the label beside it: the text uses the full width of the page (about 68 characters a line) and the stock and other lists run in two columns when the lines are short.'],
      ['improved', 'One obvious button: Roll again, at the top right of the page. Lock and reroll for a part (the name, the lead, a section) appear when you point at it. Options (ancestry, shop type, size) are small and sit under the title. Save to campaign, Copy, Expand with Claude and Refill tables stay at the bottom, always in reach as you scroll.'],
      ['improved', 'Copy puts the page on the clipboard as it reads (title, then each section with its label). Each Generate tab remembers where you were, so coming back is not a step backwards.'],
      ['improved', 'Gone from the screen: the wall of 24 cards, the category filter and "Roll visible". Everything you could do is still there, one level down.'],
    ],
  },
  {
    version: '2.15.0', date: '2026-10-25', title: 'Claude writes new rows and tables, so Generate stops repeating itself',
    changes: [
      ['new', 'Refill tables: each generator card (with Claude switched on) has a "Refill tables…" button. Pick one of its tables (Quirk, Voice, Wants, Vibe, ...), say how many new rows you want and, if you like, what you are after ("more rural, less grimdark"). Claude answers with a plain list, not a story. You see the whole question before it is sent, then tick (and edit) the rows you want. Repeats of rows you already have are dropped.'],
      ['new', 'Use my campaign as inspiration: a box, ticked to begin with, that sends the campaign overview and the names and first lines of your NPCs, locations, factions and plot threads, so the new rows suit your world. Untick it for generic rows. The count of characters sent is shown, and what is sent is one click away.'],
      ['new', 'Your rows are saved in your vault, in a note called "Generator Tables" (a heading per table, a bullet per row), so you can edit them in Obsidian. When you roll, they are mixed in with the built-in rows. They keep working with Claude switched off, and you can take rows out one at a time.'],
      ['new', 'Make a table: "Make a table with Claude…" (on the Generate page) writes a whole new table to roll on, for anything you describe ("things found in a drowned chapel"), as a d6, d8, d10, d12, d20 or d100. Tick and edit the rows, name it, and it is saved as a note in "Custom tables" in your campaign. A "My tables" card on the Generate page rolls it.'],
      ['improved', 'When Claude\'s sign-in has expired, the message now says how to sign in again (run claude in Terminal, type /login) and points to Menu, Claude (experimental), where it used to say "the sidebar".'],
    ],
  },
  {
    version: '2.14.2', date: '2026-10-23', title: 'DM cheat sheet, the Menu, and metric',
    changes: [
      ['new', 'DM cheat sheet: a Cheat sheet button right of the search bar opens a slide-over with the 2024 rules at a glance. It covers the six abilities (explained with one tomato), core rules, the 12 actions, combat, conditions, weapon mastery, resting, exploration and DM tips. It is searchable (the matches open), and a star pins a card to the top. "Open as a tab" keeps it beside your notes in a pane; Esc closes the slide-over.'],
      ['new', 'Your own cards: add house rules and table rulings to the cheat sheet. They are saved in your vault as a note called "DM Cheat Sheet" (each ## heading is a card), so they show up in Obsidian too, and like every change they wait for a push. Anything else you write above the first card in that note is kept.'],
      ['new', 'Metric: the cheat sheet shows metres, kilometres and kilograms (5 ft = 1.5 m, 1 mile = 1.5 km, 1 lb = 0.5 kg, the conversions the 2024 books use), with an Imperial button if you ever want feet. Generate follows the same setting for what it rolls from now on (a 10-foot radius becomes 3 metres). Set it in Menu, Settings, or with the buttons on the cheat sheet.'],
      ['improved', 'Settings is now the Menu. It lists Settings, Claude (experimental) and Version history, so the sidebar has one button instead of three. The version number at the bottom of the sidebar still opens the Version history.'],
      ['fixed', 'Editing a checkbox item put the box for typing under the checkbox. It now sits on the same line, to the right of it, and uses the rest of the line (the Must happen and state tracker callouts).'],
      ['improved', 'Some cheat sheet cards (initiative, stabilizing, underwater, travel pace, suffocating) are marked "double-check". They were written from memory of the rules and could not be checked against the official text, so confirm them in the book.'],
    ],
  },
  {
    version: '2.14.1', date: '2026-10-23', title: 'Cleaner tabs, and pinned tabs',
    changes: [
      ['fixed', 'The tab and the yellow accent showing which pane has the focus did not line up: a straight line ran across the whole row, above a tab with rounded corners. The accent is now on the open tab itself and follows its rounded corners, and the open tab is the colour of the page under it so the two read as one.'],
      ['new', 'Pin a tab (right-click the tab, Pin): it keeps its page. A link, the sidebar, search or picking from a list opens a new tab in the same pane instead of changing it. A pinned tab shows a pin in place of the ×; click the pin to unpin. It cannot be closed (no Close in its menu, middle-click does nothing) until you unpin it. You can still edit and save the note in a pinned tab, and move the tab between panes.'],
      ['fixed', 'The divider between the left and right panes was drawn as separate pieces (each pane\'s own edge), so it broke at the tab rows of the two right-hand panes. It is now one unbroken line, and the divider between the two right panes is a full line too.'],
      ['fixed', 'Opening Settings put the focus on the "keep the last N changes" dropdown and showed it with the yellow focus ring. A window of options now opens with nothing highlighted; forms still start on their first field.'],
      ['improved', 'A tab\'s right-click menu now works in every layout (Pin or Unpin, Move to, Close).'],
      ['new', 'The gold "D" logo is now the icon on the browser tab (it showed a blank globe before).'],
    ],
  },
  {
    version: '2.14.0', date: '2026-10-23', title: 'Layouts: a prep pane and two panes, like Obsidian',
    changes: [
      ['new', 'Layout menu in the top bar (replaces the Split view button): Single pane, Two columns, and "Prep and two panes": one big pane on the left (for session prep) and two stacked panes on the right.'],
      ['new', 'Every pane has its own row of tabs, like Obsidian. A link, the sidebar or the search opens in the pane you are in; Ctrl/⌘-click (or middle-click) opens a new tab in that pane. Move a tab to another pane by dragging it onto that pane\'s tabs or content, or right-click the tab and choose "Move to…". A pane always keeps at least one tab.'],
      ['new', 'The dividers are draggable (the height of the two right panes, and the width of the left and right sides), with the arrow keys too when a divider is focused. The layout and sizes are remembered for each campaign.'],
      ['improved', 'Efficient by design: every tab\'s page stays in place and is only repositioned when you move it or change the layout, so an edit you are typing is never lost and pages are not rebuilt; dragging a divider changes the grid directly and re-renders nothing; a page is only redrawn when its own tab changes or its data does; one observer tells each pane whether it is wide enough for a list beside a note.'],
      ['improved', 'A pane narrower than 900 px gives an open note its whole width, with an "← All sessions" (or NPCs, ...) button to bring the list back, instead of squeezing a list beside it.'],
      ['improved', 'On a narrow window the app still shows one pane with all the tabs; the Layout button is switched off there.'],
      ['fixed', 'A menu opened from a tab could close itself because the row of tabs nudged its own scroll by a pixel.'],
    ],
  },
  {
    version: '2.13.2', date: '2026-10-23', title: 'Templates go under Prep, not under Recap',
    changes: [
      ['fixed', 'Add template put everything at the very end of the note, which in a new session is under the Recap of the previous one. Now the Session prep template goes at the end of the Prep section; an NPC card goes at the end of "NPC\'s appearing in this episode" if the note has it, otherwise under Prep; a note with a Recap but no Prep gets a Prep heading before the Recap; with neither, it goes at the end. Recap text is never touched.'],
      ['improved', 'The Session prep template no longer comes with a starter NPC card (that made two NPC cards when you also added an NPC card). It has the "NPC\'s appearing in this episode" heading, and each NPC card you add lands under it, one after another.'],
      ['improved', 'After adding a template the note scrolls to it. A folded NPC card stays folded.'],
    ],
  },
  {
    version: '2.13.1', date: '2026-10-22', title: 'Fix: the helper froze at start-up', 
    changes: [
      ['fixed', 'DM Forge could freeze right after the "type update" line, with Terminal saying "suspended (tty input)": the helper never answered, Ctrl+C did nothing, and the link could not be reached. The shell the helper starts to read your Terminal settings (added in 2.12.1) could take over the Terminal, leaving the helper stopped when it listened for typed commands.'],
      ['fixed', 'That shell is now started with no access to the Terminal and only when you first use Claude (not at launch), so starting DM Forge no longer runs your shell\'s start-up files. Claude Code is started the same way.'],
      ['fixed', 'The helper now only listens for typed commands when it is the program in front in its Terminal window; it ignores the system\'s "stop" signals for Terminal input, and it restarts itself for "update" from its main thread. A new option, --no-commands (or DMF_NO_COMMANDS=1), turns typed commands off.'],
      ['improved', 'New tests run the helper inside a real terminal with job control, including a stand-in for a shell that grabs the Terminal, and fail on the broken 2.13.0 helper.'],
    ],
  },
  {
    version: '2.13.0', date: '2026-10-22', title: 'Edit in place, auto-save, Settings, where you left off',
    changes: [
      ['new', 'Edit a note where it is shown: click a checkbox to tick it; double-click a paragraph, heading or bullet (or click an empty bullet) to edit just that piece with the formatting around it; Enter saves a bullet and starts the next one under it. A pencil on each block (callout, table, list...) edits the whole block; a callout is shown without its "> " marks and they are put back on save. Only the lines you touch are rewritten.'],
      ['fixed', 'Switching category (or choosing another note, or closing the tab) while editing a note lost what you had typed. It is now saved automatically.'],
      ['new', 'Settings (sidebar, Tools): choose to auto-save when you move away from an edit (the default) or to be asked first (save, discard or keep editing; the same for closing a tab you are editing in).'],
      ['new', 'Track where I left off (a Settings option, on by default): each session note remembers its last changes (the line, the heading above it and a few words, 10, 20 or 50 kept). The session shows "Where you left off" with a Jump to it button that scrolls there and highlights it, and a list of recent changes. Kept in the browser only, never written to your vault; it can be cleared.'],
      ['fixed', 'A bullet typed into very quickly could lose its first letters because the editor took a moment to take focus.'],
      ['improved', 'The browser pop-up that appeared when closing a tab with an edit open is gone, replaced by the save-or-ask behaviour above.'],
    ],
  },
  {
    version: '2.12.1', date: '2026-10-22', title: 'Claude sign-in fix and Check sign-in', status: 'experimental',
    changes: [
      ['fixed', 'Claude (experimental) said "OAuth session expired and could not be refreshed" even though `claude` worked in Terminal. The helper (started by double-clicking a .command file) can find a different copy of Claude Code, or miss settings such as CLAUDE_CONFIG_DIR, that a Terminal window has. It now runs Claude the way your Terminal would: it reads the environment from your login shell and uses the first `claude` that shell finds.'],
      ['new', 'Check sign-in (in Claude (experimental)): shows which Claude Code and which sign-in the helper uses, other copies on the Mac, what differs from a Terminal, the sign-in status, and the result of a tiny test question, with a Copy report button. It never includes keys or what you sent.'],
      ['new', 'A log of Claude requests (claude.log, in the .dmforge folder in your home folder): time, how long, success or the error. It never contains what was sent or answered.'],
    ],
  },
  {
    version: '2.12.0', date: '2026-10-22', title: 'Type "update" in the helper window',
    changes: [
      ['new', 'While DM Forge is running, click the Terminal window it runs in and type update, then press Enter: it installs the newer DM-Forge-V2.zip from Downloads and restarts itself in the same window, on the same link. No need to close Terminal. Also: rollback (go back one version), quit and help.'],
      ['new', 'After an update, the DM Forge tab you already have open shows a bar saying which version is installed, with a "Reload to use it" button (Command-R does the same). Your unpushed changes are kept.'],
      ['improved', 'If there is no newer zip in Downloads, update says so and changes nothing.'],
      ['improved', 'Expand with Claude now sends as soon as you click it (no pre-filled box to skim first) and shows the answer. The text that was sent stays one click away under "What was sent", where you can edit it and ask again. Ask Claude on a note still shows its box, because that is where you type your question.'],
    ],
  },
  {
    version: '2.11.0', date: '2026-10-22', title: 'Claude demo (experimental)', status: 'experimental',
    note: 'A trial. If it does not go well it can be turned off in one click, or the whole version rolled back (see below); this entry stays in the history either way.',
    changes: [
      ['new', 'Claude (experimental) in the sidebar under Tools: DM Forge asks Claude Code, installed on your Mac and using your own sign-in, one question at a time. Needs the helper. Off until you tick "Show the Claude buttons".'],
      ['new', 'Expand with Claude on every generated result (two read-aloud paragraphs plus DM notes), and Ask Claude on every note (your question about that note). A box shows exactly what will be sent, you can edit it, and nothing is sent until you press Send. Only that text is passed on, never the rest of your vault.'],
      ['new', 'Claude runs with every tool switched off, in an empty temporary folder, one request at a time, and is stopped after 3 minutes: it can only answer in text. Errors say what happened and how to fix it (for example, to sign in).'],
      ['new', 'Rollback: Claude (experimental) has a "Roll back to <previous version>" button, and the helper has a --rollback option (python3 dmforge-server.py --rollback). It puts the previous version back from the .previous folder, keeps the one it replaced in .rolled-back, and never touches your notes.'],
    ],
  },
  {
    version: '2.10.0', date: '2026-10-21', title: 'Session templates',
    changes: [
      ['new', 'Add template button on session notes (in the note\'s buttons, and in the editor next to Insert [[link]]): pastes a blank layout into the note. A preview shows what you are adding before you paste it.'],
      ['new', 'Two templates to start: "Session prep" (MUST HAPPEN, Table rules, Locations / Places, State tracker, and an NPC card, all as Obsidian callouts) and "NPC card" (one collapsed card: voice, look, knows, wants, does, says, stat block) to add one per NPC. More can be added in src/core/sessiontemplates.js.'],
      ['improved', 'In view mode the template goes at the end of the note; in the editor it goes at the cursor, with a blank line around it. It is staged like any edit, so nothing is written until you push.'],
      ['fixed', 'An empty checkbox line ("- [ ] ") was shown as the text "[ ]"; it now shows as a checkbox, like Obsidian does (display only, the file is not changed).'],
    ],
  },
  {
    version: '2.9.0', date: '2026-10-21', title: 'Version history, and a grouped list for Add a link',
    changes: [
      ['new', 'Version history page (Tools in the sidebar, or click the version number at the bottom of the sidebar): every change in every version, newest first, with search and a filter by kind of change.'],
      ['improved', 'Add a link…: the list of notes is grouped by category with a heading for each. The category that the most links in your vault point at comes first (ties follow the sidebar order), and "Other notes" come last.'],
      ['improved', 'Add a link…: sessions are listed newest first; every other group is A to Z. Searching hides groups with no match, and a "N selected" count stays at the top while you search and scroll.'],
    ],
  },
  {
    version: '2.8.0', date: '2026-10-20', title: 'Centred tabs, separate scrolling, 3-second fade',
    changes: [
      ['fixed', 'Tab labels were not centred: each tab kept room for a close button even when it had none, so the text leaned left. Tabs without a close button now have equal space on both sides.'],
      ['improved', 'Lists and notes scroll separately. On desktop the window itself no longer scrolls; on list-and-note pages (NPCs, Sessions and so on) the title stays put and the list and the note each scroll on their own, so a long note never carries the list away. Split view panes scroll separately too. On narrow screens it is one normal page.'],
      ['improved', 'The dark/light colour fade is now 3 seconds (was 5).'],
    ],
  },
  {
    version: '2.7.0', date: '2026-10-20', title: 'Add a link…',
    changes: [
      ['new', 'Add a link… (third button under a note, next to Suggest links and Existing links): link to any note, even if neither one mentions the other. Search the whole vault and tick one or several notes.'],
      ['new', 'The links go in as "- [[Name]]" lines under a heading ("Related" by default, editable, or empty for the end of the note). Optional "Also add a link back from each of them". Notes that are already linked are marked and skipped.'],
    ],
  },
  {
    version: '2.6.1', date: '2026-10-20', title: 'Dark/light switch no longer freezes',
    changes: [
      ['fixed', 'The dark/light switch took about 5 seconds and froze the page. The cause was a deadlock in the circular-reveal animation: the browser pauses drawing during it, but my code waited for the next drawing.'],
      ['improved', 'The theme colours are now registered as real colours, so the browser blends them itself: a slow fade of the whole page that stays usable the whole time. The graph repaints during the fade so its colours blend too. Switches instantly with "Reduce motion".'],
    ],
  },
  {
    version: '2.6.0', date: '2026-10-20', title: 'Collapsible saves, save to several places, auto-update, dark mode',
    changes: [
      ['improved', 'Generated results saved to session prep are now collapsed callouts (> [!info]- Shop — [[Name]]): one line until opened, in DM Forge and in Obsidian, coloured by kind (people, places, items, danger, story). A "Collapse it" checkbox (on by default) can be unticked for the plain heading and list.'],
      ['new', 'Save to campaign can send one result to several places at once: session prep plus any category (NPC, Location, Faction, Plot thread, Item or your own). Each ticked category gets its own note, and the prep entry links to it.'],
      ['improved', 'Updates install automatically when you start DM Forge (no Y/n). The zip is still checked first and only the five app files are taken. Start with --ask to be asked again.'],
      ['new', 'Dark/light mode toggle (sun/moon button in the top bar and on the welcome screen). Remembers your choice, follows the system otherwise, Shift-click returns to following the system, and no flash of the wrong colour on load.'],
    ],
  },
  {
    version: '2.5.0', date: '2026-10-19', title: 'Much richer shops, magic items, potions and loot',
    changes: [
      ['improved', 'Shop generator: 19+ kinds (blacksmith, armorer, apothecary, magic emporium, fence, pawnbroker…) in a Hamlet, Village, Town or City at Fair, Steep or Bargain prices; a keeper with a manner and a quirk, a first impression, location and opening hours, stock with 5e prices and quantities, magic wares that fit the shop, a rare find, what it buys, haggling with a DC, reputation, what the keeper wants, and a secret.'],
      ['improved', 'Magic Item generator: choose rarity, kind and whether it may be cursed; type line with attunement, appearance, mechanics that scale with rarity (bonuses, damage, spells with a save DC, charges), a catch or real curse, history, a value inside the DMG range, and a story hook. Rerolling one line keeps the rest.'],
      ['improved', 'Potions: the effect matches the name, healing follows the 5e tiers, with a halved consumable price, an origin and how to identify it.'],
      ['improved', 'Loot gains art objects and, from the second tier, magic items, potions and scrolls with values. Trinkets grew to 60, with a hidden detail on one.'],
      ['improved', 'Saving a shop, magic item or potion fills in the note\'s Type and Rarity properties.'],
    ],
  },
  {
    version: '2.4.7', date: '2026-10-19', title: 'Push failure fixed: read-only .trash folder',
    changes: [
      ['fixed', 'Pushes that moved or deleted a note failed with "Permission denied". The cause was your vault\'s .trash folder being read-only (dr-xr-xr-x), so nothing could be created inside it. The helper now makes a read-only .trash writable again (only folders you own), and if that still fails it uses a .dmforge-trash folder next to it. A note is never lost if a move fails halfway.'],
      ['fixed', 'Two notes with the same name moved to the trash in the same second collided; they now get unique names.'],
    ],
  },
  {
    version: '2.4.6', date: '2026-10-19', title: 'Trash step hardened, clearer failure reports',
    changes: [
      ['improved', 'If the plain move into .trash is refused, the helper copies the note in and then removes the original, and undoes the copy if the removal fails.'],
      ['improved', 'Failure reports say "Failed to save" or "Failed to move to .trash", name the operation and the exact line that failed, and for a trash failure also test the .trash folder.'],
    ],
  },
  {
    version: '2.4.5', date: '2026-10-19', title: 'A refused save tests itself',
    changes: [
      ['new', 'When a save is refused, the helper tests each step on that exact folder (list, create, rename, open for writing, make and remove a sub-folder) and shows which one fails, with the folder\'s real permissions, owner, locks, ACLs and special attributes, whether it is in iCloud or a synced folder, and the helper version. It all appears in the push window under "Technical details" with a Copy details button.'],
    ],
  },
  {
    version: '2.4.4', date: '2026-10-19', title: 'Safer saving in stubborn folders',
    changes: [
      ['improved', 'The helper normally writes a hidden temporary file and renames it over the note. If a folder refuses that (often synced or iCloud-style folders), it now writes the note in place, keeping the old text and putting it back if the write fails halfway. A brand-new note is created directly.'],
      ['improved', 'The error message now includes the error code, the note\'s and folder\'s permissions and owner, special attributes, and the advice to quit Terminal completely (Command-Q) after changing Full Disk Access.'],
    ],
  },
  {
    version: '2.4.3', date: '2026-10-19', title: 'Sessions can be called Episode',
    changes: [
      ['new', 'The New session box has a "Called" field. The default comes from your folder\'s name (an Episodes folder gives "Episode"; Chapters gives "Chapter"), then from the word your notes use most, then "Session". You can pick Session, Episode, Chapter or Part, and it is remembered per campaign.'],
      ['improved', 'The heading inside the note, and sessions saved from the generators, use the same word.'],
    ],
  },
  {
    version: '2.4.2', date: '2026-10-19', title: 'No date in session titles, predicted session number',
    changes: [
      ['improved', 'New sessions are named "Session 4" or "Session 4 - Title" with no date in the file name or heading. The date you pick is kept in the note\'s date property, which orders the Sessions list, and shows under the name in the list. Existing dated notes still read fine.'],
      ['new', 'The session number is predicted from the folder: the count of sessions plus one (including unpushed ones), never lower than the highest number already used. It recognises Session, Episode, Ep, Chapter and Part.'],
    ],
  },
  {
    version: '2.4.0', date: '2026-10-19', title: 'Right-click to make pages, and remove links',
    changes: [
      ['new', 'Highlight words and right-click: Turn into a page (NPC, Player, Location, Faction, Plot thread, Item or your own categories, with a second step for sub-folders). The words become a [[link]] to the new page. More options… lets you rename it, pick or type a sub-folder, and choose whether to link the words and open the page. Works in the reading view and the editor.'],
      ['new', 'Link to an existing note…: link the highlighted words to a note you search for, with a tick-box to remember the words as another name (alias) for it so Suggest links finds them later.'],
      ['new', 'Remove links: right-click a link to remove it (the words stay) or remove every link to that note. A new Existing links button lists the links in the note and the notes that link to it, each with a Remove button.'],
      ['new', 'Right-clicking a link also offers Open and Show in graph, and a link to a page that does not exist yet offers Create this page.'],
      ['fixed', 'A sub-folder such as "../.." could have created a page outside its category folder; that is now blocked.'],
    ],
  },
  {
    version: '2.3.1', date: '2026-10-19', title: 'Friendlier link suggestions',
    changes: [
      ['improved', 'Link suggestions show readable text instead of raw markdown (no **, |, > or ## around the words), just the line (or table cell) with the match highlighted, and where it is ("In Episode 2 · under NPCs · in a table").'],
      ['improved', 'Each suggestion is a roomier card: where it is, the sentence, and a footer saying "Link to X" with Link it and No thanks. Jargon is hidden unless useful.'],
    ],
  },
  {
    version: '2.3.0', date: '2026-10-19', title: 'Link suggestions and the graph',
    changes: [
      ['new', 'Suggest links (replaces the tag suggestions): finds places where notes mention each other without a [[link]], like Obsidian\'s unlinked mentions, by name, alias, acronym, the words an acronym stands for (typos included, "acyolytes of solice" finds AOS) or a unique first/last name. Link it stages the edit in the other note, keeping its wording. Works in both directions; a declined suggestion does not return.'],
      ['new', 'Graph view (Tools, and a Graph button on every note): every note is a dot coloured by kind and sized by connections, links are lines, a ring marks notes with unpushed changes. Click, double-click to open in a tab, drag, zoom; Around one note shows what is within 1 to 3 links; dashed lines show unlinked mentions; filters and find.'],
    ],
  },
  {
    version: '2.2.0', date: '2026-10-19', title: 'Tag suggestions rebuilt around your notes',
    note: 'Replaced in 2.3.0, when it turned out you meant Obsidian [[links]] and not tags.',
    changes: [
      ['improved', 'Removed the built-in word list that produced random suggestions; suggestions now come from how your other notes mention each other (names, aliases, acronyms, typo-tolerant), each with a reason and Add / No thanks.'],
    ],
  },
  {
    version: '2.1.2', date: '2026-10-19', title: 'Push errors explain themselves',
    changes: [
      ['improved', 'A refused save now names the likely cause (locked file, read-only file or folder, macOS privacy settings) and what to do. The results screen lists each failed note with its full reason and says failed notes stay pending.'],
    ],
  },
  {
    version: '2.1.1', date: '2026-10-19', title: 'Split view fix',
    changes: [
      ['fixed', 'Split view for Players and Sessions was broken: a long no-wrap line pushed the whole page wider than the window, clipping the right pane. Content in a pane can now shrink, long names are cut with "…", and panes clip any leftover overflow. Checked at several window widths.'],
    ],
  },
  {
    version: '2.1.0', date: '2026-10-19', title: 'Self-updating launcher',
    changes: [
      ['new', 'Start DM Forge.command finds a newer DM-Forge-V2*.zip in Downloads, checks it, installs it over the old version, moves the zip to the Trash and opens the app. No more deleting, unzipping and moving.'],
      ['new', 'Your vault folder is remembered (--choose picks another). The version shows at the bottom of the sidebar. The previous version is kept in a .previous folder for rollback. Only the five app files are taken from a zip, and a bad zip is refused.'],
    ],
  },
  {
    version: 'V2 · build 3', date: '2026-10-19', title: 'The nine-change feedback update',
    note: 'Builds before 2.1.0 did not show a version number.',
    changes: [
      ['new', 'Delete combat (with confirmation, logs nothing). End combat still logs to a session note.'],
      ['new', 'Roll initiative for enemies: Add and roll initiative with a bonus field and one d20 per creature, a dice button on each enemy row, and Roll for enemies.'],
      ['new', 'Move… a note to another category; links keep working. It shows as one Moved row in the push list, and the old file goes to .trash only after the new copy is written.'],
      ['new', 'Add and delete categories (sidebar). A new category can be plain notes or use the NPC/Location/… properties; deleting one moves its notes elsewhere or stages them for deletion; the folder itself stays in your vault.'],
      ['improved', 'Push window: the title, counts and Push button stay at the top while a long list scrolls, and the content/diff preview is gone: it lists only which notes are new, edited, moved or deleted. Checked with 400 changes.'],
      ['improved', 'Combat initiative: rows slide to their new place live as you type or press the arrow keys (Shift = 5), and focus stays in the box.'],
      ['new', 'Suggest tags with Add / No thanks per suggestion and a reason for each (reworked in 2.2.0 and replaced in 2.3.0).'],
      ['new', 'Reformat button: fixes real structure problems (##Heading spacing, tables glued to text, bullet styles, checkbox spacing, extra blank lines, unclosed code blocks), shows what it changed and has Undo. Obsidian-only syntax (callouts, ==highlights==, %%comments%%, line breaks) is now displayed properly without changing the file.'],
      ['new', 'Tabs and split view: + opens a tab; Ctrl/⌘-click or middle-click opens notes, links and sections in a new tab; maps can be their own tab; split view shows two tabs side by side; text you are typing survives switching tabs.'],
    ],
  },
  {
    version: 'V2 · build 2', date: '2026-10-19', title: 'Brave support',
    changes: [
      ['new', 'Brave: the app detects Brave\'s blocked folder access and shows the steps to turn it on (brave://flags/#file-system-access-api) with a button that copies the address.'],
      ['new', 'The helper (dmforge-server.py and Start DM Forge.command): runs on your own computer only, needs a random token, cannot touch anything outside your vault, only writes .md notes, and moves deleted notes to .trash. Python standard library only.'],
      ['improved', 'Fonts are built into the file, so the app makes no network requests at all and Brave Shields have nothing to block.'],
      ['fixed', 'A refused write could corrupt the next request on the same helper connection.'],
    ],
  },
  {
    version: 'V2 · build 1', date: '2026-10-19', title: 'The first V2: your Obsidian vault as the database',
    changes: [
      ['new', 'A local browser app that reads a campaign folder from your Obsidian vault: pick the vault, then the campaign folder, check the folder-to-type guesses, and work as normal. Folder names decide the type (NPCs, Players, Locations, Factions, Plot Threads, Sessions, Maps, Other notes).'],
      ['new', 'Edits and new notes are held as unpushed changes (counted on the Push button, saved in the browser). Push changes shows what will change; if a note changed in your vault meanwhile, you choose to overwrite, keep the vault\'s version or decide later. Only the properties you changed are edited; deletes go to .trash.'],
      ['new', 'Notes shown rendered with [[links]] and backlinks, an edit form per note, search, new campaigns (folder, index note and standard sub-folders), and "Open in Obsidian".'],
      ['new', 'All 24 generators and dice, with Save to campaign (as a note or into a session\'s Prep section).'],
      ['new', 'Combat tracker pulling HP, AC and initiative bonus from your Players notes, with conditions; a summary can be added to the session note when combat ends.'],
      ['new', 'Inspect a vault: a read-only report of your vault\'s structure (never note contents).'],
      ['fixed', 'An unrelated notification could wipe text you were typing in an editor.'],
    ],
  },
];

/* what existed before V2 */
export const BEFORE_V2 = [
  {
    version: 'Web generator', date: '2026-10-18', title: 'A generator-only dashboard in the browser',
    changes: [
      ['new', 'A published page with 24 generators in five groups (People, Places, Items, Danger, Story), dice (d4 to d100, advantage, expressions like 4d6kh3) and Ask Claude. A first version also tracked campaigns; that was removed so it is purely for generating things on the fly.'],
      ['new', 'Every row has its own reroll and lock, Roll visible rerolls everything on screen, category chips and / search narrow it, a Pinned tray keeps results with Copy all, and Expand with Claude turns a result into read-aloud paragraphs.'],
    ],
  },
  {
    version: 'iOS app', date: '2026-09-10', title: 'DM Forge for iPhone and iPad (paused)',
    note: 'Built as an Xcode project and sent to you as a tar.gz; it was committed locally but never pushed to GitHub because of an access problem.',
    changes: [
      ['new', 'SwiftUI and SwiftData app: campaigns, NPCs, locations, factions and plot threads; offline generators (names, NPCs, taverns, loot, encounters, plot hooks); a session log and initiative tracker; an optional Claude-powered AI Assist tab with the API key stored in the Keychain.'],
    ],
  },
];
