---
name: matchpoint
description: Swipe together, match on what you both want — food, trips, activities, date nights, and shows.
colors:
  primary: "#CC3311"
  on-primary: "#FFFFFF"
  primary-container: "#FFDDD0"
  on-primary-container: "#4A1400"
  secondary: "#5548C8"
  on-secondary: "#FFFFFF"
  secondary-container: "#E4E0FF"
  on-secondary-container: "#211066"
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
  dark-bg: "#141414"
  dark-surface: "#1F1F1F"
  dark-ink: "#F2F2F2"
  dark-ink-muted: "#ABABAB"
  dark-primary: "#FF8A66"
  dark-secondary: "#B7ADFF"
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

**Creative North Star: "Flame & Iris"**

matchpoint is a decision game for two, so it should feel like date-night energy
the moment it opens — but warmth is earned by a confident **flame vermilion**
accent and springy card physics, not by a beige page. Two colors do real work: a
**flame** primary (`#CC3311`) that carries every action, the like-swipe, and the
app's identity, and an **iris violet** secondary (`#5548C8`) that means one
concrete thing in the product: *the other person* — their presence, their turn,
their half of the match. Backgrounds stay chroma-0 neutral so card imagery, state
color, and text stay legible mid-swipe.

This is a **product-register** adaptive app (Expo: iOS + Android + web),
mobile-first, rendering as a centered phone-width column on desktop web. Carried
over from prior project hard stops: the Two-Color Rule, No-Beige Rule,
Muted-Floor Rule, and Calm-Surface Rule all apply verbatim.

**Key Characteristics:**
- Two working colors: flame (identity + actions + "like") and iris (partner presence).
- Near-neutral surfaces, first-class dark theme via `lib/theme` tokens + `useTheme()`, plus a user-facing light/dark/system toggle.
- A serif/sans pairing: **Fraunces** carries display moments, **Figtree** carries all UI text.
- One button vocabulary; every touch target ≥ 48px.
- Motion confirms state — card spring, match reveal — and nothing else. All gated on `useReducedMotion()`.

## 2. Colors

Every text-bearing pair is WCAG-AA verified (≥ 4.5:1) in both light and dark; the
tightest is flame/white at 5.19:1.

### Primary
- **Flame** (light `#CC3311`, dark `#FF8A66`): brand color and every primary
  action — the like button, filled CTAs, active category, focus ring, the
  swipe-right glow on a card. In dark mode it lifts to a toasted coral so it stays
  legible on charcoal.
- **Flame Container** (`#FFDDD0` / dark `#8A2408`): soft accent fills — invite-code
  badge, empty-state icon badges, tonal buttons, match-card halo.

### Secondary
- **Iris** (light `#5548C8`, dark `#B7ADFF`): the partner's voice. Partner presence
  dot, "waiting on partner" states, their avatar ring in the match reveal. It is
  deliberately a cool violet so it never reads as a second warm accent competing
  with flame.

### Neutral
- **Ink** (`#1A1A1A` / dark `#F2F2F2`), **Ink Muted** (`#5C5C5C` / dark `#ABABAB`),
  **Background** (`#FAFAFA` / dark `#141414`), **Surface** (`#FFFFFF` / dark `#1F1F1F`),
  **Surface Variant** (`#EFEFEF` / dark `#2A2A2A`), **Outline** (`#D9D9D9` / dark `#444444`).

### Named Rules (hard stops — carried from prior projects)
**The Two-Color Rule.** The surface only speaks flame (action/identity/like) and
iris (partner). Everything else is neutral. A third accent must carry real meaning,
never decoration. (Green success-container is reserved for the matched badge only;
red danger for destructive actions only.)

**The No-Beige Rule.** Backgrounds are chroma-0 neutrals. Warmth lives in the flame
accent and the type, never in a cream, sand, or parchment body fill.

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
**The Muted-Floor Rule.** Muted text uses Ink Muted (`#5C5C5C` / dark `#ABABAB`),
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
  drag x, flame "LIKE" / neutral "PASS" stamp fades in with drag distance. Buttons
  (✕ / ♥, both ≥ 56px) mirror the gesture for accessibility.

### Match Reveal (signature)
- When both swipe right: card pauses, flame-container halo, both avatars
  (flame ring = you, iris ring = partner), single spring scale-in, "IT'S A MATCH"
  set in Fraunces. Reduced-motion: static reveal, no confetti anywhere.

### Buttons
- Fully rounded pill, min height 48px. Filled flame (default action), tonal
  (secondary), outlined (neutral). Press scales to 0.97; disabled 50% opacity.

### Category tiles / Invite code / Empty states
- Category picker: 2-column grid of neutral surface tiles (glyph + label, ≥72px),
  flame-container only for pressed/active state.
- Invite code: 6-character code in a `surface` field, 56px tall, one-tap copy.
- Empty / waiting states: flame-container icon badge + title + one sentence + optional
  CTA. "Waiting on partner" states use iris. Skeletons shaped like real cards, never spinners.

## 6. Do's and Don'ts

### Do:
- Route every color through `lib/theme` tokens and `useTheme()`; light/dark resolve automatically.
- Keep flame for actions/likes and iris for partner state; leave everything else neutral.
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
