#!/bin/bash
# Double-click this to run Recipe Whisperer on this Mac.
cd "$(dirname "$0")" || exit 1

PORT=4173
IP="$(ipconfig getifaddr en0 2>/dev/null || ipconfig getifaddr en1 2>/dev/null)"

clear
echo ""
echo "  RECIPE WHISPERER"
echo "  ----------------"
echo ""
echo "  Cook from what you have. Pick a cuisine, add ingredients,"
echo "  and find recipes that are worth making."
echo ""
echo "  On this Mac:   http://localhost:$PORT"
if [ -n "$IP" ]; then
  echo "  On your phone: http://$IP:$PORT"
  echo "                 (same Wi-Fi; open that address in Safari or Chrome)"
else
  echo "  Phone: connect this Mac and your phone to the same Wi-Fi, then rerun."
fi
echo ""
echo "  Press Ctrl+C here when you're done."
echo ""

open "http://localhost:$PORT" 2>/dev/null
exec python3 -m http.server "$PORT" --bind 0.0.0.0
