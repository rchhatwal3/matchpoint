import { Pressable, StyleSheet, View } from 'react-native';
import { useTheme } from '@/lib/theme';
import { Text } from '@/components/Text';

/**
 * Pill for the locations multiselect. Two roles:
 * - toggle (metro list): `selected` fills raspberry, unselected is outlined.
 * - removable (your locations): pass `onRemove` to show a ✕ affordance.
 */
export function LocationChip({
  label,
  selected = false,
  onPress,
  onRemove,
}: {
  label: string;
  selected?: boolean;
  onPress?: () => void;
  onRemove?: () => void;
}) {
  const { colors, radii, spacing } = useTheme();
  const bg = selected ? colors.primary : colors.surface;
  const ink = selected ? colors.onPrimary : colors.ink;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected }}
      accessibilityLabel={onRemove ? `Remove ${label}` : label}
      onPress={onRemove ?? onPress}
      style={[
        styles.chip,
        {
          backgroundColor: bg,
          borderRadius: radii.full,
          borderWidth: 1,
          borderColor: selected ? colors.primary : colors.outline,
          paddingHorizontal: spacing.lg,
          gap: spacing.xs,
        },
      ]}
    >
      <Text variant="label" color={ink}>
        {label}
      </Text>
      {onRemove ? (
        <View accessibilityElementsHidden>
          <Text variant="label" color={ink}>
            ✕
          </Text>
        </View>
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  chip: {
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
});
