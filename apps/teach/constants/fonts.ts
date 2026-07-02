export const FontFamilies = {
  regular: "System",
  medium: "System",
  semibold: "System",
  bold: "System",
  monospace: "Courier New",
} as const;

export const FontWeights = {
  regular: "400",
  medium: "500",
  semibold: "600",
  bold: "700",
  heavy: "800",
} as const;

export const FontSizes = {
  display: 28,
  h1: 24,
  h2: 20,
  h3: 17,
  body: 15,
  bodySm: 13,
  caption: 12,
  label: 11,
} as const;

export const LineHeights = {
  display: 34,
  h1: 30,
  h2: 26,
  h3: 23,
  body: 21,
  bodySm: 18,
  caption: 16,
  label: 14,
} as const;

export const LetterSpacing = {
  display: -0.3,
  h1: -0.2,
  h2: -0.15,
  h3: 0,
  body: 0,
  bodySm: 0,
  caption: 0.1,
  label: 0.8,
} as const;

export const Spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 24,
  xxxl: 32,
} as const;

export const Radius = {
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  round: 999,
} as const;

type TypeStyle = {
  fontFamily: string;
  fontWeight: (typeof FontWeights)[keyof typeof FontWeights];
  fontSize: number;
  lineHeight: number;
  letterSpacing: number;
};

function style(
  size: keyof typeof FontSizes,
  family: keyof typeof FontFamilies,
  weight: keyof typeof FontWeights
): TypeStyle {
  return {
    fontFamily: FontFamilies[family],
    fontWeight: FontWeights[weight],
    fontSize: FontSizes[size],
    lineHeight: LineHeights[size],
    letterSpacing: LetterSpacing[size],
  };
}

/**
 * The full type scale. Use these instead of raw fontSize values.
 * `label` is the uppercase kicker style — pair with `textTransform: "uppercase"`.
 */
export const Typography = {
  display: style("display", "bold", "heavy"),
  h1: style("h1", "bold", "bold"),
  h2: style("h2", "semibold", "semibold"),
  h3: style("h3", "semibold", "semibold"),
  body: style("body", "regular", "regular"),
  bodyMedium: { ...style("body", "medium", "medium") },
  bodySm: style("bodySm", "regular", "regular"),
  caption: style("caption", "regular", "regular"),
  label: style("label", "semibold", "bold"),
} as const;
