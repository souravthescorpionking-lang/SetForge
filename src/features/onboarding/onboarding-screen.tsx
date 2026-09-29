"use client";

// ─────────────────────────────────────────────────────────────────────────────
// OnboardingScreen — #/onboarding (Part 6 §4.16). The 6-step welcome wizard.
//
//   TopBar (56)  : "Welcome to SetForge" + [Skip] ghost h-11 (always available)
//   Progress     : 4px primary bar under the TopBar — step N of 6
//   ScrollBody   : one step at a time (subtle slide/fade transition)
//                  1 Welcome · 2 Units · 3 Goal · 4 Level · 5 Schedule+body ·
//                  6 Review (choice summary + "change" jump links)
//   BottomBar    : [Back] ghost + [Get started / Continue / Start training]
//
// Gate: the app-shell redirects here while profile.onboardingCompletedAt is
// null. Completion writes through profileApi.completeOnboarding (profile +
// unitSystem setting + first Body-Weight record), then the ["profile"] cache
// is updated synchronously (setQueryData) BEFORE navigating so the shell gate
// never bounces the user back.
//
// Units: heights/weights are METRIC canonically on the wire. When Imperial is
// selected in step 2 the step-5 inputs are inches/pounds and convert live
// (heightCm = in × 2.54 · weightKg = lb × 0.45359237) with the converted
// metric value shown as a hint under each input.
//
// No Dialogs; step 5 fields are optional (empty = skip) but must be valid
// (age 13–99 · height 100–250 cm / 39–98 in · weight 30–300 kg / 66–660 lb).
// ─────────────────────────────────────────────────────────────────────────────

import { useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Screen, TopBar, ScrollBody, BottomBar } from "@/components/layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Check,
  Dumbbell,
  Flame,
  Heart,
  Loader2,
  Minus,
  Plus,
  SkipForward,
  Sprout,
  TrendingUp,
  Trophy,
  Zap,
} from "lucide-react";
import { toast } from "sonner";
import { profileApi } from "@/lib/client/api";
import { hapticSelection, hapticSuccess, hapticTap } from "@/lib/client/haptics";
import { useApp } from "@/lib/client/store";
import { tourAttrs } from "@/lib/tour/attrs";
import type { TourDecl } from "@/lib/tour/types";
import { PROFILE_GOALS, PROFILE_GOAL_LABELS, PROFILE_LEVELS } from "@/lib/constants";
import type { UserProfileDTO } from "@/lib/types";
import { replaceHash } from "@/features/shell/router";
import { cn } from "@/lib/utils";

// ── constants ────────────────────────────────────────────────────────────────

const TOTAL_STEPS = 6;
const STEP_INDEX = { welcome: 0, units: 1, goal: 2, level: 3, body: 4, review: 5 } as const;

const CM_PER_IN = 2.54;
const KG_PER_LB = 0.45359237;

type UnitSystem = "metric" | "imperial";
type Goal = (typeof PROFILE_GOALS)[number];
type Level = (typeof PROFILE_LEVELS)[number];

const GOAL_ICONS: Record<Goal, typeof Zap> = {
  STRENGTH: Zap,
  MUSCLE: Dumbbell,
  FAT_LOSS: Flame,
  GENERAL: Heart,
};

const LEVEL_META: Array<{ value: Level; label: string; hint: string; icon: typeof Sprout }> = [
  { value: "BEGINNER", label: "Beginner", hint: "New to training", icon: Sprout },
  { value: "INTERMEDIATE", label: "Intermediate", hint: "6 months – 2 years", icon: TrendingUp },
  { value: "ADVANCED", label: "Advanced", hint: "2+ years", icon: Trophy },
];

const LEVEL_LABELS: Record<Level, string> = {
  BEGINNER: "Beginner",
  INTERMEDIATE: "Intermediate",
  ADVANCED: "Advanced",
};

