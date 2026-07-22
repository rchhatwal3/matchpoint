# Graph Report - .  (2026-07-22)

## Corpus Check
- 58 files · ~66,276 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 246 nodes · 463 edges · 10 communities (9 shown, 1 thin omitted)
- Extraction: 100% EXTRACTED · 0% INFERRED · 0% AMBIGUOUS
- Token cost: 0 input · 0 output

## Community Hubs (Navigation)
- App Screens & Layout
- Dependencies & Fonts
- Lobby & Date Night
- Expo App Config
- Theme Toggle
- Package Manifest
- Swipe Deck & Price Filter
- TypeScript Config
- Restaurants Edge Function
- ESLint Config

## God Nodes (most connected - your core abstractions)
1. `useTheme()` - 39 edges
2. `Text()` - 17 edges
3. `useSession()` - 15 edges
4. `expo` - 12 edges
5. `Button()` - 10 edges
6. `useReducedMotion()` - 9 edges
7. `expo-router` - 8 edges
8. `Screen()` - 8 edges
9. `scripts` - 8 edges
10. `CodeDisplay()` - 6 edges

## Surprising Connections (you probably didn't know these)
- `ThemeToggleOverlay()` --calls--> `useTheme()`  [EXTRACTED]
  app/_layout.tsx → lib/theme/index.ts
- `ThemedApp()` --calls--> `useTheme()`  [EXTRACTED]
  app/_layout.tsx → lib/theme/index.ts
- `SwipeDeck()` --calls--> `useReducedMotion()`  [EXTRACTED]
  app/swipe/[category].tsx → lib/theme/index.ts
- `SwipeDeck()` --calls--> `useTheme()`  [EXTRACTED]
  app/swipe/[category].tsx → lib/theme/index.ts
- `SwipeDeck()` --calls--> `useSession()`  [EXTRACTED]
  app/swipe/[category].tsx → providers/SessionProvider.tsx

## Import Cycles
- None detected.

## Communities (10 total, 1 thin omitted)

### Community 0 - "App Screens & Layout"
Cohesion: 0.10
Nodes (35): DateNight(), friendlyError(), Home(), styles, styles, ThemedApp(), ThemeToggleOverlay(), Lobby() (+27 more)

### Community 1 - "Dependencies & Fonts"
Cohesion: 0.04
Nodes (45): expo, expo-clipboard, expo-constants, expo-font, @expo-google-fonts/figtree, @expo-google-fonts/fraunces, expo-linking, expo-router (+37 more)

### Community 2 - "Lobby & Date Night"
Cohesion: 0.14
Nodes (23): DATE_CATEGORIES, styles, styles, styles, EmptyState(), Header(), styles, Screen() (+15 more)

### Community 3 - "Expo App Config"
Cohesion: 0.07
Nodes (26): backgroundColor, backgroundImage, foregroundImage, monochromeImage, adaptiveIcon, predictiveBackGestureEnabled, baseUrl, reactCompiler (+18 more)

### Community 4 - "Theme Toggle"
Cohesion: 0.12
Nodes (22): GLYPH, LABEL, NEXT, styles, ThemeToggle(), Theme, isPreference(), preferenceStore (+14 more)

### Community 5 - "Package Manifest"
Cohesion: 0.09
Nodes (21): eslint, eslint-config-expo, devDependencies, eslint, eslint-config-expo, @types/react, typescript, main (+13 more)

### Community 6 - "Swipe Deck & Price Filter"
Cohesion: 0.17
Nodes (13): styles, SwipeDeck(), LABEL, PRICE_LEVELS, PriceFilter(), styles, SPRING, styles (+5 more)

### Community 7 - "TypeScript Config"
Cohesion: 0.13
Nodes (14): dist, expo-env.d.ts, expo/tsconfig.base, .expo/types/**/*.ts, node_modules, supabase/functions, **/*.ts, **/*.tsx (+6 more)

### Community 8 - "Restaurants Edge Function"
Cohesion: 0.22
Nodes (12): cors, cuisineLabel(), describe(), fetchPlaces(), ItemRow, json(), Place, PLACES_KEY (+4 more)

## Knowledge Gaps
- **112 isolated node(s):** `name`, `slug`, `version`, `orientation`, `icon` (+107 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **1 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `plugins` connect `Expo App Config` to `Lobby & Date Night`?**
  _High betweenness centrality (0.095) - this node is a cross-community bridge._
- **Why does `expo-router` connect `Lobby & Date Night` to `App Screens & Layout`, `Expo App Config`, `Swipe Deck & Price Filter`?**
  _High betweenness centrality (0.087) - this node is a cross-community bridge._
- **What connects `name`, `slug`, `version` to the rest of the system?**
  _112 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `App Screens & Layout` be split into smaller, more focused modules?**
  _Cohesion score 0.10048309178743961 - nodes in this community are weakly interconnected._
- **Should `Dependencies & Fonts` be split into smaller, more focused modules?**
  _Cohesion score 0.044444444444444446 - nodes in this community are weakly interconnected._
- **Should `Lobby & Date Night` be split into smaller, more focused modules?**
  _Cohesion score 0.13793103448275862 - nodes in this community are weakly interconnected._
- **Should `Expo App Config` be split into smaller, more focused modules?**
  _Cohesion score 0.06896551724137931 - nodes in this community are weakly interconnected._