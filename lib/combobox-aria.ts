/**
 * The ARIA a text field owes the user when suggestions drop in below it — the
 * WAI-ARIA 1.2 combobox pattern, derived from what the field is showing right
 * now.
 *
 * Why this is a module and not four inline attributes: React Native's own prop
 * types declare `aria-expanded` but not `aria-controls`, `aria-autocomplete` or
 * `aria-describedby`, so those three reach the DOM only through
 * react-native-web's `accessibilityProps` passthrough (it forwards every
 * `aria-*` attribute verbatim). Spreading one typed object is what keeps that
 * seam in a single documented place, and keeps the derivation — the part with
 * actual behaviour in it — unit-testable without rendering anything.
 *
 * `aria-controls` and `aria-autocomplete` are constant: a combobox names the
 * popup it owns whether or not the popup is open, and the field completes from
 * a list either way. `aria-expanded` is the flip that tells a screen reader
 * suggestions appeared, and `aria-describedby` is what makes the region hint
 * (locationRegionHint, lib/location.ts) audible instead of merely visible.
 *
 * No-ops on iOS/Android, where the platform reads the field from
 * `accessibilityRole` / `accessibilityState` instead.
 */
export type ComboboxAria = {
  'aria-expanded': boolean;
  'aria-controls': string;
  'aria-autocomplete': 'list';
  'aria-describedby': string | undefined;
};

export function comboboxAria({
  listId,
  hintId,
  suggestionCount,
  hasHint,
}: {
  /** id of the element holding the suggestions. */
  listId: string;
  /** id of the element holding the field's hint. */
  hintId: string;
  suggestionCount: number;
  hasHint: boolean;
}): ComboboxAria {
  return {
    'aria-expanded': suggestionCount > 0,
    'aria-controls': listId,
    'aria-autocomplete': 'list',
    'aria-describedby': hasHint ? hintId : undefined,
  };
}
