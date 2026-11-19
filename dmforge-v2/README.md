# DM Forge V2

A dashboard for running a D&D campaign out of your Obsidian vault. It reads the notes in one
campaign folder, lets you work with them (NPCs, players, locations, factions, plot threads,
sessions, maps), includes the full set of on-the-fly generators and a combat tracker, and writes
your changes back to the vault when you press **Push changes**.

## Use it (Brave)

Brave blocks the browser feature that lets a web page open a folder, so there are two ways in.
Pick one.

**Option 1: turn the feature on in Brave (one time, about 30 seconds)**

1. Open a new tab, paste `brave://flags/#file-system-access-api` and press Enter.
2. Set **File System Access API** to **Enabled**, then click **Relaunch**.
3. Open `DM-Forge.html` in Brave (double-click it or drag it into a Brave window).
4. **Open vault folder...**, pick your Obsidian vault and allow access when Brave asks.

If you open the app before doing step 1, it detects Brave and shows these steps with a
button that copies the address.

**Option 2: the helper (no Brave setting needed)**

1. Keep `DM-Forge.html`, `dmforge-server.py` and `Start DM Forge.command` together in one folder.
2. Double-click `Start DM Forge.command`. (First time only: if macOS refuses, right-click it, choose
   **Open**, then **Open** again. If it says Python is missing, accept the install it offers.)
3. Drag your Obsidian vault folder into the Terminal window and press Enter.
4. Brave opens DM Forge, already connected to your vault. Leave the Terminal window open while you play;
   press Ctrl+C in it (or close it) to stop.

The helper only listens on your own computer (127.0.0.1), needs a random token that is
printed at start-up, can only touch files inside the vault you gave it, only writes `.md` notes,
and moves deleted notes to `.trash` instead of erasing them. It uses nothing but Python's
standard library.

Either way, from there:

1. Choose the campaign folder inside the vault and check the folder-to-type guesses.
2. Work as normal. Edits, new notes, generated NPCs and combat logs stay in the app as
   **unpushed changes** (counted on the Push button).
3. **Push changes** shows exactly what will change in each file. Confirm, and they are written.

No vault handy? **Try the demo vault** needs neither option: it opens a fully loaded practice campaign (Ashfall) with sessions, a party, secrets, clocks, a Bestiary, handouts and a Character Library, all of it reset each time you open it.

### Finding things

**Ctrl+K (⌘K)** opens the quick switcher: type to find a note, or an action (go to a page, roll dice, push, open the map of a place), or to create a
note by that name. The arrows at the top left (or Ctrl/⌘+[ and ]) go back and forward through where a tab has been; the history button lists recent notes.
Every list has **Sort** (name, recently edited, not touched for longest) and filter chips (status, rarity, type), and **Select several** for bulk
edits: set status or rarity or faction, move to a place, add or remove a tag, delete.

### Sessions and their cast

Every session has a **cast strip**: the party, the NPCs it links to and the places it mentions. Click a chip to read it in the other pane
(Ctrl/⌘-click for a new tab, Shift-click to open it in place). **+ Add an NPC** links someone under the session's cast heading, or makes a new
NPC at a place you choose. On a place's page, **Populate this place** rolls people to live there and adds the ones you keep. **Duplicate** (a note's
More menu, or Ctrl+K) makes a copy named "Name (copy)".

### Combat and Party in the sidebar

Party and Combat are pinned under Overview, always on show, and so is the session you are running, under Combat (the one the log box points at: the newest unless you chose another or went Live on one). Combat starts with whoever has the highest initiative. Everything is metric.

### The tool island

The timer, dice and quick log live in one pill in the top bar. Press one and the pill grows to hold it (one at a time); it closes when the mouse moves away unless you
pin it with the pin button. Option+L and Option+D open the log and the dice; Esc closes whatever is open. The cheat sheet has its own button beside it. On a narrow window the tools
open as floating boxes from the bottom bar.

### A colour for each campaign

Settings, **Colour of this campaign** (or Ctrl+K, "Campaign colour: …"): Gold, Ember, Frost, Moss, Arcane or Crimson. It colours the buttons, links, the active page and the focus
ring, in both themes, and each campaign keeps its own.

### The session page at the table

Turn on **Live** and it sits at the top of the session with the cast under it: must-happens, clocks, hidden secrets and open threads in one grid. Edit, Pin, Live and
Run combat are the buttons for play; Import last session, Tidy notes, Close out and ⋯ are for prep and afterwards (Open in Obsidian is in the ⋯ menu on a session note). Ctrl+K (⌘K) opens the quick switcher; the search box says so.

**The session page has three modes**, picked for you and switchable with the tabs under the title: **Prep** (Import last session, the cast, Prep check, prepared encounters, where you left off), **Run** (Go live, Run combat, the Live panel, prepared encounters) and **Wrap up** (Tidy notes…, Close out…). A session you have not played is Prep; going Live, a fight under way or the running timer is Run; a session with a log is Wrap up. Your choice is remembered for that session. The note comes first: properties, outline, links and the file path are folded under **Details**, and the cast is one line (**Cast**) you open when you want it. Opening a session gives it the whole page (**← All sessions** goes back to the list).

### A sidebar that gets out of the way

The pin button at the top of the sidebar (or Settings, Layout and sidebar) hides it until you point at it: it shrinks to a column of icons, opens when the mouse rests
on it for 2 seconds (1 or 3 in Settings), and closes half a second after the mouse leaves. Ctrl/⌘+B opens or closes it at once.

### Running and prepping a session

A session's page has a **Live** button (or Ctrl+K, Live mode, for the session you have open). Only one session is live at a time: pressing Live on another moves it, and the log box follows. It shows: the MUST HAPPEN list, clocks, hidden secrets (Reveal), open threads and a log box, all on the page.
**Improvise an NPC** rolls someone, lets you pick where they are, and saves them into the session's cast. In the quick log, type `@name` or `[[name` and
choose *Create … as an NPC, place or item* to make a note on the spot. **Prep check** lists what is not ready (with fixes), **Outline** jumps between and moves
sections, and the cast strip suggests *who is likely there* from the places the session mentions. On the Party page, **Save to session** writes the encounter
you lined up into the session as a prepared encounter, and **Run in Combat** puts its monsters in the fight. **Edit** on a prepared encounter (session page) changes its name and
creatures in place: one more or fewer, a typed number, a different creature, Remove, and an Add box that suggests creatures from your library; Save changes writes it into the note.
**Add template** also has Dungeon crawl, Intrigue,
Travel and One-shot layouts.

### At the table

**Table mode** (View menu in the top bar, or Ctrl+K) sets up the session, the Party and the NPC list in three panes; the cast strip's chips show a player or NPC beside the
session. Press **?** for every keyboard shortcut. A note's More menu has **Player-safe copy…** (secrets taken out, then copy or download).
On a place's page, **Pin on a map…** arms the place on a map, and the **travel times** list shows distance and time on foot or horseback to the other places on its map.

