# DM Forge V3: running it on your server

DM Forge V3 is the same app, served from your mini PC and reachable from any of your devices over Tailscale.
Your campaign lives in a database on the server (with every earlier version of every note kept), with a nightly
copy of the database and a nightly plain-Markdown copy of the whole campaign.

**Your Mac setup keeps working.** Nothing here changes `DM-Forge.html`, the helper or folder mode.

## What you need on the server (Linux Mint)

- Docker with the compose plugin (`docker compose version` should print a version)
- Tailscale, signed in, with **MagicDNS** and **HTTPS certificates** switched on in the Tailscale admin console (DNS page).
  HTTPS matters: it is what lets the app open with no connection.

## 1. Put the files on the server

Copy the `source` folder from the DM Forge zip (or `git clone` the repository and use the `dmforge-v2` folder) to somewhere
like `~/dmforge`. All the commands below are run from inside that folder.

## 2. Settings

```
cp .env.example .env
nano .env
```

- `DMFORGE_TOKEN`: the password for the app. Make one with `openssl rand -base64 24` and paste it in. You type it once per device.
- `DMFORGE_NAME`: the name shown in the app.
- `DMFORGE_HOSTS`: fill this in after step 4 with your machine's Tailscale name (for example `dmserver.tail1234.ts.net`).
- `DMFORGE_UID` / `DMFORGE_GID`: the output of `id -u` and `id -g`.

Then make the two folders the container writes to, as yourself:

```
mkdir -p data export
```

## 3. Start it

```
docker compose up -d --build
docker compose logs -f dmforge        # Ctrl+C to stop watching
```

You should see "DM Forge server listening". `docker compose ps` should show it as `healthy` after half a minute.
The port is published on the server's own loopback only (`127.0.0.1:8765`): nothing on your home network can reach it yet.

## 4. Reach it over Tailscale (HTTPS, never public)

```
sudo tailscale serve --bg --https=443 http://127.0.0.1:8765
tailscale serve status
```

Open the address it prints (`https://<machine>.<tailnet>.ts.net`) on any device signed in to your tailnet. Type the token once.

Then put that name in `.env` as `DMFORGE_HOSTS` and run `docker compose up -d` so the server only answers to that name.

**Do not use `tailscale funnel`.** Funnel puts a service on the public internet. This guide never does.

## 5a. Bring your settings over (optional, from version 2.53.1)

Your theme, fonts, layout, favourites and so on live in the browser you used before, so the server's address starts with defaults.
In the **old** place (the Mac helper or folder mode, once it is updated to 2.53.1): **Settings, Data, Save my settings…**. In the **new** place,
after you have opened the campaign once: **Settings, Data, Bring my settings in…**, pick that file and confirm. DM Forge reloads with your settings.

## 5. Bring your campaign in (once)

Dry run first. It changes nothing and tells you what it would do (the vault folder is mounted read-only):

```
docker compose run --rm -v "$HOME/path/to/your/vault:/vault:ro" dmforge python -I dmforge_io.py import --dry-run /vault
```

Then for real:

```
docker compose run --rm -v "$HOME/path/to/your/vault:/vault:ro" dmforge python -I dmforge_io.py import /vault
```

Hidden folders (`.obsidian`, `.trash`) are skipped. A note that is already in the database but different is left alone unless you add
`--overwrite` (the old text is kept in its history either way). You can run the import again at any time.

To get the campaign back out as Markdown files on demand: `docker compose run --rm dmforge python -I dmforge_io.py export /export`.

## Importing dungeons from DMAtlas

DM Forge can bring dungeons over from DMAtlas (the dungeon-map app): the picture of each level, a pin for every room, and one note with a section per room.
DMAtlas keeps the geometry; DM Forge keeps what you write. Importing again moves pins and renames headings and never touches your text.

1. In `.env` set `DMFORGE_DMATLAS_URL` to where DMAtlas publishes (for example `https://water.tail029b78.ts.net:8767`), then `docker compose up -d`.
2. Check that **this server** can reach it (the container, not your Mac):

```
docker compose exec dmforge python -I dmforge_atlas.py
```

It prints `OK. N published dungeons:` and lists them, or says exactly why not.
3. In the app: **Maps, Import from DMAtlas…** (or the command palette, or Settings, Data). Pick a dungeon, read the preview, import, then push.

Pictures are fetched by the server, checked (a real PNG, no larger than 15 MB or 16384 pixels, and exactly the hash DMAtlas gave) and stored under
`<campaign>/Maps/<dungeon>/`. They are in the nightly Markdown export and the database backups. Nothing else is fetched, and redirects are never followed.

**If DMAtlas runs as a container on this same machine** (it does, here): a container cannot use DMAtlas's tailnet address (`https://<machine>.<tailnet>.ts.net:8767`).
Tailscale only opens that port to other devices, so from inside the container it is refused. Instead, DM Forge joins DMAtlas's Docker network and uses its container name:

