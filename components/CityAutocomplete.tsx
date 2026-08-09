import { useId, useState } from 'react';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';
import { TOUCH_TARGET, useTheme } from '@/lib/theme';
import { searchCities } from '@/lib/city-search';
import { comboboxAria } from '@/lib/combobox-aria';
import { hasRegion, locationRegionHint, normalizeLocation } from '@/lib/location';
import { Text } from '@/components/Text';
import { Button } from '@/components/Button';

/**
 * The "add a city" field: type, and matching cities from the bundled list drop
 * in below it. Tapping one adds it — that is the common path, and what it adds
 * is guaranteed canonical and region-bearing (lib/cities.test.ts asserts it for
 * every entry), so the picked value lands in the same Places cache bucket as the
 * same city typed by hand.
 *
 * Suggestions, NOT an allowlist. Anywhere Places and Foursquare serve is a
 * legitimate location, so a city that is not on the list can still be typed and
 * added — the only requirement is a region, and the hint below the field says so
 * rather than just disabling the button (the codeEntryHint precedent in
 * lib/auth-logic.ts).
 *
 * The list is rendered inline below the field rather than floating over the
 * content: this sits inside the settings ScrollView, where an absolutely
 * positioned overlay clips on Android and stacks unpredictably on web. Nothing
 * animates, so there is nothing to gate on useReducedMotion, and the panel stays
 * at Level 1 — a border, no shadow (Calm-Surface Rule: only the top swipe card
 * is allowed to lift).
 */
export function CityAutocomplete({
  onAdd,
  alreadyAdded,
}: {
  /** Called with a canonical `City, Region` value. */
  onAdd: (city: string) => void;
  /** Canonical values already on the room, so they can be marked as added. */
  alreadyAdded: Set<string>;
}) {
  const { colors, radii, spacing } = useTheme();
  const [draft, setDraft] = useState('');

  const value = normalizeLocation(draft);
  const hint = locationRegionHint(draft);
  const suggestions = searchCities(draft);

  const base = useId();
  const listId = `${base}-suggestions`;
  const hintId = `${base}-hint`;
  const aria = comboboxAria({
    listId,
    hintId,
    suggestionCount: suggestions.length,
    hasHint: !!hint,
  });

  const add = (city: string) => {
    setDraft('');
    if (alreadyAdded.has(city)) return;
    onAdd(city);
  };

  const addTyped = () => {
    if (!hasRegion(value)) return;
    add(value);
  };

  return (
    <View style={{ gap: spacing.sm }}>
      <Text variant="label">Add a city</Text>
      <View style={[styles.addRow, { gap: spacing.sm }]}>
        <TextInput
          accessibilityRole="combobox"
          accessibilityLabel="Add a city"
          accessibilityHint="Type a city, then pick a suggestion or add what you typed"
          {...aria}
          value={draft}
          onChangeText={setDraft}
          onSubmitEditing={addTyped}
          autoCorrect={false}
          // The browser's own autofill overlay would cover the app's suggestions.
          autoComplete="off"
          returnKeyType="done"
          placeholder="e.g. Brooklyn, NY"
          placeholderTextColor={colors.inkMuted}
          style={[
            styles.input,
            {
              backgroundColor: colors.surface,
              color: colors.ink,
              borderRadius: radii.md,
              borderColor: colors.outline,
              paddingHorizontal: spacing.lg,
            },
          ]}
        />
        <Button
          label="Add"
          variant="tonal"
          onPress={addTyped}
          disabled={!hasRegion(value)}
          disabledReasonId={hint ? hintId : undefined}
        />
      </View>

      {suggestions.length > 0 ? (
        <View
          accessibilityRole="list"
          id={listId}
          style={[
            styles.panel,
            {
              backgroundColor: colors.surface,
              borderColor: colors.outline,
              borderRadius: radii.md,
            },
          ]}
        >
          {suggestions.map((city, i) => {
            const added = alreadyAdded.has(city);
            return (
              <Pressable
                key={city}
                accessibilityRole="button"
                accessibilityState={{ selected: added }}
                accessibilityLabel={added ? `${city}, already added` : `Add ${city}`}
                onPress={() => add(city)}
                style={[
                  styles.row,
                  {
                    paddingHorizontal: spacing.lg,
                    borderTopWidth: i === 0 ? 0 : 1,
                    borderTopColor: colors.outline,
                  },
                ]}
              >
                <Text variant="body" color={added ? colors.inkMuted : colors.ink}>
                  {city}
                </Text>
                {added ? (
                  <Text variant="label" color={colors.inkMuted}>
                    Added
                  </Text>
                ) : null}
              </Pressable>
            );
          })}
        </View>
      ) : null}

      {hint ? (
        <Text variant="body" color={colors.primary} id={hintId} aria-live="polite">
          {hint}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  addRow: { flexDirection: 'row', alignItems: 'center' },
  input: {
    flex: 1,
    height: TOUCH_TARGET,
    fontSize: 16,
    fontFamily: 'Figtree_400Regular',
    borderWidth: 1,
  },
  panel: { borderWidth: 1, overflow: 'hidden' },
  row: {
    minHeight: TOUCH_TARGET,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
});