// Validation bands (client-side; the server accepts a slightly wider range).
const AGE_MIN = 13;
const AGE_MAX = 99;
const HEIGHT_CM_MIN = 100;
const HEIGHT_CM_MAX = 250;
const HEIGHT_IN_MIN = 39;
const HEIGHT_IN_MAX = 98;
const WEIGHT_KG_MIN = 30;
const WEIGHT_KG_MAX = 300;
const WEIGHT_LB_MIN = 66;
const WEIGHT_LB_MAX = 660;

const roundTo1 = (n: number): number => Math.round(n * 10) / 10;

// ── screen ───────────────────────────────────────────────────────────────────

export default function OnboardingScreen() {
  const qc = useQueryClient();
  const updateSettings = useApp((s) => s.updateSettings);

  const [step, setStep] = useState<number>(STEP_INDEX.welcome);
  const [saving, setSaving] = useState(false);

  // draft state (local only — nothing persists before the final step)
  const [unit, setUnit] = useState<UnitSystem>("metric");
  const [goal, setGoal] = useState<Goal | null>(null);
  const [level, setLevel] = useState<Level | null>(null);
  const [days, setDays] = useState(3);
  const [heightInput, setHeightInput] = useState(""); // cm (metric) | inches (imperial)
  const [weightInput, setWeightInput] = useState(""); // kg (metric) | pounds (imperial)
  const [ageInput, setAgeInput] = useState("");

  const imperial = unit === "imperial";
  const stepNumber = step + 1;

  // ---------- step 5 field parsing / validation ----------

  const height = useMemo(() => parseNumber(heightInput), [heightInput]);
  const weight = useMemo(() => parseNumber(weightInput), [weightInput]);
  const age = useMemo(() => parseNumber(ageInput), [ageInput]);

  const heightCm = height == null ? null : imperial ? height * CM_PER_IN : height;
  const weightKg = weight == null ? null : imperial ? weight * KG_PER_LB : weight;

  const heightError = height == null ? null : imperial
    ? height < HEIGHT_IN_MIN || height > HEIGHT_IN_MAX ? `Enter ${HEIGHT_IN_MIN}–${HEIGHT_IN_MAX} inches` : null
    : height < HEIGHT_CM_MIN || height > HEIGHT_CM_MAX ? `Enter ${HEIGHT_CM_MIN}–${HEIGHT_CM_MAX} cm` : null;
  const weightError = weight == null ? null : imperial
    ? weight < WEIGHT_LB_MIN || weight > WEIGHT_LB_MAX ? `Enter ${WEIGHT_LB_MIN}–${WEIGHT_LB_MAX} lb` : null
    : weight < WEIGHT_KG_MIN || weight > WEIGHT_KG_MAX ? `Enter ${WEIGHT_KG_MIN}–${WEIGHT_KG_MAX} kg` : null;
  const ageError = age == null ? null
    : !Number.isInteger(age) || age < AGE_MIN || age > AGE_MAX ? `Enter ${AGE_MIN}–${AGE_MAX} years` : null;

  /** Step 5 is the only gate: fields are optional, but non-empty ones must be valid. */
  const step5Valid = heightError == null && weightError == null && ageError == null;
  const nextDisabled = step === STEP_INDEX.body && !step5Valid;

  // ---------- navigation ----------

  const goTo = (n: number) => {
    setStep(Math.min(Math.max(n, STEP_INDEX.welcome), STEP_INDEX.review));
    hapticTap();
  };

  const next = () => {
    if (nextDisabled || saving) return;
    if (step === STEP_INDEX.review) {
      void finish();
    } else {
      goTo(step + 1);
    }
  };

  // ---------- completion ----------

  /** Update the ["profile"] cache synchronously so the shell gate lifts instantly. */
  const applyProfile = (dto: UserProfileDTO) => {
    qc.setQueryData(["profile"], dto);
    void qc.invalidateQueries({ queryKey: ["profile"] });
  };

  const finish = async () => {
    setSaving(true);
    try {
      const dto = await profileApi.completeOnboarding({
        unitSystem: unit,
        goal,
        level,
        daysPerWeekTarget: days,
        ...(heightCm != null ? { heightCm: roundTo1(heightCm) } : {}),
        ...(weightKg != null ? { weightKg: roundTo1(weightKg) } : {}),
        ...(age != null ? { age } : {}),
      });
      applyProfile(dto);
      // The service persisted unitSystem, but the client settings/session in
      // the store still carry the signup default — sync them so every unit-aware
      // screen (weights, plates, profile) shows the chosen system without a
      // reload. Idempotent PATCH; failure is non-fatal (reload would resync).
      void updateSettings({ unitSystem: unit }).catch(() => undefined);
      hapticSuccess();
      toast.success("Welcome to SetForge");
      replaceHash("#/home");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not finish setup — try again");
    } finally {
      setSaving(false);
    }
  };

  const skip = async () => {
    if (saving) return;
    setSaving(true);
    try {
      const dto = await profileApi.completeOnboarding({ skipped: true });
      applyProfile(dto);
      toast.info("Setup skipped — finish any time from Profile");
      replaceHash("#/home");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not skip setup — try again");
    } finally {
      setSaving(false);
    }
  };

  const nextLabel =
    step === STEP_INDEX.welcome ? "Get started"
    : step === STEP_INDEX.review ? "Start training"
    : "Continue";

  // ---------- render ----------

  return (
    <Screen
      nav={false}
      topBar={
        <TopBar
          title="Welcome to SetForge"
          actions={
            <Button
              type="button"
              variant="ghost"
              className="h-11 gap-1 px-3 text-xs"
              tour={{ id: "onboarding.skip", label: "Skip", help: "Finish setup later — defaults apply until then.", order: 10 }}
              onClick={() => void skip()}
              disabled={saving}
            >
              <SkipForward className="h-4 w-4" aria-hidden /> Skip
            </Button>
          }
        />
      }
      bottomBar={
        <BottomBar>
          {step > STEP_INDEX.welcome ? (
            <Button
              type="button"
              variant="ghost"
              className="h-11 flex-none px-4"
              tour={{ id: "onboarding.back", label: "Back", help: "Return to the previous step.", order: 30 }}
              onClick={() => goTo(step - 1)}
              disabled={saving}
            >
              Back
            </Button>
          ) : null}
          <Button
            type="button"
            className="h-12 min-w-0 flex-1 text-base font-semibold"
            tour={{ id: "onboarding.next", label: "Next", help: "Continue to the next step (or finish on Review).", order: 40 }}
            onClick={next}
            disabled={nextDisabled || saving}
          >
            {saving && step === STEP_INDEX.review ? (
              <Loader2 className="h-5 w-5 animate-spin" aria-hidden />
            ) : null}
            {nextLabel}
          </Button>
        </BottomBar>
      }
    >
      {/* 4px progress bar — step N of 6 */}
      <div
        className="h-1 flex-none overflow-hidden bg-primary/10"
        {...tourAttrs({ id: "onboarding.progress", label: "Progress", help: "How far through the six setup steps you are.", order: 20 })}
        role="progressbar"
        aria-label="Onboarding progress"
        aria-valuemin={1}
        aria-valuemax={TOTAL_STEPS}
        aria-valuenow={stepNumber}
      >
        <div
          className="h-full bg-primary transition-all duration-300 ease-out"
          style={{ width: `${(stepNumber / TOTAL_STEPS) * 100}%` }}
        />
      </div>

      <ScrollBody contentClassName="flex flex-col gap-5 py-6">
        <p className="flex-none text-right text-xs font-medium tabular-nums text-muted-foreground">
          Step {stepNumber} of {TOTAL_STEPS}
        </p>

        <div key={step} className="flex flex-col gap-5 duration-300 animate-in fade-in slide-in-from-bottom-2">
          {step === STEP_INDEX.welcome ? (
            <WelcomeStep />
          ) : null}

          {step === STEP_INDEX.units ? (
            <section aria-label="Units" className="flex flex-col gap-2">
              <StepHeading title="Choose your units" subtitle="You can change this any time in Settings." />
              <div className="grid grid-cols-2 gap-3">
                {(["metric", "imperial"] as const).map((u) => (
                  <SelectTile
                    key={u}
                    selected={unit === u}
                    onPress={() => {
                      setUnit(u);
                      hapticSelection();
                    }}
                    ariaLabel={`Units: ${u === "metric" ? "Metric — kilograms and centimetres" : "Imperial — pounds and inches"}`}
                    className="h-24 flex-col justify-center gap-1"
                    tour={{ id: "onboarding.units", label: "Units tiles", help: "Pick kilograms or pounds as your display units.", order: 50 }}
                  >
                    <span className="flex w-full items-center justify-between gap-2">
                      <span className="text-lg font-bold leading-none">{u === "metric" ? "Metric" : "Imperial"}</span>
                      <TileCheck selected={unit === u} />
                    </span>
                    <span className="text-sm text-muted-foreground">{u === "metric" ? "kg · cm" : "lb · in"}</span>
                  </SelectTile>
                ))}
              </div>
            </section>
          ) : null}

          {step === STEP_INDEX.goal ? (
            <section aria-label="Goal" className="flex flex-col gap-2">
              <StepHeading title="What's your main goal?" subtitle="This tunes your dashboard and suggestions." />
              <div className="flex flex-col gap-2">
                {PROFILE_GOALS.map((g) => {
                  const Icon = GOAL_ICONS[g];
                  return (
                    <SelectTile
                      key={g}
                      selected={goal === g}
                      onPress={() => {
                        setGoal(g);
                        hapticSelection();
                      }}
                      ariaLabel={`Goal: ${PROFILE_GOAL_LABELS[g]}`}
                      className="h-16 items-center gap-3"
                      tour={{ id: "onboarding.goal", label: "Goal tiles", help: "Choose your main training goal.", order: 60 }}
                    >
                      <span className="flex h-10 w-10 flex-none items-center justify-center rounded-lg bg-primary/10 text-primary">
                        <Icon className="h-5 w-5" aria-hidden />
                      </span>
                      <span className="min-w-0 flex-1 truncate text-base font-semibold leading-none">
                        {PROFILE_GOAL_LABELS[g]}
                      </span>
                      <TileCheck selected={goal === g} />
                    </SelectTile>
                  );
                })}
              </div>
            </section>
          ) : null}

          {step === STEP_INDEX.level ? (
            <section aria-label="Experience level" className="flex flex-col gap-2">
              <StepHeading title="How much training experience?" subtitle="Be honest — you can change this later." />
              <div className="grid grid-cols-3 gap-2">
                {LEVEL_META.map((l) => {
                  const Icon = l.icon;
                  return (
                    <SelectTile
                      key={l.value}
                      selected={level === l.value}
                      onPress={() => {
                        setLevel(l.value);
                        hapticSelection();
                      }}
                      ariaLabel={`Level: ${l.label}`}
                      className="h-24 flex-col items-center justify-center gap-1 text-center"
                      tour={{ id: "onboarding.level", label: "Level tiles", help: "Pick your training experience level.", order: 70 }}
                    >
                      <TileCheck selected={level === l.value} className="absolute right-2 top-2" />
                      <Icon className="h-6 w-6 flex-none text-primary" aria-hidden />
                      <span className="text-sm font-bold leading-none">{l.label}</span>
                      <span className="text-[11px] leading-tight text-muted-foreground">{l.hint}</span>
                    </SelectTile>
                  );
                })}
              </div>
            </section>
          ) : null}

          {step === STEP_INDEX.body ? (
            <BodyStep
              imperial={imperial}
              days={days}
              setDays={(n) => {
                setDays(n);
                hapticTap();
              }}
              heightInput={heightInput}
              setHeightInput={setHeightInput}
              heightError={heightError}
              heightCm={heightCm}
              weightInput={weightInput}
              setWeightInput={setWeightInput}
              weightError={weightError}
              weightKg={weightKg}
              ageInput={ageInput}
              setAgeInput={setAgeInput}
              ageError={ageError}
            />
          ) : null}

          {step === STEP_INDEX.review ? (
            <ReviewStep
              unit={unit}
              goal={goal}
              level={level}
              days={days}
              heightCm={heightCm}
              weightKg={weightKg}
              age={age}
              onChangeStep={(n) => goTo(n)}
            />
          ) : null}
        </div>
      </ScrollBody>
    </Screen>
  );
}

