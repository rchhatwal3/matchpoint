// app/account.tsx
import { useState } from 'react';
import { useRouter } from 'expo-router';
import { ScrollView, TextInput, View } from 'react-native';
import { useTheme } from '@/lib/theme';
import { useAuth } from '@/providers/AuthProvider';
import { authView, isValidEmail, isValidCode } from '@/lib/auth-logic';
import { Screen } from '@/components/Screen';
import { Header } from '@/components/Header';
import { Button } from '@/components/Button';
import { Text } from '@/components/Text';

export default function Account() {
  const { colors, spacing, radii } = useTheme();
  const router = useRouter();
  const { email, isAnonymous, enabled, sendUpgradeCode, sendSignInCode, verifyCode, signOut } =
    useAuth();

  const [mode, setMode] = useState<'upgrade' | 'signin'>('upgrade');
  const [emailInput, setEmailInput] = useState('');
  const [code, setCode] = useState('');
  const [codeSent, setCodeSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const view = authView({ isAnonymous, email, codeSent });

  const inputStyle = {
    backgroundColor: colors.surface,
    borderRadius: radii.md,
    padding: spacing.md,
    color: colors.ink,
  };

  const run = async (fn: () => Promise<void>) => {
    setError(null);
    setBusy(true);
    try {
      await fn();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong. Try again.');
    } finally {
      setBusy(false);
    }
  };

  const sendCode = () =>
    run(async () => {
      if (mode === 'upgrade') await sendUpgradeCode(emailInput);
      else await sendSignInCode(emailInput);
      setCodeSent(true);
    });

  const verify = () =>
    run(async () => {
      await verifyCode(emailInput, code, mode === 'upgrade' ? 'email_change' : 'email');
      setCodeSent(false);
      setCode('');
    });

  return (
    <Screen>
      <Header title="Account" onBack={() => router.back()} />
      <ScrollView contentContainerStyle={{ padding: spacing['2xl'], gap: spacing['2xl'] }}>
        {!enabled ? (
          <Text variant="body" color={colors.inkMuted}>
            Accounts are unavailable in offline demo mode.
          </Text>
        ) : view === 'permanent' ? (
          <View style={{ gap: spacing.lg }}>
            <Text variant="body">Signed in as</Text>
            <Text variant="title">{email}</Text>
            <Button
              label="Sign out"
              variant="outlined"
              disabled={busy}
              onPress={() => run(signOut)}
            />
          </View>
        ) : view === 'code-sent' ? (
          <View style={{ gap: spacing.lg }}>
            <Text variant="body" color={colors.inkMuted}>
              Enter the 6-digit code we emailed to {emailInput}.
            </Text>
            <TextInput
              style={inputStyle}
              value={code}
              onChangeText={setCode}
              placeholder="123456"
              placeholderTextColor={colors.inkMuted}
              keyboardType="number-pad"
              maxLength={6}
              autoFocus
            />
            <Button label="Verify" disabled={busy || !isValidCode(code)} onPress={verify} />
            <Button
              label="Use a different email"
              variant="outlined"
              disabled={busy}
              onPress={() => {
                setCodeSent(false);
                setCode('');
              }}
            />
          </View>
        ) : (
          <View style={{ gap: spacing.lg }}>
            <Text variant="body" color={colors.inkMuted}>
              {mode === 'upgrade'
                ? 'Add your email to save your account so you never lose your room and matches.'
                : 'Sign in with the email you saved to restore your room on this device.'}
            </Text>
            {mode === 'upgrade' ? (
              <View
                style={{
                  backgroundColor: colors.surface,
                  borderRadius: radii.md,
                  padding: spacing.md,
                }}
              >
                <Text variant="body" color={colors.inkMuted}>
                  Your email is the only key to this account. If you lose access to it, your room
                  and matches can&apos;t be recovered yet.
                </Text>
              </View>
            ) : null}
            <TextInput
              style={inputStyle}
              value={emailInput}
              onChangeText={setEmailInput}
              placeholder="you@example.com"
              placeholderTextColor={colors.inkMuted}
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
            />
            <Button
              label="Send code"
              disabled={busy || !isValidEmail(emailInput.trim().toLowerCase())}
              onPress={sendCode}
            />
            <Button
              label={mode === 'upgrade' ? 'Already have an account? Sign in' : 'Back to saving this account'}
              variant="outlined"
              disabled={busy}
              onPress={() => setMode(mode === 'upgrade' ? 'signin' : 'upgrade')}
            />
          </View>
        )}
        {error ? (
          <Text variant="body" color={colors.primary}>
            {error}
          </Text>
        ) : null}
      </ScrollView>
    </Screen>
  );
}
