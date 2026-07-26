# GDPR/EU Consent + Legal Page Hosting Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Wire the GDPR/EU consent checkboxes into the anonymous-entry and email-upgrade flows, host the already-drafted Terms of Service and Privacy Policy inside the Expo web app, record consent defensibly, and provide the minimum data-subject-rights (export + delete) mechanism — all as surgical additions that respect the repo's theme, testing, and branch protocols.

**Architecture:** All testable logic (consent gating, a markdown-subset parser, policy metadata) lands in `lib/` as pure functions so the 90% coverage gate stays green. Legal documents are stored as markdown string constants (verbatim from the finalized drafts) and rendered by a single themed `LegalDocument` component behind two static expo-router routes. Consent is *gated* client-side and *recorded* server-side as a version + timestamp on the `members` row (written at exactly the moment consent is given, via the existing `create_room`/`join_room` RPCs). Data-subject rights use an in-app "Delete my data" control (the only mechanism that works for anonymous users, per the memo) plus a manual export runbook + published contact email.

**Tech Stack:** Expo + expo-router (SDK 57), React Native (react-native-web for web), TypeScript, Supabase (Postgres + SECURITY DEFINER RPCs), Jest (jest-expo) for `lib/` unit tests, theme tokens in `lib/theme/tokens.ts`.

## Global Constraints

Every task's requirements implicitly include this section. Values are copied verbatim from the repo's binding docs.

- **Branch → review → test → PR (CLAUDE.md):** one `feat/<slug>` branch off `main` per task; `/caveman-commit` for each commit message; `/caveman-review` on each diff before it lands; never push to `main`; open a PR with `gh pr create` and STOP for human merge.
- **Hex colors only in `lib/theme/tokens.ts`.** The check `grep -rEn "#[0-9a-fA-F]{6}" app components providers --include="*.tsx"` MUST return **0 hits**. Resolve every color via `useTheme()`.
- **DESIGN.md is binding — four hard-stop rules:** Two-Color Rule (surface speaks only crimson `primary` for action/identity/like and teal `secondary` for the other person — no third accent), No-Beige Rule (backgrounds are near-chroma-0 neutrals via `bg`/`surface`; never cream/sand/parchment), Muted-Floor Rule (muted text uses `inkMuted`, never lighter than 4.5:1), Calm-Surface Rule (cards sit at elevation `level1`; only the active swipe card is `level2`).
- **90% coverage gate** on `lib/` (`jest.config.js`: branches/functions/lines/statements = 90). UI components, screens, providers, and theme are out of coverage scope — their logic is extracted into `lib/`.
- **No web-only libraries** (no framer-motion, react-router-dom, or a browser-only markdown renderer). expo-router + react-native primitives only.
- **Frontend never calls third-party APIs directly**; server work goes through Supabase RPCs / edge functions. Never place the `service_role` key in the repo.
- **Web is the live target:** GitHub Pages, `app.json` `experiments.baseUrl: "/matchpoint"`. expo-router prepends the baseUrl automatically, so `router.push('/legal/terms')` resolves to `/matchpoint/legal/terms` on the deployed site — always use router-relative paths, never hardcode `/matchpoint`.
- **Legal drafts are DONE** at `docs/compliance/TERMS_OF_SERVICE.draft.md` and `docs/compliance/PRIVACY_POLICY.draft.md`. This plan hosts them; it does not rewrite them. Their `[PLACEHOLDER]` fields (legal entity, contact email, dates, jurisdiction) must be filled by the human/counsel before the pages go live — tracked as a manual step, not blocking the wiring.

---

## Decisions (recommendations, with the rationale)

These are the load-bearing choices the task asked to settle. They are locked into the tasks below.

**1. Which checkboxes appear where.** Minimal compliant set per surface, all unticked by default, separate (never bundled):

- **Anonymous entry (`app/index.tsx`) — two mandatory checkboxes, both block "Create room" and "Join room" until ticked:**
  - **A1** — combined Terms + Privacy acceptance, with both document names as tappable links: *"I agree to matchpoint's [Terms of Service] and [Privacy Policy]."*
  - **A2** — age gate, separate box: *"I confirm I am 18 years of age or older."*
  - No consent checkbox for the core data processing itself (swipes/locations/room) — that runs on contract/legitimate interests, not consent; the A1 Privacy Policy link is the required transparency notice. This is why the gate lives at anonymous entry: processing (anon session, swipes, saved locations) begins immediately, so acceptance + age must precede it.
- **Email upgrade (`app/account.tsx`) — one mandatory checkbox + one inline notice; email itself needs no consent box:**
  - **B1** — inline helper text next to the email field (NOT a checkbox), because emailing an OTP is contract-based for the feature the user requested: *"We'll email you a one-time code to verify this address and to help you recover your account. We won't use it for marketing."* (The screen already renders an equivalent note box — reuse/adjust it.)
  - **B2** — recovery-code acknowledgement checkbox, unticked, gating dismissal of the just-issued codes: *"I understand my recovery codes are the only way to regain access if I lose my email, and matchpoint cannot recover them for me. I've saved them somewhere safe."*
  - **B3** (marketing opt-in) — **omitted today** (no marketing email is sent). Documented as the single place to add later: a separate, unticked, opt-in box on this screen, consent lawful basis. Do not add it now.

**2. Where consent is recorded.** **Record it server-side, minimally**, rather than client-only gating. Because A1+A2 gate the Create/Join buttons, a `members` row is written *only after* consent is given, so stamping that row is accurate and needs no separate endpoint. Add three columns to `members` (`consent_version`, `consented_at`, `age_confirmed`), populated through the existing `create_room` / `join_room` RPCs. Rationale: GDPR accountability (Art. 5(2)) expects you to *demonstrate* acceptance; a per-user version + timestamp is the cheapest defensible evidence and lets a future policy-version bump trigger re-consent. The B2 acknowledgement is an acknowledgement (not a data-processing consent), so it is **client-gated only** — no DB column — to stay minimal. (Lighter alternative, explicitly rejected: pure client-side gating with no record — rejected because it leaves no accountability evidence, and the members row is already written at the exact gated moment, so the cost of recording is one migration.)

