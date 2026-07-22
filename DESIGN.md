---
name: matchpoint
description: Swipe together, match on what you both want — food, trips, activities, date nights, and shows.
colors:
  primary: "#C2314F"
  on-primary: "#FFFFFF"
  primary-container: "#FFD9DF"
  on-primary-container: "#5C0A1F"
  secondary: "#2E6B7A"
  on-secondary: "#FFFFFF"
  secondary-container: "#CDE9F0"
  on-secondary-container: "#0B3A45"
  bg: "#FAFAFA"
  surface: "#FFFFFF"
  surface-variant: "#EFEFEF"
  ink: "#1A1A1A"
  ink-muted: "#5C5C5C"
  outline: "#D9D9D9"
  outline-strong: "#BDBDBD"
  success: "#1E7A3D"
  success-container: "#E3F6E8"
  on-success-container: "#0E4021"
  danger: "#C21A1A"
  danger-container: "#FFDAD5"
  on-danger-container: "#410100"
  dark-bg: "#121317"
  dark-surface: "#1C1E23"
  dark-ink: "#F1F2F4"
  dark-ink-muted: "#A8ABB2"
  dark-primary: "#FF8FA3"
  dark-secondary: "#8CC5D4"
typography:
  display:
    fontFamily: "Fraunces_700Bold"
    fontSize: "40"
    fontWeight: 700
    lineHeight: "46"
    letterSpacing: "-0.5"
  headline:
    fontFamily: "Fraunces_600SemiBold"
    fontSize: "28"
    fontWeight: 600
    lineHeight: "34"
  title:
    fontFamily: "Figtree_600SemiBold"
    fontSize: "18"
    fontWeight: 600
    lineHeight: "24"
  body:
    fontFamily: "Figtree_400Regular"
    fontSize: "16"
    fontWeight: 400
    lineHeight: "24"
  label:
    fontFamily: "Figtree_600SemiBold"
    fontSize: "14"
    fontWeight: 600
    lineHeight: "20"
  overline:
    fontFamily: "Figtree_600SemiBold"
    fontSize: "12"
    fontWeight: 600
    lineHeight: "16"
    letterSpacing: "0.6"
rounded:
  xs: "6px"
  sm: "8px"
  md: "10px"
  lg: "16px"
  xl: "24px"
  full: "999px"
spacing:
  xs: "4px"
  sm: "8px"
  md: "12px"
  lg: "16px"
  xl: "20px"
  "2xl": "24px"
  "3xl": "32px"
  "4xl": "40px"
components:
  button-primary:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.on-primary}"
    rounded: "{rounded.full}"
    padding: "12px 24px"
    height: "48px"
  button-tonal:
    backgroundColor: "{colors.primary-container}"
    textColor: "{colors.on-primary-container}"
    rounded: "{rounded.full}"
    padding: "12px 24px"
    height: "48px"
  button-outlined:
    backgroundColor: "transparent"
    textColor: "{colors.primary}"
    rounded: "{rounded.full}"
    padding: "12px 24px"
    height: "48px"
  card-swipe:
    backgroundColor: "{colors.surface}"
    rounded: "{rounded.xl}"
    padding: "0"
  badge-match:
    backgroundColor: "{colors.success-container}"
    textColor: "{colors.on-success-container}"
    rounded: "{rounded.xs}"
    padding: "4px 8px"
  chip-category:
    backgroundColor: "{colors.surface-variant}"
    textColor: "{colors.ink}"
    rounded: "{rounded.lg}"
    padding: "8px 16px"
  input-code:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    rounded: "{rounded.md}"
    height: "56px"
---

# Design System: matchpoint

## 1. Overview

**Creative North Star: "Split Heart"** — drawn straight from the app's favicon,
a heart split into two halves.

