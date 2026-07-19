import { useEffect, useState } from 'react';
import { AccessibilityInfo, useColorScheme } from 'react-native';
import {
  darkColors,
  lightColors,
  type ColorTokens,
  elevation,
  motion,
  radii,
  spacing,
  typeScale,
} from './tokens';

export type Theme = {
  scheme: 'light' | 'dark';
  colors: ColorTokens;
  spacing: typeof spacing;
  radii: typeof radii;
  typeScale: typeof typeScale;
  elevation: typeof elevation;
  motion: typeof motion;
};

/**
 * Single hook for resolved theme. Follows the OS light/dark setting via
 * useColorScheme; no provider needed since the token sets are static.
 */
export function useTheme(): Theme {
  const scheme = useColorScheme() === 'dark' ? 'dark' : 'light';
  return {
    scheme,
    colors: scheme === 'dark' ? darkColors : lightColors,
    spacing,
    radii,
    typeScale,
    elevation,
    motion,
  };
}

/** Tracks the OS "Reduce Motion" setting (maps to prefers-reduced-motion on web). */
export function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    let mounted = true;
    AccessibilityInfo.isReduceMotionEnabled().then((v) => {
      if (mounted) setReduced(v);
    });
    const sub = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduced);
    return () => {
      mounted = false;
      sub.remove();
    };
  }, []);
  return reduced;
}

export * from './tokens';
