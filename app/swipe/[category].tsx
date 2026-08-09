import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Redirect, useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';
import { Image } from 'expo-image';
import { useSharedValue } from 'react-native-reanimated';
import { useReducedMotion, useTheme } from '@/lib/theme';
import { useSession } from '@/providers/SessionProvider';
import { CATEGORIES, CATEGORY_LABELS, isCategory, type Item } from '@/lib/types';
import { cardLocationLabel, deckLoadKey, filterDeck, upcomingImageUrls } from '@/lib/deck';
import { nextPriceTiers, normalizePriceTiers } from '@/lib/price-filter';
import { Screen } from '@/components/Screen';
import { Text } from '@/components/Text';
import { Header } from '@/components/Header';
import { EmptyState } from '@/components/EmptyState';
import { PriceFilter } from '@/components/PriceFilter';
import { SwipeCard, type SwipeCardHandle } from '@/components/SwipeCard';
import { DeckProgressBar } from '@/components/DeckProgressBar';
import type { FetchProgress } from '@/lib/progress';

// Pre-render one static HTML file per category so a hard load / refresh of a
// deep route (e.g. /swipe/restaurants) resolves on GitHub Pages, which has no
// SPA rewrite. Without this, `expo export` (output: "static") emits no file for
// the dynamic [category] route and a direct hit 404s ("Unmatched Route").
export function generateStaticParams(): { category: string }[] {
  return CATEGORIES.map((category) => ({ category }));
}