**3. How the legal pages are hosted.** Two static expo-router routes — `app/legal/terms.tsx` and `app/legal/privacy.tsx` — each rendering a shared themed `LegalDocument` component. Document bodies are stored as **markdown string constants** in `lib/legal/content/` (copied verbatim from the finalized drafts) and rendered via a **small pure markdown-subset parser** (`lib/legal/parse-markdown.ts`) that handles exactly the constructs the drafts use: ATX headings, paragraphs, blockquotes, horizontal rules, unordered lists, GFM pipe tables, and inline `**bold**` / `[text](url)` / `*italic*`. Rationale for the parser over (a) a markdown dependency or (b) hand-authored block arrays: a dependency risks injecting its own non-token colors (Two-Color / hex-grep risk) and adds bundle surface the repo avoids; hand-authored block arrays must be re-transcribed on every legal edit. The parser is written once, keeps content = source markdown (trivially re-synced when counsel finalizes wording/dates), and *is itself the testable `lib/` logic* that keeps coverage healthy. Pages are reachable from (i) the A1 inline links, (ii) a persistent `LegalFooter` on the entry screen, and (iii) a "Legal" section in Settings.

**4. Data-subject rights (export + delete) — minimal MVP.** Split by what actually works:

- **Delete (erasure): in-app control.** A "Delete my data" button in Settings calls a `delete_my_data()` SECURITY DEFINER RPC that removes the caller's `members` row (cascading their `swipes`) and deletes the room only when they were the last member. This is the memo's "practical erasure mechanism" — anonymous users have no email to identify themselves by, so an email-only process cannot serve them. Shared-room behavior is documented (already in the Privacy Policy §9): the erasing user's personal data is removed; the room/matches persist for the other member unless they also delete.
- **Export (access/portability): manual runbook + contact email.** Building an in-app data-export/JSON endpoint is disproportionate for a two-person MVP with tiny per-user data and rare requests; GDPR permits manual fulfillment within one month. Deliverable: a short internal runbook (`docs/compliance/DSAR_RUNBOOK.md`) with the SQL to assemble a user's data, plus ensuring the published contact email in the legal pages is real. (Rejected alternative: in-app export button now — deferred as a fast-follow; noted in the runbook.)

**5. Where testable logic lives.** `lib/consent/consent-logic.ts` (pure gate `canEnterApp`), `lib/legal/policy-meta.ts` (`POLICY_VERSION`, `POLICY_EFFECTIVE_DATE`), and `lib/legal/parse-markdown.ts` (pure parser) are all unit-tested to ≥90%. The raw content files under `lib/legal/content/` are data (like `lib/theme/`), so they are excluded from coverage in `jest.config.js`.

---

## File Structure

**New files:**
- `lib/legal/policy-meta.ts` — `POLICY_VERSION`, `POLICY_EFFECTIVE_DATE` constants (single source of truth for the recorded consent version). Covered.
- `lib/consent/consent-logic.ts` — pure consent-gate predicate(s). Covered.
- `lib/consent/consent-logic.test.ts` — tests.
- `lib/legal/parse-markdown.ts` — pure markdown-subset parser + `Block` types. Covered.
- `lib/legal/parse-markdown.test.ts` — tests.
- `lib/legal/content/terms.ts` — `export const termsMarkdown = \`…\`` (verbatim body). Coverage-excluded.
- `lib/legal/content/privacy.ts` — `export const privacyMarkdown = \`…\`` (verbatim body). Coverage-excluded.
- `components/LegalDocument.tsx` — themed renderer: `parseMarkdown(md)` → RN views.
- `components/Checkbox.tsx` — themed, accessible checkbox (no such component exists yet).
- `components/ConsentChecklist.tsx` — the A1 (with links) + A2 rows; presentational.
- `components/LegalFooter.tsx` — Terms / Privacy footer links.
- `app/legal/terms.tsx` — route rendering `<LegalDocument markdown={termsMarkdown} />`.
- `app/legal/privacy.tsx` — route rendering `<LegalDocument markdown={privacyMarkdown} />`.
- `supabase/migrations/013_consent.sql` — `members` consent columns + updated `create_room`/`join_room` RPCs.
- `supabase/migrations/014_delete_my_data.sql` — `delete_my_data()` RPC + grant.
- `docs/compliance/DSAR_RUNBOOK.md` — manual export/delete runbook.

**Modified files:**
- `jest.config.js` — add `'!lib/legal/content/**'` to `collectCoverageFrom`.
- `app/index.tsx` — mount `<ConsentChecklist>`; gate Create/Join on `canEnterApp(...)`; add `<LegalFooter>`.
- `app/account.tsx` — add B2 checkbox gating the recovery-codes dismissal.
- `app/settings.tsx` — add a "Legal" section (Terms/Privacy) and a "Delete my data" control in the Account section.
- `providers/SessionProvider.tsx` — pass `POLICY_VERSION` + age flag through `create_room`/`join_room`; add `deleteMyData()`.

---

### Task 1: Consent gate logic + policy metadata (lib, pure)

**Files:**
- Create: `lib/legal/policy-meta.ts`
- Create: `lib/consent/consent-logic.ts`
- Test: `lib/consent/consent-logic.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `POLICY_VERSION: string`, `POLICY_EFFECTIVE_DATE: string` (from `lib/legal/policy-meta.ts`).
  - `type ConsentState = { tosAccepted: boolean; ageConfirmed: boolean }`
  - `canEnterApp(state: ConsentState): boolean` — true only when both are true (from `lib/consent/consent-logic.ts`).

- [ ] **Step 1: Write the failing test**

`lib/consent/consent-logic.test.ts`:

```typescript
import { canEnterApp, type ConsentState } from './consent-logic';
import { POLICY_VERSION, POLICY_EFFECTIVE_DATE } from '@/lib/legal/policy-meta';

describe('canEnterApp', () => {
  const base: ConsentState = { tosAccepted: false, ageConfirmed: false };

  it('blocks when nothing is accepted', () => {
    expect(canEnterApp(base)).toBe(false);
  });
  it('blocks when only terms are accepted', () => {
    expect(canEnterApp({ ...base, tosAccepted: true })).toBe(false);
  });
  it('blocks when only age is confirmed', () => {
    expect(canEnterApp({ ...base, ageConfirmed: true })).toBe(false);
  });
  it('allows only when both are true', () => {
    expect(canEnterApp({ tosAccepted: true, ageConfirmed: true })).toBe(true);
  });
});

