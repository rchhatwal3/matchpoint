import { Redirect, useRouter } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useTheme } from '@/lib/theme';
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
      <ScrollView contentContainerStyle={{ padding: spacing['2xl'], gap: spacing['3xl'] }}>
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
                padding: spacing.lg,
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

        {/* Category picker — the screen's primary action, a 2-up tile grid */}
        <View style={{ gap: spacing.md }}>
          <Text variant="title">Pick a category</Text>
          <View style={[styles.grid, { gap: spacing.md }]}>
            {CATEGORIES.map((c) => (
              <Pressable
                key={c}
                accessibilityRole="button"
                accessibilityLabel={`Swipe ${CATEGORY_LABELS[c]}`}
                onPress={() => router.push(`/swipe/${c}`)}
                style={({ pressed }) => [
                  styles.tile,
                  {
                    backgroundColor: pressed ? colors.primaryContainer : colors.surface,
                    borderRadius: radii.lg,
                    borderWidth: 1,
                    borderColor: pressed ? colors.primaryContainer : colors.outline,
                    padding: spacing.md,
                    gap: spacing.sm,
                  },
                ]}
              >
                {({ pressed }) => (
                  <>
                    <Text style={styles.tileGlyph} accessibilityElementsHidden>
                      {CATEGORY_EMOJI[c]}
                    </Text>
                    <Text variant="label" color={pressed ? colors.onPrimaryContainer : colors.ink}>
                      {CATEGORY_LABELS[c]}
                    </Text>
                  </>
                )}
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
  grid: { flexDirection: 'row', flexWrap: 'wrap' },
  tile: {
    flexGrow: 1,
    flexBasis: '45%',
    minHeight: 72,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tileGlyph: { fontSize: 26, lineHeight: 32 },
});
