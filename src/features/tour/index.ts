// ─────────────────────────────────────────────────────────────────────────────
// Tour feature barrel (Part 7). Public surface used by the shell, TopBarHelp,
// Settings and Help:
//
//   <TourProvider profile={profile}>      mount in app-shell (auth branch)
//   requestTourStart(screenId, {force})   start/queue a screen tour
//   requestWelcomeTour()                  start/queue the welcome tour
//   setTourContext({ populated: true })   screens declare live context gates
//   useTourStore                          engine state (active, seen, ctx…)
//   screenHash / screenTourHash           screen id → hash (parametric → parent)
//   registry / helpStepsFor               generated registry access
// ─────────────────────────────────────────────────────────────────────────────

export { TourProvider } from "./tour-provider";
export { TourOverlay } from "./tour-overlay";
export { HintManager } from "./hints";
export { useTourStore, setTourContext, type TourContextFlags, type ActiveTour } from "./store";
export {
  requestTourStart,
  requestWelcomeTour,
  endActiveTour,
  nextStep,
  backStep,
  startScreenTourInternal,
  startWelcomeTourInternal,
} from "./actions";
export { registry, WELCOME_KEY, NO_TOUR_SCREENS } from "./registry";
export { screenHash, screenTourHash } from "./screen-links";
export { helpStepsFor, resolveScreenSteps, versionOf } from "./resolve";
export { useCardPosition } from "./use-card-position";
