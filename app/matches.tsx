import { useCallback, useState } from 'react';
import { Redirect, useFocusEffect, useRouter } from 'expo-router';
import { ScrollView, StyleSheet, View } from 'react-native';
import { useTheme } from '@/lib/theme';
import { useSession } from '@/providers/SessionProvider';
import { CATEGORIES, CATEGORY_EMOJI, CATEGORY_LABELS, type Category, type MatchRow } from '@/lib/types';
import { Screen } from '@/components/Screen';
import { Text } from '@/components/Text';
import { Header } from '@/components/Header';
import { EmptyState } from '@/components/EmptyState';

export default function Matches() {
  const { colors, spacing, radii, elevation } = useTheme();
  const router = useRouter();
  const { loading, room, offline, getMatches } = useSession();

  const [matches, setMatches] = useState<MatchRow[] | null>(null);

  useFocusEffect(
    useCallback(() => {
      if (loading || !room) return;
      let cancelled = false;
      getMatches()
        .then((rows) => {
          if (!cancelled) setMatches(rows);
        })
        .catch((e) => {
          console.warn('matches load failed', e);
          if (!cancelled) setMatches([]);
        });
      return () => {
        cancelled = true;
      };
    }, [loading, room, getMatches]),
  );

  if (!loading && !room) return <Redirect href="/" />;

  const byCategory = new Map<Category, MatchRow[]>();
  for (const m of matches ?? []) {
    const list = byCategory.get(m.category) ?? [];
    list.push(m);
    byCategory.set(m.category, list);
  }
  const populated = CATEGORIES.filter((c) => (byCategory.get(c)?.length ?? 0) > 0);

  return (
    <Screen>
      <Header title="Matches" onBack={() => router.back()} />

      {matches === null ? (
        // Row-shaped skeletons, never spinners (DESIGN.md).
        <View style={{ padding: spacing['2xl'], gap: spacing.md }}>
          {[0, 1, 2].map((i) => (
            <View
              key={i}
              style={[styles.skeletonRow, { backgroundColor: colors.skeleton, borderRadius: radii.lg }]}
            />
          ))}
        </View>
      ) : populated.length === 0 ? (
        <View style={styles.emptyWrap}>
          <EmptyState
            icon="💞"
            title="No matches yet"
            message={
              offline
                ? 'Offline mode is solo, so mutual likes can’t happen. Connect Supabase to match for real.'
                : 'When you and your partner both like the same thing, it lands here.'
            }
            ctaLabel="Go swipe"
            onCtaPress={() => router.back()}
          />
        </View>
      ) : (
        <ScrollView contentContainerStyle={{ padding: spacing['2xl'], gap: spacing['3xl'] }}>
          {populated.map((c) => (
            <View key={c} style={{ gap: spacing.md }}>
              <View style={[styles.sectionHeader, { gap: spacing.sm }]}>
                <Text accessibilityElementsHidden>{CATEGORY_EMOJI[c]}</Text>
                <Text variant="title">{CATEGORY_LABELS[c]}</Text>
              </View>
              <View style={{ gap: spacing.sm }}>
                {(byCategory.get(c) ?? []).map((m) => (
                  <View
                    key={m.item_id}
                    style={[
                      styles.row,
                      {
                        backgroundColor: colors.surface,
                        borderRadius: radii.lg,
                        borderWidth: 1,
                        borderColor: colors.outline,
                        padding: spacing.md,
                        gap: spacing.md,
                      },
                      elevation.level1,
                    ]}
                  >
                    {/* Leading category glyph for at-a-glance scannability */}
                    <Text style={styles.rowGlyph} accessibilityElementsHidden>
                      {CATEGORY_EMOJI[m.category]}
                    </Text>
                    <View style={styles.rowBody}>
                      <View style={[styles.rowTop, { gap: spacing.sm }]}>
                        <Text variant="title" style={styles.rowTitle}>
                          {m.title}
                        </Text>
                        {/* badge-match: success-container is reserved for exactly this */}
                        <View
                          style={{
                            backgroundColor: colors.successContainer,
                            borderRadius: radii.xs,
                            paddingHorizontal: spacing.sm,
                            paddingVertical: spacing.xs,
                          }}
                        >
                          <Text variant="overline" color={colors.onSuccessContainer}>
                            MATCHED
                          </Text>
                        </View>
                      </View>
                      {m.subtitle ? (
                        <Text variant="body" color={colors.inkMuted}>
                          {m.subtitle}
                        </Text>
                      ) : null}
                    </View>
                  </View>
                ))}
              </View>
            </View>
          ))}
        </ScrollView>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  emptyWrap: { flex: 1, justifyContent: 'center' },
  sectionHeader: { flexDirection: 'row', alignItems: 'center' },
  row: { flexDirection: 'row', alignItems: 'center' },
  rowGlyph: { fontSize: 26, lineHeight: 32 },
  rowBody: { flex: 1, gap: 4 },
  // Badge sits inline right after the title (no space-between fling).
  rowTop: { flexDirection: 'row', alignItems: 'center' },
  rowTitle: { flexShrink: 1 },
  skeletonRow: { height: 76 },
});