// ── step 1 — welcome ─────────────────────────────────────────────────────────

function WelcomeStep() {
  return (
    <section aria-label="Welcome" className="flex flex-col items-center gap-5 py-8 text-center">
      <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-primary text-primary-foreground shadow-lg shadow-primary/25">
        <Flame className="h-8 w-8" aria-hidden />
      </div>
      <div>
        <p className="text-4xl font-black leading-none tracking-tight">SetForge</p>
        <p className="mt-1 text-xs font-medium uppercase tracking-widest text-muted-foreground">Workout tracker</p>
      </div>
      <p className="max-w-[42ch] text-balance text-sm leading-relaxed text-muted-foreground">
        Forge real progress — track every set, plan programs, measure your body.
      </p>
      <ul className="flex flex-col gap-1 text-xs text-muted-foreground" aria-label="What you get">
        <li>Every set, rep and PR logged in seconds</li>
        <li>Programs with phases, weeks and guided sessions</li>
        <li>Body metrics and progress in one place</li>
      </ul>
    </section>
  );
}

// ── step 5 — schedule & body ─────────────────────────────────────────────────

function BodyStep({
  imperial,
  days,
  setDays,
  heightInput,
  setHeightInput,
  heightError,
  heightCm,
  weightInput,
  setWeightInput,
  weightError,
  weightKg,
  ageInput,
  setAgeInput,
  ageError,
}: {
  imperial: boolean;
  days: number;
  setDays: (n: number) => void;
  heightInput: string;
  setHeightInput: (v: string) => void;
  heightError: string | null;
  heightCm: number | null;
  weightInput: string;
  setWeightInput: (v: string) => void;
  weightError: string | null;
  weightKg: number | null;
  ageInput: string;
  setAgeInput: (v: string) => void;
  ageError: string | null;
}) {
  return (
    <section aria-label="Schedule and body" className="flex flex-col gap-4">
      <StepHeading title="Schedule & body" subtitle="Optional — leave anything blank to skip it for now." />

      {/* days per week — stepper */}
      <div className="flex flex-col gap-1.5">
        <p className="px-1 text-sm font-semibold">Training days per week</p>
        <div className="flex h-12 items-center justify-between rounded-lg border bg-card px-2">
          <span className="flex-none pl-1 text-xs text-muted-foreground">Days</span>
          <span className="flex items-center gap-1">
            <Button
              type="button"
              variant="outline"
              className="h-12 w-12 p-0"
              disabled={days <= 1}
              aria-label="Decrease training days per week"
              tour={{ id: "onboarding.days", label: "Days stepper", help: "Set how many days per week you train.", order: 80 }}
              onClick={() => setDays(days - 1)}
            >
              <Minus className="h-5 w-5" aria-hidden />
            </Button>
            <span
              className="flex h-12 w-14 items-center justify-center text-base font-bold tabular-nums leading-none"
              aria-live="polite"
              aria-label={`Training days per week: ${days}`}
            >
              {days}
            </span>
            <Button
              type="button"
              variant="outline"
              className="h-12 w-12 p-0"
              disabled={days >= 7}
              aria-label="Increase training days per week"
              tour={{ skipTour: true, reason: "Plus twin of the days stepper in the wizard" }}
              onClick={() => setDays(days + 1)}
            >
              <Plus className="h-5 w-5" aria-hidden />
            </Button>
          </span>
        </div>
      </div>

      <NumberField
        id="onboarding-height"
        label="Height"
        unitLabel={imperial ? "inches" : "cm"}
        inputMode="decimal"
        value={heightInput}
        onChange={setHeightInput}
        error={heightError}
        hint={imperial && heightCm != null ? `≈ ${roundTo1(heightCm)} cm` : null}
        placeholder={imperial ? "e.g. 70" : "e.g. 178"}
        tour={{ id: "onboarding.height", label: "Height", help: "Your height — imperial entries convert automatically.", order: 90 }}
      />
      <NumberField
        id="onboarding-weight"
        label="Weight"
        unitLabel={imperial ? "pounds" : "kg"}
        inputMode="decimal"
        value={weightInput}
        onChange={setWeightInput}
        error={weightError}
        hint={imperial && weightKg != null ? `≈ ${roundTo1(weightKg)} kg` : null}
        placeholder={imperial ? "e.g. 180" : "e.g. 80"}
        tour={{ id: "onboarding.weight", label: "Weight", help: "Your body weight — imperial entries convert automatically.", order: 100 }}
      />
      <NumberField
        id="onboarding-age"
        label="Age"
        unitLabel="years"
        inputMode="numeric"
        value={ageInput}
        onChange={setAgeInput}
        error={ageError}
        placeholder="e.g. 30"
        tour={{ id: "onboarding.age", label: "Age", help: "Your age, used for training guidance.", order: 110 }}
      />
    </section>
  );
}

