import { useCallback, useEffect, useMemo, useState } from 'react';
import { Redirect, useFocusEffect, useRouter } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';
import { useReducedMotion, useTheme } from '@/lib/theme';
import { useSession } from '@/providers/SessionProvider';
import { CATEGORY_EMOJI, CATEGORY_LABELS, type Category, type MatchRow } from '@/lib/types';
import { groupByCategory, rollPicks } from '@/lib/date-night';
import { Screen } from '@/components/Screen';
import { Text } from '@/components/Text';
import { Header } from '@/components/Header';
import { Button } from '@/components/Button';
import { EmptyState } from '@/components/EmptyState';

/** Categories that make sense to draw a date plan from (ordered for the picker). */
const DATE_CATEGORIES: Category[] = [
  'restaurants',
  'date_nights',
  'activities',
  'shows',
  'food',
  'vacations',
];

/**
 * Date Night — a randomizer over the pair's mutual matches. Multiselect the
 * categories to draw from, then "Surprise us" reveals one random pick as a
 * celebratory flame card. A shortlist lets them browse instead of spinning.
 */
export default function DateNight() {
  const { colors, spacing, radii, elevation } = useTheme();
  const router = useRouter();
  const reducedMotion = useReducedMotion();
  const { loading, room, offline, getMatches } = useSession();

  const [matches, setMatches] = useState<MatchRow[] | null>(null);
  const [selected, setSelected] = useState<Set<Category>>(() => new Set(DATE_CATEGORIES));
  const [picks, setPicks] = useState<Map<Category, MatchRow>>(() => new Map());
  const [showShortlist, setShowShortlist] = useState(false);

  useFocusEffect(
    useCallback(() => {
      if (loading || !room) return;
      let cancelled = false;
      getMatches()
        .then((rows) => {
          if (!cancelled) setMatches(rows);
        })
        .catch((e) => {
          console.warn('date-night matches load failed', e);
          if (!cancelled) setMatches([]);
        });
      return () => {
        cancelled = true;
      };
    }, [loading, room, getMatches]),
  );

  // Matches in the currently-selected categories — the draw pool.
  const pool = useMemo(
    () => (matches ?? []).filter((m) => selected.has(m.category)),
    [matches, selected],
  );

  // Pool grouped by category — the per-category draw buckets and shortlist source.
  const byCategory = useMemo(() => groupByCategory(pool), [pool]);
  const populated = DATE_CATEGORIES.filter((c) => (byCategory.get(c)?.length ?? 0) > 0);

  const toggle = useCallback((c: Category) => {
    // Deselecting a category drops its pick so no stale card lingers.
    setPicks((cur) => {
      if (!cur.has(c)) return cur;
      const next = new Map(cur);
      next.delete(c);
      return next;
    });
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(c)) next.delete(c);
      else next.add(c);
      return next;
    });
  }, []);

  // Roll one random match in every selected category that has matches.
  const spin = useCallback(() => {
    setPicks((prev) => rollPicks(byCategory, DATE_CATEGORIES, prev));
  }, [byCategory]);

  // Celebratory scale-in on each new spin (gated on reduced motion).
  const scale = useSharedValue(1);
  const cardStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));
  useEffect(() => {
    if (picks.size === 0) return;
    if (reducedMotion) {
      scale.set(1);
      return;
    }
    scale.set(0.9);
    scale.set(withSpring(1, { damping: 14, stiffness: 180 }));
  }, [picks, reducedMotion, scale]);

  // Selected categories that produced a pick, in picker order.
  const pickedCategories = DATE_CATEGORIES.filter((c) => picks.has(c));

  if (!loading && !room) return <Redirect href="/" />;

  return (
    <Screen>
      <Header title="Date Night" />
      <ScrollView contentContainerStyle={{ padding: spacing['2xl'], gap: spacing['3xl'] }}>
        {/* Category multiselect — flame-container when drawn from, neutral when not. */}
        <View style={{ gap: spacing.md }}>
          <Text variant="title">Draw from</Text>
          <View style={[styles.chips, { gap: spacing.sm }]}>
            {DATE_CATEGORIES.map((c) => {
              const on = selected.has(c);
              return (
                <Pressable
                  key={c}
                  accessibilityRole="button"
                  accessibilityState={{ selected: on }}
                  accessibilityLabel={CATEGORY_LABELS[c]}
                  onPress={() => toggle(c)}
                  style={[
                    styles.chip,
                    {
                      backgroundColor: on ? colors.primaryContainer : colors.surface,
                      borderColor: on ? colors.primaryContainer : colors.outline,
                      borderRadius: radii.lg,
                      paddingHorizontal: spacing.lg,
                      gap: spacing.sm,
                    },
                  ]}
                >
                  <Text accessibilityElementsHidden>{CATEGORY_EMOJI[c]}</Text>
                  <Text variant="label" color={on ? colors.onPrimaryContainer : colors.ink}>
                    {CATEGORY_LABELS[c]}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>

        {matches === null ? (
          // Card-shaped skeleton while matches load — never a spinner (DESIGN.md).
          <View
            style={[styles.skeleton, { backgroundColor: colors.skeleton, borderRadius: radii.xl }]}
          />
        ) : pool.length === 0 ? (
          <EmptyState
            icon="🌙"
            tone="partner"
            title="No matches yet in these categories"
            message={
              offline
                ? 'Offline mode is solo, so mutual likes can’t happen. Swipe together on a live room first.'
                : 'Go swipe together first — when you both like the same thing it lands here to draw from.'
            }
            ctaLabel="Back to lobby"
            onCtaPress={() => router.replace('/lobby')}
          />
        ) : (
          <>
            {/* Tonight's plan — one celebratory flame-halo card per selected category. */}
            {pickedCategories.length > 0 ? (
              <Animated.View style={[{ gap: spacing.md }, cardStyle]}>
                <Text variant="overline" color={colors.primary}>
                  TONIGHT’S PLAN
                </Text>
                {pickedCategories.map((c) => {
                  const p = picks.get(c)!;
                  return (
                    <View
                      key={c}
                      style={{
                        backgroundColor: colors.primaryContainer,
                        borderRadius: radii.xl + spacing.md,
                        padding: spacing.md,
                      }}
                    >
                      <View
                        style={[
                          styles.pickCard,
                          {
                            backgroundColor: colors.surface,
                            borderRadius: radii.xl,
                            padding: spacing['3xl'],
                            gap: spacing.md,
                          },
                          elevation.level2,
                        ]}
                      >
                        <Text variant="overline" color={colors.inkMuted}>
                          {CATEGORY_LABELS[c].toUpperCase()}
                        </Text>
                        <Text style={styles.pickGlyph} accessibilityElementsHidden>
                          {CATEGORY_EMOJI[c]}
                        </Text>
                        <Text variant="headline" style={styles.centered}>
                          {p.title}
                        </Text>
                        {p.subtitle ? (
                          <Text variant="body" color={colors.inkMuted} style={styles.centered}>
                            {p.subtitle}
                          </Text>
                        ) : null}
                      </View>
                    </View>
                  );
                })}
              </Animated.View>
            ) : null}

            {/* Prominent flame randomizer — the screen's primary action. */}
            <Button label={picks.size > 0 ? 'Spin again' : 'Surprise us'} onPress={spin} />

            {/* Shortlist — browse the same pool grouped by category instead of spinning. */}
            <View style={{ gap: spacing.md }}>
              <Button
                label={showShortlist ? 'Hide the shortlist' : `Browse all ${pool.length}`}
                variant="outlined"
                onPress={() => setShowShortlist((v) => !v)}
              />
              {showShortlist
                ? populated.map((c) => (
                    <View key={c} style={{ gap: spacing.sm }}>
                      <View style={[styles.sectionHeader, { gap: spacing.sm }]}>
                        <Text accessibilityElementsHidden>{CATEGORY_EMOJI[c]}</Text>
                        <Text variant="title">{CATEGORY_LABELS[c]}</Text>
                      </View>
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
                          <Text style={styles.rowGlyph} accessibilityElementsHidden>
                            {CATEGORY_EMOJI[m.category]}
                          </Text>
                          <View style={styles.rowBody}>
                            <Text variant="title">{m.title}</Text>
                            {m.subtitle ? (
                              <Text variant="body" color={colors.inkMuted}>
                                {m.subtitle}
                              </Text>
                            ) : null}
                          </View>
                        </View>
                      ))}
                    </View>
                  ))
                : null}
            </View>
          </>
        )}
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  chips: { flexDirection: 'row', flexWrap: 'wrap' },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 48,
    borderWidth: 1,
  },
  skeleton: { height: 220 },
  pickCard: { alignItems: 'center' },
  pickGlyph: { fontSize: 48, lineHeight: 60 },
  centered: { textAlign: 'center' },
  sectionHeader: { flexDirection: 'row', alignItems: 'center' },
  row: { flexDirection: 'row', alignItems: 'center' },
  rowGlyph: { fontSize: 26, lineHeight: 32 },
  rowBody: { flex: 1, gap: 4 },
});
