"use client";

// Screen slot — #/calendar/{yyyy-mm-dd}
// Thin re-export of the Part 10 §5.1 calendar day-detail screen.
//
// Part 7 LAW 2 — the screen's tour/help contract (harvested by tour:gen).
// The inline calendarDay.* steps are declared on the elements in the feature
// module (src/features/calendar/calendar-day-screen.tsx).

import { registerScreen } from "@/lib/tour/register";

const SCREEN = registerScreen({
  id: "calendar-day",
  title: "Calendar day",
  purpose: "See one date's sessions: completed logs, scheduled plans, missed catch-ups and rest days.",
  emptyPurpose: "Nothing on this day yet — schedule a workout from the bottom bar.",
});
void SCREEN;

export { default } from "@/features/calendar/calendar-day-screen";