// ── step 6 — review ──────────────────────────────────────────────────────────

function ReviewStep({
  unit,
  goal,
  level,
  days,
  heightCm,
  weightKg,
  age,
  onChangeStep,
}: {
  unit: UnitSystem;
  goal: Goal | null;
  level: Level | null;
  days: number;
  heightCm: number | null;
  weightKg: number | null;
  age: number | null;
  onChangeStep: (step: number) => void;
}) {
  const imperial = unit === "imperial";
  const heightLabel =
    heightCm == null ? null
    : imperial ? `${roundTo1(heightCm / CM_PER_IN)} in (${roundTo1(heightCm)} cm)`
    : `${roundTo1(heightCm)} cm`;
  const weightLabel =
    weightKg == null ? null
    : imperial ? `${roundTo1(weightKg / KG_PER_LB)} lb (${roundTo1(weightKg)} kg)`
    : `${roundTo1(weightKg)} kg`;

  const rows: Array<{ label: string; value: string; step: number }> = [
    { label: "Units", value: imperial ? "Imperial (lb · in)" : "Metric (kg · cm)", step: STEP_INDEX.units },
    { label: "Goal", value: goal ? PROFILE_GOAL_LABELS[goal] : "Not set", step: STEP_INDEX.goal },
    { label: "Experience", value: level ? LEVEL_LABELS[level] : "Not set", step: STEP_INDEX.level },
    { label: "Days per week", value: String(days), step: STEP_INDEX.body },
    { label: "Height", value: heightLabel ?? "Skipped", step: STEP_INDEX.body },
    { label: "Weight", value: weightLabel ?? "Skipped", step: STEP_INDEX.body },
    { label: "Age", value: age != null ? `${age} years` : "Skipped", step: STEP_INDEX.body },
  ];

  return (
    <section aria-label="Review" className="flex flex-col gap-2">
      <StepHeading title="Ready to forge." subtitle="Check your setup — tap change to jump back." />
      <div className="flex flex-col gap-2">
        {rows.map((r) => (
          <div
            key={r.label}
            data-row
            className="flex h-14 items-center gap-2 overflow-hidden whitespace-nowrap rounded-lg border bg-card px-3"
          >
            <span className="min-w-0 flex-1 truncate text-sm font-medium">{r.label}</span>
            <span className="max-w-[55%] flex-none truncate text-sm tabular-nums text-muted-foreground">
              {r.value}
            </span>
            <button
              type="button"
              onClick={() => onChangeStep(r.step)}
              {...tourAttrs({ id: "onboarding.change", label: "Change link", help: "Jump back to that step to adjust your answer.", order: 120 })}
              className="h-11 flex-none rounded-md px-2 text-xs font-semibold text-primary hover:bg-primary/10 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
            >
              change
            </button>
          </div>
        ))}
      </div>
    </section>
  );
}

