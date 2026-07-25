import { Pressable, StyleSheet, View } from 'react-native';
import { useTheme } from '@/lib/theme';
import { Text } from '@/components/Text';
import { PRICE_TIERS } from '@/lib/price-filter';

const LABEL: Record<number, string> = { 1: '$', 2: '$$', 3: '$$$', 4: '$$$$', 0: '?' };
const A11Y: Record<number, string> = {
  1: 'Price $',
  2: 'Price $$',
  3: 'Price $$$',
  4: 'Price $$$$',
  0: 'Unpriced',
};

/**
 * Compact multi-select chip row for the Restaurants deck ($ $$ $$$ $$$$ ?).
 * The trailing "?" chip is Unpriced (tier 0) — Google prices most places as
 * null, so hiding them needs an explicit toggle. Selected chips use the crimson
 * container (action = Two-Color Rule); unselected stay neutral. Targets are
 * >= 44px. Purely presentational — the deck owns the selected set + filtering.
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
      {PRICE_TIERS.map((level) => {
        const on = selected.has(level);
        return (
          <Pressable
            key={level}
            accessibilityRole="button"
            accessibilityState={{ selected: on }}
            accessibilityLabel={A11Y[level]}
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
