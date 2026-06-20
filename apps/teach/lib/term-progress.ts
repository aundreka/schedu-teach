// Helpers for computing where a teacher is *within* a lesson plan today —
// "Week 4 of Term 1", "Term 2 of 3", etc. Used by the home dashboard pill and
// plan_detail.

import type { ISODate } from "./deped-calendar";

export interface PlanLike {
  start_date: ISODate;
  end_date: ISODate;
  effective_start_date?: ISODate | null;
}

export interface TermLike {
  term_no: number;
  label?: string | null;
  start_date: ISODate;
  end_date: ISODate;
}

export interface WeekOfTerm {
  term: TermLike;
  week_no: number;
  total_weeks: number;
}

function diffDays(later: ISODate, earlier: ISODate): number {
  const toUtc = (d: ISODate) => {
    const [y, m, day] = d.split("-").map(Number);
    return Date.UTC(y, m - 1, day);
  };
  return Math.floor((toUtc(later) - toUtc(earlier)) / 86400000);
}

export function getCurrentTerm(terms: TermLike[], today: ISODate): TermLike | null {
  return terms.find((t) => today >= t.start_date && today <= t.end_date) ?? null;
}

export function getWeekOfTerm(term: TermLike, today: ISODate): WeekOfTerm | null {
  if (today < term.start_date) return null;

  const clampedToday = today > term.end_date ? term.end_date : today;
  const daysIn = diffDays(clampedToday, term.start_date);
  const totalDays = diffDays(term.end_date, term.start_date) + 1;
  const week_no = Math.floor(daysIn / 7) + 1;
  const total_weeks = Math.ceil(totalDays / 7);

  return { term, week_no, total_weeks };
}

// Format the pill text: "Week 4 of Term 1" / "Term 1 starts soon" / "School year complete".
export function formatTermProgress(
  terms: TermLike[],
  today: ISODate,
): string | null {
  if (terms.length === 0) return null;

  const current = getCurrentTerm(terms, today);
  if (current) {
    const wot = getWeekOfTerm(current, today);
    const termLabel = current.label?.trim() || `Term ${current.term_no}`;
    if (!wot) return termLabel;
    return `Week ${wot.week_no} of ${termLabel}`;
  }

  const next = terms.find((t) => today < t.start_date);
  if (next) {
    const days = diffDays(next.start_date, today);
    const termLabel = next.label?.trim() || `Term ${next.term_no}`;
    if (days <= 0) return `${termLabel} starts today`;
    if (days === 1) return `${termLabel} starts tomorrow`;
    if (days <= 14) return `${termLabel} starts in ${days} days`;
    return null;
  }

  return null;
}

// True when the plan's start date is already in the past — i.e. the teacher
// is onboarding mid-term and the wizard should offer the "I've started already"
// branch.
export function isPlanInPast(plan: PlanLike, today: ISODate): boolean {
  const floor = plan.effective_start_date ?? plan.start_date;
  return today > floor;
}
