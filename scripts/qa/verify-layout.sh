#!/usr/bin/env bash
# SetForge — Part 3 layout verification harness (QA tooling; adapts the spec's
# Playwright harness to this platform's agent-browser CLI + single-page hash routing).
#
# Usage: bash scripts/qa/verify-layout.sh '#/today' [widths...]
#   default widths: 320 360 390 768 1024 1440
#
# Gates per width (spec §VERIFICATION HARNESS 1-3):
#   overlap    — no two visible leaf elements intersect (fixed/sticky/absolute
#                subtrees excluded by design: toasts, badges, popovers, sticky headers)
#   rightEdge  — no visible element's right edge exceeds viewport width
#   hscroll    — document.scrollingElement has no horizontal scroll
#   nowrapFail — every [data-row] has scrollHeight <= clientHeight (single line)
#   wsFail     — every [data-row] computed white-space === nowrap
#   badHeights — every [data-row] height ∈ {40,48,56,72}
# Checks run at scroll-top AND scroll-bottom of the [data-scroll-body] container.
set -uo pipefail

ROUTE="${1:?usage: verify-layout.sh '#/today' [widths...]}"
shift || true
if [ "$#" -gt 0 ]; then WIDTHS=("$@"); else WIDTHS=(320 360 390 768 1024 1440); fi

case "$ROUTE" in
  '#/'*) URL="http://localhost:3000/$ROUTE" ;;
  '/'*)  URL="http://localhost:3000/#$ROUTE" ;;
  *)     URL="http://localhost:3000/#/$ROUTE" ;;
esac

CHECK_JS='(() => {
  const vw = document.documentElement.clientWidth;
  const raw = [];
  for (const el of document.querySelectorAll("body *")) {
    const cs = getComputedStyle(el);
    if (cs.display === "none" || cs.visibility === "hidden" || +cs.opacity === 0) continue;
    const svgAncestor = el.closest("svg");
    if (svgAncestor && svgAncestor !== el) continue;
    let p = el, skip = false;
    while (p && p !== document.body) {
      const pcs = getComputedStyle(p);
      if (pcs.position === "fixed" || pcs.position === "sticky" || pcs.position === "absolute") { skip = true; break; }
      p = p.parentElement;
    }
    if (skip) continue;
    const r = el.getBoundingClientRect();
    if (r.width < 1 || r.height < 1) continue;
    raw.push({ el, r });
  }
  // v2 — clip-aware overlap: an element scrolled/clipped out of an overflow
  // ancestor (e.g. rows above/below the ScrollBody viewport) is NOT visually
  // present, so its bounding rect must not count as overlapping the bar bands.
  // Effective rect = bounding rect intersected with every overflow ancestor.
  // rightEdge keeps using RAW rects, so hidden horizontal overflow still fails.
  const eff = (el) => {
    let r = el.getBoundingClientRect();
    let p = el.parentElement;
    while (p && p !== document.body) {
      const pcs = getComputedStyle(p);
      const ov = pcs.overflow + " " + pcs.overflowX + " " + pcs.overflowY;
      if (/(auto|scroll|hidden|clip)(\s|$)/.test(ov)) {
        const pr = p.getBoundingClientRect();
        const left = Math.max(r.left, pr.left), top = Math.max(r.top, pr.top);
        const right = Math.min(r.right, pr.right), bottom = Math.min(r.bottom, pr.bottom);
        r = { left, top, right, bottom };
      }
      p = p.parentElement;
    }
    return r;
  };
  const vis = [];
  for (const item of raw) {
    const r = eff(item.el);
    if (r.right - r.left >= 1 && r.bottom - r.top >= 1) vis.push({ el: item.el, r });
  }
  let rightEdge = 0;
  for (const item of raw) if (item.r.right > vw + 1) rightEdge++;
  const visSet = new Set(vis.map(v => v.el));
  const leaves = vis.filter(v => !Array.from(v.el.children).some(c => visSet.has(c)));
  let overlap = 0; const samples = [];
  for (let i = 0; i < leaves.length; i++) for (let j = i + 1; j < leaves.length; j++) {
    const a = leaves[i], b = leaves[j];
    if (a.el.contains(b.el) || b.el.contains(a.el)) continue;
    const ix = Math.min(a.r.right, b.r.right) - Math.max(a.r.left, b.r.left);
    const iy = Math.min(a.r.bottom, b.r.bottom) - Math.max(a.r.top, b.r.top);
    if (ix > 1 && iy > 1) {
      overlap++;
      if (samples.length < 3) samples.push((a.el.tagName.toLowerCase() + "." + String(a.el.className || "").split(" ")[0]) + "~" + b.el.tagName.toLowerCase() + "." + String(b.el.className || "").split(" ")[0]);
    }
  }
  const sc = document.scrollingElement || document.documentElement;
  const hscroll = sc.scrollWidth > vw + 1;
  const rows = Array.from(document.querySelectorAll("[data-row]"));
  const nowrapFail = rows.filter(r => r.scrollHeight > r.clientHeight + 1).length;
  const wsFail = rows.filter(r => getComputedStyle(r).whiteSpace !== "nowrap").length;
  const okH = [40, 48, 56, 72];
  const hBad = [];
  for (const r of rows) { const h = Math.round(r.getBoundingClientRect().height); if (!okH.includes(h)) hBad.push(h); }
  const scrollBodies = document.querySelectorAll("[data-scroll-body]").length;
  return JSON.stringify({ vw, checked: leaves.length, overlap, rightEdge, hscroll, rows: rows.length, nowrapFail, wsFail, badHeights: Array.from(new Set(hBad)), samples, scrollBodies });
})()'

