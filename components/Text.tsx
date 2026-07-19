import { Text as RNText, type TextProps as RNTextProps, type TextStyle } from 'react-native';
import { useTheme, type TypeVariant } from '@/lib/theme';

/** Loaded Nunito face per type-scale weight. */
const FONT_BY_WEIGHT: Record<string, string> = {
  '400': 'Nunito_400Regular',
  '600': 'Nunito_600SemiBold',
  '700': 'Nunito_700Bold',
  '800': 'Nunito_800ExtraBold',
};

export type TextProps = RNTextProps & {
  variant?: TypeVariant;
  /** Token color override; defaults to ink. */
  color?: string;
};

/** Themed text: applies the DESIGN.md type scale + matching Nunito face. */
export function Text({ variant = 'body', color, style, ...rest }: TextProps) {
  const { colors, typeScale } = useTheme();
  const t = typeScale[variant];
  const base: TextStyle = {
    fontSize: t.fontSize,
    lineHeight: t.lineHeight,
    fontFamily: FONT_BY_WEIGHT[t.fontWeight] ?? 'Nunito_400Regular',
    letterSpacing: 'letterSpacing' in t ? t.letterSpacing : undefined,
    color: color ?? colors.ink,
  };
  return <RNText style={[base, style]} {...rest} />;
}
