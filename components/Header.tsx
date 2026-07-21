import { Pressable, StyleSheet, View } from 'react-native';
import { TOUCH_TARGET, useTheme } from '@/lib/theme';
import { Text } from '@/components/Text';

/**
 * Shared screen header: back chevron button (>= 48px), centered title, empty
 * right slot (equal width to the button so the title stays optically centered).
 */
export function Header({ title, onBack }: { title: string; onBack: () => void }) {
  const { colors, spacing } = useTheme();
  return (
    <View style={[styles.header, { paddingHorizontal: spacing['2xl'], paddingVertical: spacing.md }]}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Back"
        onPress={onBack}
        style={styles.slot}
      >
        <Text style={styles.chevron} color={colors.primary}>
          ‹
        </Text>
      </Pressable>
      <Text variant="title" style={styles.title}>
        {title}
      </Text>
      <View style={styles.slot} />
    </View>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center' },
  slot: { width: TOUCH_TARGET, height: TOUCH_TARGET, alignItems: 'center', justifyContent: 'center' },
  title: { flex: 1, textAlign: 'center' },
  chevron: { fontSize: 34, lineHeight: 38, fontFamily: 'Figtree_600SemiBold' },
});
