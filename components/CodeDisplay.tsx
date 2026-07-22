import { useState } from 'react';
import { Platform, Pressable, Share, StyleSheet, View } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { useTheme } from '@/lib/theme';
import { Text } from '@/components/Text';
import { Button } from '@/components/Button';

const INVITE_BASE_URL = 'https://ramneekchhatwal.com/matchpoint/';

function inviteUrl(code: string): string {
  return `${INVITE_BASE_URL}?code=${code}`;
}

function inviteMessage(code: string): string {
  return `Join me on matchpoint — our room code is ${code}: ${inviteUrl(code)}`;
}

/**
 * DESIGN.md invite code: 6-char code in a surface field, 56px tall,
 * overline-tracked wide spacing, one-tap copy. Below it, a Share affordance
 * that hands off the full invite link (?code=) via the platform share sheet,
 * falling back to clipboard on web when the Web Share API is unavailable.
 */
export function CodeDisplay({ code }: { code: string }) {
  const { colors, radii, spacing } = useTheme();
  const [copied, setCopied] = useState(false);
  const [linkCopied, setLinkCopied] = useState(false);

  const copy = async () => {
    await Clipboard.setStringAsync(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const share = async () => {
    const message = inviteMessage(code);
    if (Platform.OS === 'web') {
      const nav = typeof navigator !== 'undefined' ? navigator : undefined;
      if (nav?.share) {
        try {
          await nav.share({ title: 'matchpoint', text: message, url: inviteUrl(code) });
        } catch {
          // User dismissed the share sheet — nothing to do.
        }
        return;
      }
      await Clipboard.setStringAsync(inviteUrl(code));
      setLinkCopied(true);
      setTimeout(() => setLinkCopied(false), 2000);
      return;
    }
    await Share.share({ message });
  };

  return (
    <View style={{ gap: spacing.md, alignItems: 'center' }}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Invite code ${code.split('').join(' ')}. Tap to copy.`}
        onPress={copy}
        style={[
          styles.field,
          {
            backgroundColor: colors.surface,
            borderRadius: radii.md,
            borderWidth: 1,
            borderColor: colors.outline,
            paddingHorizontal: spacing['2xl'],
          },
        ]}
      >
        <Text variant="headline" style={styles.code} color={colors.ink}>
          {code}
        </Text>
      </Pressable>
      <Text variant="overline" color={copied ? colors.primary : colors.inkMuted}>
        {copied ? 'COPIED' : 'TAP TO COPY'}
      </Text>
      <Button label="Share invite link" variant="tonal" onPress={share} />
      <Text variant="overline" color={colors.primary} style={!linkCopied && styles.hidden}>
        LINK COPIED
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  field: { height: 56, alignItems: 'center', justifyContent: 'center' },
  code: { letterSpacing: 8 },
  hidden: { opacity: 0 },
});