// ── small shared pieces ──────────────────────────────────────────────────────

function StepHeading({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <div className="flex flex-col gap-1 px-1">
      <h2 className="text-lg font-bold leading-tight">{title}</h2>
      {subtitle ? <p className="text-xs leading-relaxed text-muted-foreground">{subtitle}</p> : null}
    </div>
  );
}

function SelectTile({
  selected,
  onPress,
  ariaLabel,
  className,
  tour,
  children,
}: {
  selected: boolean;
  onPress: () => void;
  ariaLabel: string;
  className?: string;
  /** Inline tour declaration — renders data-tour-id on the tile (Part 7). */
  tour?: TourDecl;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      aria-label={ariaLabel}
      {...(tour ? tourAttrs(tour) : {})}
      onClick={onPress}
      className={cn(
        "relative flex w-full rounded-lg border bg-card p-3 text-left",
        "transition-colors hover:bg-accent/40 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
        selected && "border-primary bg-primary/5",
        className,
      )}
    >
      {children}
    </button>
  );
}

/** Radio-style check badge used inside SelectTiles (muted ring when unselected). */
function TileCheck({ selected, className }: { selected: boolean; className?: string }) {
  return (
    <span
      aria-hidden
      className={cn(
        "flex h-5 w-5 flex-none items-center justify-center rounded-full",
        selected ? "bg-primary text-primary-foreground" : "border border-border bg-muted/60",
        className,
      )}
    >
      {selected ? <Check className="h-3 w-3" /> : null}
    </span>
  );
}

