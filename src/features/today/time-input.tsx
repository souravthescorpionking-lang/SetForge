"use client";

// hh:mm:ss segmented numeric input for time-based sets.
// Each segment auto-advances after two digits; empty everywhere = null.
import { useEffect, useRef } from "react";
import { cn } from "@/lib/utils";

export function TimeInput({
  valueSec,
  onChange,
  ariaLabel = "Set duration",
  className,
}: {
  valueSec: number | null;
  onChange: (v: number | null) => void;
  ariaLabel?: string;
  className?: string;
}) {
  const hRef = useRef<HTMLInputElement>(null);
  const mRef = useRef<HTMLInputElement>(null);
  const sRef = useRef<HTMLInputElement>(null);

  const total = valueSec ?? 0;
  const h = valueSec == null ? "" : String(Math.floor(total / 3600));
  const m = valueSec == null ? "" : String(Math.floor((total % 3600) / 60));
  const s = valueSec == null ? "" : String(total % 60);

  useEffect(() => {
    // reflect external value changes (prefill / set selection)
    if (document.activeElement !== hRef.current) hRef.current!.value = h ? pad(h) : "";
    if (document.activeElement !== mRef.current) mRef.current!.value = m ? pad(m) : "";
    if (document.activeElement !== sRef.current) sRef.current!.value = s ? pad(s) : "";
  }, [h, m, s]);

  const commit = () => {
    const hv = parseInt(hRef.current?.value ?? "", 10);
    const mv = parseInt(mRef.current?.value ?? "", 10);
    const sv = parseInt(sRef.current?.value ?? "", 10);
    const allEmpty = hRef.current?.value === "" && mRef.current?.value === "" && sRef.current?.value === "";
    if (allEmpty || (Number.isNaN(hv) && Number.isNaN(mv) && Number.isNaN(sv))) {
      onChange(null);
      return;
    }
    const sec = (Number.isNaN(hv) ? 0 : hv) * 3600 + (Number.isNaN(mv) ? 0 : mv) * 60 + (Number.isNaN(sv) ? 0 : sv);
    onChange(sec > 0 ? sec : null);
  };

  const seg = (
    ref: React.RefObject<HTMLInputElement | null>,
    val: string,
    max: number,
    next: React.RefObject<HTMLInputElement | null> | null,
    label: string,
  ) => (
    <input
      ref={ref}
      inputMode="numeric"
      aria-label={`${ariaLabel} — ${label}`}
      defaultValue={val ? pad(val) : ""}
      placeholder="00"
      maxLength={2}
      className={cn(
        "w-10 bg-transparent text-center numeric text-base font-semibold outline-none sm:w-12",
        "focus-visible:text-primary",
      )}
      onChange={(e) => {
        const v = e.target.value.replace(/\D/g, "").slice(0, 2);
        e.target.value = v;
        if (v.length === 2 && next?.current) next.current.focus();
        commit();
      }}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === "ArrowUp" || e.key === "ArrowDown") {
          e.preventDefault();
          const cur = parseInt(e.currentTarget.value || "0", 10) || 0;
          const nextVal = Math.max(0, Math.min(max, cur + (e.key === "ArrowUp" ? 1 : -1)));
          e.currentTarget.value = pad(String(nextVal));
          commit();
        }
        if (e.key === "Backspace" && e.currentTarget.value === "") {
          // move focus back one segment
          if (ref === sRef) mRef.current?.focus();
          else if (ref === mRef) hRef.current?.focus();
        }
      }}
    />
  );

  return (
    <div
      className={cn(
        "flex h-11 items-center justify-center rounded-lg border border-input bg-background focus-within:ring-2 focus-within:ring-ring/40",
        className,
      )}
    >
      {seg(hRef, h, 99, mRef, "hours")}
      <span className="select-none px-0.5 text-muted-foreground" aria-hidden>:</span>
      {seg(mRef, m, 59, sRef, "minutes")}
      <span className="select-none px-0.5 text-muted-foreground" aria-hidden>:</span>
      {seg(sRef, s, 59, null, "seconds")}
    </div>
  );
}

function pad(v: string) {
  return v.padStart(2, "0");
}
