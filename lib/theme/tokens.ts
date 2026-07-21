/**
 * matchpoint design tokens — single source of truth.
 *
 * Identity: "Flame & Iris". A decision game for two should feel like date-night
 * energy the moment it opens — warmth carried by a confident FLAME vermilion
 * primary (identity + every action + the "like" swipe) and an IRIS violet
 * SECONDARY that means one thing: the other person (their presence, their turn,
 * their half of a match). Backgrounds stay chroma-0 neutral (No-Beige Rule) so
 * card imagery, state color, and text stay legible mid-swipe.
 *
 * Material 3 role naming (primary / onPrimary / surface / surfaceVariant /
 * outline / danger ...) so mapping to native Material stays 1:1.
 *
 * Light values are verbatim from DESIGN.md frontmatter. Dark values use the
 * DESIGN.md dark set where given (bg / surface / surfaceVariant / ink /
 * inkMuted / outline / primary / primaryContainer / secondary); remaining dark
 * container + semantic pairs follow Material 3 tonal logic (container = dark
 * tone of the hue, on-container = light tone). Every text-bearing pair is
 * WCAG-AA verified (>= 4.5:1) in both schemes.
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
  surfaceVariant: '#EFEFEF',
  surfaceElevated: '#FFFFFF',
  ink: '#1A1A1A',
  inkMuted: '#5C5C5C',
  onPrimary: '#FFFFFF',
  onSecondary: '#FFFFFF',
  primary: '#CC3311',
  primaryContainer: '#FFDDD0',
  onPrimaryContainer: '#4A1400',
  secondary: '#5548C8',
  secondaryContainer: '#E4E0FF',
  onSecondaryContainer: '#211066',
  outline: '#D9D9D9',
  outlineStrong: '#BDBDBD',
  success: '#1E7A3D',
  onSuccess: '#FFFFFF',
  successContainer: '#E3F6E8',
  onSuccessContainer: '#0E4021',
  danger: '#C21A1A',
  onDanger: '#FFFFFF',
  dangerContainer: '#FFDAD5',
  onDangerContainer: '#410100',
  scrim: 'rgba(0,0,0,0.45)',
  skeleton: '#ECECEC',
};

export const darkColors: ColorTokens = {
  bg: '#141414',
  surface: '#1F1F1F',
  surfaceVariant: '#2A2A2A',
  surfaceElevated: '#2A2A2A',
  ink: '#F2F2F2',
  inkMuted: '#ABABAB',
  onPrimary: '#4A1400',
  onSecondary: '#1B0A57',
  primary: '#FF8A66',
  primaryContainer: '#8A2408',
  onPrimaryContainer: '#FFDDD0',
  secondary: '#B7ADFF',
  secondaryContainer: '#382A9E',
  onSecondaryContainer: '#E4E0FF',
  outline: '#444444',
  outlineStrong: '#5E5E5E',
  success: '#6CC17D',
  onSuccess: '#0E3316',
  successContainer: '#123D22',
  onSuccessContainer: '#CDEBD1',
  danger: '#FFB4AB',
  onDanger: '#3A0A06',
  dangerContainer: '#8C1D14',
  onDangerContainer: '#FFDAD5',
  scrim: 'rgba(0,0,0,0.6)',
  skeleton: '#2C2C2C',
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
 * Type scale (DESIGN.md typography — Flame & Iris pairing). Sizes are unitless
 * (RN = sp, scales with the OS font-size setting). lineHeight is absolute for
 * predictable rhythm. `fontFamily` names the exact loaded face and is consumed
 * internally by components/Text.tsx: FRAUNCES (serif) carries display moments
 * only (wordmark, screen titles, "IT'S A MATCH"); FIGTREE (sans) carries all
 * title/body/label/overline UI text. The public Text API is unchanged.
 */
export const typeScale = {
  display: { fontSize: 40, lineHeight: 46, fontWeight: '700', letterSpacing: -0.5, fontFamily: 'Fraunces_700Bold' },
  headline: { fontSize: 28, lineHeight: 34, fontWeight: '600', fontFamily: 'Fraunces_600SemiBold' },
  title: { fontSize: 18, lineHeight: 24, fontWeight: '600', fontFamily: 'Figtree_600SemiBold' },
  body: { fontSize: 16, lineHeight: 24, fontWeight: '400', fontFamily: 'Figtree_400Regular' },
  label: { fontSize: 14, lineHeight: 20, fontWeight: '600', fontFamily: 'Figtree_600SemiBold' },
  overline: { fontSize: 12, lineHeight: 16, fontWeight: '600', letterSpacing: 0.6, fontFamily: 'Figtree_600SemiBold' },
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
