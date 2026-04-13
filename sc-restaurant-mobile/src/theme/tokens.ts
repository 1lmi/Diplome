export const colors = {
  bg: "#ffffff",
  bgSoft: "#f5f7fa",
  surface: "#ffffff",
  surfaceStrong: "#ffffff",
  surfaceMuted: "#f3f5f7",
  surfaceTint: "#f8fafc",
  text: "#111827",
  muted: "#667085",
  accent: "#e67a2e",
  accentHover: "#cd651e",
  accentSoft: "#fff1e5",
  border: "#e5e7eb",
  line: "rgba(148, 163, 184, 0.22)",
  success: "#1f9d68",
  danger: "#d24a43",
  scrim: "rgba(15, 23, 42, 0.22)",
  overlay: "rgba(15, 23, 42, 0.06)",
  dark: "#0f172a",
  shadow: "rgba(15, 23, 42, 0.08)",
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
  sm: 12,
  md: 16,
  lg: 20,
  xl: 24,
  pill: 999,
} as const;

export const typography = {
  caption: 12,
  bodySm: 14,
  body: 15,
  titleSm: 20,
  title: 26,
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
    shadowOffset: { width: 0, height: 10 },
    elevation: 4,
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
