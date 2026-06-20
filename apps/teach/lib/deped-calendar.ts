// DepEd school-year calendar anchors.
//
// The Department of Education's three-term school year follows the same shape
// every year. SY 2026-2027 — published in DepEd Order — runs June 8, 2026 to
// March 31, 2027 with terms at Jun-Aug, Sep-Nov, Dec-Mar. We hard-code the
// 26-27 anchors and provide a helper for deriving an SY label from a date.
//
// When DepEd publishes the next SY, add another entry here.

export type ISODate = string; // YYYY-MM-DD

export interface DepEdTerm {
  term_no: 1 | 2 | 3;
  label: string;
  start_date: ISODate;
  end_date: ISODate;
}

export interface DepEdSchoolYear {
  label: string; // e.g. "2026-2027"
  start_date: ISODate;
  end_date: ISODate;
  terms: [DepEdTerm, DepEdTerm, DepEdTerm];
}

export const DEPED_SCHOOL_YEARS: DepEdSchoolYear[] = [
  {
    label: "2026-2027",
    start_date: "2026-06-08",
    end_date: "2027-03-31",
    terms: [
      { term_no: 1, label: "Term 1", start_date: "2026-06-08", end_date: "2026-08-31" },
      { term_no: 2, label: "Term 2", start_date: "2026-09-01", end_date: "2026-11-30" },
      { term_no: 3, label: "Term 3", start_date: "2026-12-01", end_date: "2027-03-31" },
    ],
  },
];

// SY containing the given date, or the next upcoming SY if the date is before
// all known years. Returns null only if no SY is configured.
export function getSchoolYearForDate(date: ISODate): DepEdSchoolYear | null {
  if (DEPED_SCHOOL_YEARS.length === 0) return null;

  const current = DEPED_SCHOOL_YEARS.find(
    (sy) => date >= sy.start_date && date <= sy.end_date,
  );
  if (current) return current;

  const upcoming = DEPED_SCHOOL_YEARS.find((sy) => sy.start_date > date);
  if (upcoming) return upcoming;

  return DEPED_SCHOOL_YEARS[DEPED_SCHOOL_YEARS.length - 1];
}

export function getTermForDate(date: ISODate): { sy: DepEdSchoolYear; term: DepEdTerm } | null {
  const sy = getSchoolYearForDate(date);
  if (!sy) return null;

  const term = sy.terms.find((t) => date >= t.start_date && date <= t.end_date);
  if (!term) return null;

  return { sy, term };
}

// Default `start_date` for a new lesson plan. If today is before the next SY
// starts, anchor on the SY start. Otherwise anchor on today (mid-term join).
// Callers should still allow the teacher to override.
export function defaultPlanStart(today: ISODate): ISODate {
  const sy = getSchoolYearForDate(today);
  if (!sy) return today;
  return today < sy.start_date ? sy.start_date : today;
}

export function todayIso(): ISODate {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}
