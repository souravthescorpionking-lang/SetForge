#!/usr/bin/env bash
# Dev-server keeper (cron-run every minute): starts the dev server if down.
cd /home/z/my-project || exit 1
if curl -sf -m 4 -o /dev/null http://localhost:3000/api/health; then
  exit 0
fi
echo "$(date -u +%FT%TZ) keeper: server down — starting" >> watchdog.log
pkill -f "next dev" 2>/dev/null
pkill -f "next-server" 2>/dev/null
sleep 2
setsid env NODE_OPTIONS="--max-old-space-size=1024" nohup bun run dev >> dev.log 2>&1 < /dev/null &
exit 0