### Undo, trash and versions

**Undo last push** (after a push, in Settings under Data and updates, or Ctrl+K) puts every note the push changed back as it was; the helper keeps the last 10 pushes in
`~/.dmforge/undo`, outside your vault. **Settings, Data and updates, Trash** lists deleted notes with Restore. **Settings, Data and updates, Versions** rolls DM Forge back to the version
before (and forward again) and restarts the helper for you; typing `rollback` or `forward` in the helper window does the same.

### Long lists fold up by town

NPCs, factions (by where they are based) and items (by where they are kept) group themselves by town once a list is long
(more than 20 by default; Menu, Settings). Groups are folded up except where you are and what has unpushed changes; searching opens the
matches; your choices are remembered per campaign. **Group by** offers Town, Exact place, Faction (NPCs) or one list. NPCs with no place are in
*Not placed anywhere*: an NPC's text that mentions a place gets a one-click **Place at …**, *Accept all suggestions* does the group, drag an NPC
onto a group to move them, **Select several** moves many, and an NPC's page has **Lives in**. The Overview says how many are not placed yet.

### Moving places

A place's page has **This place is inside** (a list; Nothing makes it top-level). The place that should hold it has **Move an existing place
in…**. In the Locations list, drag a place onto another to put it inside, or onto the strip that appears at the top to make it top-level.
A place cannot go inside itself or anything inside it. Only the one Within property changes, under the name the note already uses.

### Maps with pins

Maps page, **Open as a map** on any picture. **Pin places** lists the places inside the map's place that are not on it yet: pick one,
then click where it goes (or click anywhere and type a name or label). Drag to move, mark secret, add a note. **Player view** hides
secret pins. **Measure** two points or pins; give it one real distance and the map keeps its scale and shows distances and walking time.
A map can say which place it shows, so a pin opens that place's own map, and a place's page shows its map. The pins are a list in a small
note beside the picture (type map), each line with a position and a [[link]], so renaming a place keeps its pins.

### Places inside places

Give a location a **Within** (the place it sits in) and the Locations list becomes a tree. A place's page shows its trail
(Greenhold › The Weir › The Hollow Reach), **Places inside** with *Add a place inside*, and **Who is here**: NPCs whose Location
is this place or anything inside it, the last session that touched it, and the factions, threads and people that mention it.
*Add a new person here* and *Put an existing NPC here* write the NPC's Location for you. New Location has a Type list (town,
village, tavern, shop, temple, castle, dungeon, wilderness, landmark, building) and starts the page with matching headings.

### Clocks that belong to a plot thread

On the Clocks page, give a clock a **Belongs to…** note (a plot thread, usually). The thread's status shows next to the clock, and the
thread's own page shows the clock under its Properties with − and + buttons. The link is a plain `[[link]]` in the clock's line in the
"Clocks and Standing" note, so there is one copy of the clock and Obsidian sees the link. Clocks can have 2 to 10, or 12, slices.

### Reopening your last campaign

When DM Forge starts it goes straight back into the campaign you were last in (remembered per vault, in this browser).
*Switch campaign* still shows the list. Turn it off under Menu, Settings, *Open the campaign I was last in*.

### Updating (helper users)

Put the DM Forge folder somewhere permanent (for example your Documents folder) and always start it
with **Start DM Forge.command**. To update, download the new `DM-Forge-V2.zip` and just start DM Forge
again: it finds the newer zip in your Downloads folder, installs it over the old version, moves the zip
to the Trash and carries on. Nothing to unzip, delete or answer. (Start it with `--ask` to be asked
*Install it now? [Y/n]* first, or `--no-update` to skip updating.)

- **From inside the app.** After downloading the new zip, come back to DM Forge: a bar says *DM Forge x.y.z is in your Downloads
  folder* with **Install and restart** (also Settings, Data and updates, *Check now*). It does what typing `update` does, then reloads the page;
  unpushed changes are kept. The first update to a version that has this still needs one of the other two ways.
- **Without closing Terminal.** While DM Forge is running, click the Terminal window, type `update` and press Enter.
  It installs the newer zip from Downloads and restarts itself in the same window on the same link; the open DM Forge tab
  then shows a bar with **Reload to use it** (your unpushed changes are kept). Also `rollback` (back one version), `quit`
  and `help`. The first update to a version that has this still needs the old way (close and start again). Start with
  `--no-commands` (or `DMF_NO_COMMANDS=1`) if you do not want the helper to listen to what you type.
- It only takes the five app files (`DM-Forge.html`, `dmforge-server.py`, `Start DM Forge.command`,
  `README.md`, `VERSION`) from a zip named `DM-Forge-V2*.zip`, and checks them first; anything else in
  the zip, or a zip that fails the check, is ignored. The old version is kept in the `.previous` folder.
- The helper remembers your vault folder, so you are not asked for it every time
  (`--choose` picks a different one). The version is shown at the bottom of the sidebar.
- The very first update to this version is manual (the old launcher cannot do it); after that it is automatic.

Chrome, Edge and Arc work with Option 1's step 3 onward (no flag needed). Safari and Firefox cannot
open folders directly; use the helper.

## What it will and will not do to your notes

- Nothing is written until you confirm a push. The one exception is **Create campaign folder**,
  which writes the new folder, an index note and the standard subfolders straight away.
- It only edits the properties (front matter) you changed. Other properties, comments and the
  rest of the note are left exactly as they were. Windows (CRLF) line endings are preserved.
- If a note changed in your vault after you opened the campaign (for example in Obsidian), the push
  stops on that note and asks: overwrite, keep the vault's version, or decide later.
- The push window lists only *which notes* will change (new, edited, moved, deleted), never their
  text. Its Push button stays at the top while the list scrolls, however many changes there are.
- Deleted notes are moved to the vault's `.trash` folder, not erased. If that folder was left read-only, the helper
  gives you (its owner) write access again; if it still cannot be used, `.dmforge-trash` next to it is used instead. A moved note is written to its
  new place first and the old file goes to `.trash` only after that succeeded.
- Unpushed changes are saved in the browser, so closing the tab does not lose them.
- It never writes outside the campaign folder you chose.

## How notes are understood

- The top-level folder decides the type: `NPCs`, `Players`, `Locations`, `Factions`,
  `Plot Threads`, `Sessions`, `Maps`, `Items` (loose matching: "npc", "01 - Players", "Session Notes"
  all work). Anything else is listed under **Other notes**.
- Fields are read from front matter (`race: Elf`), then from inline fields (`Race:: Elf`) and
  `**Race:** Elf` lines. `[[Wikilinks]]` become links and "Mentioned in" backlinks.
