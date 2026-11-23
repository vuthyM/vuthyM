#!/usr/bin/env bash
# Run this on your Mac (or any other computer on your tailnet): it downloads a fresh copy of the campaign from the DM Forge server, so the
# only copy is never the one on the server. Safe to run as often as you like.
#
#   tools/pull-backup.sh https://water.tail029b78.ts.net  [folder]
#
# It saves, into the folder (default ~/Documents/DM-Forge-backups):
#   DM-Forge-notes-<date>.zip       every note and picture as ordinary files (open it in Obsidian, or copy it back in)
#   DM-Forge-database-<date>.db.gz  the database itself, with every earlier version of every note
# and keeps the newest KEEP of each (default 14). Your access token is read from the DMFORGE_TOKEN variable, or from the file ~/.dmforge-token
# (keep that file private: chmod 600 ~/.dmforge-token). Nothing is deleted from the server.
set -u
url="${1:-}"; dest="${2:-$HOME/Documents/DM-Forge-backups}"; keep="${KEEP:-14}"
[ -n "$url" ] || { echo "Usage: $0 https://<your-server>.ts.net [folder]"; exit 2; }
url="${url%/}"
token="${DMFORGE_TOKEN:-}"
[ -n "$token" ] || token="$(tr -d '[:space:]' < "$HOME/.dmforge-token" 2>/dev/null || true)"
[ -n "$token" ] || { echo "No access token: set DMFORGE_TOKEN, or put it in ~/.dmforge-token"; exit 2; }
mkdir -p "$dest" || exit 1
stamp="$(date +%Y-%m-%d-%H%M)"
status=0
for kind in zip db; do
  case "$kind" in zip) name="DM-Forge-notes-$stamp.zip";; db) name="DM-Forge-database-$stamp.db.gz";; esac
  tmp="$dest/.$name.part"
  # the token goes in a header read from stdin, so it never shows up in the process list
  if printf 'header = "X-DMF-Token: %s"\n' "$token" | curl -fsS --max-time 900 -K - -o "$tmp" "$url/api/backup-download?kind=$kind"; then
    if [ -s "$tmp" ]; then mv -f "$tmp" "$dest/$name"; echo "saved $dest/$name ($(wc -c < "$dest/$name" | tr -d ' ') bytes)"; else rm -f "$tmp"; echo "the server sent an empty $kind copy"; status=1; fi
  else
    rm -f "$tmp"; echo "could not download the $kind copy from $url"; status=1
  fi
done
# keep the newest $keep of each kind
for pat in 'DM-Forge-notes-*.zip' 'DM-Forge-database-*.db.gz'; do
  ls -1t "$dest"/$pat 2>/dev/null | tail -n +$((keep + 1)) | while IFS= read -r f; do rm -f -- "$f"; done
done
exit $status
