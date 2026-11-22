# DM Forge V3 plan (queued, not built)

Status: **queued**. Nothing is built until the user says "build" or "go". V2 stays fully working
(folder mode, Brave helper) until the user says otherwise.

## Goal
Move DM Forge off the Mac helper and onto the user's mini PC (Linux Mint, Docker) so it can be used
from any device, anywhere, over Tailscale. Single user for now. V4 (players, wider access) is a later
discussion and is out of scope.

## Decisions (from the user)
- Notes live in a **database** (source of truth). The user does not use Obsidian today.
- Backup: **nightly Markdown export** to a folder, so the campaign is never locked in (and can be opened
  in Obsidian read-only if wanted).
- Access: Tailscale only. **Never expose ports.** Bind to the Tailscale address, plus a login token.
- Claude features: implement the server-side path, low priority. The user will log in to the `claude`
  CLI on the server once.
- **Offline-capable:** edits are saved locally when the server is unreachable and pushed on reconnect.
  Needs safeguards for the rare conflicting-merge case.
- Keep V2 backends (folder picker, helper) working alongside V3.

## Shape
- Server: Python, standard library where possible, in one Docker container; SQLite (WAL) in a volume.
- Rows per note: path, front matter, body, modified time, version number. Full-text search via FTS5.
- Trash, undo and version history stored as rows (replacing the helper's `.trash` and undo folders).
- App: new `ServerVault` backend behind the existing vault interface in `src/core/vault.js`
  (siblings: `MemoryVault`, `FsaVault`, `HttpVault`), plus a "Connect to server" option.
- Offline: browser-side cache and outbox of pending changes, replayed on reconnect.
- Conflicts: every write carries the base version it was made from. If the server's version has moved,
  do a three-way merge (`src/core/merge3.js` already exists); if that is not clean, nothing is
  overwritten. Keep both versions and ask the user to choose, and never lose either side. Also keep every
  prior version in history so any overwrite is recoverable.

## Build order
1. Server and database: notes, trash, undo, history, search, token login.
2. `ServerVault` backend and the connect screen.
3. Offline cache, outbox, sync and conflict handling (with tests for the rare cases).
4. Import from a vault folder (dry run first) and Markdown export.
5. Docker: Dockerfile, compose file, Tailscale-only binding, nightly export job, backup notes.
6. Claude on the server (CLI login), low priority.
7. Character-creator UI tweaks (parked; only if the user wants them in V3).

## Open questions
- Should the parked character-creator tweaks be part of V3?
- Whether to start the hosted-server work before the remaining V2 UI rework (Overview, Combat, Party).