export default function SwipeDeck() {
  const { category } = useLocalSearchParams<{ category: string }>();
  const { colors, spacing, radii } = useTheme();
  const reducedMotion = useReducedMotion();
  const router = useRouter();
  const { loading, room, getItems, getMySwipedItemIds, recordSwipe, updatePriceTiers } =
    useSession();

  const [deck, setDeck] = useState<Item[] | null>(null);
  const [progress, setProgress] = useState<FetchProgress | null>(null);
  // Ids swiped this session — items drop out of the deck view once swiped, so a
  // price-filter toggle never resurfaces them (an index cursor couldn't do that).
  const [swiped, setSwiped] = useState<Set<string>>(new Set());
  // Restaurants only: shared per-room price-tier selection (synced to the partner
  // in realtime, persisted on the room row — survives revisits and devices).
  const priceLevels = useMemo(() => normalizePriceTiers(room?.price_tiers), [room?.price_tiers]);
  const togglePrice = useCallback(
    (level: number) => {
      const next = nextPriceTiers([...priceLevels], level);
      if (next === null) return;
      void updatePriceTiers(next);
    },
    [priceLevels, updatePriceTiers],
  );
  const translateX = useSharedValue(0);
  const topCardRef = useRef<SwipeCardHandle>(null);
  // Data the mounted deck currently reflects. Editing locations happens on
  // another screen (/settings), so reload on focus — but only when the key
  // changed, to skip a redundant edge-function fetch and skeleton flash.
  const loadedKey = useRef<string | null>(null);

  const valid = isCategory(category);
  const isRestaurants = category === 'restaurants';

  useFocusEffect(
    useCallback(() => {
      if (!valid || loading || !room) return;
      const key = deckLoadKey(category, room.locations);
      if (loadedKey.current === key) return;
      loadedKey.current = key;
      let cancelled = false;
      // Clear the deck so the skeleton covers a refetch too, not just the first
      // load — editing locations used to leave the old cards sitting there with
      // no sign anything was happening.
      setDeck(null);
      setProgress(null);
      (async () => {
        try {
          const [items, alreadySwiped] = await Promise.all([
            getItems(category, (p) => {
              if (!cancelled) setProgress(p);
            }),
            getMySwipedItemIds(),
          ]);
          if (cancelled) return;
          setDeck(items.filter((i) => !alreadySwiped.has(i.id)));
          setSwiped(new Set());
        } catch (e) {
          console.warn('deck load failed', e);
          if (!cancelled) setDeck([]);
        }
      })();
      return () => {
        cancelled = true;
      };
      // getItems/getMySwipedItemIds excluded — loadedKey guards the reload.
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [valid, loading, room, category]),
  );

  // Deck view: swiped items removed, then (restaurants only) price-filtered.
  const visible = useMemo(() => {
    if (deck === null) return null;
    return filterDeck(deck, swiped, isRestaurants, priceLevels);
  }, [deck, swiped, isRestaurants, priceLevels]);

  const current = visible?.[0] ?? null;
  const next = visible?.[1] ?? null;

  // Warm the cards beyond the two already mounted (top + next) so they paint
  // from cache when they reach the top. Keyed on the top card's id.
  useEffect(() => {
    if (!visible) return;
    const urls = upcomingImageUrls(visible, 2, 3);
    if (urls.length) void Image.prefetch(urls).catch(() => {});
  }, [visible, current?.id]);

  // Persist on commit; advance the deck only when the card has animated away,
  // so the next card still scales up under the outgoing one.
  const handleSwipeCommitted = useCallback(
    (item: Item) => (liked: boolean) => {
      recordSwipe(item, liked).catch((e) => console.warn('swipe save failed', e));
    },
    [recordSwipe],
  );

  const handleSwiped = useCallback(
    (item: Item) => () => {
      setSwiped((prev) => new Set(prev).add(item.id));
    },
    [],
  );

  if (!valid) return <Redirect href="/lobby" />;
  if (!loading && !room) return <Redirect href="/" />;

  const label = CATEGORY_LABELS[category];
  // Restaurants are sourced from the room's cities — surface the count + an edit
  // link while swiping. Zero-locations is handled by the empty state below.
  const locationCount = room?.locations.length ?? 0;
  const showLocationBar = isRestaurants && locationCount > 0;
  // Show the price row whenever there are restaurant cards to filter.
  const showPriceFilter = isRestaurants && (deck?.length ?? 0) > 0;
  // Unswiped restaurants exist but the price filter is hiding all of them
  // (distinguishes "priced out" from "you've swiped everything").
  const pricedOut = isRestaurants && !current && (deck?.some((i) => !swiped.has(i.id)) ?? false);

  return (
    <Screen>
      <Header title={label} />

      {showLocationBar ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`${locationCount} location${locationCount === 1 ? '' : 's'} set. Edit locations.`}
          onPress={() => router.push('/settings')}
          style={({ pressed }) => [
            styles.locationBar,
            { paddingHorizontal: spacing['2xl'], paddingBottom: spacing.sm, gap: spacing.xs, opacity: pressed ? 0.6 : 1 },
          ]}
        >
          <Text variant="label" color={colors.inkMuted} accessibilityElementsHidden>
            📍
          </Text>
          <Text variant="label" color={colors.inkMuted}>
            {`${locationCount} location${locationCount === 1 ? '' : 's'}`}
          </Text>
          <Text variant="label" color={colors.primary}>
            · Edit
          </Text>
        </Pressable>
      ) : null}

      {showPriceFilter ? <PriceFilter selected={priceLevels} onToggle={togglePrice} /> : null}

      {visible === null ? (
        // Card-shaped skeleton, never a spinner (DESIGN.md). The bar underneath
        // reports which location the fan-out is on — see the DESIGN.md amendment.
        <View style={[styles.deckArea, { padding: spacing['2xl'], gap: spacing.lg }]}>
          <View
            style={[styles.skeletonCard, { backgroundColor: colors.skeleton, borderRadius: radii.xl }]}
          />
          {isRestaurants && progress && progress.total > 1 ? (
            <DeckProgressBar progress={progress} />
          ) : null}
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
                  locationLabel={cardLocationLabel(next.location, locationCount)}
                  onSwipeCommitted={() => {}}
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
                locationLabel={cardLocationLabel(current.location, locationCount)}
                onSwipeCommitted={handleSwipeCommitted(current)}
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
      ) : isRestaurants && (room?.locations.length ?? 0) === 0 ? (
        <View style={styles.deckArea}>
          <EmptyState
            icon="📍"
            title="Set your locations first"
            message="Restaurants are sourced from the cities you and your partner pick."
            ctaLabel="Set locations"
            onCtaPress={() => router.push('/settings')}
          />
        </View>
      ) : isRestaurants && (deck?.length ?? 0) === 0 ? (
        <View style={styles.deckArea}>
          <EmptyState
            icon="🍽️"
            title="No restaurants yet"
            message="We couldn't find restaurants for your locations. Try adding another city."
            ctaLabel="Edit locations"
            onCtaPress={() => router.push('/settings')}
          />
        </View>
      ) : pricedOut ? (
        <View style={styles.deckArea}>
          <EmptyState
            icon="💸"
            title="Nothing in this price range"
            message="No restaurants match the selected prices. Widen the price filter above to see more."
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
  locationBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center' },
  deckArea: { flex: 1, justifyContent: 'center' },
  // Fill the space the layout gives us (never the fixed 645px an aspect ratio
  // forced), so the card can't overflow into the action buttons or push the
  // header off a short web viewport. maxHeight keeps it portrait on tall screens.
  cardStack: { flex: 1, width: '100%', maxWidth: 400, maxHeight: 645, alignSelf: 'center' },
  skeletonCard: { flex: 1, width: '100%', maxWidth: 400, maxHeight: 645, alignSelf: 'center' },
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
