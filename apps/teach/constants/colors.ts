/**
 * schEDU semantic color tokens — single source of truth for every color in
 * the app. No screen should hardcode hex values; add a token here instead.
 *
 * Both palettes MUST keep an identical shape (ThemeColors is derived from it).
 * `category` is the session-type ramp shared by the calendar, library detail
 * accents, plan history triggers, and the create hub.
 */

export type CategoryTone = {
  base: string;
  soft: string;
  onSoft: string;
  border: string;
};

const lightCategory = {
  lesson: { base: "#22C55E", soft: "#DCFCE7", onSoft: "#15803D", border: "#86EFAC" },
  writtenWork: { base: "#F59E0B", soft: "#FEF3C7", onSoft: "#B45309", border: "#FCD34D" },
  performanceTask: { base: "#38BDF8", soft: "#E0F2FE", onSoft: "#0369A1", border: "#7DD3FC" },
  exam: { base: "#FB7185", soft: "#FFE4E6", onSoft: "#BE123C", border: "#FDA4AF" },
  buffer: { base: "#94A3B8", soft: "#F1F5F9", onSoft: "#475569", border: "#CBD5E1" },
} as const satisfies Record<string, CategoryTone>;

const darkCategory = {
  lesson: { base: "#4ADE80", soft: "rgba(34,197,94,0.18)", onSoft: "#86EFAC", border: "rgba(74,222,128,0.45)" },
  writtenWork: { base: "#FBBF24", soft: "rgba(245,158,11,0.18)", onSoft: "#FCD34D", border: "rgba(251,191,36,0.45)" },
  performanceTask: { base: "#7DD3FC", soft: "rgba(56,189,248,0.18)", onSoft: "#BAE6FD", border: "rgba(125,211,252,0.45)" },
  exam: { base: "#FB7185", soft: "rgba(251,113,133,0.18)", onSoft: "#FDA4AF", border: "rgba(251,113,133,0.45)" },
  buffer: { base: "#94A3B8", soft: "rgba(148,163,184,0.15)", onSoft: "#CBD5E1", border: "rgba(148,163,184,0.4)" },
} as const satisfies Record<string, CategoryTone>;

export const Colors = {
  light: {
    // surfaces
    background: "#FFFFFF",
    card: "#FFFFFF",
    surfaceAlt: "#F4F6F8",
    // text
    text: "#111827",
    mutedText: "#6B7280",
    faintText: "#9CA3AF",
    // lines
    border: "#E5E7EB",
    hairline: "#EEF1F4",
    // brand
    tint: "#22C55E",
    tintDeep: "#16A34A",
    tintSoft: "#E7F8EE",
    onTint: "#07301A",
    gradientTint: ["#22C55E", "#16A34A"] as const,
    // status
    danger: "#DC2626",
    dangerSoft: "#FEE2E2",
    warning: "#F59E0B",
    warningSoft: "#FEF3C7",
    info: "#3B82F6",
    infoSoft: "#DBEAFE",
    // chrome
    backdrop: "rgba(15,23,42,0.45)",
    shadow: "#0F172A",
    // tiers
    tierProBg: "#FEF3C7",
    tierProFg: "#B45309",
    tierMaxBg: "#DCFCE7",
    tierMaxFg: "#16A34A",
    category: lightCategory,
  },
  dark: {
    // surfaces
    background: "#0B0F14",
    card: "#111827",
    surfaceAlt: "#161F2B",
    // text
    text: "#F9FAFB",
    mutedText: "#9CA3AF",
    faintText: "#6B7280",
    // lines
    border: "#1F2937",
    hairline: "#19222E",
    // brand
    tint: "#22C55E",
    tintDeep: "#15803D",
    tintSoft: "rgba(34,197,94,0.16)",
    onTint: "#07301A",
    gradientTint: ["#22C55E", "#15803D"] as const,
    // status
    danger: "#F87171",
    dangerSoft: "rgba(239,68,68,0.16)",
    warning: "#FBBF24",
    warningSoft: "rgba(245,158,11,0.16)",
    info: "#60A5FA",
    infoSoft: "rgba(59,130,246,0.16)",
    // chrome
    backdrop: "rgba(0,0,0,0.55)",
    shadow: "#000000",
    // tiers
    tierProBg: "rgba(245,158,11,0.18)",
    tierProFg: "#FBBF24",
    tierMaxBg: "rgba(34,197,94,0.18)",
    tierMaxFg: "#4ADE80",
    category: darkCategory,
  },
} as const;

export type CategoryKey = keyof typeof lightCategory;
