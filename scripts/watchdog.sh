#!/bin/bash
# Dev-server watchdog for the SetForge sandbox: the next-server process is
# killed intermittently (Turbopack recompile memory spikes / sandbox reaper).
# This loop keeps it alive: check every 4s, restart when dead.
cd /home/z/my-project
while true; do
  if ! pgrep -f "next-server" > /dev/null; then
    echo "[$(date +%H:%M:%S)] next-server down — restarting" >> /tmp/watchdog.log
    bun run dev >> dev.log 2>&1 &
    # wait for readiness (max 30s)
    for i in $(seq 1 15); do
      sleep 2
      if curl -s -o /dev/null --max-time 2 http://localhost:3000/api/health; then
        echo "[$(date +%H:%M:%S)] healthy again" >> /tmp/watchdog.log
        break
      fi
    done
  fi
  sleep 4
done
