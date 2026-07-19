import { Redirect, useRouter } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { TOUCH_TARGET, useTheme } from '@/lib/theme';
import { useSession } from '@/providers/SessionProvider';
import { CATEGORIES, CATEGORY_EMOJI, CATEGORY_LABELS } from '@/lib/types';
import { Screen } from '@/components/Screen';
import { Text } from '@/components/Text';
import { Button } from '@/components/Button';
import { CodeDisplay } from '@/components/CodeDisplay';

export default function Lobby() {
  const { colors, spacing, radii } = useTheme();
  const router = useRouter();
  const { loading, room, member, partner, offline } = useSession();

  if (!loading && !room) {
    return <Redirect href="/" />;
  }

  return (
    <Screen>
      <ScrollView contentContainerStyle={{ padding: spacing['2xl'], gap: spacing['2xl'] }}>
        <View style={{ gap: spacing.xs }}>
          <Text variant="headline">
            {member ? `Hey, ${member.display_name}` : 'Lobby'}
          </Text>
          {offline ? (
            <Text variant="overline" color={colors.inkMuted}>
              OFFLINE DEMO MODE
            </Text>
          ) : null}
        </View>

        {/* Partner presence — lagoon is the partner's color (DESIGN.md) */}
        {partner ? (
          <View
            style={[
              styles.presenceRow,
              {
                backgroundColor: colors.surface,
                borderRadius: radii.lg,
                borderWidth: 1,
                borderColor: colors.outline,
                padding: spacing.lg,
                gap: spacing.md,
              },
            ]}
          >
            <View style={[styles.dot, { backgroundColor: colors.secondary, borderRadius: radii.full }]} />
            <Text variant="title">{partner.display_name} is here</Text>
          </View>
        ) : (
          <View
            style={[
              styles.waiting,
              {
                backgroundColor: colors.secondaryContainer,
                borderRadius: radii.lg,
                padding: spacing.xl,
                gap: spacing.sm,
              },
            ]}
          >
            <View style={[styles.presenceRow, { gap: spacing.md }]}>
              <View style={[styles.dot, { backgroundColor: colors.secondary, borderRadius: radii.full }]} />
              <Text variant="title" color={colors.onSecondaryContainer}>
                Waiting on your partner
              </Text>
            </View>
            <Text variant="body" color={colors.onSecondaryContainer}>
              {offline
                ? 'Offline mode is solo — matches need a live room.'
                : 'Send them the room code below. You can start swiping meanwhile.'}
            </Text>
            {room && !offline ? <CodeDisplay code={room.code} /> : null}
          </View>
        )}

        {/* Category chips */}
        <View style={{ gap: spacing.md }}>
          <Text variant="title">Pick a category</Text>
          <View style={[styles.chips, { gap: spacing.md }]}>
            {CATEGORIES.map((c) => (
              <Pressable
                key={c}
                accessibilityRole="button"
                accessibilityLabel={`Swipe ${CATEGORY_LABELS[c]}`}
                onPress={() => router.push(`/swipe/${c}`)}
                style={[
                  styles.chip,
                  {
                    backgroundColor: colors.surfaceVariant,
                    borderRadius: radii.full,
                    paddingHorizontal: spacing.lg,
                    gap: spacing.sm,
                  },
                ]}
              >
                <Text accessibilityElementsHidden>{CATEGORY_EMOJI[c]}</Text>
                <Text variant="label">{CATEGORY_LABELS[c]}</Text>
              </Pressable>
            ))}
          </View>
        </View>

        <Button label="See your matches" variant="tonal" onPress={() => router.push('/matches')} />
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  presenceRow: { flexDirection: 'row', alignItems: 'center' },
  waiting: { alignItems: 'stretch' },
  dot: { width: 12, height: 12 },
  chips: { flexDirection: 'row', flexWrap: 'wrap' },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: TOUCH_TARGET,
  },
});
