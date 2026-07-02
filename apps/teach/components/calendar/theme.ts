// components/calendar/theme.ts
//
// Visual language for the planning calendar. All colors derive from the
// semantic category ramp in constants/colors.ts (Colors[scheme].category) so
// the calendar stays in lock-step with the rest of the app in both light and
// dark mode. The session-category keys from the scheduler
// (see algorithm/00_types.ts → SessionCategory) map onto that ramp here.

import type { SessionCategory } from "../../algorithm/00_types";
import { Colors, type CategoryKey, type CategoryTone } from "../../constants/colors";

export type CalendarScheme = "light" | "dark";

export type BlockTone = {
  bg: string;
  fg: string;
};

const CATEGORY_KEY: Record<SessionCategory, CategoryKey> = {
  lesson: "lesson",
  written_work: "writtenWork",
  performance_task: "performanceTask",
  exam: "exam",
  buffer: "buffer",
};

function categoryTone(category: SessionCategory, scheme: CalendarScheme): CategoryTone {
  const key = CATEGORY_KEY[category] ?? "lesson";
  return Colors[scheme].category[key];
}

/**
 * Calm soft-fill tone for month-grid bars and chips: soft category background
 * with readable on-soft text — works in both light and dark schemes.
 */
export function toneFor(category: SessionCategory, scheme: CalendarScheme): BlockTone {
  const tone = categoryTone(category, scheme);
  return { bg: tone.soft, fg: tone.onSoft };
}

/**
 * Bright, saturated accent — used wherever the user is meant to *tell the
 * categories apart at a glance*: the block-editor funnel's big cards.
 */
export function accentFor(category: SessionCategory, scheme: CalendarScheme): string {
  return categoryTone(category, scheme).base;
}

/** Soft category fill (unselected subcategory cards, pale surfaces). */
export function tintFor(category: SessionCategory, scheme: CalendarScheme): string {
  return categoryTone(category, scheme).soft;
}

/**
 * Soft category border — used by the daily-view block cards so the category
 * (lesson · written work · performance task · ...) reads at a glance without
 * shouting at the user.
 */
export function borderFor(category: SessionCategory, scheme: CalendarScheme): string {
  return categoryTone(category, scheme).border;
}

export const CATEGORY_ICONS: Record<SessionCategory, "library" | "create" | "color-palette" | "ribbon" | "cafe"> = {
  lesson: "library",
  written_work: "create",
  performance_task: "color-palette",
  exam: "ribbon",
  buffer: "cafe",
};

// Sunday-first, matching the mock ("S M T W T F S").
export const WEEKDAY_INITIALS = ["S", "M", "T", "W", "T", "F", "S"] as const;

export const MONTH_NAMES = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
] as const;
