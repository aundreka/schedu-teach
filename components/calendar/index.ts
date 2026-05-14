// components/calendar/index.ts — public surface of the calendar feature.

export { default as CalendarMonth } from "./calendar-month";
export { default as CalendarToolbar } from "./calendar-toolbar";
export { default as CalendarBlockBar } from "./calendar-block-bar";
export { default as SubjectPill, normalizeYear, planSubtitle } from "./subject-pill";
export { default as BlockEditor } from "./block-editor";
export type { BlockEditorInitial } from "./block-editor";

export * from "./schedule";
export * from "./agenda";
export * from "./labels";
export * from "./dates";
export * from "./theme";
