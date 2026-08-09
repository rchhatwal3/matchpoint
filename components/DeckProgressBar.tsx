import { StyleSheet, View } from 'react-native';
import { useTheme } from '@/lib/theme';
import { progressFraction, type FetchProgress } from '@/lib/progress';

/**
 * Determinate loading bar for the restaurants deck, sitting under the card
 * skeleton while the per-location fan-out lands.
 *
 * DESIGN.md's "skeletons, never spinners" rule stands and is not weakened: the
 * skeleton still carries the load. What it cannot express is how far along the
 * fetch is, and this one knows — a cache-missing load is one edge-function call
 * per saved city. Recorded as an amendment in DESIGN.md.
 *
 * The fill steps once per location that lands, with no easing between steps:
 * each step is a real event, so there is no motion to gate on reduced motion.
 * Level 0 surface, primary fill, no elevation (Calm-Surface Rule).
 */
export function DeckProgressBar({ progress }: { progress: FetchProgress }) {
  const { colors, radii } = useTheme();
  const percent = `${Math.round(progressFraction(progress) * 100)}%` as const;

  return (
    <View
      accessibilityRole="progressbar"
      // Explicit aria-* as well: react-native-web does not map accessibilityValue
      // onto a plain View, so without these the bar announces no position at all.
      aria-valuemin={0}
      aria-valuemax={progress.total}
      aria-valuenow={progress.done}
      accessibilityLabel={`Loading restaurants, ${progress.done} of ${progress.total} locations`}
      style={[styles.track, { backgroundColor: colors.surfaceVariant, borderRadius: radii.full }]}
    >
      <View
        style={[
          styles.fill,
          { width: percent, backgroundColor: colors.primary, borderRadius: radii.full },
        ]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  track: { height: 4, width: '100%', maxWidth: 400, overflow: 'hidden' },
  fill: { height: '100%' },
});
