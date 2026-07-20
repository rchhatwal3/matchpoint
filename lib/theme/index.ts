import { useContext, useEffect, useState } from 'react';
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
import { ThemeContext } from './ThemeProvider';

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
 * Single hook for resolved theme. Resolves the scheme from ThemeProvider
 * context (honouring an explicit light/dark preference); falls back to the OS
 * setting via useColorScheme when there's no provider or preference = system.
 * Return shape is unchanged, so no call site needs to change.
 */
export function useTheme(): Theme {
  const ctx = useContext(ThemeContext);
  const systemScheme = useColorScheme() === 'dark' ? 'dark' : 'light';
  const scheme = ctx ? ctx.scheme : systemScheme;
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
export * from './ThemeProvider';
