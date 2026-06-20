// components/calendar/theme.ts
//
// Visual language for the planning calendar. The block colours mirror the
// scheduler's session categories (see algorithm/00_types.ts → SessionCategory)
// so the same palette can be reused by the teacher and the (upcoming) admin
// calendar screens.

import type { SessionCategory } from "../../algorithm/00_types";

export type BlockTone = {
  bg: string;
  text: string;
  subText: string;
};

export const BLOCK_TONES: Record<SessionCategory, BlockTone> = {
  lesson: { bg: "#86A893", text: "#FFFFFF", subText: "rgba(255,255,255,0.86)" },
  written_work: { bg: "#7B86C9", text: "#FFFFFF", subText: "rgba(255,255,255,0.86)" },
  performance_task: { bg: "#D2B450", text: "#FFFFFF", subText: "rgba(255,255,255,0.9)" },
  exam: { bg: "#9C7CB9", text: "#FFFFFF", subText: "rgba(255,255,255,0.9)" },
  buffer: { bg: "#9CA3A8", text: "#FFFFFF", subText: "rgba(255,255,255,0.86)" },
};

export function toneFor(category: SessionCategory): BlockTone {
  return BLOCK_TONES[category] ?? BLOCK_TONES.lesson;
}

// Bright, saturated accents — used wherever the user is meant to *tell the
// categories apart at a glance*: the day-view chips, the block-editor funnel.
export const BLOCK_ACCENTS: Record<SessionCategory, string> = {
  lesson: "#22C55E",          // green
  written_work: "#6366F1",    // indigo blue
  performance_task: "#EAB308", // yellow
  exam: "#A855F7",            // purple
  buffer: "#6B7280",          // gray
};

export const BLOCK_TINTS: Record<SessionCategory, string> = {
  lesson: "#DCFCE7",          // pale green
  written_work: "#E0E7FF",    // pale indigo
  performance_task: "#FEF3C7", // pale yellow
  exam: "#F3E8FF",            // pale purple
  buffer: "#F3F4F6",          // pale gray
};

// Pastel borders — used by the daily-view block cards so the category
// (lesson · written work · performance task · ...) reads at a glance without
// shouting at the user. Keep these soft; the bright accents above are for
// chips/CTAs.
export const BLOCK_BORDERS: Record<SessionCategory, string> = {
  lesson: "#9DD0AE",          // pastel mint green
  written_work: "#A8B6E0",    // pastel periwinkle blue
  performance_task: "#E8CE6E", // pastel mustard yellow
  exam: "#C9B0E0",            // pastel lavender purple
  buffer: "#C5CAD0",          // pastel slate gray
};

export function borderFor(category: SessionCategory): string {
  return BLOCK_BORDERS[category] ?? BLOCK_BORDERS.lesson;
}

export const CATEGORY_ICONS: Record<SessionCategory, "library" | "create" | "color-palette" | "ribbon" | "cafe"> = {
  lesson: "library",
  written_work: "create",
  performance_task: "color-palette",
  exam: "ribbon",
  buffer: "cafe",
};

export function accentFor(category: SessionCategory): string {
  return BLOCK_ACCENTS[category] ?? BLOCK_ACCENTS.lesson;
}

export function tintFor(category: SessionCategory): string {
  return BLOCK_TINTS[category] ?? BLOCK_TINTS.lesson;
}

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