describe('policy metadata', () => {
  it('exposes a non-empty version and effective date', () => {
    expect(POLICY_VERSION.length).toBeGreaterThan(0);
    expect(POLICY_EFFECTIVE_DATE.length).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- consent-logic`
Expected: FAIL — cannot find module `./consent-logic` / `@/lib/legal/policy-meta`.

- [ ] **Step 3: Write the implementation**

`lib/legal/policy-meta.ts`:

```typescript
/**
 * Version stamp recorded against each user's consent (members.consent_version).
 * Bump this whenever the Terms or Privacy Policy change materially so a future
 * re-consent prompt can compare against what the user last accepted.
 * Keep in sync with the "Effective date" printed on the hosted legal pages.
 */
export const POLICY_VERSION = '2026-07-26';
export const POLICY_EFFECTIVE_DATE = '2026-07-26';
```

`lib/consent/consent-logic.ts`:

```typescript
export type ConsentState = {
  /** A1: agreed to Terms of Service + Privacy Policy. */
  tosAccepted: boolean;
  /** A2: confirmed 18 or older. */
  ageConfirmed: boolean;
};

/** Anonymous entry is allowed only once both mandatory boxes are ticked. */
export function canEnterApp(state: ConsentState): boolean {
  return state.tosAccepted && state.ageConfirmed;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- consent-logic`
Expected: PASS (all 6 assertions).

- [ ] **Step 5: Commit**

```bash
git add lib/legal/policy-meta.ts lib/consent/consent-logic.ts lib/consent/consent-logic.test.ts
git commit -m "feat: consent gate logic + policy version metadata"
```

---

### Task 2: Markdown-subset parser (lib, pure)

**Files:**
- Create: `lib/legal/parse-markdown.ts`
- Test: `lib/legal/parse-markdown.test.ts`
- Modify: `jest.config.js` (exclude `lib/legal/content/**` from coverage)

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `type Inline = { text: string; bold?: boolean; italic?: boolean; href?: string }`
  - `type Block =`
    - `{ type: 'heading'; level: 1 | 2 | 3; spans: Inline[] }`
    - `{ type: 'paragraph'; spans: Inline[] }`
    - `{ type: 'bullets'; items: Inline[][] }`
    - `{ type: 'quote'; spans: Inline[] }`
    - `{ type: 'rule' }`
    - `{ type: 'table'; header: Inline[][]; rows: Inline[][][] }`
  - `parseMarkdown(src: string): Block[]`

- [ ] **Step 1: Write the failing test**

`lib/legal/parse-markdown.test.ts`:

```typescript
import { parseMarkdown, type Block } from './parse-markdown';

describe('parseMarkdown — blocks', () => {
  it('parses ATX headings at levels 1-3', () => {
    const b = parseMarkdown('# One\n\n## Two\n\n### Three');
    expect(b.map((x) => x.type)).toEqual(['heading', 'heading', 'heading']);
    expect((b[0] as Extract<Block, { type: 'heading' }>).level).toBe(1);
    expect((b[2] as Extract<Block, { type: 'heading' }>).level).toBe(3);
  });

  it('parses a paragraph split by blank lines', () => {
    const b = parseMarkdown('First para.\n\nSecond para.');
    expect(b).toHaveLength(2);
    expect(b[0].type).toBe('paragraph');
  });

  it('parses a bullet list into one block', () => {
    const b = parseMarkdown('- a\n- b\n- c');
    expect(b).toHaveLength(1);
    const list = b[0] as Extract<Block, { type: 'bullets' }>;
    expect(list.type).toBe('bullets');
    expect(list.items).toHaveLength(3);
  });

  it('parses a blockquote and a horizontal rule', () => {
    const b = parseMarkdown('> note\n\n---');
    expect(b[0].type).toBe('quote');
    expect(b[1].type).toBe('rule');
  });

  it('parses a GFM table, skipping the separator row', () => {
    const src = '| A | B |\n|---|---|\n| 1 | 2 |\n| 3 | 4 |';
    const t = parseMarkdown(src)[0] as Extract<Block, { type: 'table' }>;
    expect(t.type).toBe('table');
    expect(t.header).toHaveLength(2);
    expect(t.rows).toHaveLength(2);
    expect(t.rows[0][1][0].text).toBe('2');
  });
});

describe('parseMarkdown — inline', () => {
  it('parses bold, italic, and links', () => {
    const p = parseMarkdown('a **b** c *d* [e](https://x.io)')[0] as Extract<
      Block,
      { type: 'paragraph' }
    >;
    const bold = p.spans.find((s) => s.bold);
    const italic = p.spans.find((s) => s.italic);
    const link = p.spans.find((s) => s.href);
    expect(bold?.text).toBe('b');
    expect(italic?.text).toBe('d');
    expect(link).toEqual({ text: 'e', href: 'https://x.io' });
  });

  it('returns [] for empty input', () => {
    expect(parseMarkdown('')).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- parse-markdown`
Expected: FAIL — cannot find module `./parse-markdown`.

- [ ] **Step 3: Write the implementation**

`lib/legal/parse-markdown.ts`:

```typescript
export type Inline = { text: string; bold?: boolean; italic?: boolean; href?: string };

export type Block =
  | { type: 'heading'; level: 1 | 2 | 3; spans: Inline[] }
  | { type: 'paragraph'; spans: Inline[] }
  | { type: 'bullets'; items: Inline[][] }
  | { type: 'quote'; spans: Inline[] }
  | { type: 'rule' }
  | { type: 'table'; header: Inline[][]; rows: Inline[][][] };

// Split "| a | b |" into ["a", "b"] (drop leading/trailing empty cells).
function splitRow(line: string): string[] {
  return line
    .trim()
    .replace(/^\||\|$/g, '')
    .split('|')
    .map((c) => c.trim());
}

const isTableSep = (line: string) => /^\|?\s*:?-{3,}.*$/.test(line) && line.includes('-');

// Inline: **bold**, *italic*, [text](href). Single left-to-right scan.
export function parseInline(text: string): Inline[] {
  const spans: Inline[] = [];
  const re = /\*\*(.+?)\*\*|\*(.+?)\*|\[([^\]]+)\]\(([^)]+)\)/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) spans.push({ text: text.slice(last, m.index) });
    if (m[1] !== undefined) spans.push({ text: m[1], bold: true });
    else if (m[2] !== undefined) spans.push({ text: m[2], italic: true });
    else spans.push({ text: m[3], href: m[4] });
    last = re.lastIndex;
  }
  if (last < text.length) spans.push({ text: text.slice(last) });
  return spans.length > 0 ? spans : [{ text }];
}

export function parseMarkdown(src: string): Block[] {
  const lines = src.replace(/\r\n/g, '\n').split('\n');
  const blocks: Block[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];
    const trimmed = line.trim();

    if (trimmed === '') { i++; continue; }

    if (/^-{3,}$/.test(trimmed)) { blocks.push({ type: 'rule' }); i++; continue; }

    const heading = /^(#{1,3})\s+(.*)$/.exec(trimmed);
    if (heading) {
      blocks.push({
        type: 'heading',
        level: heading[1].length as 1 | 2 | 3,
        spans: parseInline(heading[2]),
      });
      i++;
      continue;
    }

    if (trimmed.startsWith('>')) {
      blocks.push({ type: 'quote', spans: parseInline(trimmed.replace(/^>\s?/, '')) });
      i++;
      continue;
    }

    // Table: a pipe row immediately followed by a separator row.
    if (trimmed.startsWith('|') && i + 1 < lines.length && isTableSep(lines[i + 1])) {
      const header = splitRow(trimmed).map(parseInline);
      i += 2;
      const rows: Inline[][][] = [];
      while (i < lines.length && lines[i].trim().startsWith('|')) {
        rows.push(splitRow(lines[i].trim()).map(parseInline));
        i++;
      }
      blocks.push({ type: 'table', header, rows });
      continue;
    }

    if (/^[-*]\s+/.test(trimmed)) {
      const items: Inline[][] = [];
      while (i < lines.length && /^[-*]\s+/.test(lines[i].trim())) {
        items.push(parseInline(lines[i].trim().replace(/^[-*]\s+/, '')));
        i++;
      }
      blocks.push({ type: 'bullets', items });
      continue;
    }

    // Paragraph: gather consecutive non-blank, non-special lines.
    const para: string[] = [];
    while (i < lines.length && lines[i].trim() !== '' && !/^(#{1,3}\s|>|[-*]\s|-{3,}$|\|)/.test(lines[i].trim())) {
      para.push(lines[i].trim());
      i++;
    }
    blocks.push({ type: 'paragraph', spans: parseInline(para.join(' ')) });
  }

  return blocks;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- parse-markdown`
Expected: PASS (all assertions).

- [ ] **Step 5: Exclude content data from coverage**

In `jest.config.js`, change the `collectCoverageFrom` line to add the content exclusion:

```javascript
  collectCoverageFrom: ['lib/**/*.ts', '!lib/**/*.test.ts', '!lib/theme/**', '!lib/usePriceLevels.ts', '!lib/legal/content/**'],
```

- [ ] **Step 6: Verify full suite + coverage still green**

Run: `npm run test:ci`
Expected: PASS with coverage ≥90% on all four metrics (the parser and consent-logic are fully covered; content is excluded).

- [ ] **Step 7: Commit**

```bash
git add lib/legal/parse-markdown.ts lib/legal/parse-markdown.test.ts jest.config.js
git commit -m "feat: pure markdown-subset parser for legal pages"
```

---

### Task 3: Host the legal pages (content, renderer, routes, footer, settings links)

**Files:**
- Create: `lib/legal/content/terms.ts`, `lib/legal/content/privacy.ts`
- Create: `components/LegalDocument.tsx`, `components/LegalFooter.tsx`
- Create: `app/legal/terms.tsx`, `app/legal/privacy.tsx`
- Modify: `app/settings.tsx` (add "Legal" section)

**Interfaces:**
- Consumes: `parseMarkdown`, `Block`, `Inline` (Task 2); `POLICY_EFFECTIVE_DATE` (Task 1); existing `Screen`, `Header`, `Text` components; `useTheme`.
- Produces:
  - `termsMarkdown: string`, `privacyMarkdown: string`.
  - `<LegalDocument markdown={string} />`.
  - `<LegalFooter />` — two `Text` links (`router.push('/legal/terms' | '/legal/privacy')`).

- [ ] **Step 1: Create the content modules**

`lib/legal/content/terms.ts` — copy the **body** of `docs/compliance/TERMS_OF_SERVICE.draft.md` verbatim into a template literal (escape any backticks). `lib/legal/content/privacy.ts` — same for `PRIVACY_POLICY.draft.md`:

```typescript
// Verbatim body of docs/compliance/TERMS_OF_SERVICE.draft.md.
// Update this string whenever counsel finalizes wording/placeholders; bump
// POLICY_VERSION in lib/legal/policy-meta.ts on material change.
export const termsMarkdown = `# matchpoint — Terms of Service
... (full draft body, unchanged) ...
`;
```

```typescript
// Verbatim body of docs/compliance/PRIVACY_POLICY.draft.md.
export const privacyMarkdown = `# matchpoint — Privacy Policy
... (full draft body, unchanged) ...
`;
```

Note: the drafts still contain `[PLACEHOLDER]` fields and a DRAFT banner — copy them as-is. Filling placeholders + removing the DRAFT banner is a counsel/manual step tracked in `MANUAL_TODOS.md` (see Task 7 note); it does not block wiring.

- [ ] **Step 2: Build the themed renderer**

`components/LegalDocument.tsx` — map `Block[]` to themed views. Headings use `Text` variants (`headline`/`title`/`label`), body uses `body`, muted metadata uses `inkMuted`, links use `colors.primary` and open via `Linking.openURL` for external `http` links or `router.push` for internal ones. Tables render as stacked rows of `View`s (a two-column key/value layout works for every table in the drafts; wrap in a horizontally scrollable `ScrollView` if a row overflows). ALL colors from `useTheme()` — no hex.

```tsx
import { Linking, ScrollView, View } from 'react-native';
import { useTheme } from '@/lib/theme';
import { Text } from '@/components/Text';
import { parseMarkdown, type Block, type Inline } from '@/lib/legal/parse-markdown';

function Spans({ spans }: { spans: Inline[] }) {
  const { colors } = useTheme();
  return (
    <Text variant="body">
      {spans.map((s, k) => (
        <Text
          key={k}
          variant="body"
          color={s.href ? colors.primary : undefined}
          style={{ fontWeight: s.bold ? '700' : undefined, fontStyle: s.italic ? 'italic' : undefined }}
          onPress={s.href ? () => void Linking.openURL(s.href as string) : undefined}
        >
          {s.text}
        </Text>
      ))}
    </Text>
  );
}

export function LegalDocument({ markdown }: { markdown: string }) {
  const { spacing } = useTheme();
  const blocks: Block[] = parseMarkdown(markdown);
  return (
    <View style={{ gap: spacing.lg }}>
      {blocks.map((b, i) => {
        switch (b.type) {
          case 'heading':
            return (
              <Text key={i} variant={b.level === 1 ? 'headline' : b.level === 2 ? 'title' : 'label'}>
                {b.spans.map((s) => s.text).join('')}
              </Text>
            );
          case 'rule':
            return <View key={i} />;
          case 'bullets':
            return (
              <View key={i} style={{ gap: spacing.xs, paddingLeft: spacing.md }}>
                {b.items.map((it, k) => (
                  <Spans key={k} spans={[{ text: '•  ' }, ...it]} />
                ))}
              </View>
            );
          case 'quote':
            return <Spans key={i} spans={b.spans} />;
          case 'table':
            return (
              <ScrollView key={i} horizontal>
                <View style={{ gap: spacing.xs }}>
                  {[b.header, ...b.rows].map((row, r) => (
                    <View key={r} style={{ flexDirection: 'row', gap: spacing.md }}>
                      {row.map((cell, c) => (
                        <View key={c} style={{ width: 160 }}>
                          <Spans spans={cell} />
                        </View>
                      ))}
                    </View>
                  ))}
                </View>
              </ScrollView>
            );
          default:
            return <Spans key={i} spans={b.spans} />;
        }
      })}
    </View>
  );
}
```

(Keep styling minimal and token-driven; this is not the swipe surface, so the Two-Color rule is easy — only link text carries `primary`, everything else is `ink`/`inkMuted`.)

- [ ] **Step 3: Create the two routes**

`app/legal/terms.tsx`:

```tsx
import { ScrollView } from 'react-native';
import { useRouter } from 'expo-router';
import { useTheme } from '@/lib/theme';
import { Screen } from '@/components/Screen';
import { Header } from '@/components/Header';
import { LegalDocument } from '@/components/LegalDocument';
import { termsMarkdown } from '@/lib/legal/content/terms';

export default function Terms() {
  const { spacing } = useTheme();
  const router = useRouter();
  return (
    <Screen>
      <Header title="Terms of Service" onBack={() => router.back()} />
      <ScrollView contentContainerStyle={{ padding: spacing['2xl'] }}>
        <LegalDocument markdown={termsMarkdown} />
      </ScrollView>
    </Screen>
  );
}
```

`app/legal/privacy.tsx` — identical but title `"Privacy Policy"` and `privacyMarkdown`.

- [ ] **Step 4: Create the footer**

`components/LegalFooter.tsx`:

```tsx
import { useRouter } from 'expo-router';
import { View } from 'react-native';
import { useTheme } from '@/lib/theme';
import { Text } from '@/components/Text';

export function LegalFooter() {
  const { colors, spacing } = useTheme();
  const router = useRouter();
  return (
    <View style={{ flexDirection: 'row', gap: spacing.lg, justifyContent: 'center', marginTop: spacing['3xl'] }}>
      <Text variant="label" color={colors.inkMuted} onPress={() => router.push('/legal/terms')}>
        Terms
      </Text>
      <Text variant="label" color={colors.inkMuted} onPress={() => router.push('/legal/privacy')}>
        Privacy
      </Text>
    </View>
  );
}
```

- [ ] **Step 5: Add a "Legal" section to Settings**

In `app/settings.tsx`, add after the "Account" section:

```tsx
        <SettingsSection title="Legal">
          <Button label="Terms of Service" variant="outlined" onPress={() => router.push('/legal/terms')} />
          <Button label="Privacy Policy" variant="outlined" onPress={() => router.push('/legal/privacy')} />
        </SettingsSection>
```

- [ ] **Step 6: Verify — typecheck, lint, hex-grep, web export, browser**

Run each and confirm:
- `npm run typecheck` → no errors.
- `npm run lint` → no errors.
- `grep -rEn "#[0-9a-fA-F]{6}" app components providers --include="*.tsx"` → **0 hits**.
- `npx expo export --platform web` → builds `dist/` with no route errors.
- Browser: start the dev server (`preview_start` name for `npm run web`, port 8081), navigate to `/legal/terms` and `/legal/privacy`; confirm the full document renders (headings, paragraphs, bullet lists, the Privacy Policy tables), links are tappable, and the back button returns. Confirm Settings → Legal opens both pages.

- [ ] **Step 7: Commit**

```bash
git add lib/legal/content components/LegalDocument.tsx components/LegalFooter.tsx app/legal app/settings.tsx
git commit -m "feat: host ToS + Privacy pages with themed markdown renderer"
```

---

### Task 4: Consent gate on anonymous entry (A1 + A2)

**Files:**
- Create: `components/Checkbox.tsx`
- Create: `components/ConsentChecklist.tsx`
- Modify: `app/index.tsx`

**Interfaces:**
- Consumes: `canEnterApp`, `ConsentState` (Task 1); `LegalFooter` (Task 3); `useTheme`, `Text`, `TOUCH_TARGET`.
- Produces:
  - `<Checkbox checked={boolean} onChange={(next: boolean) => void} accessibilityLabel={string} />`
  - `<ConsentChecklist value={ConsentState} onChange={(next: ConsentState) => void} />`

- [ ] **Step 1: Build the Checkbox component**

`components/Checkbox.tsx` — a `Pressable` box that fills with `primary` when checked, `TOUCH_TARGET` min hit area, `accessibilityRole="checkbox"` with `accessibilityState={{ checked }}`. All colors from tokens (checked = `primary`/`onPrimary`, unchecked border = `outlineStrong`).

```tsx
import { Pressable, View } from 'react-native';
import { TOUCH_TARGET, useTheme } from '@/lib/theme';
import { Text } from '@/components/Text';

export function Checkbox({
  checked,
  onChange,
  accessibilityLabel,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  accessibilityLabel: string;
}) {
  const { colors, radii } = useTheme();
  return (
    <Pressable
      accessibilityRole="checkbox"
      accessibilityState={{ checked }}
      accessibilityLabel={accessibilityLabel}
      onPress={() => onChange(!checked)}
      hitSlop={12}
      style={{ minWidth: TOUCH_TARGET, minHeight: TOUCH_TARGET, alignItems: 'center', justifyContent: 'center' }}
    >
      <View
        style={{
          width: 24,
          height: 24,
          borderRadius: radii.xs,
          borderWidth: 2,
          borderColor: checked ? colors.primary : colors.outlineStrong,
          backgroundColor: checked ? colors.primary : 'transparent',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        {checked ? <Text variant="label" color={colors.onPrimary}>✓</Text> : null}
      </View>
    </Pressable>
  );
}
```

- [ ] **Step 2: Build the ConsentChecklist**

`components/ConsentChecklist.tsx` — two rows. A1's label is a `Text` with tappable inline link spans (`onPress` → `router.push`). A2 is plain. Both boxes unticked by default (the parent owns the state, initialized to false).

```tsx
import { useRouter } from 'expo-router';
import { View } from 'react-native';
import { useTheme } from '@/lib/theme';
import { Text } from '@/components/Text';
import { Checkbox } from '@/components/Checkbox';
import type { ConsentState } from '@/lib/consent/consent-logic';

export function ConsentChecklist({
  value,
  onChange,
}: {
  value: ConsentState;
  onChange: (next: ConsentState) => void;
}) {
  const { colors, spacing } = useTheme();
  const router = useRouter();
  return (
    <View style={{ gap: spacing.md }}>
      <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm }}>
        <Checkbox
          checked={value.tosAccepted}
          onChange={(next) => onChange({ ...value, tosAccepted: next })}
          accessibilityLabel="I agree to the Terms of Service and Privacy Policy"
        />
        <Text variant="body" style={{ flex: 1 }}>
          I agree to matchpoint&apos;s{' '}
          <Text variant="body" color={colors.primary} onPress={() => router.push('/legal/terms')}>
            Terms of Service
          </Text>{' '}
          and{' '}
          <Text variant="body" color={colors.primary} onPress={() => router.push('/legal/privacy')}>
            Privacy Policy
          </Text>
          .
        </Text>
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm }}>
        <Checkbox
          checked={value.ageConfirmed}
          onChange={(next) => onChange({ ...value, ageConfirmed: next })}
          accessibilityLabel="I confirm I am 18 years of age or older"
        />
        <Text variant="body" style={{ flex: 1 }}>
          I confirm I am 18 years of age or older.
        </Text>
      </View>
    </View>
  );
}
```

- [ ] **Step 3: Wire into `app/index.tsx`**

In `app/index.tsx`:
1. Import `canEnterApp, type ConsentState` from `@/lib/consent/consent-logic`, `ConsentChecklist`, and `LegalFooter`.
2. Add state: `const [consent, setConsent] = useState<ConsentState>({ tosAccepted: false, ageConfirmed: false });`
3. Change `canSubmit` to also require consent: `const canSubmit = name.trim().length > 0 && canEnterApp(consent) && !busy;`
4. In `handleJoin`, add a guard at the top (mirroring the existing name/code guards): `if (!canEnterApp(consent)) { setError('Please accept the terms and confirm your age first.'); return; }`
5. Render `<ConsentChecklist value={consent} onChange={setConsent} />` between the name field and the "Create room" button (so it visibly gates the dominant action). Also disable the Join button until consent: `disabled={busy || !canEnterApp(consent)}`.
6. Render `<LegalFooter />` at the bottom of the `ScrollView`, after the error `Text`.

The `createdCode` success view and skeletons are unchanged.

- [ ] **Step 4: Verify — typecheck, lint, hex-grep, browser**

- `npm run typecheck` → clean.
- `npm run lint` → clean.
- `grep -rEn "#[0-9a-fA-F]{6}" app components providers --include="*.tsx"` → **0 hits**.
- Browser (`/`): with a name typed, "Create room" is **disabled** until *both* boxes are ticked; ticking only one keeps it disabled; ticking both enables it. The A1 links open the legal pages. "Join room" is likewise gated. Footer links work. Boxes start unticked on load.

- [ ] **Step 5: Commit**

```bash
git add components/Checkbox.tsx components/ConsentChecklist.tsx app/index.tsx
git commit -m "feat: A1/A2 consent gate on anonymous entry"
```

---

### Task 5: Record consent server-side (members columns + RPCs)

**Files:**
- Create: `supabase/migrations/013_consent.sql`
- Modify: `providers/SessionProvider.tsx`

**Interfaces:**
- Consumes: `POLICY_VERSION` (Task 1).
- Produces: `create_room(p_name text, p_policy_version text, p_age_confirmed boolean)` and `join_room(p_code text, p_name text, p_policy_version text, p_age_confirmed boolean)` write `consent_version`, `consented_at = now()`, `age_confirmed` onto the new `members` row.

**Note:** Read `supabase/migrations/003_rpc.sql` first to copy the exact current `create_room` / `join_room` bodies — the migration below must re-`CREATE OR REPLACE` them with the *same logic plus* the consent writes. Do not change their existing behavior (room creation, member insert, idempotent join, 6-char code generation). The snippet below shows only the added columns/params; preserve everything else verbatim from 003.

- [ ] **Step 1: Write the migration**

`supabase/migrations/013_consent.sql`:

```sql
-- 013_consent.sql
-- GDPR accountability: record each user's acceptance of the Terms + Privacy
-- Policy and their 18+ confirmation at the moment their member row is created.
-- The client gates Create/Join on both boxes, so a member row implies consent;
-- we stamp the version + timestamp here as the demonstrable record (Art. 5(2)).

ALTER TABLE members
  ADD COLUMN IF NOT EXISTS consent_version text,
  ADD COLUMN IF NOT EXISTS consented_at    timestamptz,
  ADD COLUMN IF NOT EXISTS age_confirmed   boolean NOT NULL DEFAULT false;

-- Re-create the RPCs to accept + persist consent. Copy the FULL existing body
-- from 003_rpc.sql and add the p_policy_version / p_age_confirmed params and the
-- consent columns to the members INSERT. Illustrative shape only:
--
-- CREATE OR REPLACE FUNCTION create_room(p_name text, p_policy_version text, p_age_confirmed boolean)
--   ... existing code generation + rooms INSERT ...
--   INSERT INTO members (id, room_id, display_name, consent_version, consented_at, age_confirmed)
--   VALUES (auth.uid(), v_room_id, p_name, p_policy_version, now(), p_age_confirmed);
--   ... existing RETURN v_code ...
--
-- CREATE OR REPLACE FUNCTION join_room(p_code text, p_name text, p_policy_version text, p_age_confirmed boolean)
--   ... existing room lookup + idempotent member INSERT, adding the 3 consent columns ...
--
-- Keep SECURITY DEFINER + SET search_path = public on both (per repo convention).

GRANT EXECUTE ON FUNCTION create_room(text, text, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION join_room(text, text, boolean, boolean) TO authenticated;
```

- [ ] **Step 2: Apply the migration**

Apply via Supabase SQL editor or `supabase db push` (per `docs/SUPABASE_SETUP.md`). Migrations that add selected columns must be applied before a bundle selecting them ships — but note we do **not** add these to any client `select`, so ordering is only about the RPC signature matching. Confirm no error.

- [ ] **Step 3: Update SessionProvider RPC calls**

In `providers/SessionProvider.tsx`:
1. Import `POLICY_VERSION` from `@/lib/legal/policy-meta`.
2. In `createRoom`, change the RPC call to:
   `const { data: code, error } = await supabase.rpc('create_room', { p_name: name, p_policy_version: POLICY_VERSION, p_age_confirmed: true });`
3. In `joinRoom`, change to:
   `const { data: roomId, error } = await supabase.rpc('join_room', { p_code: code, p_name: name, p_policy_version: POLICY_VERSION, p_age_confirmed: true });`

`age_confirmed: true` is safe because the entry gate (Task 4) blocks Create/Join unless A2 is ticked; the provider never reaches these calls otherwise. Offline branches are unchanged. `createRoom`/`joinRoom` public signatures are unchanged, so `app/index.tsx` needs no edit.

- [ ] **Step 4: Verify — typecheck, browser + DB check**

- `npm run typecheck` → clean.
- `grep -rEn "#[0-9a-fA-F]{6}" providers --include="*.tsx"` → **0 hits** (unchanged).
- Browser: create a room end-to-end against the live/staging backend, then in the Supabase table editor confirm the new `members` row has `consent_version = '2026-07-26'`, a `consented_at` timestamp, and `age_confirmed = true`. Repeat for a join from a second session.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/013_consent.sql providers/SessionProvider.tsx
git commit -m "feat: record consent version + timestamp on member creation"
```

---

### Task 6: Recovery-code acknowledgement (B2) on email upgrade

**Files:**
- Modify: `app/account.tsx`

**Interfaces:**
- Consumes: `Checkbox` (Task 4).
- Produces: nothing new (client-gated acknowledgement; no DB record, per Decision 2).

- [ ] **Step 1: Wire B2 into the recovery-codes display**

In `app/account.tsx`, in the `generatedCodes ? (...)` block (the freshly-issued-codes view that appears right after an upgrade and on regenerate):
1. Add state near the other recovery state: `const [ackSaved, setAckSaved] = useState(false);`
2. Reset it whenever a fresh set is shown: in `verify` (after `setGeneratedCodes(c)`) and in `generate` (after `setGeneratedCodes(c)`), add `setAckSaved(false);`.
3. Render a `Checkbox` + label above the "I've saved them" button:

```tsx
<View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm }}>
  <Checkbox
    checked={ackSaved}
    onChange={setAckSaved}
    accessibilityLabel="I understand my recovery codes cannot be recovered and I have saved them"
  />
  <Text variant="body" style={{ flex: 1 }}>
    I understand my recovery codes are the only way to regain access if I lose my email, and
    matchpoint cannot recover them for me. I&apos;ve saved them somewhere safe.
  </Text>
</View>
```

4. Gate the dismissal button on it: change the "I've saved them" `Button` to `disabled={busy || !ackSaved}`.

The B1 inline notice already exists as the `mode === 'upgrade'` note box ("Your email is the only key…"); adjust its copy to match the memo's B1 microcopy if desired, but no checkbox is added for email — it stays contract-based helper text.

- [ ] **Step 2: Verify — typecheck, lint, hex-grep, browser**

- `npm run typecheck` → clean.
- `npm run lint` → clean.
- `grep -rEn "#[0-9a-fA-F]{6}" app --include="*.tsx"` → **0 hits**.
- Browser: complete an email upgrade (or tap "Generate recovery codes"); confirm the acknowledgement box starts **unticked**, the "I've saved them" button is **disabled** until it is ticked, and ticking it enables dismissal. Regenerating re-shows the box unticked.

- [ ] **Step 3: Commit**

```bash
git add app/account.tsx
git commit -m "feat: B2 recovery-code acknowledgement gate on upgrade"
```

---

### Task 7: Data-subject rights — in-app delete + export runbook

**Files:**
- Create: `supabase/migrations/014_delete_my_data.sql`
- Create: `docs/compliance/DSAR_RUNBOOK.md`
- Modify: `providers/SessionProvider.tsx`, `app/settings.tsx`
- Modify: `MANUAL_TODOS.md` (note the placeholder-fill + contact-email step)

**Interfaces:**
- Consumes: `useSession`.
- Produces:
  - `delete_my_data()` RPC — deletes the caller's `members` row (cascades their `swipes`); deletes the room only if no members remain.
  - `deleteMyData(): Promise<void>` on `useSession()`.

- [ ] **Step 1: Write the delete RPC migration**

`supabase/migrations/014_delete_my_data.sql`:

```sql
-- 014_delete_my_data.sql
-- GDPR/UK GDPR erasure for the caller. Anonymous users have no email to reach us
-- with, so this in-app control is the practical erasure mechanism (memo §2.3).
-- Shared-room policy: remove the erasing user (their member row + swipes cascade);
-- the room + the partner's data survive unless the partner also deletes. The room
-- is removed only when it becomes empty.

CREATE OR REPLACE FUNCTION delete_my_data() RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_room_id uuid;
  v_remaining int;
BEGIN
  SELECT room_id INTO v_room_id FROM members WHERE id = auth.uid();
  IF v_room_id IS NULL THEN
    RETURN; -- nothing to delete
  END IF;
  DELETE FROM members WHERE id = auth.uid(); -- cascades swipes (FK ON DELETE CASCADE)
  SELECT count(*) INTO v_remaining FROM members WHERE room_id = v_room_id;
  IF v_remaining = 0 THEN
    DELETE FROM rooms WHERE id = v_room_id; -- cascades any remnants
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION delete_my_data() TO authenticated;
```

Apply via the SQL editor / `supabase db push`; confirm no error.

- [ ] **Step 2: Add `deleteMyData` to SessionProvider**

In `providers/SessionProvider.tsx`:
1. Add to the `SessionValue` type: `deleteMyData: () => Promise<void>;`
2. Implement (mirrors existing action shape; offline just clears local state):

```typescript
const deleteMyData = useCallback(async (): Promise<void> => {
  if (!supabase) {
    setRoom(null);
    setMember(null);
    setPartner(null);
    return;
  }
  const { error } = await supabase.rpc('delete_my_data');
  if (error) throw error;
  setRoom(null);
  setMember(null);
  setPartner(null);
  seenMatchIds.current.clear();
}, []);
```

3. Add `deleteMyData` to the `useMemo` value object and its dependency array.

- [ ] **Step 3: Add the Settings control**

In `app/settings.tsx`, in the existing "Account" `SettingsSection`, add below "Manage account". Use a two-tap confirm (no `Alert` dependency assumptions): a "Delete my data" outlined button that reveals a confirm state. Keep it token-driven; the destructive button uses `colors.danger` via... note: `Button` has no danger variant, so render the confirm action as an `outlined` Button and put the warning in `Text` with `color={colors.danger}` (which is a token, not hex). On confirm, call `deleteMyData()` then `router.replace('/')`.

```tsx
// local state in Settings(): const [confirmDelete, setConfirmDelete] = useState(false);
// and pull deleteMyData from useSession().
...
{confirmDelete ? (
  <View style={{ gap: spacing.sm }}>
    <Text variant="body" color={colors.danger}>
      This permanently deletes your data from this room. Shared matches stay with your partner
      unless they also delete. This can&apos;t be undone.
    </Text>
    <Button
      label="Permanently delete my data"
      variant="outlined"
      onPress={() =>
        deleteMyData()
          .then(() => router.replace('/'))
          .catch((e) => console.warn('deleteMyData failed', e))
      }
    />
    <Button label="Cancel" variant="outlined" onPress={() => setConfirmDelete(false)} />
  </View>
) : (
  <Button label="Delete my data" variant="outlined" onPress={() => setConfirmDelete(true)} />
)}
```

- [ ] **Step 4: Write the export runbook**

`docs/compliance/DSAR_RUNBOOK.md` — a short internal doc: how to fulfill an access/portability request manually within one month. Include: the contact email that receives requests (the same placeholder used in the legal docs, to be filled by counsel — see MANUAL_TODOS), an identity-verification note, and the SQL to gather one user's data given their `auth.uid()` or email (rooms/members/swipes/saved locations + auth email), plus a note that in-app "Delete my data" covers erasure and an in-app export button is a deferred fast-follow. Keep it factual and brief.

- [ ] **Step 5: Note the manual placeholder step**

Add a line to `MANUAL_TODOS.md`: before the legal pages go live, counsel must fill the `[PLACEHOLDER]` fields in both drafts (legal entity, real contact/abuse email, dates, jurisdiction), remove the DRAFT banner, and re-sync the finalized bodies into `lib/legal/content/terms.ts` and `privacy.ts` (bump `POLICY_VERSION` if wording changed materially). The DSAR contact email must be a real, monitored inbox.

- [ ] **Step 6: Verify — typecheck, lint, hex-grep, browser + DB**

- `npm run typecheck` → clean.
- `npm run lint` → clean.
- `grep -rEn "#[0-9a-fA-F]{6}" app components providers --include="*.tsx"` → **0 hits**.
- Browser: in Settings, "Delete my data" reveals the confirm/cancel state; Cancel dismisses; confirming (against staging) deletes the member row and returns to `/`. Verify in the Supabase table editor that the member row + its swipes are gone and that a room with a remaining partner still exists (delete the second member and confirm the room is then removed).
- `npx expo export --platform web` → builds clean.

- [ ] **Step 7: Commit**

```bash
git add supabase/migrations/014_delete_my_data.sql providers/SessionProvider.tsx app/settings.tsx docs/compliance/DSAR_RUNBOOK.md MANUAL_TODOS.md
git commit -m "feat: in-app data erasure + DSAR export runbook"
```

---

## Final verification (before opening the PR)

Run the repo's full verification gate and confirm each passes with output seen this turn:

- `npm run test:ci` → PASS, coverage ≥90% on all metrics.
- `npm run typecheck` → clean.
- `npm run lint` → clean.
- `grep -rEn "#[0-9a-fA-F]{6}" app components providers --include="*.tsx"` → **0 hits**.
- `npx expo export --platform web` → builds `dist/`.
- Browser end-to-end on the exported web build: entry gate blocks until A1+A2; legal pages render and are reachable from A1 links, footer, and Settings; upgrade flow gates on B2; Settings "Delete my data" works.
- Run `/code-review` on the full branch diff and resolve findings (required before declaring merge-ready).
- Open the PR with `gh pr create` and STOP for human review.

---

## Self-Review

**Spec coverage** (against the task's six required decisions):
1. Which checkboxes where — Decisions §1; A1/A2 in Task 4, B1 (inline)/B2 in Task 6, B3 explicitly deferred. ✓
2. Consent recording — Decisions §2; members columns + RPCs in Task 5. ✓
3. Hosting ToS/Privacy — Decisions §3; content + parser + renderer + routes + footer + Settings in Tasks 2–3. ✓
4. Export + delete — Decisions §4; in-app delete + runbook in Task 7. ✓
5. Testable lib logic for coverage — Task 1 (consent-logic), Task 2 (parser), content excluded from coverage. ✓
6. Phased steps with verification — all seven tasks end with typecheck/lint/hex-grep/test/web-export/browser checks. ✓

**Placeholder scan:** No "TBD"/"implement later" left in code steps; the only ellipses are the deliberate "copy the verbatim draft body" (Task 3 Step 1) and "copy the existing RPC body from 003" (Task 5 Step 1), which are instructions to transcribe existing files, with the exact additions shown.

**Type consistency:** `ConsentState`/`canEnterApp` (Task 1) reused identically in Tasks 4/5; `Block`/`Inline`/`parseMarkdown` (Task 2) consumed by `LegalDocument` (Task 3); `Checkbox` prop shape (Task 4) reused verbatim in Task 6; `deleteMyData` signature matches between the RPC (Task 7 Step 1), provider (Step 2), and Settings caller (Step 3); RPC param names (`p_policy_version`, `p_age_confirmed`) match between migration 013 and the SessionProvider calls.
