// components/calendar/dates.ts
//
// Small calendar-grid date helpers. Everything works on plain
// `YYYY-MM-DD` strings (the shape Supabase / the scheduler use for dates) and
// builds Sunday-first month matrices for rendering.

import { MONTH_NAMES } from "./theme";

export type ISODate = string; // YYYY-MM-DD

export type YearMonth = { year: number; month0: number }; // month0: 0-11

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

export function toISO(date: Date): ISODate {
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
}

export function todayISO(): ISODate {
  return toISO(new Date());
}

export function parseISO(iso: ISODate): YearMonth & { day: number } {
  const [y, m, d] = iso.split("-").map(Number);
  return { year: y, month0: (m ?? 1) - 1, day: d ?? 1 };
}

export function monthKeyOf(iso: ISODate): string {
  return iso.slice(0, 7); // YYYY-MM
}

export function dayOfMonth(iso: ISODate): number {
  return parseISO(iso).day;
}

export function monthName(month0: number): string {
  return MONTH_NAMES[((month0 % 12) + 12) % 12];
}

/**
 * 6 × 7 grid of ISO dates for the given month, Sunday-first, padded with the
 * trailing days of the previous month and leading days of the next month.
 */
export function getMonthMatrix(year: number, month0: number): ISODate[][] {
  const first = new Date(year, month0, 1);
  const startWeekday = first.getDay(); // 0 = Sunday
  const matrix: ISODate[][] = [];

  for (let week = 0; week < 6; week += 1) {
    const row: ISODate[] = [];
    for (let day = 0; day < 7; day += 1) {
      const offset = week * 7 + day - startWeekday;
      row.push(toISO(new Date(year, month0, 1 + offset)));
    }
    matrix.push(row);
  }
  return matrix;
}

/** Inclusive list of months touched by the [start, end] date range. */
export function monthsBetween(startISO: ISODate, endISO: ISODate): YearMonth[] {
  const start = parseISO(startISO);
  const end = parseISO(endISO);
  const months: YearMonth[] = [];

  let y = start.year;
  let m = start.month0;
  while (y < end.year || (y === end.year && m <= end.month0)) {
    months.push({ year: y, month0: m });
    m += 1;
    if (m > 11) {
      m = 0;
      y += 1;
    }
  }
  return months.length > 0 ? months : [{ year: start.year, month0: start.month0 }];
}

export function sameYearMonth(a: YearMonth, b: YearMonth): boolean {
  return a.year === b.year && a.month0 === b.month0;
}

const WEEKDAY_FULL = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
] as const;

function isoToDate(iso: ISODate): Date {
  const { year, month0, day } = parseISO(iso);
  return new Date(year, month0, day);
}

export function addDaysISO(iso: ISODate, days: number): ISODate {
  const d = isoToDate(iso);
  return toISO(new Date(d.getFullYear(), d.getMonth(), d.getDate() + days));
}

/** 0 = Sunday … 6 = Saturday. */
export function weekdayIndexOf(iso: ISODate): number {
  return isoToDate(iso).getDay();
}

/** The Sunday on or before `iso`. */
export function startOfWeek(iso: ISODate): ISODate {
  return addDaysISO(iso, -weekdayIndexOf(iso));
}

/** The 7 ISO dates of the week containing `iso`, Sunday-first. */
export function weekOf(iso: ISODate): ISODate[] {
  const sunday = startOfWeek(iso);
  return Array.from({ length: 7 }, (_, i) => addDaysISO(sunday, i));
}

export function weekdayName(iso: ISODate): string {
  return WEEKDAY_FULL[weekdayIndexOf(iso)];
}

/** e.g. "Friday, October 30" */
export function formatLongDate(iso: ISODate): string {
  const { month0, day } = parseISO(iso);
  return `${weekdayName(iso)}, ${monthName(month0)} ${day}`;
}

// --- time-of-day helpers (HH:MM[:SS]) --------------------------------------

export type TimeOfDay = string; // "HH:MM:SS"

export function timeToMinutes(time: string): number {
  const [h = 0, m = 0] = time.split(":").map(Number);
  return h * 60 + m;
}

export function minutesToTime(minutes: number): TimeOfDay {
  const clamped = Math.max(0, Math.min(24 * 60 - 1, Math.round(minutes)));
  const h = Math.floor(clamped / 60);
  const m = clamped % 60;
  return `${pad2(h)}:${pad2(m)}:00`;
}

/** e.g. "8:00 AM", "1:30 PM" */
export function formatTime12(time: string): string {
  const total = timeToMinutes(time);
  const h24 = Math.floor(total / 60);
  const m = total % 60;
  const period = h24 < 12 ? "AM" : "PM";
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
  return `${h12}:${pad2(m)} ${period}`;
}

/** e.g. "1 hr 30 min", "45 min" */
export function formatDuration(minutes: number): string {
  const total = Math.max(0, Math.round(minutes));
  const h = Math.floor(total / 60);
  const m = total % 60;
  if (h > 0 && m > 0) return `${h} hr ${m} min`;
  if (h > 0) return `${h} hr`;
  return `${m} min`;
}

export function hourLabel12(hour24: number): string {
  const h = ((hour24 % 12) + 12) % 12;
  return String(h === 0 ? 12 : h);
}
