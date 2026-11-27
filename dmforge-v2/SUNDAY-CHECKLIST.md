# Before Sunday: the 20-minute check

I have tested everything I can without your Mac: a whole game night on a big, messy campaign, crashes and refreshes, the helper stopping, Obsidian editing the same note, two tabs, awkward note names, a 3,000-note vault, undo and the trash, every page at four window sizes in light and dark. That is about 2,000 automatic checks, all passing.

What I **cannot** see from here is your Mac, Brave, your real vault and Obsidian. This list is only those things. Do it on **Saturday**, so there is a day left to fix anything it turns up. Tick as you go.

## 1. Make a safety copy (2 minutes, do this first)
- [ ] In Finder, right-click your vault folder, **Duplicate**. Rename the copy `Vault backup (Saturday)`. Keep it outside Obsidian Sync.
- [ ] If anything below ever goes wrong, this copy is the whole campaign exactly as it was.

## 2. Start it the way you will on Sunday (3 minutes)
- [ ] Quit any old helper window (the Terminal one). Only ever run **one** helper: a second one picks a new port, and then your unpushed notes and your fight stay on the first one.
- [ ] Unzip the new version. First time only: right-click `Start DM Forge.command`, **Open**, **Open**.
- [ ] Terminal shows a link starting `http://127.0.0.1:8765/?t=`. Open it in **Brave**.
- [ ] **Menu** shows version **2.61.0** (at the bottom of the sidebar).
- [ ] Your real campaign opens. Counts look right (NPCs, Players, Sessions). The top bar says nothing is pending.

## 3. Things that depend on a Mac (5 minutes)
- [ ] **Capital letters.** Make an NPC called `zz test npc`, push it. Make another called `ZZ TEST NPC`. It should be saved as `ZZ TEST NPC 2` and **not** replace the first. (A Mac treats those as the same file; this protects you.) Then **Undo last push** twice to remove them.
- [ ] **Accents.** Make an NPC called `Zoë Test` and one called `Zoe Test`. Push. Both exist as separate notes.
- [ ] **Brave swipe.** On the trackpad, two-finger swipe left across the page. It must not take you back a page and lose your place. (If it does, turn off *Swipe to navigate* in Brave, or just don't swipe sideways.)
- [ ] **Option+L** (the log box) opens it. Press it with the cursor in a note editor: it must not type a `¬`.
- [ ] **Sleep.** Add a log line (don't push). Close the lid for 1 minute. Open it. The line is still there and **Push** works. If it says it cannot reach the helper: start the helper again, open the **new** link it prints, and the unpushed line comes back.
- [ ] **Wi-Fi off.** Turn Wi-Fi off, reload the helper link. The app looks the same and works (it does not need the internet). Turn Wi-Fi on again.
- [ ] **Keep it awake.** Open Terminal and run `caffeinate -d`. Leave it running on Sunday; it stops the screen sleeping mid-session. (Or set the Mac to never sleep on power.)

## 4. With Obsidian open on the same vault (4 minutes)
- [ ] Open the vault in Obsidian and DM Forge together. Just opening notes in Obsidian must **not** make DM Forge say "changed in your vault".
- [ ] In DM Forge: log a line to the newest session, push. Obsidian shows the new line within a few seconds.
- [ ] In Obsidian: type a line near the top of that session note. In DM Forge: log another line and push. You should see **Keep both: my changes and the vault's**. Choose it. Both lines are in the note afterwards.
- [ ] If you use Obsidian Sync, wait 30 seconds and check nothing looks doubled or conflicted (`... (conflicted copy)`).

## 5. A dry run of the real thing (6 minutes)
- [ ] **New session** for Sunday. Fill in the prep with a few lines.
- [ ] **Combat**: start, add your real party, add a couple of monsters, run two rounds. Check **highest initiative goes first**, the turn banner reads well on your screen, and Undo (in Combat) takes back a slip.
- [ ] Open the tool pill (timer, dice, log). Move the mouse away: it closes. Pin it: it stays.
- [ ] Log five lines with an `@mention` and a `[[New Person` (create from the log box).
- [ ] **Push.** Then **Undo last push**, then check the notes are back as they were. Push again to put it back.
- [ ] Refresh the page in the middle of the fight. The fight comes back exactly.
- [ ] **Tidy notes** (new in 2.47): on the dry-run session switch to **Wrap up** and press **Tidy notes…**. Send to Claude (or **Tidy without Claude** if you are not signed in). Read your notes on the left against the tidy version on the right, then **Apply**. Check: your Prep and the players' Recap look exactly as before, your promises still show in **What am I forgetting?**, and **Show my original** (under the title) shows exactly what you typed. Then **Put back my original…** and check everything is back as it was.
- [ ] Open the tidied note in **Obsidian**: it reads cleanly, and your original is hidden (it only shows in source mode, at the very bottom).
- [ ] Delete the dry-run session and its test notes (or **Undo last push** until they are gone), and push.
- [ ] If you use Claude for Close out: **Menu, Settings, Claude** shows it signed in. If you do not, switch it off.

## 6. Things to remember at the table
- Your notes are on disk and safe. DM Forge only changes them when you press **Push**.
- Push at a natural break (a scene change, a long rest), not only at the end. It takes a second.
- If the page says it **cannot reach the helper**: do not close the tab. Start `Start DM Forge.command` again, open the new link, and your unpushed lines and the fight in progress come back.
- If a push goes wrong: **Command+K**, type `undo`, **Undo last push**. The last ten pushes can be undone. Deleted notes are in the vault's `.trash`, and **Menu, Settings, Data and updates** has a trash viewer.
- Do not run `update` in the helper window on Sunday night. Update on Monday.
- After the session: **Tidy notes…** first, then **Close out…** (Close out reads the tidy version). Your original typing is always kept, and one click puts it back.
- One Brave tab, one helper, one window. That is the setup I tested.

## What the automatic tests cover (so you do not need to)
A full game night on a 280-note campaign with awkward notes (broken front matter, empty file, 200 KB note, Windows line endings, emoji names, duplicate names) with checks on the files afterwards. Refresh or crash with unpushed work. The helper stopping and returning. A push where one write fails. Obsidian editing the same note, with and without a clean merge. Two tabs. Seventeen awkward names. 1,500 log lines and a 34-creature fight. A 3,000-note vault. Undo, the trash, the ten-push limit and byte-for-byte restores. Every note opened, every page at four widths in light and dark, every campaign colour.