matchpoint is a decision game for two, so it should feel like date-night energy
the moment it opens — warmth carried by a confident **crimson** accent and springy
card physics, not by a beige page. Two colors do real work, one per heart-half: a
**crimson** primary (`#C2314F`, the favicon's left half) that carries every action,
the like-swipe, and the app's identity — *you* — and a **teal** secondary (`#2E6B7A`,
the favicon's right half) that means one concrete thing: *the other person* — their
presence, their turn, their half of the match. Backgrounds stay near-neutral
(cooled a hair toward the teal in dark) so card imagery, state color, and text stay
legible mid-swipe.

This is a **product-register** adaptive app (Expo: iOS + Android + web),
mobile-first, rendering as a centered phone-width column on desktop web. Carried
over from prior project hard stops: the Two-Color Rule, No-Beige Rule,
Muted-Floor Rule, and Calm-Surface Rule all apply verbatim.

**Key Characteristics:**
- Two working colors: crimson (identity + actions + "like" = you) and teal (partner presence).
- Near-neutral surfaces, first-class dark theme via `lib/theme` tokens + `useTheme()`, plus a user-facing light/dark/system toggle.
- A serif/sans pairing: **Fraunces** carries display moments, **Figtree** carries all UI text.
- One button vocabulary; every touch target ≥ 48px.
- Motion confirms state — card spring, match reveal — and nothing else. All gated on `useReducedMotion()`.

## 2. Colors

Every text-bearing pair is WCAG-AA verified (≥ 4.5:1) in both light and dark; the
tightest is crimson/white at 5.46:1.

### Primary
- **Crimson** (light `#C2314F`, dark `#FF8FA3`): brand color and every primary
  action — the like button, filled CTAs, active category, focus ring, the
  swipe-right glow on a card. In dark mode it lifts to a rose so it stays legible
  on the cool charcoal ground.
- **Crimson Container** (`#FFD9DF` / dark `#7A1230`): soft accent fills — invite-code
  badge, empty-state icon badges, tonal buttons, match-card halo.

### Secondary
- **Teal** (light `#2E6B7A`, dark `#8CC5D4`): the partner's voice. Partner presence
  dot, "waiting on partner" states, their avatar ring in the match reveal. It is
  deliberately a cool blue-teal so it never reads as a second warm accent competing
  with crimson.

### Neutral
- **Ink** (`#1A1A1A` / dark `#F1F2F4`), **Ink Muted** (`#5C5C5C` / dark `#A8ABB2`),
  **Background** (`#FAFAFA` / dark `#121317`), **Surface** (`#FFFFFF` / dark `#1C1E23`),
  **Surface Variant** (`#EFEFEF` / dark `#282A30`), **Outline** (`#D9D9D9` / dark `#3E414A`).
  Dark neutrals carry the barest cool bias toward the teal so the ground never reads warm.

### Named Rules (hard stops — carried from prior projects)
**The Two-Color Rule.** The surface only speaks crimson (action/identity/like) and
teal (partner). Everything else is neutral. A third accent must carry real meaning,
never decoration. (Green success-container is reserved for the matched badge only;
red danger for destructive actions only.)

**The No-Beige Rule.** Backgrounds are near-chroma-0 neutrals. Warmth lives in the
crimson accent and the type, never in a cream, sand, or parchment body fill.

## 3. Typography

**Type pairing:** **Fraunces** (`@expo-google-fonts/fraunces`), a warm high-contrast
display serif, against **Figtree** (`@expo-google-fonts/figtree`), a friendly
geometric-humanist sans. Contrast axis is serif-vs-sans, so the two never blur
together.

- **Fraunces** appears only at display moments: the `matchpoint` wordmark, screen
  titles (headline), and the "IT'S A MATCH" reveal. Its personality is the brand's
  editorial-but-warm voice.
- **Figtree** carries every piece of working UI text: titles, body, labels, buttons,
  captions, codes. Body text is *always* Figtree — the serif never runs as body.

### Named Rules
**The Muted-Floor Rule.** Muted text uses Ink Muted (`#5C5C5C` / dark `#A8ABB2`),
verified ≥ 4.5:1 on both background and surface (light floor 6.41:1). Never lighten
body or placeholder text "for elegance."

## 4. Elevation

Calm, nearly flat at rest. Depth conveyed by soft shadow only:
- **Level 1** (`0 1px 3px rgba(0,0,0,0.06)`): resting cards, list rows.
- **Level 2** (`0 4px 16px rgba(0,0,0,0.12)`): the active swipe card only — the one
  lifted element per screen.

**The Calm-Surface Rule.** Cards sit at Level 1 and stay there. Only the top card of
the swipe deck rises to Level 2. If everything is elevated, nothing is.

## 5. Components

### Swipe Card (signature)
- Portrait-locked (maxWidth ~400, aspect ~0.62), centered in the phone-width column
  so it keeps its shape at any viewport. Full-bleed image or colored panel, 24px
  radius, title + meta pinned bottom over a scrim. Drag physics: rotation follows
  drag x, crimson "LIKE" / neutral "PASS" stamp fades in with drag distance. Buttons
  (✕ / ♥, both ≥ 56px) mirror the gesture for accessibility.

### Match Reveal (signature)
- When both swipe right: card pauses, crimson-container halo, both avatars
  (crimson ring = you, teal ring = partner), single spring scale-in, "IT'S A MATCH"
  set in Fraunces. Reduced-motion: static reveal, no confetti anywhere.

### Buttons
- Fully rounded pill, min height 48px. Filled crimson (default action), tonal
  (secondary), outlined (neutral). Press scales to 0.97; disabled 50% opacity.

### Category tiles / Invite code / Empty states
- Category picker: 2-column grid of neutral surface tiles (glyph + label, ≥72px),
  crimson-container only for pressed/active state.
- Invite code: 6-character code in a `surface` field, 56px tall, one-tap copy.
- Empty / waiting states: crimson-container icon badge + title + one sentence + optional
  CTA. "Waiting on partner" states use teal. Skeletons shaped like real cards, never spinners.

## 6. Do's and Don'ts

### Do:
- Route every color through `lib/theme` tokens and `useTheme()`; light/dark resolve automatically.
- Keep crimson for actions/likes and teal for partner state; leave everything else neutral.
- Reserve Fraunces for display moments; set all working text in Figtree.
- Give every touch target ≥ 48px and gesture actions button equivalents.
- Gate every animation on `useReducedMotion()` (maps to `prefers-reduced-motion` on web).

### Don't:
- Use cream/sand/parchment/warm-tinted backgrounds. (No-Beige)
- Introduce a decorative third accent, gradient text, or eyebrow kickers on sections.
- Run the serif as body text, or pair it with a second display face.
- Lighten text below 4.5:1. (Muted-Floor)
- Elevate anything beyond the single active swipe card. (Calm-Surface)
- Hard-code hex in components; tokens only.
