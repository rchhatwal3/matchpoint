/**
 * matchpoint design tokens — single source of truth.
 *
 * Identity: "Raspberry & Lagoon". A decision game for two should feel like
 * date-night energy the moment it opens — warmth carried by a confident
 * RASPBERRY primary (identity + every action + the "like" swipe) and a LAGOON
 * teal SECONDARY that means one thing: the other person (their presence, their
 * turn, their half of a match). Backgrounds stay near-neutral (No-Beige Rule)
 * so card imagery, state color, and text stay legible mid-swipe.
 *
 * Material 3 role naming (primary / onPrimary / surface / surfaceVariant /
 * outline / danger ...) so mapping to native Material stays 1:1.
 *
 * Light values are verbatim from DESIGN.md frontmatter. Dark values use the
 * DESIGN.md dark set where given (bg / surface / surfaceVariant / ink /
 * inkMuted / outline / primary / primaryContainer / secondary); remaining dark
 * container + semantic pairs follow Material 3 tonal logic (container = dark
 * tone of the hue, on-container = light tone).
 */

export type ColorTokens = {
  // Surfaces
  bg: string;
  surface: string;
  surfaceVariant: string;
  surfaceElevated: string;
  // Text / icon ink
  ink: string;
  inkMuted: string;
  onPrimary: string;
  onSecondary: string;
  // Brand
  primary: string;
  primaryContainer: string;
  onPrimaryContainer: string;
  secondary: string;
  secondaryContainer: string;
  onSecondaryContainer: string;
  // Lines
  outline: string;
  outlineStrong: string;
  // Semantic — success (matched badge only)
  success: string;
  onSuccess: string;
  successContainer: string;
  onSuccessContainer: string;
  // Semantic — danger (destructive)
  danger: string;
  onDanger: string;
  dangerContainer: string;
  onDangerContainer: string;
  // Misc
  scrim: string;
  skeleton: string;
};

export const lightColors: ColorTokens = {
  bg: '#FAFAFA',
  surface: '#FFFFFF',
  surfaceVariant: '#F0EFED',
  surfaceElevated: '#FFFFFF',
  ink: '#1C1B1A',
  inkMuted: '#5B5854',
  onPrimary: '#FFFFFF',
  onSecondary: '#FFFFFF',
  primary: '#C2314F',
  primaryContainer: '#FFD9DF',
  onPrimaryContainer: '#5C0A1F',
  secondary: '#2E6B7A',
  secondaryContainer: '#CDE9F0',
  onSecondaryContainer: '#0B3A45',
  outline: '#D8D5D0',
  outlineStrong: '#B9B5AF',
  success: '#1E7A3D',
  onSuccess: '#FFFFFF',
  successContainer: '#E6F7EA',
  onSuccessContainer: '#0F4022',
  danger: '#B3261E',
  onDanger: '#FFFFFF',
  dangerContainer: '#FFDAD6',
  onDangerContainer: '#410002',
  scrim: 'rgba(0,0,0,0.45)',
  skeleton: '#ECEAE7',
};

export const darkColors: ColorTokens = {
  bg: '#151312',
  surface: '#211E1C',
  surfaceVariant: '#2A2622',
  surfaceElevated: '#2A2622',
  ink: '#F2F0ED',
  inkMuted: '#B8B3AC',
  onPrimary: '#5C0A1F',
  onSecondary: '#0B3A45',
  primary: '#F08CA1',
  primaryContainer: '#6B1230',
  onPrimaryContainer: '#FFD9DF',
  secondary: '#8CC5D4',
  secondaryContainer: '#0E3B47',
  onSecondaryContainer: '#CDE9F0',
  outline: '#46413B',
  outlineStrong: '#5F5A53',
  success: '#6CC17D',
  onSuccess: '#0F3316',
  successContainer: '#123D22',
  onSuccessContainer: '#CDEBD1',
  danger: '#FFB4AB',
  onDanger: '#3A0A06',
  dangerContainer: '#8C1D14',
  onDangerContainer: '#FFDAD6',
  scrim: 'rgba(0,0,0,0.6)',
  skeleton: '#2C2825',
};

/** 4dp base spacing scale (DESIGN.md). */
export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  '2xl': 24,
  '3xl': 32,
  '4xl': 40,
} as const;

/** Corner radii (DESIGN.md). `full` = pill. */
export const radii = {
  xs: 6,
  sm: 8,
  md: 10,
  lg: 16,
  xl: 24,
  full: 999,
} as const;

/**
 * Type scale (DESIGN.md typography — Nunito family). Sizes are unitless
 * (RN = sp, scales with the OS font-size setting). lineHeight is absolute for
 * predictable rhythm. fontFamily is applied per-component from the loaded
 * Nunito weights, not baked in here.
 */
export const typeScale = {
  display: { fontSize: 40, lineHeight: 46, fontWeight: '800', letterSpacing: -0.5 },
  headline: { fontSize: 28, lineHeight: 34, fontWeight: '700' },
  title: { fontSize: 18, lineHeight: 24, fontWeight: '600' },
  body: { fontSize: 16, lineHeight: 24, fontWeight: '400' },
  label: { fontSize: 14, lineHeight: 20, fontWeight: '600' },
  overline: { fontSize: 12, lineHeight: 16, fontWeight: '600', letterSpacing: 0.6 },
} as const;

export type TypeVariant = keyof typeof typeScale;

/**
 * Elevation (DESIGN.md §4 — Calm-Surface Rule). Android reads `elevation`;
 * iOS/web read the shadow props. Level 1 = resting cards; Level 2 = the single
 * active swipe card only.
 */
export const elevation = {
  level0: {},
  level1: {
    elevation: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 3,
  },
  level2: {
    elevation: 3,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.12,
    shadowRadius: 16,
  },
} as const;

/** Motion tokens. Durations in ms; ease-out for confident deceleration. */
export const motion = {
  duration: { fast: 120, base: 200, slow: 320 },
  stagger: 45,
  staggerCap: 8,
} as const;

/** Minimum touch target (dp) — every interactive element >= this. */
export const TOUCH_TARGET = 48;
