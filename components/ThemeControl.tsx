import { Pressable, StyleSheet, View } from 'react-native';
import { TOUCH_TARGET, useTheme, useThemePreference, type ThemePreference } from '@/lib/theme';
import { Text } from '@/components/Text';

const OPTIONS: { value: ThemePreference; label: string }[] = [
  { value: 'system', label: 'System' },
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
];

/**
 * System / Light / Dark segmented control for the Appearance section.
 * Selected segment fills the primary container (Two-Color Rule); everything
 * else stays neutral.
 */
export function ThemeControl() {
  const { colors, radii, spacing } = useTheme();
  const { preference, setPreference } = useThemePreference();

  return (
    <View
      accessibilityRole="radiogroup"
      style={[
        styles.track,
        { backgroundColor: colors.surfaceVariant, borderRadius: radii.full, padding: spacing.xs },
      ]}
    >
      {OPTIONS.map(({ value, label }) => {
        const selected = preference === value;
        return (
          <Pressable
            key={value}
            accessibilityRole="radio"
            accessibilityState={{ selected }}
            accessibilityLabel={label}
            onPress={() => setPreference(value)}
            style={[
              styles.segment,
              { backgroundColor: selected ? colors.primaryContainer : 'transparent', borderRadius: radii.full },
            ]}
          >
            <Text variant="label" color={selected ? colors.onPrimaryContainer : colors.inkMuted}>
              {label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  track: { flexDirection: 'row' },
  segment: { flex: 1, minHeight: TOUCH_TARGET, alignItems: 'center', justifyContent: 'center' },
});
