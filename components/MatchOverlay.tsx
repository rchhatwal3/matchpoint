import { useEffect } from 'react';
import { Modal, StyleSheet, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';
import { useReducedMotion, useTheme } from '@/lib/theme';
import { useSession } from '@/providers/SessionProvider';
import { CATEGORY_EMOJI } from '@/lib/types';
import { Text } from '@/components/Text';
import { Button } from '@/components/Button';

function initialOf(name: string | undefined): string {
  return (name?.trim().charAt(0) || '?').toUpperCase();
}

/**
 * DESIGN.md §5 match reveal: raspberry-container halo, both avatars
 * (raspberry ring = you, lagoon ring = partner), single spring scale-in.
 * Reduced motion: static reveal — no confetti anywhere, ever.
 * Rendered once at the root so a match surfaces from wherever it's detected.
 */
export function MatchOverlay() {
  const { colors, radii, spacing, elevation } = useTheme();
  const reducedMotion = useReducedMotion();
  const { pendingMatch, dismissMatch, member, partner } = useSession();

  const scale = useSharedValue(reducedMotion ? 1 : 0.8);
  const animatedStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));

  useEffect(() => {
    if (!pendingMatch) return;
    if (reducedMotion) {
      scale.set(1);
      return;
    }
    scale.set(0.8);
    scale.set(withSpring(1, { damping: 14, stiffness: 180 }));
  }, [pendingMatch, reducedMotion, scale]);

  if (!pendingMatch) return null;

  return (
    <Modal transparent animationType="none" visible onRequestClose={dismissMatch}>
      <View style={[styles.scrim, { backgroundColor: colors.scrim, padding: spacing['2xl'] }]}>
        {/* Raspberry-container halo around the reveal card */}
        <View
          style={{
            backgroundColor: colors.primaryContainer,
            borderRadius: radii.xl + spacing.md,
            padding: spacing.md,
          }}
        >
          <Animated.View
            style={[
              styles.card,
              {
                backgroundColor: colors.surface,
                borderRadius: radii.xl,
                padding: spacing['3xl'],
                gap: spacing.lg,
              },
              elevation.level2,
              animatedStyle,
            ]}
          >
            <Text variant="overline" color={colors.primary}>
              IT&apos;S A MATCH
            </Text>

            {/* Avatar pair: raspberry ring = you, lagoon ring = partner */}
            <View style={[styles.avatars, { gap: spacing.md }]}>
              <View
                style={[
                  styles.avatar,
                  {
                    borderColor: colors.primary,
                    backgroundColor: colors.primaryContainer,
                    borderRadius: radii.full,
                  },
                ]}
              >
                <Text variant="title" color={colors.onPrimaryContainer}>
                  {initialOf(member?.display_name)}
                </Text>
              </View>
              <View
                style={[
                  styles.avatar,
                  {
                    borderColor: colors.secondary,
                    backgroundColor: colors.secondaryContainer,
                    borderRadius: radii.full,
                  },
                ]}
              >
                <Text variant="title" color={colors.onSecondaryContainer}>
                  {initialOf(partner?.display_name)}
                </Text>
              </View>
            </View>

            <Text style={styles.glyph} accessibilityElementsHidden>
              {CATEGORY_EMOJI[pendingMatch.category]}
            </Text>
            <Text variant="headline" style={styles.centered}>
              {pendingMatch.title}
            </Text>
            {pendingMatch.subtitle ? (
              <Text variant="body" color={colors.inkMuted} style={styles.centered}>
                {pendingMatch.subtitle}
              </Text>
            ) : null}

            <Button label="Keep swiping" onPress={dismissMatch} style={styles.cta} />
          </Animated.View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  scrim: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  card: { alignItems: 'center', maxWidth: 420, width: '100%' },
  avatars: { flexDirection: 'row', alignItems: 'center' },
  avatar: {
    width: 56,
    height: 56,
    borderWidth: 3,
    alignItems: 'center',
    justifyContent: 'center',
  },
  glyph: { fontSize: 48, lineHeight: 60 },
  centered: { textAlign: 'center' },
  cta: { alignSelf: 'stretch' },
});