```
cd ~/dmforge
cp deploy/docker-compose.dmatlas.yml docker-compose.override.yml
sed -i '/^DMFORGE_DMATLAS_URL=/d' .env
echo 'DMFORGE_DMATLAS_URL=http://dmatlas:8767' >> .env
docker compose up -d
docker compose exec dmforge python -I dmforge_atlas.py
```

`docker compose` reads `docker-compose.override.yml` by itself, and it is not in the repository, so the automatic updater leaves it alone. The network name inside it
(`dmatlas_default`) and the port (`8767`) come from `docker ps` and `docker inspect dmatlas`; change them if yours differ. Nothing is published beyond loopback.
If you ever remove DMAtlas or its network, delete `docker-compose.override.yml` or DM Forge will not start.

**If the check says `DMAtlas answered 421`:** DMAtlas only accepts its own public host name (a guard like DM Forge's own). DM Forge tries your tailnet name and `localhost`
by itself and tells you which one worked; to make it permanent, put `DMFORGE_DMATLAS_HOST=<that name>` in `.env` and run `docker compose up -d`.

**If DMAtlas is somewhere else** (another machine on the tailnet), the tailnet address works as it is, because then the request does come from outside.

## Backups

Every night at `DMFORGE_BACKUP_HOUR` (default 3am) the server:

- copies the database to `data/backups/dmforge-<date>.db.gz`. The copy is **checked** (SQLite's own check, and every note and picture counted against the live
  database) and compressed before it is kept, and the newest `DMFORGE_BACKUP_KEEP` (default 14) stay. A copy that fails the check is thrown away and reported as FAILED;
- refreshes `export/` with every note as an ordinary `.md` file. A note you deleted is moved to `export/.removed/<date>/`, never erased.
  You can open `export/` in Obsidian (read-only is safest).

The outcome of the last backup (and of the last update, the free disk space and the size of the database) is on **Settings, Server** in the app. If a backup fails, or the disk is
getting full, the top bar shows **Server needs a look** so you hear about it without reading logs.

**Everything above is on this one machine.** If its disk dies or it is stolen, the campaign and all these copies go together. So keep a copy somewhere else:

- **From the app, any time:** Settings, Server, **Download notes (.zip)** (every note and picture as ordinary files, openable in Obsidian) or **Download database (.gz)**
  (everything, with every earlier version of every note). Do it before you travel, or now and then.
- **Automatically, on your Mac:** `tools/pull-backup.sh` downloads both copies over Tailscale and keeps the newest 14 of each. Put your access token in a private file, test it once by hand,
  then let macOS run it every day:

```
printf '%s' 'YOUR-TOKEN' > ~/.dmforge-token && chmod 600 ~/.dmforge-token
bash ~/dmforge/tools/pull-backup.sh https://<your-server>.<your-tailnet>.ts.net
open ~/Documents/DM-Forge-backups
# once that works: edit the two names inside tools/com.dmforge.pull-backup.plist, then
cp tools/com.dmforge.pull-backup.plist ~/Library/LaunchAgents/
launchctl load ~/Library/LaunchAgents/com.dmforge.pull-backup.plist
```

  (If the Mac is asleep at the set time, it runs when it wakes. The script never deletes anything from the server, and the token is not put on the command line.)

**Restore from a nightly copy:**

```
docker compose down
rm -f data/dmforge.db data/dmforge.db-wal data/dmforge.db-shm
gunzip -c data/backups/dmforge-YYYYMMDD-HHMMSS.db.gz > data/dmforge.db
docker compose up -d
```

(A downloaded `.db.gz` restores the same way. A `.zip` is put back with `dmforge_io.py import` on the unzipped folder, as in step 5.)

You can also take a copy right now, with no downtime (it lands in `data/backups`):

```
docker compose exec dmforge python -c "import os,urllib.request as u;print(u.urlopen(u.Request('http://127.0.0.1:8765/api/backup',method='POST',headers={'X-DMF-Token':os.environ['DMFORGE_TOKEN']})).read())"
```

**Disk space.** Pictures are kept once in the database, but every database copy includes them: with many large maps the copies add up. Settings, Server shows the free space and the
nightly copies are compressed; lower `DMFORGE_BACKUP_KEEP` in `.env` if the disk is small. Docker's own logs are limited to 30 MB.

## Updating (automatic)

The server can install new versions by itself, within about a minute of one being released. It follows the `dmforge-release` branch on GitHub.
Every minute it asks GitHub one small question ("has that branch moved?"). Nothing is opened to the internet: it only reaches out.

**One-time setup** (on the server, inside `~/dmforge`; your `.env`, `data/` and `export/` are not touched):

```
cd ~/dmforge
git init -q
git remote add origin https://github.com/vuthyM/vuthyM.git
git fetch --depth 1 origin dmforge-release
git reset --hard FETCH_HEAD
git branch -M dmforge-release
./update.sh --status
```

If `git fetch` asks for a password, the repository is private: tell Claude and a read-only key will be set up instead.

Then start the minute-by-minute check:

```
crontab -l 2>/dev/null | grep -v update.sh > /tmp/cron.new
printf 'PATH=/usr/local/bin:/usr/bin:/bin\n* * * * * %s/dmforge/update.sh >/dev/null 2>&1\n' "$HOME" >> /tmp/cron.new
crontab /tmp/cron.new
crontab -l
```

**What happens when a release is published**

1. The database is copied to `data/backups/pre-update-<date>.db.gz` first (the newest 10 are kept). If that copy fails, nothing is updated.
2. The new files are downloaded and the new version is built while the old one keeps running.
3. The container is swapped (a few seconds), then checked until it reports healthy.
4. If the build fails or the new version is not healthy, the old version is put back automatically and that release is skipped until a newer one is published.
5. Open DM Forge pages show a bar with "Reload to use it" within about 30 seconds (it never reloads for you, so nothing is lost mid-edit), and the app copes with the few seconds the server is away.

Everything is written to `~/dmforge/update.log`, and the outcome of the last update (and when the server last looked) is on **Settings, Server** in the app, which also warns you if a
release failed to install or the server has stopped looking.

**Before a session: Settings, Server, Hold updates** stops installs for 8 hours (it ends by itself, so it cannot be forgotten; Resume updates ends it sooner). Without the app:
`echo $(( $(date +%s) + 8*3600 )) > ~/dmforge/data/.hold-updates`. `./update.sh --status` shows the version running, any hold, and the last log lines; `./update.sh` checks right now.

**To pause automatic updates:** `crontab -e` and put a `#` at the start of the update.sh line. **To go back to manual updates:** copy a zip over as before (the git folder is just files).

## Working with no connection

- Everything you open is saved on the device. Opening the campaign again downloads only the notes that changed. For pictures and files, Settings, Server, **Save everything for offline** fetches the rest before you travel. Opening DM Forge with no server (a train, bad signal at a table) works as long as that
  device has opened the campaign once while online, and used the HTTPS address above.
- Edits are kept as "unpushed changes" as always. The top bar says **Offline** and pushing waits.
- When the server is back the Offline note disappears by itself. Push as normal: the review shows each note and flags any that changed
  on the server in the meantime, offering to keep both sets of changes when they do not overlap.
- The server also refuses to overwrite a note that changed since the version you started from, whatever the timing. If that happens
  your change stays waiting and nothing is lost; every earlier version of every note is kept.

## Security notes

- The port is bound to loopback; Tailscale carries it. Never publish it on `0.0.0.0` or with `tailscale funnel`.
- Every request needs the token (as a header, or the sign-in cookie, which is HttpOnly and SameSite=Strict). Wrong tokens are slowed down.
- The container runs as your user, with a read-only filesystem, no extra Linux capabilities and no privilege escalation.
- Changing `DMFORGE_TOKEN` signs every device out. Only wrong tokens typed in count against the sign-in limit, and the right token always gets in, so nobody can lock you out.
- **The automatic updater runs whatever is on the `dmforge-release` branch.** Whoever can push to it can run code on this machine, which holds your whole campaign. Protect the GitHub account
  that owns the repository (a passkey or two-factor sign-in) and turn on branch protection for `dmforge-release` (no force pushes, no deletion).
- The default address in `docker-compose.yml` and in these notes is your tailnet name. If the repository is public, that name is public too (it is not a secret that lets anyone in, but
  it says which tailnet this is); put your own value in `.env` and keep `docker-compose.override.yml` out of the repository.
- A stalled connection is dropped after 30 seconds, and a request with no valid token is turned away without its body being read.
- Set the mini PC's BIOS option "Restore on AC power loss" (or "Power on after power failure") to on, so a power cut does not leave it off until you press the button.

## Trouble

- **The page asks for the token again and again:** the address changed (http vs https, or a different name). Use the one `tailscale serve status` shows.
- **"Forbidden" right after step 4:** `DMFORGE_HOSTS` does not match the name you opened. Fix it in `.env`, then `docker compose up -d`.
- **`permission denied` on `data/`:** the folders were made by root. `sudo chown -R "$(id -u):$(id -g)" data export`.
- **"Server needs a look" in the top bar:** open Settings, Server. It names the problem: a failed backup, low disk space, an update that did not install, or no look for updates in a while (check `crontab -l`).
- **The container restarts:** `docker compose logs dmforge` says why (usually a missing `DMFORGE_TOKEN`).
