// app/account.tsx
import { useEffect, useState } from 'react';
import { useRouter } from 'expo-router';
import { Platform, ScrollView, TextInput, View } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { useTheme } from '@/lib/theme';
import { useAuth } from '@/providers/AuthProvider';
import { authView, isValidEmail, isValidCode } from '@/lib/auth-logic';
import { codesToText, groupCode, isValidRecoveryCode } from '@/lib/recovery-logic';
import { Screen } from '@/components/Screen';
import { Header } from '@/components/Header';
import { Button } from '@/components/Button';
import { Text } from '@/components/Text';

export default function Account() {
  const { colors, spacing, radii } = useTheme();
  const router = useRouter();
  const {
    email,
    isAnonymous,
    enabled,
    sendUpgradeCode,
    sendSignInCode,
    verifyCode,
    signOut,
    issueRecoveryCodes,
    redeemRecoveryCode,
    codesRemaining,
  } = useAuth();

  const [mode, setMode] = useState<'upgrade' | 'signin'>('upgrade');
  const [emailInput, setEmailInput] = useState('');
  const [code, setCode] = useState('');
  const [codeSent, setCodeSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Recovery: sign-in-with-code sub-flow + the one-time generated-codes display.
  const [recoverMode, setRecoverMode] = useState(false);
  const [recCode, setRecCode] = useState('');
  const [generatedCodes, setGeneratedCodes] = useState<string[] | null>(null);
  const [codesLeft, setCodesLeft] = useState<number | null>(null);
  const [copied, setCopied] = useState(false);

  const view = authView({ isAnonymous, email, codeSent });

  // Load the remaining-codes count when landing on the permanent view.
  useEffect(() => {
    if (view !== 'permanent' || !enabled) return;
    codesRemaining()
      .then(setCodesLeft)
      .catch(() => {});
  }, [view, enabled, codesRemaining]);

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
      // Auto-prompt: generate recovery codes right after a successful upgrade so
      // every permanent account gets a way back in.
      if (mode === 'upgrade') {
        const c = await issueRecoveryCodes();
        setGeneratedCodes(c);
        setCodesLeft(c.length);
      }
    });

  const generate = () =>
    run(async () => {
      setCopied(false);
      const c = await issueRecoveryCodes();
      setGeneratedCodes(c);
      setCodesLeft(c.length);
    });

  const copyCodes = () =>
    run(async () => {
      if (!generatedCodes) return;
      await Clipboard.setStringAsync(codesToText(generatedCodes));
      setCopied(true);
    });

  const downloadCodes = () => {
    if (Platform.OS !== 'web' || !generatedCodes) return;
    const g = globalThis as unknown as {
      Blob: typeof Blob;
      URL: typeof URL;
      document: Document;
    };
    const url = g.URL.createObjectURL(new g.Blob([codesToText(generatedCodes)], { type: 'text/plain' }));
    const a = g.document.createElement('a');
    a.href = url;
    a.download = 'matchpoint-recovery-codes.txt';
    a.click();
    g.URL.revokeObjectURL(url);
  };

  const redeem = () =>
    run(async () => {
      await redeemRecoveryCode(emailInput, recCode);
      setRecoverMode(false);
      setRecCode('');
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
          <View style={{ gap: spacing['2xl'] }}>
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

            <View style={{ gap: spacing.lg }}>
              <Text variant="title">Recovery codes</Text>
              {generatedCodes ? (
                <View style={{ gap: spacing.lg }}>
                  <View
                    style={{
                      backgroundColor: colors.surface,
                      borderRadius: radii.md,
                      padding: spacing.md,
                    }}
                  >
                    <Text variant="body" color={colors.primary}>
                      Save these now — they won&apos;t be shown again. Each code works once, from any
                      device, even without your email.
                    </Text>
                  </View>
                  <View
                    style={{
                      backgroundColor: colors.surface,
                      borderRadius: radii.md,
                      padding: spacing.md,
                      gap: spacing.xs,
                    }}
                  >
                    {generatedCodes.map((c) => (
                      <Text key={c} variant="body">
                        {groupCode(c)}
                      </Text>
                    ))}
                  </View>
                  <Button label={copied ? 'Copied' : 'Copy codes'} disabled={busy} onPress={copyCodes} />
                  {Platform.OS === 'web' ? (
                    <Button label="Download codes" variant="outlined" disabled={busy} onPress={downloadCodes} />
                  ) : null}
                  <Button
                    label="I've saved them"
                    variant="outlined"
                    disabled={busy}
                    onPress={() => setGeneratedCodes(null)}
                  />
                </View>
              ) : (
                <View style={{ gap: spacing.lg }}>
                  <Text variant="body" color={colors.inkMuted}>
                    {codesLeft && codesLeft > 0
                      ? `You have ${codesLeft} unused recovery ${codesLeft === 1 ? 'code' : 'codes'}. Use one to sign in if you ever lose access to your email.`
                      : 'Generate recovery codes so you can get back into your account if you lose access to your email.'}
                  </Text>
                  <Button
                    label={codesLeft && codesLeft > 0 ? 'Regenerate recovery codes' : 'Generate recovery codes'}
                    disabled={busy}
                    onPress={generate}
                  />
                  {codesLeft && codesLeft > 0 ? (
                    <Text variant="label" color={colors.inkMuted}>
                      Regenerating voids your previous codes.
                    </Text>
                  ) : null}
                </View>
              )}
            </View>
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
        ) : recoverMode ? (
          <View style={{ gap: spacing.lg }}>
            <Text variant="body" color={colors.inkMuted}>
              Lost access to your email? Enter it with one of your saved recovery codes to restore
              your room on this device.
            </Text>
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
            <TextInput
              style={inputStyle}
              value={recCode}
              onChangeText={setRecCode}
              placeholder="ABCDE-FGHJK-LMNPQ-RSTUV-WXYZ2"
              placeholderTextColor={colors.inkMuted}
              autoCapitalize="characters"
              autoCorrect={false}
            />
            <Button
              label="Restore my account"
              disabled={
                busy || !isValidEmail(emailInput.trim().toLowerCase()) || !isValidRecoveryCode(recCode)
              }
              onPress={redeem}
            />
            <Button
              label="Back"
              variant="outlined"
              disabled={busy}
              onPress={() => {
                setRecoverMode(false);
                setRecCode('');
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
                  Your email is the only key to this account. Right after you save it, generate
                  recovery codes so you can still get back in if you lose email access.
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
            <Button
              label="Lost access to your email? Use a recovery code"
              variant="outlined"
              disabled={busy}
              onPress={() => setRecoverMode(true)}
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
