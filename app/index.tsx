import { useState } from 'react';
import { Redirect, useRouter } from 'expo-router';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { useTheme } from '@/lib/theme';
import { useSession } from '@/providers/SessionProvider';
import { Screen } from '@/components/Screen';
import { Text } from '@/components/Text';
import { Button } from '@/components/Button';
import { CodeDisplay } from '@/components/CodeDisplay';
import { CodeInput } from '@/components/CodeInput';

function friendlyError(message: string): string {
  if (message.includes('room_not_found')) return 'No room with that code — double-check it?';
  if (message.includes('room_full')) return 'That room already has two people.';
  return 'Something went wrong. Try again.';
}

export default function Home() {
  const { colors, spacing, radii } = useTheme();
  const router = useRouter();
  const { loading, room, offline, createRoom, joinRoom } = useSession();

  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [createdCode, setCreatedCode] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Already paired from a previous session -> straight to the lobby.
  if (!loading && room && !createdCode) {
    return <Redirect href="/lobby" />;
  }

  const canSubmit = name.trim().length > 0 && !busy;

  const handleCreate = async () => {
    setError(null);
    setBusy(true);
    try {
      const c = await createRoom(name.trim());
      setCreatedCode(c);
    } catch (e) {
      setError(friendlyError(e instanceof Error ? e.message : String(e)));
    } finally {
      setBusy(false);
    }
  };

  const handleJoin = async () => {
    setError(null);
    setBusy(true);
    try {
      await joinRoom(code, name.trim());
      router.replace('/lobby');
    } catch (e) {
      setError(friendlyError(e instanceof Error ? e.message : String(e)));
    } finally {
      setBusy(false);
    }
  };

  if (loading) {
    // Skeletons shaped like the real form — never spinners (DESIGN.md).
    return (
      <Screen>
        <View style={[styles.body, { padding: spacing['2xl'], gap: spacing.lg }]}>
          <View style={[styles.skeletonTitle, { backgroundColor: colors.skeleton, borderRadius: radii.md }]} />
          <View style={[styles.skeletonField, { backgroundColor: colors.skeleton, borderRadius: radii.md }]} />
          <View style={[styles.skeletonField, { backgroundColor: colors.skeleton, borderRadius: radii.full }]} />
        </View>
      </Screen>
    );
  }

  // Post-create: show the invite code before entering the lobby.
  if (createdCode) {
    return (
      <Screen>
        <View style={[styles.body, styles.centered, { padding: spacing['2xl'], gap: spacing['2xl'] }]}>
          <Text variant="headline" style={styles.textCenter}>
            Your room is ready
          </Text>
          <Text variant="body" color={colors.inkMuted} style={styles.textCenter}>
            Share this code with your partner so they can join.
          </Text>
          <CodeDisplay code={createdCode} />
          <Button label="Go to lobby" onPress={() => router.replace('/lobby')} style={styles.stretch} />
        </View>
      </Screen>
    );
  }

  return (
    <Screen>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.body}
      >
        <ScrollView
          contentContainerStyle={{ padding: spacing['2xl'], gap: spacing['2xl'] }}
          keyboardShouldPersistTaps="handled"
        >
          <View style={{ gap: spacing.sm, marginTop: spacing['4xl'] }}>
            <Text variant="display" color={colors.primary}>
              matchpoint
            </Text>
            <Text variant="body" color={colors.inkMuted}>
              Swipe together, match on what you both want.
            </Text>
            {offline ? (
              <Text variant="overline" color={colors.inkMuted}>
                OFFLINE DEMO MODE
              </Text>
            ) : null}
          </View>

          <View style={{ gap: spacing.sm }}>
            <Text variant="label">Your name</Text>
            <TextInput
              accessibilityLabel="Your name"
              value={name}
              onChangeText={setName}
              placeholder="e.g. Sam"
              placeholderTextColor={colors.inkMuted}
              autoCorrect={false}
              style={[
                styles.nameInput,
                {
                  backgroundColor: colors.surface,
                  color: colors.ink,
                  borderColor: colors.outline,
                  borderRadius: radii.md,
                  paddingHorizontal: spacing.xl,
                },
              ]}
            />
          </View>

          <View style={{ gap: spacing.md }}>
            <Text variant="title">Start a new room</Text>
            <Button label={busy ? 'Creating…' : 'Create room'} onPress={handleCreate} disabled={!canSubmit} />
          </View>

          <View style={[styles.divider, { backgroundColor: colors.outline }]} />

          <View style={{ gap: spacing.md }}>
            <Text variant="title">Join with a code</Text>
            <CodeInput value={code} onChangeText={setCode} />
            <Button
              label={busy ? 'Joining…' : 'Join room'}
              variant="tonal"
              onPress={handleJoin}
              disabled={!canSubmit || code.length !== 6}
            />
          </View>

          {error ? (
            <Text variant="label" color={colors.danger}>
              {error}
            </Text>
          ) : null}
        </ScrollView>
      </KeyboardAvoidingView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  body: { flex: 1 },
  centered: { justifyContent: 'center' },
  textCenter: { textAlign: 'center' },
  stretch: { alignSelf: 'stretch' },
  divider: { height: 1 },
  nameInput: { height: 56, fontSize: 16, fontFamily: 'Nunito_400Regular', borderWidth: 1 },
  skeletonTitle: { height: 40, width: '60%', marginTop: 40 },
  skeletonField: { height: 56, width: '100%' },
});
