export const colors = {
  bg: "#fbf8f4",
  bgSoft: "#f6efe6",
  surface: "#fffdf9",
  surfaceStrong: "#ffffff",
  surfaceMuted: "#f4ede6",
  surfaceTint: "#fbf4ec",
  text: "#211a16",
  muted: "#6f6358",
  accent: "#e67a2e",
  accentHover: "#cd651e",
  accentSoft: "#f7e1cd",
  border: "#eadfd3",
  line: "rgba(234, 223, 211, 0.84)",
  success: "#1f9d68",
  danger: "#d24a43",
  scrim: "rgba(33, 26, 22, 0.28)",
  overlay: "rgba(33, 26, 22, 0.1)",
  dark: "#241d18",
  shadow: "rgba(62, 38, 18, 0.07)",
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
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 12 },
    elevation: 5,
  },
  soft: {
    shadowColor: colors.shadow,
    shadowOpacity: 1,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 8 },
    elevation: 3,
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
