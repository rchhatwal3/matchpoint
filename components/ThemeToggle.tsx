import { Pressable, StyleSheet } from 'react-native';
import { TOUCH_TARGET, useTheme, useThemePreference, type ThemePreference } from '@/lib/theme';
import { Text } from '@/components/Text';

/** Tap order: system → light → dark → system. */
const NEXT: Record<ThemePreference, ThemePreference> = {
  system: 'light',
  light: 'dark',
  dark: 'system',
};

/** Neutral glyph per state (half / sun / moon). No accent color. */
const GLYPH: Record<ThemePreference, string> = {
  system: '◐',
  light: '☀',
  dark: '☾',
};

const LABEL: Record<ThemePreference, string> = {
  system: 'Theme: follow device. Activate to switch to light.',
  light: 'Theme: light. Activate to switch to dark.',
  dark: 'Theme: dark. Activate to switch to follow device.',
};

/**
 * Small neutral icon button that cycles the theme preference. Per DESIGN.md
 * Two-Color Rule it introduces no accent — surface fill, outline border,
 * ink glyph. Touch target = TOUCH_TARGET (48px).
 */
export function ThemeToggle() {
  const { colors, radii } = useTheme();
  const { preference, setPreference } = useThemePreference();

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={LABEL[preference]}
      onPress={() => setPreference(NEXT[preference])}
      style={[
        styles.button,
        {
          backgroundColor: colors.surface,
          borderColor: colors.outline,
          borderRadius: radii.full,
        },
      ]}
    >
      <Text variant="title" color={colors.ink}>
        {GLYPH[preference]}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    width: TOUCH_TARGET,
    height: TOUCH_TARGET,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
});
