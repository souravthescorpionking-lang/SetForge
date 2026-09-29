// Part 8 group-card primitives — barrel export.
// Law 3: exactly ONE GroupCard (and one SetRow) — every place an exercise
// appears renders inside GroupCard (SoloCard is the singleton-group shorthand).

export { GroupCard, SoloCard, GroupCardStack } from "./group-card";
export type { GroupCardProps, GroupCardEntry, GroupCardGroup, GroupMenuItem, SoloCardProps } from "./group-card";
export { mapLegacyMode } from "./group-types";
export type { CardMode, CardExercise, CardSet, CardVisibleColumns, CardAction, ApplyToAllFields, ToCardSetInput } from "./group-types";
export { toCardSet } from "./group-types";
