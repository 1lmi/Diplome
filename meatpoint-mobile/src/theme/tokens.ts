export const colors = {
  bg: "#fbf8f4",
  bgSoft: "#f6efe6",
  surface: "#fffdf9",
  surfaceStrong: "#ffffff",
  surfaceMuted: "#f4ede6",
  text: "#211a16",
  muted: "#6f6358",
  accent: "#e67a2e",
  accentHover: "#cd651e",
  accentSoft: "#f7e1cd",
  border: "#eadfd3",
  success: "#1f9d68",
  danger: "#d24a43",
  scrim: "rgba(33, 26, 22, 0.28)",
  overlay: "rgba(33, 26, 22, 0.12)",
  shadow: "rgba(62, 38, 18, 0.08)",
} as const;

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 24,
  xxxl: 32,
} as const;

export const radii = {
  sm: 10,
  md: 14,
  lg: 18,
  xl: 22,
  pill: 999,
} as const;

export const typography = {
  caption: 12,
  bodySm: 14,
  body: 15,
  titleSm: 19,
  title: 24,
  regular: "400" as const,
  medium: "500" as const,
  semibold: "600" as const,
} as const;

export const motion = {
  fast: 140,
  normal: 180,
  slow: 220,
} as const;

export const shadows = {
  card: {
    shadowColor: colors.shadow,
    shadowOpacity: 1,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 8 },
    elevation: 3,
  },
  soft: {
    shadowColor: colors.shadow,
    shadowOpacity: 1,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 5 },
    elevation: 2,
  },
} as const;

export const theme = {
  colors,
  spacing,
  radii,
  typography,
  motion,
  shadows,
} as const;

export type Theme = typeof theme;
