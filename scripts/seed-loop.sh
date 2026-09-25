#!/bin/bash
# Resilient seed runner: the sandbox dev server (Turbopack) gets OOM-killed
# under rapid route compilation. The seed script is idempotent (skips days
# that already have data), so we loop: seed → restart server → resume.
# Usage: bash scripts/seed-loop.sh scripts/reset-demo-data.ts
set -u
cd /home/z/my-project

restart_server() {
  pkill -f 'next-server' 2>/dev/null
  pkill -f 'next dev' 2>/dev/null
  sleep 2
  NODE_OPTIONS="--max-old-space-size=1400" setsid nohup bun run dev >> dev.log 2>&1 < /dev/null &
  disown
  sleep 12
}

for i in $(seq 1 10); do
  echo "=== attempt $i ==="
  OUT=$(bun "$1" 2>&1)
  CODE=$?
  echo "$OUT" | tail -5
  if [ $CODE -eq 0 ]; then
    echo "SEED EXITED CLEANLY"
    break
  fi
  echo "--- restarting server (attempt $i failed, code $CODE) ---"
  restart_server
done
