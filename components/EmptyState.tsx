import { StyleSheet, View } from 'react-native';
import { useTheme } from '@/lib/theme';
import { Text } from '@/components/Text';
import { Button } from '@/components/Button';

export type EmptyStateProps = {
  icon: string;
  title: string;
  message: string;
  /** Lagoon styling for "waiting on partner" states (DESIGN.md §5). */
  tone?: 'primary' | 'partner';
  ctaLabel?: string;
  onCtaPress?: () => void;
};

/**
 * DESIGN.md empty/waiting state: container icon badge + title + one sentence
 * + optional CTA. Partner-waiting states use lagoon.
 */
export function EmptyState({ icon, title, message, tone = 'primary', ctaLabel, onCtaPress }: EmptyStateProps) {
  const { colors, spacing, radii } = useTheme();
  const badgeBg = tone === 'partner' ? colors.secondaryContainer : colors.primaryContainer;
  const badgeInk = tone === 'partner' ? colors.onSecondaryContainer : colors.onPrimaryContainer;

  return (
    <View style={[styles.wrap, { padding: spacing['3xl'], gap: spacing.lg }]}>
      <View
        style={[
          styles.badge,
          { backgroundColor: badgeBg, borderRadius: radii.full },
        ]}
      >
        <Text style={styles.icon} color={badgeInk} accessibilityElementsHidden>
          {icon}
        </Text>
      </View>
      <Text variant="title" style={styles.centered}>
        {title}
      </Text>
      <Text variant="body" color={colors.inkMuted} style={styles.centered}>
        {message}
      </Text>
      {ctaLabel && onCtaPress ? (
        <Button label={ctaLabel} variant="tonal" onPress={onCtaPress} style={{ marginTop: spacing.sm }} />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'center', justifyContent: 'center' },
  badge: { width: 72, height: 72, alignItems: 'center', justifyContent: 'center' },
  icon: { fontSize: 32, lineHeight: 40 },
  centered: { textAlign: 'center' },
});
