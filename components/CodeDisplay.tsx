import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { useTheme } from '@/lib/theme';
import { Text } from '@/components/Text';

/**
 * DESIGN.md invite code: 6-char code in a surface field, 56px tall,
 * overline-tracked wide spacing, one-tap copy.
 */
export function CodeDisplay({ code }: { code: string }) {
  const { colors, radii, spacing } = useTheme();
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    await Clipboard.setStringAsync(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <View style={{ gap: spacing.sm, alignItems: 'center' }}>
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
    </View>
  );
}

const styles = StyleSheet.create({
  field: { height: 56, alignItems: 'center', justifyContent: 'center' },
  code: { letterSpacing: 8 },
});
