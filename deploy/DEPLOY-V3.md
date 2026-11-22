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

## Backups

Every night at `DMFORGE_BACKUP_HOUR` (default 3am) the server:

- copies the database to `data/backups/dmforge-<date>.db` (the newest `DMFORGE_BACKUP_KEEP`, default 14, are kept), and
- refreshes `export/` with every note as an ordinary `.md` file. A note you deleted is moved to `export/.removed/<date>/`, never erased.
  You can open `export/` in Obsidian (read-only is safest).

Please also copy `data/` somewhere that is not this machine now and then (a USB drive, another computer). One folder is the whole campaign.

**Restore from a nightly copy:**

```
docker compose down
rm -f data/dmforge.db data/dmforge.db-wal data/dmforge.db-shm
cp data/backups/dmforge-YYYYMMDD-HHMMSS.db data/dmforge.db
docker compose up -d
```

You can also take a copy right now, with no downtime (it lands in `data/backups`):

```
docker compose exec dmforge python -c "import os,urllib.request as u;print(u.urlopen(u.Request('http://127.0.0.1:8765/api/backup',method='POST',headers={'X-DMF-Token':os.environ['DMFORGE_TOKEN']})).read())"
```

## Updating

```
git pull          # or copy in the new files
docker compose up -d --build
```

Open DM Forge pages show a "Reload to use it" bar when the server is running a newer version. Unpushed changes are kept.

## Working with no connection

- Everything you open is saved on the device. Opening DM Forge with no server (a train, bad signal at a table) works as long as that
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
- Changing `DMFORGE_TOKEN` signs every device out.

## Trouble

- **The page asks for the token again and again:** the address changed (http vs https, or a different name). Use the one `tailscale serve status` shows.
- **"Forbidden" right after step 4:** `DMFORGE_HOSTS` does not match the name you opened. Fix it in `.env`, then `docker compose up -d`.
- **`permission denied` on `data/`:** the folders were made by root. `sudo chown -R "$(id -u):$(id -g)" data export`.
- **The container restarts:** `docker compose logs dmforge` says why (usually a missing `DMFORGE_TOKEN`).
