# Settings hub + theme relocation (design)

**Status:** approved 2026-07-24. Frontend feature. Branch `feat/settings-hub-theme` off `main`. Implemented with the impeccable skill (DESIGN.md binding).

## Goal

Turn `/settings` from a locations-only screen into a sectioned **Settings hub**, and move the light/dark theme control into it, removing the floating overlay.

## Current state

- `app/settings.tsx` — locations only; **hard-redirects to `/` when there is no room** (`if (!loading && !room) return <Redirect href="/" />`). Owns the `POPULAR_METROS` quick-pick + free-text add + `LocationChip`s, writes via `useSession().updateLocations`.
- Theme control — floating `ThemeToggleOverlay` in `app/_layout.tsx` mounting `components/ThemeToggle.tsx` (a **cycle** button: system→light→dark). Reads/writes `useThemePreference()` from `lib/theme/ThemeProvider.tsx` (`preference`, `setPreference`, `scheme`).
- `/account` — email upgrade / sign-in (separate screen).
- Price filter — lives on the restaurants deck (shipped separately). **Stays there. Not moved into Settings.**

## Sections (top → bottom)

| Section | Scope | Gating | Content |
|---|---|---|---|
| Appearance | per-user | none | **System / Light / Dark** segmented control → `setPreference` |
| Account | per-user | none | Row linking to `/account` (email upgrade/sign-in) |
| Locations | per-room | **only this gates on `room`** | Existing quick-pick + free-text editor, unchanged behavior; label it "Shared with your partner" |
| Notifications | per-user | none | Disabled stub row ("Coming soon"), not wired |

## Key changes

1. **Drop the top-level room-redirect.** Render Appearance + Account + Notifications for everyone (including no-room users). Gate **only** the Locations section on `room` — if `!room`, show a short "Join or create a room to set locations" note in place of the editor (no redirect).
2. **New `components/ThemeControl.tsx`** — a 3-option segmented control (System / Light / Dark), reading `useThemePreference()`. Selected segment uses the theme's primary container (Two-Color Rule). Accessible: `accessibilityRole="radio"` per segment, `accessibilityState={{ selected }}`. This is a better settings affordance than the cycle button.
3. **Remove `ThemeToggleOverlay`** from `app/_layout.tsx` (both the local component definition and its mount). Retire `components/ThemeToggle.tsx` if nothing else imports it (grep first; delete only if orphaned by this change).
4. Settings screen composed of small section blocks — keep `app/settings.tsx` readable; extract a `SettingsSection` presentational wrapper if it helps, or inline if short.

## Design rules (binding)

- Hex colors only in `lib/theme/tokens.ts`; `grep -rEn "#[0-9a-fA-F]{6}" app components providers --include="*.tsx"` MUST stay 0. Resolve all colors via `useTheme()`.
- DESIGN.md: Two-Color, No-Beige, Muted-Floor, Calm-Surface. Gate any animation on `useReducedMotion()`.
- No web-only libs. expo-router + react-native only.

## Testing / verification

- Little pure logic here (mostly presentational + routing). If any branching logic emerges (e.g. section visibility), extract to `lib/` and unit-test; otherwise no new jest logic is expected.
- `npm run typecheck`, `npm run lint`, hex grep 0, `npx expo export --platform web`.
- Browser (dev server): (a) as a no-room session, `/settings` renders Appearance + Account + Notifications with **no redirect**, Locations shows the join note; (b) create/join a room → Locations editor appears; (c) switch System/Light/Dark → colors change live, persists across reload; (d) confirm the floating toggle is gone from lobby + deck.

## Out of scope

- Price filter relocation (stays on the deck).
- Real notification preferences (stub only).
- Any change to `updateLocations` / room-shared locations behavior beyond relocating the editor into a section.
