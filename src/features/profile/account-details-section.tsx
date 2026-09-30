"use client";

// ─────────────────────────────────────────────────────────────────────────────
// AccountDetailsSection — Part 10 §9 rows on #/profile: avatar, name, email,
// password, gender, birth year (+ derived age), weight (read-only latest
// weigh-in + Log link), fitness level (= user.difficulty via the ONE shared
// useChangeDifficulty flow), weigh-in days (7 weekday toggles), units
// (settings.unitSystem) and timezone (settings.timezone).
//
// Rows are the profile-screen conventions: 56px rounded-lg border bg-card,
// label left · value right · chevron/action; editors are ActionList pickers
// or inline numeric/text rows (L3: no sheets). Every control declares `tour`.
// ─────────────────────────────────────────────────────────────────────────────

import { useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ActionList } from "@/components/shared/action-list";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { tourAttrs } from "@/lib/tour/attrs";
import type { TourDecl } from "@/lib/tour/types";
import { Camera, Check, ChevronRight, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { useApp } from "@/lib/client/store";
import { mediaApi, userAccountApi } from "@/lib/client/api";
import { useChangeDifficulty } from "@/features/routines/use-change-difficulty";
import { useBodyWeight } from "@/features/body/use-body-weight";
import { DIFFICULTIES, DIFFICULTY_LABELS, type Difficulty } from "@/lib/constants";
import type { UserAccountDTO } from "@/lib/types";
import { errorMessage } from "@/features/routines/screen-helpers";
import { hapticTap } from "@/lib/client/haptics";

/** ["user-account"] — the User-level §9 fields (staleTime 60s, invalidated on write). */
export function useUserAccount() {
  return useQuery({
    queryKey: ["user-account"],
    queryFn: () => userAccountApi.get(),
    staleTime: 60_000,
  });
}

const GENDERS = [
  { value: "MALE", label: "Male" },
  { value: "FEMALE", label: "Female" },
  { value: "OTHER", label: "Other" },
  { value: "UNSPECIFIED", label: "Prefer not to say" },
] as const;

const GENDER_LABEL: ReadonlyMap<string, string> = new Map(GENDERS.map((g) => [g.value as string, g.label]));

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] as const; // ISO 1..7 → index 0..6

const TIMEZONE_SUGGESTIONS = [
  "UTC",
  "Europe/London",
  "Europe/Berlin",
  "Europe/Paris",
  "America/New_York",
  "America/Chicago",
  "America/Denver",
  "America/Los_Angeles",
  "Asia/Kolkata",
  "Asia/Dubai",
  "Asia/Singapore",
  "Asia/Tokyo",
  "Australia/Sydney",
  "Pacific/Auckland",
] as const;

const CURRENT_YEAR = new Date().getFullYear();

function Row({
  label,
  value,
  children,
  onClick,
  ariaLabel,
  tour,
}: {
  label: string;
  value: string | null;
  children?: React.ReactNode;
  onClick?: () => void;
  ariaLabel?: string;
  /** Static declaration — the lint/codegen rule reads literals only. */
  tour: TourDecl;
}) {
  return (
    <div
      data-row
      className="flex h-14 w-full items-center gap-2 overflow-hidden whitespace-nowrap rounded-lg border bg-card px-3"
      aria-label={ariaLabel}
    >
      <span className="min-w-0 flex-1 truncate text-sm font-medium">{label}</span>
      {children ?? (
        <>
          <span className={cn("max-w-[55%] flex-none truncate text-sm", value == null ? "text-muted-foreground/60" : "text-muted-foreground")}>
            {value ?? "Not set"}
          </span>
          {onClick ? (
            <button
              type="button"
              {...tourAttrs(tour)}
              onClick={() => {
                hapticTap();
                onClick();
              }}
              className="flex h-11 w-11 flex-none items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent/40 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
              aria-label={`${label} — edit`}
            >
              <ChevronRight className="h-4 w-4" aria-hidden />
            </button>
          ) : null}
        </>
      )}
    </div>
  );
}