TOP_JS="(() => { const sb = document.querySelector('[data-scroll-body]'); if (sb) sb.scrollTop = 0; return 0; })()"
BTM_JS="(() => { const sb = document.querySelector('[data-scroll-body]'); if (sb) sb.scrollTop = sb.scrollHeight; return 0; })()"

TOTAL_FAIL=0
for W in "${WIDTHS[@]}"; do
  case "$W" in
    320|360|390) H=844 ;;
    768)         H=1024 ;;
    *)           H=900 ;;
  esac
  agent-browser set viewport "$W" "$H" >/dev/null 2>&1 || true
  agent-browser open "$URL" >/dev/null 2>&1
  agent-browser wait 1200 >/dev/null 2>&1 || sleep 1.2
  agent-browser press Escape >/dev/null 2>&1 || true
  agent-browser eval "$TOP_JS" >/dev/null 2>&1 || true

  OUT1=$(agent-browser eval "$CHECK_JS" 2>&1 | sed 's/\\"/"/g')
  agent-browser eval "$BTM_JS" >/dev/null 2>&1 || true
  agent-browser wait 300 >/dev/null 2>&1 || true
  OUT2=$(agent-browser eval "$CHECK_JS" 2>&1 | sed 's/\\"/"/g')

  VERDICT="PASS"
  for OUT in "$OUT1" "$OUT2"; do
    if ! echo "$OUT" | grep -q '"checked":'; then
      VERDICT="FAIL(no-result)"; TOTAL_FAIL=1; continue
    fi
    if echo "$OUT" | grep -q '"overlap":[1-9]' \
      || echo "$OUT" | grep -q '"rightEdge":[1-9]' \
      || echo "$OUT" | grep -q '"hscroll":true' \
      || echo "$OUT" | grep -q '"nowrapFail":[1-9]' \
      || echo "$OUT" | grep -q '"wsFail":[1-9]' \
      || echo "$OUT" | grep -qE '"badHeights":\[[0-9]'; then
      VERDICT="FAIL"; TOTAL_FAIL=1
    fi
  done
  echo "[${W}x${H}] ${VERDICT}"
  echo "  top: ${OUT1}"
  echo "  btm: ${OUT2}"
done

if [ "$TOTAL_FAIL" -eq 0 ]; then echo "GATE: PASS"; exit 0; else echo "GATE: FAIL"; exit 1; fi