- Players: `hp`, `ac` and `init` (initiative bonus) feed the combat tracker.
- Sessions: the `date` and `number` properties sort the list (older notes named `YYYY-MM-DD Session N` are
  understood too). New sessions are named `Session N` or `Session N - Title` (or `Episode`, `Chapter`, `Part`: the box follows
  your folder's name, e.g. an `Episodes` folder gives `Episode N`, else the word your notes use most, and
  remembers what you pick); the date you pick is saved in
  the note's `date` property, not in its name. The session number in the *New session* box is predicted from
  the folder: the number of sessions in it plus one, never lower than the highest number already used
  ("Session 3", "Episode 3", "Part 3" all count).
  Generated results can be added under a `## Prep` heading; combat summaries go in a marked block
  under `## Combat`, so a later push updates it instead of duplicating it.

## Everyday tools

- **Tabs and panes.** `+` opens a new tab; Ctrl/⌘-click (or middle-click) on a note, a link or a
  sidebar section opens it in a new tab. A map can be opened as its own tab ("Open in a tab" in the
  image viewer). The **Layout** button shows several panes at once (see *Layouts and panes*), for example a map next to your session
  notes. Text you are typing in a tab is kept when you switch away.
- **Categories.** A category is a top-level folder of the campaign. *Add or remove categories* (sidebar)
  adds one for anything you track (Bestiary, Lore...), as plain notes or with the NPC/Location/...
  properties. Deleting a category either moves its notes to another category or stages them for
  deletion; the empty folder itself stays in your vault.
- **Move…** on a note sends it to another category. Links keep working because they use the note's name.
- **Suggest links.** Like Obsidian's "unlinked mentions", but you can act on them. On any note,
  *Suggest links* reads your other notes and finds places where one talks about the other without a
  `[[link]]`: by its name, an alias, its acronym, the words an acronym stands for (even with typos, like
  "acyolytes of solice" for the faction AOS), or a first/last name that only one note has. On the AOS
  page it shows the sentence in Xir Valen's file with the match highlighted and what it would become
  (`[[AOS|acyolytes of solice]]`); *Link it* stages that edit in his note, keeping his wording. On Xir
  Valen's page it offers the same thing in the other direction. Text inside existing links, headings,
  code, URLs and `#tags` is never touched, and a declined suggestion does not come back.
- **Right-click on words.** Highlight any words in a note (in the reading view or in the editor) and
  right-click:
  - *Turn into a page*: pick the kind (NPC, Player, Location, Faction, Plot thread, Item, or one of your
    own categories) and, if that category has sub-folders, which one. The page is created and the words
    become a `[[link]]` to it. *More options…* lets you rename it, choose a new sub-folder, and decide
    whether to replace the words with a link and open the page.
  - *Link to an existing note…*: search for a note and link the words to it. Tick "remember as another
    name" to add the words to that note's `aliases`, so Suggest links finds them from then on.
  Only the occurrence you highlighted is changed, and never inside a heading, code or an existing link.
- **Add a link…** (third button under a note) links to notes that never mention each other. Search the whole
  vault, tick one or several notes, and they are listed as `- [[Name]]` under a heading (*Related* by default;
  type another, or leave it empty for the end of the note). Tick *Also add a link back* to put the matching
  link in each of the other notes too. Notes already linked are marked and skipped. The list is grouped by
  category: the category that the most links in your vault point at comes first (ties follow the sidebar
  order), "Other notes" come last, notes are A to Z and sessions newest first. Searching hides groups with no match,
  and a "N selected" count stays at the top.
- **Remove links.** Right-click a link to open it, show it in the graph or *Remove this link* (the words
  stay), or remove every link to that note in the page. A link to a page that does not exist yet can be
  created from the same menu. *Existing links* under any note lists the links in it and the notes that link
  to it, each with a Remove button. Embeds and links in properties are left alone.
- **Graph.** *Graph* (Tools) draws every note as a dot and every `[[link]]` (including links in
  properties) as a line, coloured by kind of note, sized by how connected it is. Click a note to see what
  it links with, double-click to open it in a new tab, drag to move, scroll to zoom. *Around one note*
  (or the **Graph** button on any note) shows just that note and what is within 1 to 3 links of it.
  *Dashed lines* mark mentions that are not linked yet, so you can see what Suggest links would connect.
  Filter by kind of note, find a note by name, and a ring marks notes with unpushed changes.
- **Reformat** tidies markdown that renders badly: `##Heading` spacing, blank lines around headings and
  tables, `*`/`+` bullets, checkbox spacing, spaces inside `[[links]]`, runs of blank lines and unclosed
  code blocks. It never touches Obsidian features or code blocks, shows what it changed, and has Undo.
  Obsidian-only syntax (callouts, `==highlights==`, `%%comments%%`, `^block-ids`, `![[note]]` embeds,
  line breaks) is displayed properly without changing the file.
- **Combat.** Enemies get an *Add and roll initiative* button (d20 + bonus, separately for each),
  a roll button on every enemy row and *Roll for enemies*. Edit any initiative, by typing or with the
  up/down arrows (Shift = 5), and the list re-sorts and animates immediately. *Delete combat* throws a
  fight away without logging it; *End combat* logs it to a session note.

