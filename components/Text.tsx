import { Text as RNText, type TextProps as RNTextProps, type TextStyle } from 'react-native';
import { useTheme, type TypeVariant } from '@/lib/theme';

export type TextProps = RNTextProps & {
  variant?: TypeVariant;
  /** Token color override; defaults to ink. */
  color?: string;
};

/**
 * Themed text: applies the DESIGN.md type scale + its loaded face. Fraunces
 * (serif) resolves for display/headline; Figtree (sans) for everything else —
 * the face is carried on each type-scale variant's `fontFamily`.
 */
export function Text({ variant = 'body', color, style, ...rest }: TextProps) {
  const { colors, typeScale } = useTheme();
  const t = typeScale[variant];
  const base: TextStyle = {
    fontSize: t.fontSize,
    lineHeight: t.lineHeight,
    fontFamily: t.fontFamily,
    letterSpacing: 'letterSpacing' in t ? t.letterSpacing : undefined,
    color: color ?? colors.ink,
  };
  return <RNText style={[base, style]} {...rest} />;
}
