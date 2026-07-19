import { useCallback, useEffect, useRef, useState } from 'react';
import { Redirect, useLocalSearchParams, useRouter } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';
import { useSharedValue } from 'react-native-reanimated';
import { useReducedMotion, useTheme } from '@/lib/theme';
import { useSession } from '@/providers/SessionProvider';
import { CATEGORY_LABELS, isCategory, type Item } from '@/lib/types';
import { Screen } from '@/components/Screen';
import { Text } from '@/components/Text';
import { EmptyState } from '@/components/EmptyState';
import { SwipeCard, type SwipeCardHandle } from '@/components/SwipeCard';

export default function SwipeDeck() {
  const { category } = useLocalSearchParams<{ category: string }>();
  const { colors, spacing, radii } = useTheme();
  const reducedMotion = useReducedMotion();
  const router = useRouter();
  const { loading, room, getItems, getMySwipedItemIds, recordSwipe } = useSession();

  const [deck, setDeck] = useState<Item[] | null>(null);
  const [index, setIndex] = useState(0);
  const translateX = useSharedValue(0);
  const topCardRef = useRef<SwipeCardHandle>(null);

  const valid = isCategory(category);

  useEffect(() => {
    if (!valid || loading || !room) return;
    let cancelled = false;
    (async () => {
      try {
        const [items, swiped] = await Promise.all([getItems(category), getMySwipedItemIds()]);
        if (cancelled) return;
        setDeck(items.filter((i) => !swiped.has(i.id)));
        setIndex(0);
      } catch (e) {
        console.warn('deck load failed', e);
        if (!cancelled) setDeck([]);
      }
    })();
    return () => {
      cancelled = true;
    };
    // Load once per category visit; swipes advance the index locally.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [valid, loading, room, category]);

  const current = deck?.[index] ?? null;
  const next = deck?.[index + 1] ?? null;

  const handleSwiped = useCallback(
    (item: Item) => (liked: boolean) => {
      recordSwipe(item, liked).catch((e) => console.warn('swipe save failed', e));
      setIndex((i) => i + 1);
    },
    [recordSwipe],
  );

  if (!valid) return <Redirect href="/lobby" />;
  if (!loading && !room) return <Redirect href="/" />;

  const label = CATEGORY_LABELS[category];

  return (
    <Screen>
      <View style={[styles.header, { paddingHorizontal: spacing['2xl'], paddingVertical: spacing.md }]}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Back to lobby"
          onPress={() => router.back()}
          style={styles.backButton}
        >
          <Text variant="title" color={colors.primary}>
            ←
          </Text>
        </Pressable>
        <Text variant="title">{label}</Text>
        <View style={styles.backButton} />
      </View>

      {deck === null ? (
        // Card-shaped skeleton, never a spinner (DESIGN.md).
        <View style={[styles.deckArea, { padding: spacing['2xl'] }]}>
          <View
            style={[styles.skeletonCard, { backgroundColor: colors.skeleton, borderRadius: radii.xl }]}
          />
        </View>
      ) : current ? (
        <>
          <View style={[styles.deckArea, { padding: spacing['2xl'] }]}>
            {/* Unpadded relative wrapper: absolute-fill cards measure it identically on native + web */}
            <View style={styles.cardStack}>
              {next ? (
                <SwipeCard
                  key={next.id}
                  item={next}
                  isTop={false}
                  translateX={translateX}
                  onSwiped={() => {}}
                  reducedMotion={reducedMotion}
                />
              ) : null}
              <SwipeCard
                key={current.id}
                ref={topCardRef}
                item={current}
                isTop
                translateX={translateX}
                onSwiped={handleSwiped(current)}
                reducedMotion={reducedMotion}
              />
            </View>
          </View>

          {/* ✕ / ♥ mirror the gesture for accessibility — both >= 56px */}
          <View style={[styles.actions, { gap: spacing['3xl'], paddingBottom: spacing['3xl'] }]}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Pass"
              onPress={() => topCardRef.current?.swipe(false)}
              style={[
                styles.actionButton,
                {
                  borderRadius: radii.full,
                  borderWidth: 2,
                  borderColor: colors.outlineStrong,
                  backgroundColor: colors.surface,
                },
              ]}
            >
              <Text variant="headline" color={colors.inkMuted}>
                ✕
              </Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Like"
              onPress={() => topCardRef.current?.swipe(true)}
              style={[
                styles.actionButton,
                { borderRadius: radii.full, backgroundColor: colors.primary },
              ]}
            >
              <Text variant="headline" color={colors.onPrimary}>
                ♥
              </Text>
            </Pressable>
          </View>
        </>
      ) : deck.length === 0 && category === 'restaurants' ? (
        <View style={styles.deckArea}>
          <EmptyState
            icon="🍽️"
            title="No restaurants yet"
            message="Restaurants unlock once locations are set."
          />
        </View>
      ) : (
        <View style={styles.deckArea}>
          <EmptyState
            icon="✔️"
            title={`That's all for ${label}`}
            message="You've swiped everything here. Check your matches or try another category."
            ctaLabel="See matches"
            onCtaPress={() => router.push('/matches')}
          />
        </View>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  backButton: {
    width: 48,
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
  },
  deckArea: { flex: 1, justifyContent: 'center' },
  cardStack: { flex: 1 },
  skeletonCard: { flex: 1 },
  actions: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionButton: {
    width: 64,
    height: 64,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
