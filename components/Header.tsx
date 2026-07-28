import { Pressable, StyleSheet, View } from 'react-native';
import { usePathname, useRouter } from 'expo-router';
import { TOUCH_TARGET, useTheme } from '@/lib/theme';
import { useSession } from '@/providers/SessionProvider';
import { parentRoute } from '@/lib/nav';
import { Text } from '@/components/Text';

/**
 * Shared screen header: back chevron button (>= 48px), centered title, empty
 * right slot (equal width to the button so the title stays optically centered).
 * The chevron navigates to the screen's logical parent (`parentRoute`) rather
 * than `router.back()` — history replay can bounce between screens that link
 * to each other and never reach the lobby. `onBack`, if given, overrides that.
 */
export function Header({ title, onBack }: { title: string; onBack?: () => void }) {
  const { colors, spacing } = useTheme();
  const router = useRouter();
  const pathname = usePathname();
  const { room } = useSession();

  const goBack = onBack ?? (() => router.replace(parentRoute(pathname, Boolean(room))));

  return (
    <View style={[styles.header, { paddingHorizontal: spacing['2xl'], paddingVertical: spacing.md }]}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Back"
        onPress={goBack}
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
