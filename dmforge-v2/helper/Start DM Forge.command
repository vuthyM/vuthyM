#!/bin/bash
# Double-click to start the DM Forge helper (works in any browser, including Brave).
cd "$(dirname "$0")"
clear
echo "DM Forge helper"
echo "---------------"
if ! command -v python3 >/dev/null 2>&1; then
  echo "Python 3 is required. macOS will offer to install it; run this again afterwards."
  read -n 1 -s -r -p "Press any key to close."
  exit 1
fi
python3 dmforge-server.py "$@"
echo
read -n 1 -s -r -p "The helper has stopped. Press any key to close."
