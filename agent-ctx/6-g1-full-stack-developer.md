# Task 6-g1 — Body progress photos (§4.14): Track-tab photo slots + Compare screen

Task: Part 6 §4.14 on SetForge — (A) photo slots (FRONT/BACK/LEFT/RIGHT) on the
`#/body?tab=track` inline record editor, (B) the full `#/body/compare`
side-by-side body-compare screen, plus the `#/body` ⋮ menu entry point.
Client-side only; all endpoints (media upload, photo attach upsert, photos list,
photo delete) were already live and verified by 6-0.

## Files changed (all inside src/features/body/ — my owned folder)

| File | Change |
|---|---|
| `photo-keys.ts` | NEW — `photosKeys` (`["photos"]` all / `["photos", recordId]` per-record) + `invalidatePhotos(qc)` helper. Kept inside the feature folder (src/lib/** is off-limits); prefix invalidation refreshes both key shapes at once. |
| `photo-slots.tsx` | NEW — `PhotoSlots` section (4 fixed 72px slot squares), `PHOTO_SLOTS` const, `SLOT_LABELS`, `PhotoSlot` type. One hidden `<input type=file accept=image/jpeg,image/png,image/webp capture=environment>` PER SLOT (slot-bound onChange, `data-photo-slot` attr). Upload → `mediaApi.upload` → `photosApi.attach` (upsert per slot) → hapticSuccess + toast "Photo saved" + `invalidatePhotos`. Per-slot Loader2 spinner. × remove → `photosApi.remove` + toast + invalidate. `MEDIA_DISABLED` (403) → toast "Photo uploads are disabled on this server", UI stays visible. MIME guard on the picked file. |
| `body-track-tab.tsx` | TrackEditor restructured: `h-24` fixed → auto height (two h-10 rows + PhotoSlots); rows `flex-1/min-h-0` → `h-10 flex-none`. Added records query (`qk.measurementRecords(m.id)`) binding the editor's date input to a MeasurementRecord via `localDayKey` (app convention). Comment updates. |
| `body-compare-screen.tsx` | Stub (17 lines) → full screen (~340 lines). Screen/TopBar/ScrollBody primitives, no Dialogs. |
| `body-screen.tsx` | ⋮ DropdownMenu + "Compare photos" (Camera icon) → `replaceHash("#/body/compare")` between "Add measurement" and "Configure metrics". |

## Design decisions

1. **Photos attach to records, the editor binds date → record.** The Track
   editor is a NEW-entry editor (value + date + Save); photos need a recordId.
   Binding = records query, `records.find(r => localDayKey(r.recordedAt) === date)`.
   When NO record exists on the chosen date, tapping a slot auto-creates the
   entry with the editor's current value (identical semantics to "Save entry")
   then uploads — weigh-in + photo is one flow. A `createdIdRef` (cleared on
   date change) prevents double-creating while the records query catches up.
   Verified: exactly ONE record on 2026-09-27 after the flow.
2. **Undo on delete intentionally omitted** (spec allowed either): the server's
   `deletePhoto` also deletes the underlying media objects (mediaKey + thumb),
   so a re-attach Undo would point at deleted media. Immediate delete + toast
   "Photo removed" instead.
3. **Per-slot file inputs** instead of one shared input + pendingSlot ref:
   deterministic, no pending-state race, and the `data-photo-slot` attr makes
   the flow automatable (`agent-browser upload "input[data-photo-slot=FRONT]" file`).
4. **Compare screen state is derived, not effect-initialized**: default slot =
   FRONT (else first slot with photos), A = oldest date, B = newest — computed
   from query data with user picks sticky while still valid. Auto-swap on
   A === B (picking one side's date onto the other swaps them). Single-date
   accounts render a B placeholder "Pick a different date to compare".
5. **Date list is slot-independent** (all distinct photo record dates, desc) —
   a picked date without a photo in the current slot renders the dashed
   placeholder panel with the slot name (per spec).
6. **"All" slot mode**: each panel shows the newest photo (createdAt desc) for
   its date regardless of slot; the panel caption shows that photo's own slot.
7. **Weight nicety implemented**: `useMeasurements()` → find "Body Weight" →
   `measurementsApi.records` (enabled only when found) → both dates' values +
   `signedDelta` on the delta line ("3 days apart · 80.9 kg → 80.9 kg ±0").
8. **72px squares use `flex flex-wrap`** — 4×72+3×8 = 312px fits the 358px
   content column at 390px (and wraps gracefully below ~340px, no h-scroll).
9. Editor photo section is a `rounded-lg border bg-muted/20 p-2` sub-block —
   same visual language as MetricsSetup.

## QA evidence (agent-browser, session `p6g-qa`, demo@setforge.app)

All flows verified IN-BROWSER through my UI (no curl fallback was needed for
the data path — `agent-browser upload` drove the real `<input type=file>`):

- **Track editor (390×844)**: expand "Body Weight" → editor shows 4 slots
  (dashed Camera placeholders) + hint "No Body Weight entry on this date yet…"
  (today had no record) → upload `/tmp/p6g-front.jpg` via
  `input[data-photo-slot=FRONT]` → toast "Photo saved" → slot becomes
  "Replace Front photo" + × → row header flips to "19h ago 80.9kg ±0"
  (auto-created record, DB: exactly 1 record on 2026-09-27, value 80.9).
- **Replace (upsert)**: re-upload FRONT with a nicer labeled image → photo row
  replaced (new mediaKey), no second FRONT row for the record.
- **Second date binding**: set editor date → 2026-09-24 (existing record) via
  native setter + input/change events (agent-browser `fill` doesn't fire React
  onChange on date inputs) → slots all "Add …" (Sep-24 record had no photos) →
  upload FRONT-old → "Photo saved" → attached to the Sep-24 record.
- **BACK slot**: uploaded on Sep 27; remove via × → toast "Photo removed" +
  slot flips to "Add Back photo" → re-added through the same UI.
- **Compare screen 390**: slot chips All|Front|Back|Left|Right (aria-pressed,
  Front default), A = Sep 24 / B = Sep 27 (oldest/newest defaults), both panels
  render loaded 800×600 images (173×130 object-contain), captions
  "A · Sep 24 2026 · FRONT" / "B · Sep 27 2026 · FRONT", delta line
  "3 days apart · 80.9 kg → 80.9 kg ±0". Back chip → A placeholder
  "No Back photo / Sep 24 2026", B image. All chip → per-panel real slots.
  A/B auto-swap verified both directions (pick B=A's date → A becomes old B,
  and vice versa).
- **Compare 1024×900**: panels 298×224 (larger at lg), no horizontal scroll.
- **Menu entry**: `#/body` ⋮ → "Compare photos" → navigates to #/body/compare
  (screenshot p6g-menu-nav-1024.png).
- **Empty state**: throwaway account p6g-empty@test.dev (signup → skip
  onboarding) → #/body/compare shows CameraOff icon + "Nothing to compare yet"
  + "No progress photos yet — add them from Body → Track" + "Go to Track" →
  navigates to #/body?tab=track. Account deleted afterwards (dev.log confirms).
- **Layout gates**: 390px — `document.scrollingElement.scrollWidth <=
  innerWidth` true on track + compare; photo section right edge 367px; slots
  72px (img box 70px incl. border); 1024px — no h-scroll, editor + compare fit.
- **Console**: zero errors/warnings (only React DevTools info + HMR logs).
- **Screenshots**: download/p6g-{compare-390, compare-1024, compare-empty-390,
  track-editor-390, track-editor-1024, track-editor-after-remove-readd-390,
  menu-nav-1024}.png
- **Gates**: `bun run lint` exit 0; `bunx tsc --noEmit` — ZERO errors in
  src/features/body/** (remaining errors are the documented baseline:
  examples/, scripts/, scripts-tmp/ (other agents' QA leftovers), skills/,
  timer-presets route). dev.log: zero 500s during the whole session.

## Deviations / notes

- **Dev-tools overlay**: the "Open Next.js Dev Tools" pill reappeared in the
  fresh browser session (next.config.ts is on the never-touch list, so I
  removed the `nextjs-portal` element per-page during QA instead). It does not
  block any interaction.
- **Kept demo data (intentional richness per task)**: 3 labeled gradient demo
  photos on Body Weight — FRONT 2026-09-24, FRONT + BACK 2026-09-27 — plus the
  80.9 kg record on 2026-09-27 that carries them (identical value to Sep 24,
  so no trend distortion). The initial plain orange test square was REPLACED
  with a labeled card via the replace flow; one orphaned media file remains in
  the store (attach-upsert doesn't delete replaced media — server behavior).
- **agent-browser `fill` on `<input type=date>`** does not fire React onChange;
  used the native-value-setter + input/change event pattern instead (QA-side
  workaround, no app change needed).
- One transient browser daemon restart mid-QA (memory pressure during Turbopack
  compaction) logged my session out; re-logged-in and re-verified the affected
  state (both slots render post-restart, compare re-screenshotted).
- A `PUT /api/profile 400` in dev.log came from the throwaway account's
  onboarding screen (not my code — my files never call profileApi).

## Notes for later agents

- `photosKeys` / `invalidatePhotos` live in `src/features/body/photo-keys.ts`;
  anything that mutates photos should call `invalidatePhotos(qc)` to refresh
  both the compare list and per-record queries.
- `PHOTO_SLOTS` / `SLOT_LABELS` / `PhotoSlot` are exported from
  `src/features/body/photo-slots.tsx` — reuse rather than redefining.
- Home/insights "latest physique photo" widgets (if ever specced) can consume
  `photosApi.list()` + `mediaApi.url(thumbKey ?? mediaKey)`.
