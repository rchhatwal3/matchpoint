import { Pressable, StyleSheet, View } from 'react-native';
import { useTheme } from '@/lib/theme';
import { Text } from '@/components/Text';

export const PRICE_LEVELS = [1, 2, 3, 4] as const;
const LABEL: Record<number, string> = { 1: '$', 2: '$$', 3: '$$$', 4: '$$$$' };

/**
 * Compact multi-select chip row for the Restaurants deck ($ $$ $$$ $$$$).
 * Selected chips use the crimson container (action = Two-Color Rule); unselected
 * stay neutral. Targets are >= 44px. Purely presentational — the deck owns the
 * selected set and the client-side filtering.
 */
export function PriceFilter({
  selected,
  onToggle,
}: {
  selected: Set<number>;
  onToggle: (level: number) => void;
}) {
  const { colors, spacing, radii } = useTheme();
  return (
    <View style={[styles.row, { paddingHorizontal: spacing['2xl'], gap: spacing.sm }]}>
      {PRICE_LEVELS.map((level) => {
        const on = selected.has(level);
        return (
          <Pressable
            key={level}
            accessibilityRole="button"
            accessibilityState={{ selected: on }}
            accessibilityLabel={`Price ${LABEL[level]}`}
            onPress={() => onToggle(level)}
            style={[
              styles.chip,
              {
                borderRadius: radii.full,
                paddingHorizontal: spacing.lg,
                backgroundColor: on ? colors.primaryContainer : colors.surfaceVariant,
                borderWidth: 1,
                borderColor: on ? colors.primary : colors.outline,
              },
            ]}
          >
            <Text variant="label" color={on ? colors.onPrimaryContainer : colors.inkMuted}>
              {LABEL[level]}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center' },
  chip: { minHeight: 44, minWidth: 44, alignItems: 'center', justifyContent: 'center' },
});
