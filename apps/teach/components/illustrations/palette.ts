import { useAppTheme } from "../../context/theme";

/**
 * Shared palette for spot illustrations. Illustrations must draw ONLY from
 * these slots so every asset recolors correctly in light/dark and stays
 * within the locked art direction (brand green + small warm secondary set).
 */
export type IllustrationPalette = {
  stroke: string;
  faint: string;
  paper: string;
  shadow: string;
  green: string;
  greenDeep: string;
  greenSoft: string;
  amber: string;
  amberSoft: string;
  coral: string;
  coralSoft: string;
  sky: string;
  skySoft: string;
};

const LIGHT: IllustrationPalette = {
  stroke: "#475569",
  faint: "#CBD5E1",
  paper: "#FFFFFF",
  shadow: "#EEF2F6",
  green: "#22C55E",
  greenDeep: "#16A34A",
  greenSoft: "#DCFCE7",
  amber: "#F59E0B",
  amberSoft: "#FEF3C7",
  coral: "#FB7185",
  coralSoft: "#FFE4E6",
  sky: "#38BDF8",
  skySoft: "#E0F2FE",
};

const DARK: IllustrationPalette = {
  stroke: "#94A3B8",
  faint: "#3B4757",
  paper: "#18212C",
  shadow: "#0E141B",
  green: "#4ADE80",
  greenDeep: "#22C55E",
  greenSoft: "rgba(34,197,94,0.18)",
  amber: "#FBBF24",
  amberSoft: "rgba(245,158,11,0.18)",
  coral: "#FB7185",
  coralSoft: "rgba(251,113,133,0.18)",
  sky: "#7DD3FC",
  skySoft: "rgba(56,189,248,0.18)",
};

export function useIllustrationPalette(): IllustrationPalette {
  const { scheme } = useAppTheme();
  return scheme === "dark" ? DARK : LIGHT;
}

export type IllustrationProps = {
  /** Rendered width; height keeps the 6:5 aspect ratio. */
  size?: number;
};
