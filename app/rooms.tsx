import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useTheme } from '@/lib/theme';
import { useSession } from '@/providers/SessionProvider';
import { Screen } from '@/components/Screen';
import { Text } from '@/components/Text';
import { Button } from '@/components/Button';
import { CodeDisplay } from '@/components/CodeDisplay';
import type { RoomSummary } from '@/lib/rooms';

export default function Rooms() {
  const { colors, spacing, radii } = useTheme();
  const router = useRouter();
  const { rooms, loading, setActiveRoom, refreshRooms, leaveRoom } = useSession();
  const [confirmLeave, setConfirmLeave] = useState<string | null>(null);

  // Realtime only keeps the active room current, so re-read the list each time
  // this screen is shown: a partner may have joined, or matches landed, meanwhile.
  // The list already on screen stays until the fresh one replaces it.
  useFocusEffect(
    useCallback(() => {
      if (loading) return;
      refreshRooms().catch((e) => console.warn('rooms refresh failed', e));
    }, [loading, refreshRooms]),
  );

  const open = async (summary: RoomSummary) => {
    await setActiveRoom(summary.room.id);
    router.push('/lobby');
  };

  return (
    <Screen>
      <ScrollView contentContainerStyle={{ padding: spacing['2xl'], gap: spacing['2xl'] }}>
        <Text variant="headline">Your rooms</Text>

        {!loading && rooms.length === 0 ? (
          <View style={{ gap: spacing.md }}>
            <Text variant="body" color={colors.inkMuted}>
              You&apos;re not in a room yet. Create one and share the code, or join with a code
              someone sent you.
            </Text>
            <Button label="New room" variant="filled" onPress={() => router.push('/?new=1')} />
          </View>
        ) : null}

        {!loading && rooms.map((summary) => (
          <View
            key={summary.room.id}
            style={{
              backgroundColor: colors.surface,
              borderRadius: radii.lg,
              borderWidth: 1,
              borderColor: colors.outline,
              padding: spacing.lg,
              gap: spacing.md,
            }}
          >
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={
                summary.partnerName
                  ? `Open your room with ${summary.partnerName}`
                  : `Open your room ${summary.room.code}, nobody has joined yet`
              }
              onPress={() => open(summary)}
              style={{ gap: spacing.xs }}
            >
              {summary.partnerName ? (
                <>
                  <View style={[styles.row, { gap: spacing.md }]}>
                    <View
                      style={[styles.dot, { backgroundColor: colors.secondary, borderRadius: radii.full }]}
                    />
                    <Text variant="title">{summary.partnerName}</Text>
                  </View>
                  <Text variant="body" color={colors.inkMuted}>
                    {summary.room.locations.length > 0
                      ? summary.room.locations.join(' · ')
                      : 'No cities saved yet'}
                  </Text>
                  <Text variant="body" color={colors.inkMuted}>
                    {summary.matchCount === 1 ? '1 match' : `${summary.matchCount} matches`}
                  </Text>
                </>
              ) : (
                <Text variant="title">Waiting for someone to join</Text>
              )}
            </Pressable>

            {/* The state that silently swallowed 80 swipes on 2026-09-09: a room
                nobody joined looked identical to a working one. The code lives
                here, on the list, so it is visible without entering the room. */}
            {summary.partnerName === null ? (
              <View
                style={{
                  backgroundColor: colors.secondaryContainer,
                  borderRadius: radii.lg,
                  padding: spacing.lg,
                  gap: spacing.sm,
                }}
              >
                <Text variant="body" color={colors.onSecondaryContainer}>
                  Matches need two people. Send them this code — you can swipe meanwhile, and your
                  likes will be waiting.
                </Text>
                <CodeDisplay code={summary.room.code} />
              </View>
            ) : null}

            {confirmLeave === summary.room.id ? (
              <View style={{ gap: spacing.sm }}>
                <Text variant="body" color={colors.danger}>
                  Leaving deletes your swipes in this room. Matches you already made stay with
                  {summary.partnerName ? ` ${summary.partnerName}` : ' your partner'}. If nobody else
                  is left, the room is deleted.
                </Text>
                <Button
                  label="Leave this room"
                  variant="outlined"
                  onPress={() => {
                    leaveRoom(summary.room.id)
                      .then(() => setConfirmLeave(null))
                      .catch((e) => console.warn('leaveRoom failed', e));
                  }}
                />
                <Button label="Cancel" variant="outlined" onPress={() => setConfirmLeave(null)} />
              </View>
            ) : (
              <Button
                label="Leave"
                variant="outlined"
                onPress={() => setConfirmLeave(summary.room.id)}
              />
            )}
          </View>
        ))}

        {rooms.length > 0 ? (
          <Button label="New room" variant="tonal" onPress={() => router.push('/?new=1')} />
        ) : null}
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center' },
  dot: { width: 12, height: 12 },
});