- **Monster library** (Combat, *Monster library…*): the 331 creatures of the 2024 SRD (5.2.1, CC-BY 4.0) plus your own notes in a `Bestiary`,
  `Monsters` or `Creatures` folder (properties `cr`, `ac`, `hp`, `init`, `creature`; or "AC 15" / "HP 22" in the text). Search, filter by CR and type, read
  the stat block (metric if that is your setting), *Add to the fight* (any number, initiative rolled; *Roll HP* for each one's dice), *Save to Bestiary*
  for an editable copy. Creatures from the library keep a *Stat block* button, counted legendary actions (refilled at the start of their turn)
  and recharge / per-day buttons. The built-in set can be switched off in Settings. This work includes material from the System Reference
  Document 5.2.1 by Wizards of the Coast LLC (https://www.dndbeyond.com/srd), licensed under CC BY 4.0
  (https://creativecommons.org/licenses/by/4.0/legalcode).
- **More in combat:** temporary hit points (damage uses them first), death saves for players at 0, a *Reaction used* marker (clears on that
  creature's turn), a note per creature, and *Undo* for the last change.
- **Combat log.** Every change is written down as it happens, by round and by whose turn it is (damage and healing with before and after, conditions,
  death saves, reactions, legendary actions, recharge, creatures joining and leaving, initiative changes). The **Log** tab beside *Add to the fight*
  shows it live (a heading for each turn; turns with nothing logged are joined on one line) and lets you add your own lines. *End combat* saves the
  summary plus the whole log, folded, in the session note; *Save to session now* does it mid-fight (it updates the same block). *Undo* removes a line
  too. The bar with Next turn, Undo, Roll for enemies and End combat stays pinned while you scroll, and so does the right-hand panel; *Next turn* scrolls
  to the active creature. *Delete combat* is in the End combat window.

## Layouts and panes

The **Layout** button (top bar) divides the window into panes, each with its own row of tabs, like Obsidian:

- **Single pane**, **Two columns**, and **Prep and two panes**: one big pane on the left (made for session prep) and two stacked
  panes on the right.
- A link, the sidebar or search opens in the pane you are in. Ctrl/⌘-click (or middle-click) opens a new tab in that pane.
- Move a tab to another pane by dragging it onto the other pane's tabs or content, or right-click it and choose *Move to…*.
  A pane always keeps at least one tab.
- **Pin a tab** (right-click it, *Pin*) to keep its page: a link, the sidebar or search then opens a new tab in the same pane
  instead. A pinned tab shows a pin where the × was (click it to unpin) and cannot be closed until unpinned. You can still edit
  the note in it.
- Drag the dividers to resize (the two right panes' height, and the left and right sides), or focus one and use the arrow
  keys. The layout and sizes are remembered for each campaign.
- A pane narrower than 900 px shows an open note at full width, with an *← All sessions* (or NPCs...) button to bring the list
  back. On a narrow window there is one pane with all the tabs.

## Editing where it is shown

You do not have to press Edit to change a note. On any note page:

- **Click a checkbox** to tick or untick it.
- **Double-click** a paragraph, a heading or a bullet (or click an empty bullet) to edit just that piece, in place, with the
  formatting around it kept. **Enter** saves a bullet and starts the next one under it (Backspace on an empty bullet removes
  it); in a heading, Enter saves; in a paragraph Enter makes a new line and **Ctrl/⌘+Enter** saves. **Esc** cancels, and
  clicking away saves.
- **The pencil** that appears on a block (a callout, a table, a list...) opens that whole block. A callout is shown without its
  `> ` marks, and they are put back when you save.

Only the lines you touched are rewritten; the rest of the note stays exactly as it was. The note's own **Edit** button still
opens the whole note as text.

## DM cheat sheet

The **Cheat sheet** button (right of the search bar) slides in a panel with the 2024 rules at a glance: the six abilities
explained with one tomato, core rules, the 12 actions, combat, conditions, weapon mastery, resting, exploration and DM tips.
Search it (the matches open), star a card to pin it to the top, or *Open as a tab* to keep it beside your notes in a pane.
Esc closes the slide-over.

- **Metric only** (metres, kilometres, kilograms: 5 ft = 1.5 m, 1 mile = 1.5 km, 1 lb = 0.5 kg). There is no unit switch. What *Generate* rolls,
  and the monsters, spells, items and characters from the libraries, are shown in metric too.
- **Your own cards:** *+ Add my own card* saves a note called `DM Cheat Sheet` in the campaign folder. Each `##` heading is a
  card, so you can edit it in Obsidian too. Like every change it waits for a push. Text above the first card is kept.
- The rules text is short and in our own words, and a few cards are marked **double-check**: they were written from memory and
  not verified against the official text. The content lives in `src/core/cheatsheet.js`; the edition is a label there.

## Settings, saving and where you left off

*Settings* (sidebar, **Menu**, then Settings; or Ctrl+K, "Settings") is a page: categories down the left, one category at a time on the right, and a
search box (try "sidebar", "font" or "claude") that finds an option wherever it is. Changes apply straight away. Ctrl/⌘-click opens it in a new tab.
The categories are **Appearance** (light, dark or follow the Mac; Warm or Blue-grey dark; the colour of this campaign; the typeface), **Layout and
sidebar** (one pane, two columns or the prep layout; hiding the sidebar until you point at it, and the delay), **Writing and saving**, **Sessions**,
**Library and lists** (the built-in monsters, folding long lists, which generators show), **Claude** (the optional helper, and the campaign snapshot)
and **Data and updates** (Undo last push, the Trash, Version and Check for an update). Switches, side-by-side choices and dropdowns are real form
controls, so the keyboard works; options that only matter when something is on appear only then.

**Typeface** has seven sets, each shown in its own letters: *Today* (Fraunces and Work Sans, the default), *Manuscript* (Cinzel), *Storybook* (Alegreya),
*Clear and Bookish* (Literata and Atkinson Hyperlegible), *Warm and Bold* (Young Serif and Figtree), *Clean* (Plus Jakarta Sans and Inter) and *Modern with
Character* (Bricolage Grotesque and DM Sans). Each set is a title font, a text font and a numbers font. All the fonts are built into the app (about
1 MB more in the file; a font is only read when something on screen uses it), so every set works offline and with Brave Shields on. The sets are
listed in `src/core/fontsets.js`, their CSS is at the end of `src/ui/styles.css`, and `tools/gen-fonts.py` writes the font files into `src/ui/fonts.css`.

- **Track where I left off:** after each change to a session note, DM Forge remembers where it was (the line, the heading
  above it and a few words). The session then shows **Where you left off** with a *Jump to it* button that scrolls there and
  highlights it, and a list of the recent changes (10, 20 or 50 kept). It is kept in this browser only and never written to
  your vault; *Clear tracked changes* empties it. If you undo or discard a change that was not pushed, its entry goes too (it only describes changes that are still in the note).

## Your own monsters

The **Monsters** button in the sidebar (under Reference; Ctrl+K "Monster library"; also Combat, Add, Monsters) opens the Monster library. **+ New monster** opens a
form: name, size, type, alignment, armour class and note, hit points and hit dice, initiative (the Dex modifier unless you give one), challenge rating, speed, the six
ability scores, saves, skills, resistances, senses and languages, and boxes for traits, actions, bonus actions, reactions and legendary actions (one ability per
paragraph, written `**Name.** what it does`). **Save** writes a note into your Bestiary folder (made if there is none): properties (`cr`, `size`, `creature`, `ac`, `hp`,
`init`, `speed`, `hd`) and a stat block laid out like the built-in ones, so the library, Combat and Obsidian all use it. **Copy and edit…** starts a new monster from
any other (the built-in one is never changed). **Paste a stat block** (in the form) reads the 2024 layout or the older one and fills in what it can find, in metres;
check it over, then save. **Edit** reopens the form on a monster made with it (the form is kept in a hidden comment, `dmforge:monster`, at the end of the note); if you
changed the note by hand, Edit is off, so the form never overwrites your changes (use *Open the note*). **Delete** asks first. Notes you write yourself in a
Bestiary, Monsters or Creatures folder are listed too, as before.

## Who seeded a plot thread

A plot thread has **Seeded by**: the NPCs, factions and player characters that planted it, one or several. Edit the thread and add them as chips (type a
name and press Enter or a comma; suggestions come from your NPCs, factions and players; × removes one). It is saved as a list of `[[links]]` in the
note's properties (`seeded:`), so Obsidian shows and follows them. The thread page shows the seeders as links, and an NPC, faction or player page lists
**Seeded threads**. The Plot threads list has a **Seeded by** row of filter chips with counts. Plain names under `planted by` or `started by` are read too.

**Appears in** works the same way for places: the locations a thread happens in (property `appears`; only what you set counts, a place that is merely mentioned in the text does not). A thread's page offers the places its text mentions as **Mentions: ＋ Place** buttons, one click to add one. The list has an **Appears in**
row of filter chips, a **Group by: Location** choice (a thread is listed under every place it appears in; threads with no place go last; groups fold up and the choice is
remembered), and a place's page lists the **Plot threads here**.

## Session templates

On a session note, **Add template** (next to *Run combat*, and in the editor next to *Insert [[link]]*) adds a blank
layout: **Session prep** (MUST HAPPEN, Locations, State tracker and an "NPC's appearing in this episode" heading, as
Obsidian callouts) or a single **NPC card**. A preview shows what you are adding. It goes where it belongs: the Session prep
template at the end of the **Prep** section, an NPC card at the end of "NPC's appearing in this episode" (or under Prep), never
under the Recap. In the editor it goes at the cursor. More templates can be added in `src/core/sessiontemplates.js`.

## Generate

Generate asks one question: **What do the players need right now?** Five tiles (Someone to talk to, Somewhere to go, Something to find,
Trouble, A reason to care) open that group's generators, each with a one-line description; **Just surprise me** rolls a random one, and
a small box finds a generator by name (Enter opens the first match). *Dice and my tables* is one step further down.

A result is a page you could read aloud: what it is (small line), the name, a lead paragraph, then headed sections with the label above
the text. **Roll again** (top right) rerolls everything except the parts you locked. Point at the name, the lead or a section to lock it
(Roll again then leaves it alone) or reroll just that part. Options (ancestry, shop type, size) sit under the title. At the bottom,
at the end of the page: *Save to campaign…*, *Copy* (the page as it reads), and with Claude on, *Expand with Claude* and *Refill tables…*.
Each Generate tab remembers where you were, and the home screen lists the generators you used last as one-tap chips.

**Choose which generators show:** Settings, Library and lists, *Generators shown on the Generate screen* (or the link at the bottom of the Generate home
screen). Switch off the ones you never use; they disappear from Generate, search and *Just surprise me*. Saved in Settings; nothing is deleted. How each generator is laid out is in `src/core/genlayout.js`.

**Pick several at once:** tick the small box on any generator tile (Ctrl/⌘-click works too). A bar collects your picks (from any groups), each
with a ×1, ×2... stepper (up to 8 sheets in all). *Roll them* shows every result on one page, one under another, with jump chips at the top;
each keeps its own lock, reroll and options. *Roll all again*, *Save all to campaign…* (one window: where each goes, its name, tick to skip,
or "put them all in session prep") and *Copy all* are at the top. **Combos** save a set of picks as a one-tap preset on the home screen
(*Save as a combo…*; three starters come with the app); they are kept in Settings, in the browser.

## New rows and tables from Claude

With Claude switched on (Settings, Claude), the Generate page can have Claude write *rows*, not stories:

- **Refill tables…** at the bottom of a generator's page: tick one or several of its tables (the fields that roll on their own, such as NPC Quirk,
  Voice and Wants), how many new rows each, and optionally a direction. They go in one request and come back as one review list with a
  section per table; tick and edit the rows to keep, and they are saved together.
  Below the rows, **Also make a note from these** turns the refill into a note in any category: it is the sheet on the page, with the name you
  give it (the sheet's name to begin with) and one chosen row in place of each refilled table's value. You can add the rows to the tables, make
  the note, or both. (Name is not a table, so it is never refilled: the note takes it from the page.)
  They are saved in a note called `Generator Tables` in the campaign folder (a `##` heading per table, a bullet per row, so you can edit
  it in Obsidian) and mixed in with the built-in rows when you roll. They keep working with Claude off.
- **Use my campaign as inspiration** (ticked to begin with): sends your campaign snapshot if you have made one (below), or else the overview and
  the names and first lines of your NPCs, locations, factions and plot threads (about 2 to 4 thousand characters). It is shown before sending.
  Untick for generic rows. With a snapshot you can also leave out its DM-only secrets.
- **How strongly:** *Light touch* (the campaign colours the rows), *Strong* (the default: at least two rows in three must name or refer to a specific
  person, place, faction, thread or event from your campaign) or *Very strong* (every row does). Built from your notes, the campaign context has the
  overview, the latest session recaps, plot threads with next steps, your player characters, and each person's wants and ties (and DM-only text, which
  you can leave out). New rows start at 5.
- **Make a table with Claude…**: describe a table ("things found in a drowned chapel"), pick a die, tick the rows, and it is saved as a
  note in `Custom tables` in the campaign. **My tables** on the Generate page rolls it.

Nothing is sent until you press Send, and nothing is added until you tick it. Like any change, the notes wait for a push.

## Log the session, and close it out

- **Log** (top bar, or **Option+L** on a Mac / Alt+L): a small box that floats over the page. Type a line and press Enter; it goes at the end of
  a `Session log` section in the session note, as `- 20:41 text`, and the box stays ready. The session is the newest one unless you pick
  another in the box. Tags (click, or Alt+1 to 6): Reveal, Loot, Decision, Ruling, Promise, Hook. They are written as `#tags`;
  Promise and Hook make a task (`- [ ]`) you can tick off. `@` and a few letters offers notes to link. *Undo last* takes back the last line.
  Lines are pending changes (kept in the browser, so a refresh is safe); push when you finish.
- **Close out…** on a session note: Claude reads the log, the notes and the combat summaries and proposes (1) a recap for you, (2) updates to plot
  threads and NPCs that moved, (3) things to carry to next time, and (4) if the note has a players' recap, where it differs from your log. You
  tick and edit; **Apply** writes them: `DM recap`, `Next time` (tasks) and `Recap check` in the session note (marked blocks, updated rather
  than repeated), and a status change plus a linked line under `Session updates` in each thread or NPC note. Your players' `Recap` section is
  never touched. *Just tidy the log* does a plain version with no Claude. It runs in the background, with a pill in the top bar.
- **Import last session** (a button on every session note, and a box in *New session*): brings what Close out saved in the previous session into this one,
  as a `Last time` section before the prep: `Previously, in [[Session 12]]` (your recap, else the players' recap, else the log), `To carry over`
  (the Next time tasks, unticked must-happen items and promises or hooks from the log, as tasks) and `Secrets still hidden`. Pressing it again refreshes
  the section and keeps the ticks you made.

## What am I forgetting?

A card at the top of the Overview, worked out from your vault (no Claude needed): **Waiting for you** (unticked MUST HAPPEN items and *Next time*
tasks from your latest three sessions, and promises and hooks from the session logs that are still unticked), **Threads going quiet** (active
threads that no session has mentioned for the last N sessions, with their next step) and **NPCs not seen lately** (living NPCs who have appeared
before but not in the last N sessions, the most linked-to first). Tick a task and it is ticked in its note. **Add to prep** writes
it as a "Before we start" checklist at the end of that session's Prep. N is in Settings (3 to begin with). A note counts as mentioned when a
session note links to it or names it, so it is only as good as your linking (Suggest links helps).

## Party and encounter budget

**Party** (Tools): each player's level, max HP, AC, passive perception, gold and XP, editable in place and saved on their note where the value already is (a property, or an inline line such as `Level:: 5` or `**HP:** 38`; a property is added only if the sheet has it nowhere). Choose
the session and untick anyone who was away; that is saved on the session note as an `absent` list, and they are left out of the budget and of
*Add the party* in Combat. **Encounter budget** (2024 rules): the budget is each character's XP number for their level (Low, Moderate, High),
added up for those who are here; search any monster (built-in or Bestiary), add as many as you like, and it totals their XP and shows Low,
Moderate, High or beyond High, with how many of a monster fit each tier. *Send to combat* adds them all with initiative rolled. There is no
multiplier for the number of monsters in the 2024 rules. The per-character table is from the 2024 DMG (not in the SRD), transcribed from a
secondary source: check it against your book (it is in `src/core/party.js`).

## Rename, dice, timer, quick-peek, rules

- **Rename** (a note's *Rename…* button, F2, double-click the title, or right-click a `[[link]]`): the file name, the `#` title inside the note, and every
  `[[link]]` to it in other notes (text and properties; `[[Name|words]]`, `[[Name#Heading]]` and embeds too; code is left alone). A preview counts the
  links; *keep the old name* turns them into `[[New|Old]]`. Duplicate names, capitals-only changes and illegal characters are caught. Pushing renames the file.
- **Dice** (top bar, Option+D / Alt+D): d4 to d100, how many, a modifier, advantage or disadvantage on a d20, any expression (`2d6+3`, `4d6kh3`, `d20+5`),
  history, and *Log this roll*. Dice in notes (`2d6 + 5`, `d20`, `Attack Roll: +9`) are buttons; Shift-click advantage, Alt-click disadvantage.
- **Session timer** (top bar): start, pause, reset; a break reminder every 30 / 45 / 60 / 90 minutes. Scenes are tasks under `## Scenes` in the session
  note (`- [ ] The ambush (20 min)`), added from the timer or typed in the note; *Done* ticks one, notes how long it took, and logs it. Pace shows
  scenes done, time planned and left, and ahead or behind.
- **Quick-peek**: hover or tab to a `[[link]]`, a creature's name in the fight, or a condition for a small card (kind, properties, start of the text; or what the
  condition does). Esc hides it.
- **Rules** (Tools): the 339 spells of the 2024 SRD (5.2.1, CC-BY 4.0) with search and filters, *Save to my notes* into a `Spells` category, and
  short reminders for each condition (written for DM Forge from the 2024 rules; check the book). This work includes material from the System Reference Document
  5.2.1 by Wizards of the Coast LLC (https://www.dndbeyond.com/srd), licensed under CC BY 4.0 (https://creativecommons.org/licenses/by/4.0/legalcode).

## Secrets, spotlight, clocks, name checker

- **Secrets** (Tools): tasks under `## Secrets and clues` in session and plot thread notes, with the clues after a dash
  (`- [ ] The ferryman sold the bells — Old Tam's ledger; the missing rope`). Add them on the page or in Obsidian; fewer than three clues is flagged.
  Ticking one marks it `(revealed in [[Session]])` and logs a Reveal line. The Overview lists secrets still hidden.
- **Spotlight**: the log's Spotlight tag (Alt+7), plus *+ Moment* on the Party page's Spotlight card, which counts moments per player over
  the last four sessions (quietest first; away players are skipped). Each player has a **−** that takes back their newest moment in the current session, and **Undo last moment** takes back the newest one of anyone's. The Overview names players with none lately.
- **Clocks** (Tools): progress clocks (4 to 12 slices) and faction standing (Hostile, Unfriendly, Wary, Neutral, Friendly, Trusted, Allied), saved in
  the note `Clocks and Standing` (`## Clocks` and `## Faction standing` lists; anything else in the note is kept). Filling a clock and changing a
  standing are logged to the session.
- **Name checker**: shown when naming a note, saving a generated result, renaming, and on generated NPCs, taverns, shops, villains, settlements and
  festivals: the name is already used, the first or family name matches, or a close spelling does (titles like Captain and Old are ignored).

## Session zero kit, tour, sample campaign

- **Session zero kit** (Menu, or the start card on the Overview): four steps (the campaign, the table, the players, check and create). It makes a
  `Session Zero` note (premise, setting, tone, pillars, level, schedule, lines and veils, safety tools, how you play together, house rules), a
  `Session Zero Questionnaire` to send the players, a note per player (class, level, who plays them, prompts for backstory and hooks), a first plot
  thread, and optionally Session 1 with a prep outline (strong start, three timed scenes, secrets and clues, must happen). All pending changes.
- **Take the tour** (Menu or the start card): fifteen stops pointing at the real buttons; arrows move, Esc leaves.
- **Add the sample campaign to my vault** (Menu): the whole Ashfall showcase campaign (NPCs, players, six sessions, secrets, clocks, a Bestiary, a cheat sheet; the map pictures are only in the practice demo) written into a new folder (default `Ashfall (sample)`), with an option (off by default) to add ten example characters to Character Library/Examples. Inside the sample, **Menu, Remove the sample campaign** moves the notes you have not changed to the trash, never into a
  folder that already has something in it. **Try the demo vault** on the start screen is the practice campaign: nothing you do there is saved.

## Character Library and the character creator

Player characters and NPCs that belong to no campaign. They live in **Character Library/Characters** at the root of your vault, one plain markdown file each. Open it with the **Character Library** button on the campaign picker, or **Tools, Characters** inside a campaign.

- **Make a character** in seven steps: Class, Origin, Abilities, Spells (casters only), Equipment, Details, Review. Level 1 to 20, all 12 SRD classes with their subclasses and features, the 9 SRD species, the 4 SRD backgrounds, and the 339 SRD spells. Hit points, Armor Class, saves, skills, passive Perception, spell save DC and spell slots update as you go.
- **Abilities**: standard array, point buy, roll 4d6 and drop the lowest, or type them in. The background adds +2/+1 or +1/+1/+1.
- **Details** are as deep as you want: **Quick** is the basics, **Standard** adds appearance and personality, **Deep** adds backstory, family tree, timeline, relationships, ties to the other PCs, hooks for your DM and notes. NPCs get a "Running this NPC" section instead. Add sections of your own; empty ones are never written. The dice button suggests a trait, ideal, bond, flaw and more.
- **The file** is markdown you can open in Obsidian, with properties (class, level, HP, AC, scores) and a sheet. Edit the details there if you like: the creator reads them back. A file you wrote by hand is listed and can be viewed, but not edited in the creator.
- Saving writes straight to the vault (it is not held as a pending change, like creating a campaign folder). Delete moves the file to your vault's trash folder.
- **Print the sheet** for the table.

- **Examples** (the ones the sample campaign can add) go in **Character Library/Examples**, shown in a collapsed section under your own characters, with a **Remove all examples** button. They are never mixed in with yours.

The classes, species, feats, armour and weapons are from the SRD 5.2.1 (CC-BY 4.0). The four backgrounds and the shape of the details sections are written for DM Forge: check backgrounds against your book. Bringing characters into a campaign comes next.

## Adding a line without Edit

On any note, double-click a paragraph, heading or bullet to change just that piece. Double-click the **empty space between two parts**
(say between "Recap" and "Session log") to add a line there: a bullet if the part above is a list, otherwise a paragraph.
Enter adds it, Shift+Enter starts a new line inside it, Esc cancels.

## Level up, items and adding to a campaign

In the Character Library, every character made in the creator has a **Level up** button. It lists what the next level gives,
then asks only for the choices that level needs: hit points (the average, a roll, or the number you rolled), an ability score
improvement or a feat, Expertise, and spells. A before-and-after panel shows the numbers. The choices are written into the file
("Level 4: +2 Str"), so the creator and the sheet keep agreeing. Characters made at level 4 or higher in the creator are owed their
improvements, which Level up asks for.

The **Items** tab keeps magic items in `Character Library/Items` as plain markdown. Build one from scratch, copy one of the 265 SRD
5.2.1 magic items, or roll one with the Magic Item generator and edit it. The builder covers kind, rarity, attunement, bonuses,
Armor Class bonus, charges, extra properties and DM-only notes (curse, history, hook). A character can carry library items:
attunement is counted (three at once) and an Armor Class bonus applies once attuned.

**Add to campaign** (on any character or item) copies it into the campaign you have open as pending changes, in the right folder,
bringing along the items a character carries. The copy is an ordinary note with a `library` property saying where it came from.

## Campaign snapshot

The **Snapshot** button in the top bar (just left of Layout, always there; it gets a dot when the snapshot is worth refreshing, and is greyed out when Claude is off) makes or refreshes it. The same buttons are in Menu, Settings, **Campaign snapshot**, *Make a snapshot…* (needs Claude switched on). It runs **in the background**: press Send, the window closes and
you carry on; a pill in the top bar next to Layout shows the progress, and turns into *Snapshot ready: review* when it is done (red if it failed).
While it runs, the other Claude buttons say Claude is busy. Claude reads your notes once (a big campaign in parts,
then joined) and writes about 1,500 words: premise and tone, where the story is now, open threads, factions, key people, places, recent
sessions, and the **DM-only secrets in their own section** (tick the box to leave them out). You see what will be sent and can edit the answer
before it is saved as the note `Campaign Snapshot` in your campaign, which you can also edit in Obsidian. The settings show how old it is and
how far the campaign has moved on ("3 notes changed, 1 new"), and say it is worth refreshing when 5 or more notes (or 15%) changed or a
session note did. It only refreshes when you press *Refresh*. Notes DM Forge writes itself (the snapshot, Generator Tables, DM Cheat Sheet and
Custom tables) are not part of it.

## Saving generated things

- **Save to campaign** can send one result to several places at once: session prep and any category
  (NPC, Location, Faction, Plot thread, Item, or one you added). Each ticked category gets its own note,
  and the prep entry links to it.
- In session prep it is saved as a **collapsed callout** (`> [!info]- Shop — [[Jorah's Arcana]]`), so a long
  shop or NPC is one line until you open it, in DM Forge and in Obsidian. Untick *Collapse it* for the plain
  heading and list.

## Version history

*Version history* (sidebar, Menu, then Version history, or click the version number at its bottom) lists every change in every
version, newest first: what is new, improved or fixed, with the date. Search every change, filter by kind, expand
or collapse releases. The current version is marked "You are here", and what came before V2 is at the bottom.
The list lives in `src/core/changelog.js`; a test fails if the newest entry does not match the `VERSION` file.

## Scrolling

On a computer screen the window itself does not scroll. On pages with a list and a note (NPCs, Sessions and so
on) the title stays at the top and the list and the note scroll separately, so a long note never carries the
list away. Other pages scroll in their own area. On a narrow screen it is one ordinary scrolling page.

## The Menu

The sidebar's **Menu** button opens a short list: *Settings*, *Keyboard shortcuts*, *Take the tour*, *Session zero kit*, the sample campaign and *Version history*
(Ctrl/⌘-click Settings or Version history for a new tab). Claude, Undo last push, the Trash, Version and Check for an update are in Settings.

## Claude (experimental)

*Claude (experimental)* (sidebar, Menu, Settings, then Claude) is a demo that needs the helper. DM Forge asks **Claude Code**, installed on
your Mac and using your own sign-in, one question at a time. Only text you can see is passed on, and nothing is sent by itself:
*Expand with Claude* sends straight away (the result on the card plus a fixed request) and shows what it sent under "What was
sent"; *Ask Claude* shows the note and a box for your question and sends when you press Send.

- Tick *Show the Claude buttons* to get **Expand with Claude** on every generated result (two read-aloud paragraphs plus DM
  notes) and **Ask Claude** on every note (the note and your question).
- Claude runs with every tool switched off, in an empty temporary folder, one request at a time and for at most 3 minutes, so it
  can only answer in text: it cannot read the rest of your vault, run anything or change files.
- The helper runs Claude Code the way a Terminal window would (your login shell's PATH and settings), so it uses the same
  `claude` and sign-in you do. **Check sign-in** in the same window shows which one it found, what differs, and a test
  answer. Requests are logged (times and results only, never your text) in `~/.dmforge/claude.log`.
- It needs Claude Code on the Mac (run `claude` once in Terminal and sign in). If it is missing, the settings say so.
- **Going back.** Untick the box and every Claude button disappears. To go back to the previous version completely, use *Roll
  back* in the same window, or run `python3 dmforge-server.py --rollback`. The previous version comes back from the `.previous`
  folder, the one you left is kept in `.rolled-back`, and your notes are never touched. The Version history keeps the entry.

## The look: sidebar, Favourites, dark styles

The sidebar has four groups (Story, World, Table, Reference); one is open at a time and the one with your current page
opens itself. Star a page, or drag it onto **Favourites** at the top, to keep it handy (it stays in its group too); a single
note can be pinned from its ... menu. Favourites are kept per campaign in this browser. Characters (your library) sits below.

Menu, Settings has **Dark mode style**: Warm (default) or Blue-grey. The top bar is icon-only, with a Push button that always
says what it will do. Below 900 px wide the sidebar becomes a drawer; below 700 px the table tools sit in a bottom bar.

## Light and dark

Light and dark are in the **View** menu in the top bar (and the sun/moon button on the welcome screen); either switches mode, and every colour fades over 3 seconds
while the page stays fully usable (plain CSS, nothing is frozen or snapshotted). It remembers your choice and otherwise follows the system. Shift-click to go back to following
the system. With "reduce motion" on, it switches instantly.

## Items and shops

- **Shop**: 19 kinds (general store, blacksmith, weaponsmith, armorer, apothecary, alchemist, arcane curios,
  magic emporium, tailor, bookseller, stables, jeweler, leatherworker, bowyer, cartographer, reliquary,
  provisions, fence, pawnbroker, tinker, carpenter) in a Hamlet, Village, Town or City, at Fair, Steep or
  Bargain prices. Each shop gets a keeper with a manner and a quirk, a first impression, where and when it is
  open, priced stock with quantities (5e equipment prices), magic wares that fit the shop and the settlement,
  a rare find, what it buys, how to haggle (with a DC), its reputation, what the keeper wants, and a secret.
- **Magic Item**: choose rarity, kind and whether it may be cursed. You get a type line (weapon, armor, ring,
  wand, staff or wondrous item, with attunement), a name, an appearance, mechanics that scale with rarity
  (bonuses, extra damage, spells with a save DC, charges), a catch or a real curse, a history, a value inside
  the DMG range for its rarity and a story hook. Rerolling one line keeps the rest.
- **Potion**: rarity and kind (healing, utility, combat); healing potions follow the 5e tiers, every effect
  matches the potion's name, with a halved consumable price, an origin and how to identify it.
- **Loot** adds art objects and, from the second tier, magic items, potions and scrolls with values.
  **Trinkets** are 60 oddities with a hidden detail for one of them.

## Tidy notes

During a session you type fast and the notes are rough. **Tidy notes…** (on every session note, beside *Close out…*) organises them afterwards.

- **What it tidies.** The log lines you typed and any notes-style sections (a section called *Notes*, *What happened* and so on). The window lists every section with a tick box: the log is ticked, Prep and the players' *Recap* are locked and left exactly as they are, and any other section of yours is there to tick if you want it. Combat summaries, *DM recap*, *Next time* and anything else DM Forge wrote are never touched.
- **What you get.** The tidy version in order of play, grouped by scene (`### Scene title`), your wording kept where it is clear, spelling and run-on lines fixed, times kept, `#reveal`, `#loot`, `#decision`, `#ruling` lines labelled, names linked as `[[links]]`, and a short *At a glance* list (who, where, loot, open threads). Anything secret or DM-only goes under `### Secrets (DM only)`, which a player-safe copy removes. Claude is told to add nothing and drop nothing.
- **Your original is kept.** The notes exactly as you typed them go into one hidden comment (`<!-- dmforge:original ... -->`) at the very end of the note. It does not show in Obsidian's reading view, is left out of player-safe copies, and is not counted for links or tags. *Show my original* (on the strip under the title) shows it, and *Put back my original…* removes the tidy version and restores every line (promises you ticked since stay ticked).
- **Promises and hooks stay as tasks.** Lines tagged `#promise` and `#hook` are kept in a small log block under *Promises and hooks*, exactly as typed, so *What am I forgetting?*, *Close out* and *Import last session* find them as before. *Close out* now reads the tidy version.
- **Checked before you apply.** The review shows your notes on the left and the tidy version on the right (editable). Every name, number and link from your notes must be in the tidy version: if some are missing, they are listed and *Apply* waits until you tick *I have looked* (or put them back). Names and numbers in the tidy version that were not in your notes are highlighted. If something that looks secret has moved outside the DM part, you are warned that players could see it.
- **Tidy without Claude** fixes the formatting and puts the log in order as a timeline, with nothing reworded. Secret lines go to the DM part. It needs no login.
- **While Claude works** you can keep using DM Forge and keep logging: lines typed meanwhile are added to the end of the tidy version (under *Added while tidying*) and to the original. A long night is sent in parts, one after the other, then joined.
- **Tidy again** (from the strip) starts from your original plus anything typed since, and replaces the tidy version. Changes are pending until you push, like everything else; *Undo last push* works too.

## Before a real session

`SUNDAY-CHECKLIST.md` (in this folder) is a 20-minute list for the things only your Mac, Brave and real vault can confirm, plus what to do if something goes wrong at the table.

**Keep both.** If a note was changed in your vault (in Obsidian, say) while you were also changing it here, the push review shows *Changed in your vault*. When the two sets of changes are in different places, *Keep both* is offered: it combines them, line by line, and writes the result. If you both changed the same spot it is not offered; the other choices are the same as before. Nothing is chosen for you, and *Undo last push* can bring back what was replaced.

**If the helper stops.** The page keeps working and your changes (and a fight in progress) are kept in the browser. A push says it cannot reach the helper. Start the helper again, open the new link it prints, and the unpushed changes come back. Always run one helper: a second one gets a different port, which is a different place to the browser.

**Note names.** On a Mac, names that differ only in capital letters are the same file, so a new note with such a name gets a number (`Wren Dunmere 2`). Names never start with a dot, never contain `/ : * ? " < > | # ^ [ ]`, and are kept under 200 bytes.

## Known limits

- Notes are read when you open the campaign. If you edit in Obsidian during a session, use
  **Reload from vault** (your unpushed changes are kept). Conflicts are caught at push time.
- Wikilinks to notes outside the campaign folder show as dashed links and open in Obsidian.
  Only `![[image.png]]` embeds inside the campaign folder are shown.
- Fonts are built into the file. The app makes no network requests at all, so Brave Shields have nothing to block.
- No AI features in this version.

## Vault report

**Inspect a vault** on the start screen scans a vault read-only and produces a text report: folder
names and counts, which properties your notes use, inline-field and link usage, plugins, and
templates. It never includes note contents. Useful for tuning DM Forge to your vault.

## Development

```
npm install
npm run build      # writes dist/DM-Forge.html (single file, no server needed)
npm test           # unit tests for the reader, writer, push logic, moves, reformat, tags, combat, generators
python3 test/update_test.py   # the self-updater
node test/e2e.mjs && node test/e2e2.mjs && node test/opfs.mjs && node test/helper.mjs   # browser tests (Playwright)
node test/tidy47.mjs    # Tidy notes (part of the usual run)
# Occasional, not part of the usual run: an extensive suite on a big messy campaign (a whole game night, break-it cases, backup and undo, a sweep of every note and page):
node --import ./test/open-nav.mjs test/sunday1.mjs    # and sunday2 to sunday5; each takes a minute or two
# By hand, needs Claude Code signed in (makes real requests): Tidy notes against the real Claude Code
node --import ./test/open-nav.mjs test/tidy-real.mjs
```
Source is in `src/core` (vault, parsing, push logic, generators) and `src/ui` (Preact screens).
