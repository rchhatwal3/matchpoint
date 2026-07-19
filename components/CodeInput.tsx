import { StyleSheet, TextInput } from 'react-native';
import { useTheme } from '@/lib/theme';

/** DESIGN.md join input: single field, auto-uppercase, 6 chars, 56px tall. */
export function CodeInput({
  value,
  onChangeText,
}: {
  value: string;
  onChangeText: (v: string) => void;
}) {
  const { colors, radii, spacing } = useTheme();
  return (
    <TextInput
      accessibilityLabel="Invite code"
      value={value}
      onChangeText={(t) => onChangeText(t.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6))}
      autoCapitalize="characters"
      autoCorrect={false}
      maxLength={6}
      placeholder="ABC123"
      placeholderTextColor={colors.inkMuted}
      style={[
        styles.input,
        {
          backgroundColor: colors.surface,
          color: colors.ink,
          borderRadius: radii.md,
          borderWidth: 1,
          borderColor: colors.outline,
          paddingHorizontal: spacing.xl,
        },
      ]}
    />
  );
}

const styles = StyleSheet.create({
  input: {
    height: 56,
    fontSize: 22,
    letterSpacing: 6,
    fontFamily: 'Nunito_700Bold',
    textAlign: 'center',
  },
});