export function AccountDetailsSection() {
  const navigate = useApp((s) => s.navigate);
  const session = useApp((s) => s.session);
  const setSession = useApp((s) => s.setSession);
  const settings = useApp((s) => s.settings);
  const updateSettings = useApp((s) => s.updateSettings);
  const qc = useQueryClient();

  const accountQuery = useUserAccount();
  const account = accountQuery.data;
  const weight = useBodyWeight();

  // §9 fitness level — the ONE shared difficulty flow (confirm + server action).
  const { difficulty, confirm, request: changeDifficulty } = useChangeDifficulty();

  // ---------- editors ----------
  const [editingName, setEditingName] = useState(false);
  const [nameDraft, setNameDraft] = useState("");
  const [editingBirthYear, setEditingBirthYear] = useState(false);
  const [birthYearDraft, setBirthYearDraft] = useState("");
  const [busy, setBusy] = useState(false);

  const takePhotoRef = useRef<HTMLInputElement>(null);
  const choosePhotoRef = useRef<HTMLInputElement>(null);

  const patchAccount = async (patch: Parameters<typeof userAccountApi.update>[0]) => {
    setBusy(true);
    try {
      const dto = await userAccountApi.update(patch);
      qc.setQueryData(["user-account"], dto);
      void qc.invalidateQueries({ queryKey: ["user-account"] });
      if (patch.name !== undefined && session?.user) {
        setSession({ ...session, user: { ...session.user, name: dto.name } });
      }
      toast.success("Saved");
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const uploadAvatar = async (file: File) => {
    setBusy(true);
    try {
      const res = await mediaApi.upload(file, "avatar");
      await patchAccount({ avatarKey: res.key });
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  if (accountQuery.isLoading || !account || !settings) {
    return (
      <section aria-label="Account details" className="flex flex-col gap-2" aria-busy="true">
        <p className="px-1 text-xs font-bold uppercase leading-none tracking-wide text-muted-foreground">Account</p>
        {Array.from({ length: 5 }, (_, i) => (
          <Skeleton key={i} className="h-14 w-full rounded-lg" />
        ))}
      </section>
    );
  }

  const age = account.birthYear != null ? CURRENT_YEAR - account.birthYear : null;
  const imperial = settings.unitSystem === "imperial";
  const latestWeight =
    weight.latest != null
      ? imperial
        ? `${Math.round(weight.latest * 2.2046226218)} lb`
        : `${Math.round(weight.latest * 10) / 10} kg`
      : null;
  const browserTz = typeof Intl !== "undefined" ? Intl.DateTimeFormat().resolvedOptions().timeZone : null;

  return (
    <section aria-label="Account details" className="flex flex-col gap-2">
      <p className="px-1 text-xs font-bold uppercase leading-none tracking-wide text-muted-foreground">Account</p>

      {/* Avatar row (§9) — 56px: circle 40 · "Change photo" ActionList */}
      <div
        data-row
        className="flex h-14 w-full items-center gap-3 overflow-hidden whitespace-nowrap rounded-lg border bg-card px-3"
      >
        <span
          aria-hidden
          className="flex h-10 w-10 flex-none items-center justify-center overflow-hidden rounded-full bg-primary/10 text-sm font-bold text-primary"
        >
          {account.avatarKey ? (
            // eslint-disable-next-line @next/next/no-img-element -- auth-scoped media adapter URL
            <img src={mediaApi.url(account.avatarKey)} alt="" className="h-10 w-10 object-cover" />
          ) : (
            (session?.user?.name ?? "S")
              .split(/[\s@.]/)
              .filter(Boolean)
              .slice(0, 2)
              .map((p) => p[0]?.toUpperCase())
              .join("") || "SF"
          )}
        </span>
        <ActionList
          label="Change photo"
          items={[
            { id: "take", label: "Take photo", onSelect: () => takePhotoRef.current?.click() },
            { id: "choose", label: "Choose from library", onSelect: () => choosePhotoRef.current?.click() },
            ...(account.avatarKey
              ? [{ id: "remove", label: "Remove photo", danger: true as const, onSelect: () => void patchAccount({ avatarKey: null }) }]
              : []),
          ]}
          trigger={
            <button
              type="button"
              disabled={busy}
              {...tourAttrs({ id: "accountDetails.photo", label: "Change photo", help: "Set or remove your profile photo.", order: 10 })}
              className="flex h-11 min-w-0 flex-1 items-center gap-2 rounded-md px-2 text-left text-sm font-medium transition-colors hover:bg-accent/40 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
            >
              {busy ? <Loader2 className="h-4 w-4 flex-none animate-spin" aria-hidden /> : <Camera className="h-4 w-4 flex-none text-muted-foreground" aria-hidden />}
              <span className="truncate">{account.avatarKey ? "Change photo" : "Add photo"}</span>
            </button>
          }
        />
        {/* hidden native inputs — capture toggles camera vs library */}
        <input
          ref={takePhotoRef}
          type="file"
          accept="image/*"
          capture="environment"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            e.target.value = "";
            if (f) void uploadAvatar(f);
          }}
        />
        <input
          ref={choosePhotoRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            e.target.value = "";
            if (f) void uploadAvatar(f);
          }}
        />
      </div>

      {/* Name (inline) */}
      {editingName ? (
        <div data-row className="flex h-14 w-full items-center gap-2 rounded-lg border border-primary/50 bg-primary/5 px-3">
          <Input
            autoFocus
            value={nameDraft}
            onChange={(e) => setNameDraft(e.target.value)}
            aria-label="Name"
            {...tourAttrs({ id: "accountDetails.nameInput", label: "Name input", help: "Your display name.", order: 20 })}
            className="h-11 min-w-0 flex-1 rounded-md"
            placeholder="Your name"
          />
          <Button
            type="button"
            size="icon"
            aria-label="Save name"
            {...tourAttrs({ id: "accountDetails.nameSave", label: "Save name", help: "Save your display name.", order: 30 })}
            disabled={busy || nameDraft.trim() === "" || nameDraft.trim() === (account.name ?? "")}
            onClick={() => {
              void patchAccount({ name: nameDraft.trim() }).then(() => setEditingName(false));
            }}
            className="h-11 w-11 flex-none"
          >
            <Check className="h-4 w-4" aria-hidden />
          </Button>
        </div>
      ) : (
        <Row
          label="Name"
          value={account.name ?? null}
          ariaLabel={`Name: ${account.name ?? "Not set"}`}
          tour={{ id: "accountDetails.name", label: "Name", help: "Change your display name.", order: 20 }}
          onClick={() => {
            setNameDraft(account.name ?? "");
            setEditingName(true);
          }}
        />
      )}

      {/* Email — read-only */}
      <Row
        label="Email"
        value={account.email}
        ariaLabel={`Email: ${account.email}`}
        tour={{ id: "accountDetails.email", label: "Email", help: "Your sign-in email — read-only.", order: 30 }}
      />

      {/* Password */}
      <div
        data-row
        className="flex h-14 w-full items-center gap-2 overflow-hidden whitespace-nowrap rounded-lg border bg-card px-3"
      >
        <span className="min-w-0 flex-1 truncate text-sm font-medium">Password</span>
        <Button
          type="button"
          variant="outline"
          className="h-10 flex-none px-3 text-sm"
          {...tourAttrs({ id: "accountDetails.password", label: "Change password", help: "Set a new password with a strength check.", order: 40 })}
          onClick={() => navigate("/account/password")}
        >
          Change
        </Button>
      </div>

      {/* Gender — ActionList */}
      <div
        data-row
        className="flex h-14 w-full items-center gap-2 overflow-hidden whitespace-nowrap rounded-lg border bg-card px-3"
      >
        <span className="min-w-0 flex-1 truncate text-sm font-medium">Gender</span>
        <ActionList
          label={`Gender — ${account.gender ? GENDER_LABEL.get(account.gender) ?? account.gender : "Not set"}`}
          items={GENDERS.map((g) => ({
            id: g.value,
            label: g.label,
            checked: account.gender === g.value,
            onSelect: () => void patchAccount({ gender: g.value }),
          }))}
          trigger={
            <button
              type="button"
              {...tourAttrs({ id: "accountDetails.gender", label: "Gender", help: "Set your gender — optional.", order: 50 })}
              className="flex h-11 max-w-[55%] flex-none items-center gap-1 rounded-md px-2 text-sm text-muted-foreground transition-colors hover:bg-accent/40 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
            >
              <span className="truncate">{account.gender ? GENDER_LABEL.get(account.gender) ?? account.gender : "Not set"}</span>
            </button>
          }
        />
      </div>

      {/* Birth year — inline numeric + age helper */}
      {editingBirthYear ? (
        <div data-row className="flex h-14 w-full items-center gap-2 rounded-lg border border-primary/50 bg-primary/5 px-3">
          <Input
            autoFocus
            inputMode="numeric"
            value={birthYearDraft}
            onChange={(e) => setBirthYearDraft(e.target.value.replace(/[^0-9]/g, "").slice(0, 4))}
            aria-label="Birth year"
            {...tourAttrs({ id: "accountDetails.birthYearInput", label: "Birth year input", help: "The year you were born.", order: 60 })}
            className="h-11 min-w-0 flex-1 rounded-md"
            placeholder="e.g. 1994"
          />
          <Button
            type="button"
            size="icon"
            aria-label="Save birth year"
            {...tourAttrs({ id: "accountDetails.birthYearSave", label: "Save birth year", help: "Save your birth year.", order: 60 })}
            disabled={busy || birthYearDraft.length !== 4 || Number(birthYearDraft) > CURRENT_YEAR || Number(birthYearDraft) < 1900}
            onClick={() => {
              void patchAccount({ birthYear: Number(birthYearDraft) }).then(() => setEditingBirthYear(false));
            }}
            className="h-11 w-11 flex-none"
          >
            <Check className="h-4 w-4" aria-hidden />
          </Button>
        </div>
      ) : (
        <Row
          label="Birth year"
          value={account.birthYear != null ? `${account.birthYear} · Age ${age}` : null}
          ariaLabel={account.birthYear != null ? `Birth year ${account.birthYear}, age ${age}` : "Birth year not set"}
          tour={{ id: "accountDetails.birthYear", label: "Birth year", help: "Your birth year — age is derived from it.", order: 60 }}
          onClick={() => {
            setBirthYearDraft(account.birthYear != null ? String(account.birthYear) : "");
            setEditingBirthYear(true);
          }}
        />
      )}

      {/* Weight — read-only latest weigh-in + Log link */}
      <div
        data-row
        className="flex h-14 w-full items-center gap-2 overflow-hidden whitespace-nowrap rounded-lg border bg-card px-3"
      >
        <span className="min-w-0 flex-1 truncate text-sm font-medium">Weight</span>
        <span className={cn("max-w-[45%] flex-none truncate text-sm", latestWeight == null ? "text-muted-foreground/60" : "text-muted-foreground")}>
          {latestWeight ?? "No weigh-ins"}
        </span>
        <Button
          type="button"
          variant="ghost"
          className="h-10 flex-none px-3 text-sm text-primary"
          {...tourAttrs({ id: "accountDetails.weightLog", label: "Log weigh-in", help: "Log today's weigh-in in Progress.", order: 70 })}
          onClick={() => navigate("/progress/log")}
        >
          Log
        </Button>
      </div>

      {/* Fitness level — the ONE difficulty flow */}
      <div
        data-row
        className="flex h-14 w-full items-center gap-2 overflow-hidden whitespace-nowrap rounded-lg border bg-card px-3"
      >
        <span className="min-w-0 flex-1 truncate text-sm font-medium">Fitness level</span>
        <ActionList
          label={`Fitness level — ${DIFFICULTY_LABELS[difficulty]}`}
          items={DIFFICULTIES.map((d) => ({
            id: d,
            label: DIFFICULTY_LABELS[d as Difficulty],
            checked: d === difficulty,
            onSelect: () => changeDifficulty(d as Difficulty),
          }))}
          trigger={
            <button
              type="button"
              {...tourAttrs({
                id: "accountDetails.fitnessLevel",
                label: "Fitness level",
                help: "Changes your program difficulty everywhere.",
                order: 80,
              })}
              className="flex h-11 max-w-[55%] flex-none items-center gap-1 rounded-md px-2 text-sm text-muted-foreground transition-colors hover:bg-accent/40 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
            >
              <span className="truncate">{DIFFICULTY_LABELS[difficulty]}</span>
            </button>
          }
        />
      </div>

      {/* Weigh-in days — 7 weekday toggles */}
      <div
        data-row
        className="flex h-14 w-full items-center gap-1 overflow-hidden whitespace-nowrap rounded-lg border bg-card px-3"
        role="group"
        aria-label="Weigh-in days"
      >
        <span className="mr-1 min-w-0 flex-1 truncate text-sm font-medium">Weigh-in days</span>
        {WEEKDAYS.map((wd, i) => {
          const isoDay = i + 1; // Mon=1 … Sun=7 → spec 0..6 with Mon…Sun order
          const on = account.weighInDays.includes(isoDay);
          return (
            <button
              key={wd}
              type="button"
              aria-pressed={on}
              aria-label={`${wd} weigh-in ${on ? "on" : "off"}`}
              {...tourAttrs({ id: "accountDetails.weighInDay", label: "Weigh-in day", help: "Pick the weekdays you weigh in.", order: 90 })}
              onClick={() => {
                const next = on ? account.weighInDays.filter((d) => d !== isoDay) : [...account.weighInDays, isoDay].sort((a, b) => a - b);
                void patchAccount({ weighInDays: next });
              }}
              className={cn(
                "flex h-10 w-10 flex-none items-center justify-center rounded-full border text-xs font-semibold leading-none transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
                on ? "border-primary/60 bg-primary/10 text-primary" : "border-border text-muted-foreground hover:bg-accent/40",
              )}
            >
              {wd}
            </button>
          );
        })}
      </div>

      {/* Units */}
      <div
        data-row
        className="flex h-14 w-full items-center gap-2 overflow-hidden whitespace-nowrap rounded-lg border bg-card px-3"
      >
        <span className="min-w-0 flex-1 truncate text-sm font-medium">Units</span>
        <ActionList
          label={`Units — ${imperial ? "lb / in" : "kg / cm"}`}
          items={[
            { id: "metric", label: "Metric (kg · cm)", checked: !imperial, onSelect: () => void updateSettings({ unitSystem: "metric" }) },
            { id: "imperial", label: "Imperial (lb · in)", checked: imperial, onSelect: () => void updateSettings({ unitSystem: "imperial" }) },
          ]}
          trigger={
            <button
              type="button"
              {...tourAttrs({ id: "accountDetails.units", label: "Units", help: "Switch metric and imperial everywhere.", order: 100 })}
              className="flex h-11 max-w-[55%] flex-none items-center gap-1 rounded-md px-2 text-sm text-muted-foreground transition-colors hover:bg-accent/40 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
            >
              <span className="truncate">{imperial ? "lb / in" : "kg / cm"}</span>
            </button>
          }
        />
      </div>

      {/* Timezone */}
      <div
        data-row
        className="flex h-14 w-full items-center gap-2 overflow-hidden whitespace-nowrap rounded-lg border bg-card px-3"
      >
        <span className="min-w-0 flex-1 truncate text-sm font-medium">Timezone</span>
        <ActionList
          label={`Timezone — ${settings.timezone}${browserTz && browserTz !== settings.timezone ? ` (device: ${browserTz})` : ""}`}
          items={[
            ...(browserTz && browserTz !== settings.timezone
              ? [{ id: browserTz, label: `Use device (${browserTz})`, onSelect: () => void updateSettings({ timezone: browserTz }) }]
              : []),
            ...TIMEZONE_SUGGESTIONS.map((tz) => ({
              id: tz,
              label: tz,
              checked: settings.timezone === tz,
              onSelect: () => void updateSettings({ timezone: tz }),
            })),
          ]}
          trigger={
            <button
              type="button"
              {...tourAttrs({ id: "accountDetails.timezone", label: "Timezone", help: "Your day boundary for schedules and streaks.", order: 110 })}
              className="flex h-11 max-w-[55%] flex-none items-center gap-1 rounded-md px-2 text-sm text-muted-foreground transition-colors hover:bg-accent/40 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
            >
              <span className="truncate">{settings.timezone}</span>
            </button>
          }
        />
      </div>

      {/* §2 difficulty-change confirm — shared modal */}
      {confirm ? <confirm.Dialog /> : null}
    </section>
  );
}
