#!/usr/bin/env bash
# Publishes the committed app as a release: the server (update.sh) follows the dmforge-release branch and installs
# whatever is pushed to it within a minute. Run this after the tests pass and the work is committed.
#
#   tools/release.sh
#
# dmforge-release holds only the dmforge-v2 folder (the app itself) as the root, so the server downloads just that.
set -euo pipefail
cd "$(git rev-parse --show-toplevel)"
if [ -n "$(git status --porcelain dmforge-v2)" ]; then echo "There are uncommitted changes in dmforge-v2. Commit them first."; exit 1; fi
version="$(tr -d '\n' < dmforge-v2/VERSION)"
git branch -D dmforge-release-tmp >/dev/null 2>&1 || true
git subtree split --prefix=dmforge-v2 -b dmforge-release-tmp >/dev/null
trap 'git branch -D dmforge-release-tmp >/dev/null 2>&1 || true' EXIT
git push origin dmforge-release-tmp:refs/heads/dmforge-release
echo "Released $version to dmforge-release. The server installs it within about a minute."
