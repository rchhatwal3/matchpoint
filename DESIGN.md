---
name: matchpoint
description: Swipe together, match on what you both want — food, trips, activities, date nights, and shows.
colors:
  primary: "#C2314F"
  on-primary: "#FFFFFF"
  primary-container: "#FFD9DF"
  on-primary-container: "#5C0A1F"
  secondary: "#2E6B7A"
  secondary-container: "#CDE9F0"
  on-secondary-container: "#0B3A45"
  bg: "#FAFAFA"
  surface: "#FFFFFF"
  surface-variant: "#F0EFED"
  ink: "#1C1B1A"
  ink-muted: "#5B5854"
  outline: "#D8D5D0"
  success: "#1E7A3D"
  success-container: "#E6F7EA"
  on-success-container: "#0F4022"
  danger: "#B3261E"
  danger-container: "#FFDAD6"
  on-danger-container: "#410002"
  dark-bg: "#151312"
  dark-surface: "#211E1C"
  dark-ink: "#F2F0ED"
  dark-primary: "#F08CA1"
  dark-secondary: "#8CC5D4"
typography:
  display:
    fontFamily: "Nunito, system-ui, sans-serif"
    fontSize: "40"
    fontWeight: 800
    lineHeight: "46"
    letterSpacing: "-0.5"
  headline:
    fontFamily: "Nunito, system-ui, sans-serif"
    fontSize: "28"
    fontWeight: 700
    lineHeight: "34"
  title:
    fontFamily: "Nunito, system-ui, sans-serif"
    fontSize: "18"
    fontWeight: 600
    lineHeight: "24"
  body:
    fontFamily: "Nunito, system-ui, sans-serif"
    fontSize: "16"
    fontWeight: 400
    lineHeight: "24"
  label:
    fontFamily: "Nunito, system-ui, sans-serif"
    fontSize: "14"
    fontWeight: 600
    lineHeight: "20"
  overline:
    fontFamily: "Nunito, system-ui, sans-serif"
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
    rounded: "{rounded.full}"
    padding: "8px 16px"
  input-code:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    rounded: "{rounded.md}"
    height: "56px"
---

# Design System: matchpoint

## 1. Overview

**Creative North Star: "Raspberry & Lagoon"**

matchpoint is a decision game for two, so it should feel like date-night energy
the moment it opens — but warmth is earned by a confident raspberry accent and
springy card physics, not by a beige page. Two colors do real work: a
**raspberry** primary that carries every action, the like-swipe, and the app's
identity, and a **lagoon teal** secondary that means one concrete thing in the
product: *the other person* — their presence, their turn, their half of the
match. Backgrounds stay near-neutral and quiet so card imagery, state color,
and text stay legible mid-swipe.

This is a **product-register** adaptive app (Expo: iOS + Android + web), mobile-first. Carried over from prior
project hard stops: the Two-Color Rule, No-Beige Rule, Muted-Floor Rule, and
Calm-Surface Rule all apply verbatim.

**Key Characteristics:**
- Two working colors: raspberry (identity + actions + "like") and lagoon (partner presence).
- Near-neutral surfaces, first-class dark theme via `lib/theme` tokens + `useTheme()`.
- One button vocabulary; every touch target ≥ 48px.
- Motion confirms state — card spring, match reveal — and nothing else. All gated on `prefers-reduced-motion`.

## 2. Colors

### Primary
- **Raspberry** (light `#C2314F`, dark `#F08CA1`): brand color and every primary
  action — the like button, filled CTAs, active category, focus ring, the swipe-right
  glow on a card.
- **Raspberry Container** (`#FFD9DF` / dark `#6B1230`): soft accent fills — invite-code
  badge, empty-state icon badges, tonal buttons, match-card halo.

### Secondary
- **Lagoon** (light `#2E6B7A`, dark `#8CC5D4`): the partner's voice. Partner presence
  dot, "waiting on partner" states, their avatar ring in the match reveal.

### Neutral
- **Ink** (`#1C1B1A` / dark `#F2F0ED`), **Ink Muted** (`#5B5854` / dark `#B8B3AC`),
  **Background** (`#FAFAFA` / dark `#151312`), **Surface** (`#FFFFFF` / dark `#211E1C`),
  **Surface Variant** (`#F0EFED` / dark `#2A2622`), **Outline** (`#D8D5D0` / dark `#46413B`).

### Named Rules (hard stops — carried from prior projects)
**The Two-Color Rule.** The surface only speaks raspberry (action/identity/like) and
lagoon (partner). Everything else is neutral. A third accent must carry real meaning,
never decoration. (Green success-container is reserved for the matched badge only.)

**The No-Beige Rule.** Backgrounds are chroma-0 neutrals. Warmth lives in the accent
and the type, never in a cream, sand, or parchment body fill.

## 3. Typography

**Type family:** Nunito (`@expo-google-fonts/nunito`), system-ui fallback. One family, multiple weights — rounded terminals give the playful voice
without a decorative display face.

### Named Rules
**The Muted-Floor Rule.** Muted text uses Ink Muted (`#5B5854`), verified ≥ 4.5:1 on
both background and surface. Never lighten body or placeholder text "for elegance."

## 4. Elevation

Calm, nearly flat at rest. Depth conveyed by soft shadow only:
- **Level 1** (`0 1px 3px rgba(0,0,0,0.06)`): resting cards, list rows.
- **Level 2** (`0 4px 16px rgba(0,0,0,0.12)`): the active swipe card only — the one
  lifted element per screen.

**The Calm-Surface Rule.** Cards sit at Level 1 and stay there. Only the top card of
the swipe deck rises to Level 2. If everything is elevated, nothing is.

## 5. Components

### Swipe Card (signature)
- Full-bleed image or colored panel, 24px radius, title + meta pinned bottom over a
  scrim. Drag physics: rotation follows drag x, raspberry "LIKE" / neutral "PASS"
  stamp fades in with drag distance. Buttons (✕ / ♥, both ≥ 56px) mirror the gesture
  for accessibility.

### Match Reveal (signature)
- When both swipe right: card pauses, raspberry-container halo, both avatars
  (raspberry ring = you, lagoon ring = partner), single spring scale-in.
  Reduced-motion: static reveal, no confetti anywhere.

### Buttons
- Fully rounded pill, min height 48px. Filled raspberry (default action), tonal
  (secondary), outlined (neutral). Press scales to 0.97; disabled 50% opacity.

### Invite Code
- 6-character code in a `surface` field, 56px tall, overline-tracked monospace-ish
  spacing, one-tap copy. Join screen: single input, auto-uppercase.

### Empty & Waiting states
- Raspberry-container icon badge + title + one sentence + optional CTA. "Waiting on
  partner" states use lagoon. Skeletons shaped like real cards, never spinners.

## 6. Do's and Don'ts

### Do:
- Route every color through `lib/theme` tokens and `useTheme()`; light/dark resolve automatically.
- Keep raspberry for actions/likes and lagoon for partner state; leave everything else neutral.
- Give every touch target ≥ 48px and gesture actions button equivalents.
- Gate every animation on `useReducedMotion()` (maps to `prefers-reduced-motion` on web).

### Don't:
- Use cream/sand/parchment/warm-tinted backgrounds. (No-Beige)
- Introduce a decorative third accent, gradient text, or eyebrow kickers on sections.
- Lighten text below 4.5:1. (Muted-Floor)
- Elevate anything beyond the single active swipe card. (Calm-Surface)
- Hard-code hex in components; tokens only.