function NumberField({
  id,
  label,
  unitLabel,
  inputMode,
  value,
  onChange,
  error,
  hint,
  placeholder,
  tour,
}: {
  id: string;
  label: string;
  unitLabel: string;
  inputMode: "decimal" | "numeric";
  value: string;
  onChange: (v: string) => void;
  error: string | null;
  hint?: string | null;
  placeholder?: string;
  /** Inline tour declaration — renders data-tour-id on the input (Part 7). */
  tour?: TourDecl;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="flex items-baseline justify-between px-1">
        <span className="text-sm font-semibold">{label}</span>
        <span className="text-xs text-muted-foreground">{unitLabel}</span>
      </label>
      <Input
        id={id}
        type="number"
        inputMode={inputMode}
        step="any"
        min="0"
        className={cn("h-12 rounded-lg text-base tabular-nums", error && "border-destructive")}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder ?? ""}
        aria-invalid={error != null}
        aria-describedby={error ? `${id}-error` : hint ? `${id}-hint` : undefined}
        {...(tour ? tourAttrs(tour) : {})}
      />
      {error ? (
        <p id={`${id}-error`} className="px-1 text-xs text-destructive" role="alert">
          {error}
        </p>
      ) : hint ? (
        <p id={`${id}-hint`} className="px-1 text-xs tabular-nums text-muted-foreground">
          {hint}
        </p>
      ) : null}
    </div>
  );
}

/** "" → null; otherwise the finite number value (NaN → null via band checks). */
function parseNumber(raw: string): number | null {
  const trimmed = raw.trim();
  if (trimmed === "") return null;
  const n = Number(trimmed);
  return Number.isFinite(n) ? n : null;
}
