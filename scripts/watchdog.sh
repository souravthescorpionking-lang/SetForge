#!/bin/bash
# Dev-server watchdog for the SetForge sandbox — v3 (age-aware, OOM-tuned).
#
# MEASURED FACTS that shaped this version:
# • The initial compile of the app spikes next-server RSS to 1.7–2.3GB for
#   ~30–60s. Killing during that window = boot loop (v2 bug).
# • The kernel OOM killer executed next-server at ~1.8–2.25GB RSS when the
#   system was tight (accumulated test browsers ate ~2GB).
# • Steady-state RSS after compile ≈ 1.2–2.0GB.
#
# Policy:
# • Server process dead (any cause: OOM, crash, reaper) → restart, wait for
#   /api/health (max 30s).
# • RSS guard ONLY for servers older than 240s (past the compile window) and
#   only above 2560MB — i.e. a true leak, far above the compile peak but
#   below the point where the kernel would kill us with browsers running.
# • Keep agent-browser sessions closed when not testing (frees ~1–2GB).
cd /home/z/my-project
RSS_LIMIT_KB=$((2560 * 1024))
MIN_AGE_S=240 # seconds — skip the RSS guard while a fresh server compiles

rss_and_age() {
  # prints "rss_kb age_s" for the next-server process (empty if absent)
  ps -eo rss,etimes,cmd | awk '/next-server \(v/ && !/awk/ {print $1, $2; exit}'
}

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
  else
    # leak guard: only old servers past the compile window, only true leaks
    read -r rss age <<< "$(rss_and_age)"
    if [ -n "$rss" ] && [ -n "$age" ] && [ "$age" -gt "$MIN_AGE_S" ] && [ "$rss" -gt "$RSS_LIMIT_KB" ]; then
      echo "[$(date +%H:%M:%S)] next-server age=${age}s RSS ${rss}KB > ${RSS_LIMIT_KB}KB — graceful restart" >> /tmp/watchdog.log
      pkill -TERM -f "next dev -p 3000" 2>/dev/null
      pkill -TERM -f "next-server" 2>/dev/null
      sleep 5
      pkill -KILL -f "next-server" 2>/dev/null
      sleep 2
    fi
  fi
  sleep 4
done
