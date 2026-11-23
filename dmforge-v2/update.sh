#!/usr/bin/env bash
# DM Forge: install a new release when there is one. Safe to run at any time, as often as you like.
#
#   ./update.sh            check now, and install if a newer version has been published
#   ./update.sh --status   show the version running and the last few log lines
#
# What it does when it finds a new version:
#   1. copies the database aside (data/backups/)
#   2. downloads the new files and builds the new image while the old one keeps running
#   3. swaps the container (a few seconds), then waits for it to report healthy
#   4. if the build fails or the new version does not come up healthy, it puts the old version back
#      and remembers the bad release so it does not try it again every minute (a newer one is tried)
# Your .env, data/ and export/ are never touched. Everything is logged to update.log, and the outcome is written to data/update-status.json
# so the app's Settings, Server page can show it. To stop updates for a while (before a session), use that page's "Hold updates", or
#   echo $(( $(date +%s) + 8*3600 )) > data/.hold-updates        (it ends by itself at that time; delete the file to end it sooner)
#
# Nothing here opens a port: it only asks GitHub "has the release branch moved?" with one small request.
# The branch it follows is dmforge-release (set DMFORGE_BRANCH to follow another).

main() {
  cd "$(dirname "$(readlink -f "$0")")" || exit 1
  BRANCH="${DMFORGE_BRANCH:-dmforge-release}"
  LOG="update.log"
  BAD=".update.bad"
  log() { printf '%s %s\n' "$(date '+%F %T')" "$*" >> "$LOG"; [ -t 1 ] && printf '%s\n' "$*"; return 0; }
  # what the app's Server page shows about updates: state (building, ok, failed, rolled-back), the version, when, and a short reason
  note() {
    [ -d data ] || return 0
    printf '{"state":"%s","version":"%s","at":%s000,"message":"%s"}\n' "$1" "$2" "$(date +%s)" "$(printf '%s' "${3:-}" | tr -d '"\\\n' | cut -c1-200)" > data/.update-status.part \
      && mv -f data/.update-status.part data/update-status.json
    return 0
  }

  if [ "${1:-}" = "--status" ]; then
    files="$(cat VERSION 2>/dev/null || echo unknown)"
    echo "Files on disk: $files ($(git rev-parse --short HEAD 2>/dev/null || echo no-git))"
    inside="$(docker compose exec -T dmforge cat /app/VERSION 2>/dev/null | tr -d '\r\n')"
    if [ -n "$inside" ]; then
      echo "Running in the container: $inside"
      [ "$inside" = "$files" ] || echo "  (the container is on an older build than the files; the next release or 'docker compose up -d --build' brings it up to date)"
    fi
    hold="$(cat data/.hold-updates 2>/dev/null || true)"
    if [ -n "$hold" ] && [ "$hold" -gt "$(date +%s)" ] 2>/dev/null; then echo "Updates are ON HOLD until $(date -d "@$hold" '+%F %T' 2>/dev/null || echo "$hold") (delete data/.hold-updates to end that now)."; fi
    docker compose ps 2>/dev/null | tail -n +1
    echo "--- last log lines"; tail -n 12 "$LOG" 2>/dev/null
    return 0
  fi

  # one update at a time (cron starts this every minute; a build can take longer than that)
  exec 9> .update.lock
  flock -n 9 || return 0

  [ -d .git ] || { log "This folder is not a git checkout, so it cannot update itself (see deploy/DEPLOY-V3.md)."; return 1; }

  # one small request: where is the release branch now?
  remote="$(git ls-remote origin "refs/heads/$BRANCH" 2>/dev/null | cut -f1)"
  [ -n "$remote" ] || return 0                       # GitHub unreachable right now: try again next minute, quietly
  [ -d data ] && : > data/.update-checked 2>/dev/null   # "I looked just now": the Server page shows this, so a stopped cron job is noticed
  current="$(git rev-parse HEAD 2>/dev/null)"
  [ "$remote" = "$current" ] && return 0
  hold="$(cat data/.hold-updates 2>/dev/null || true)"
  if [ -n "$hold" ] && [ "$hold" -gt "$(date +%s)" ] 2>/dev/null; then return 0; fi     # held (before a session): look again next minute, quietly
  [ "$remote" = "$(cat "$BAD" 2>/dev/null)" ] && return 0     # this one failed before; wait for a newer release

  old_version="$(cat VERSION 2>/dev/null || echo unknown)"
  log "New release found (${remote:0:7}, you have ${current:0:7}). Updating from $old_version."

  # 1. a copy of the database first, made with SQLite's own backup (safe while the app is running, needs no web address or token)
  if docker compose ps --status running --services 2>/dev/null | grep -qx dmforge; then
    stamp="$(date +%Y%m%d-%H%M%S)"
    if ! docker compose exec -T dmforge python -I -c "import sys,os;sys.path.insert(0,'/app');import dmforge_db as D;D.Store(os.path.join(os.environ.get('DMFORGE_DATA','/data'),'dmforge.db')).backup_to(os.path.join(os.environ.get('DMFORGE_DATA','/data'),'backups','pre-update-$stamp.db'))" >> "$LOG" 2>&1; then
      log "Could not take a database copy, so NOT updating. (Is the app healthy? Try ./update.sh again in a minute; the reason is just above in update.log.)"
      return 1
    fi
    # compress it (a database of notes shrinks a lot) and keep the last 10 of these (the nightly copies are looked after by the server itself)
    gzip -f "data/backups/pre-update-$stamp.db" 2>>"$LOG" || true
    ls -1t data/backups/pre-update-*.db data/backups/pre-update-*.db.gz 2>/dev/null | tail -n +11 | xargs -r rm -f
  fi

  # 2. fetch and build; the running container is untouched until this works
  if ! git fetch --quiet --depth 1 origin "$BRANCH" 2>>"$LOG"; then log "Could not download the release. Nothing changed."; return 1; fi
  new="$(git rev-parse FETCH_HEAD)"
  docker image inspect dmforge:v3 >/dev/null 2>&1 && docker tag dmforge:v3 dmforge:previous
  git reset --hard --quiet "$new"
  new_version="$(cat VERSION 2>/dev/null || echo unknown)"
  note building "$new_version"
  if ! docker compose build >> "$LOG" 2>&1; then
    git reset --hard --quiet "$current"
    echo "$new" > "$BAD"
    note failed "$new_version" "it did not build; staying on $old_version"
    log "The new version ($new_version) did not build. Staying on $old_version. Details above in update.log."
    return 1
  fi

  # 3. swap, and wait for healthy
  docker compose up -d --no-build >> "$LOG" 2>&1
  if wait_healthy; then
    rm -f "$BAD"
    note ok "$new_version"
    log "Updated to $new_version (${new:0:7}). Healthy."
    return 0
  fi

  # 4. put the old one back
  log "The new version ($new_version) did not come up healthy. Putting $old_version back."
  git reset --hard --quiet "$current"
  echo "$new" > "$BAD"
  note rolled-back "$new_version" "it did not come up healthy; went back to $old_version"
  if docker image inspect dmforge:previous >/dev/null 2>&1; then
    docker tag dmforge:previous dmforge:v3
    docker compose up -d --no-build >> "$LOG" 2>&1
    if wait_healthy; then log "Back on $old_version. Healthy."; else log "WARNING: the old version is not healthy either. See: docker compose logs dmforge"; fi
  else
    log "WARNING: there was no earlier image to go back to. See: docker compose logs dmforge"
  fi
  return 1
}

# healthy within about two minutes? (the container's own health check decides)
wait_healthy() {
  local i status
  for i in $(seq 1 "${DMFORGE_HEALTH_TRIES:-60}"); do
    status="$(docker inspect -f '{{.State.Health.Status}}' dmforge 2>/dev/null)"
    [ "$status" = "healthy" ] && return 0
    [ "$status" = "unhealthy" ] && return 1
    sleep "${DMFORGE_HEALTH_WAIT:-2}"
  done
  return 1
}

# the whole script is read before it runs, so replacing this file with a newer one mid-update is safe
main "$@"; exit $?
