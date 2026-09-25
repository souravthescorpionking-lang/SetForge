#!/usr/bin/env bash
# SetForge dev-server watchdog.
# The 4GB sandbox OOM-kills the Next dev server once its heap grows (~2GB RSS).
# This loop polls /api/health every 15s; after 2 consecutive failures it
# restarts `bun run dev` with a capped V8 heap (1GB) so the kernel never has
# to intervene. All actions are logged to watchdog.log.
cd /home/z/my-project || exit 1
LOG=watchdog.log
FAILS=0
echo "$(date -u +%FT%TZ) watchdog started (pid $$)" >> "$LOG"
while true; do
  if curl -sf -m 4 -o /dev/null http://localhost:3000/api/health; then
    FAILS=0
  else
    FAILS=$((FAILS+1))
    echo "$(date -u +%FT%TZ) health fail #$FAILS" >> "$LOG"
    if [ "$FAILS" -ge 2 ]; then
      echo "$(date -u +%FT%TZ) restarting dev server (heap cap 1024m)" >> "$LOG"
      pkill -f 'next dev' 2>/dev/null
      pkill -f 'next-server' 2>/dev/null
      sleep 3
      setsid env NODE_OPTIONS="--max-old-space-size=1024" nohup bun run dev >> dev.log 2>&1 < /dev/null &
      FAILS=0
      sleep 45
    fi
  fi
  date -u +%FT%TZ > .watchdog-heartbeat
  sleep 15
done
