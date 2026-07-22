# T9 Email Auth Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let an anonymous matchpoint user attach an email (passwordless OTP) so their room/matches become durable and recoverable, without rewriting SessionProvider.

**Architecture:** New standalone `AuthProvider` wraps `supabase.auth` (email OTP via `updateUser` for upgrade, `signInWithOtp` for recovery, `verifyOtp` for both). Pure validation/state logic lives in `lib/auth-logic.ts` (unit-tested to the coverage gate). A `/account` screen drives the three UI states. SessionProvider gets one additive `onAuthStateChange` listener so the recovery uid-change re-bootstraps its room load.

**Tech Stack:** Expo (expo-router, TS), `@supabase/supabase-js` (PKCE, already configured `lib/supabase.ts:45`), jest-expo + RNTL, existing Split-Heart component kit (`Screen`, `Header`, `Button`, `Text`, `useTheme`).

## Global Constraints

- No password is ever collected or stored — OTP only.
- No cross-provider linking / same-email merge anywhere in this feature (Google/Apple deferred).
- Do NOT rewrite SessionProvider — only the additive listener in Task 5.
- Hex colors ONLY in `lib/theme/tokens.ts`: `grep -rEn "#[0-9a-fA-F]{6}" app components providers --include="*.tsx"` MUST be 0. Screens/components resolve color via `useTheme()`.
- No web-only libs. No third-party API calls from the frontend.
- 90% coverage gate scoped to `lib/`. Logic worth testing goes in `lib/`; providers/screens are verified by typecheck + browser, not deep-mocked.
- Offline demo mode (`supabase === null`, `supabaseEnabled === false`) must not crash — auth UI shows an "unavailable offline" state.
- Commits: Conventional Commits, lowercase subject (commitlint `subject-case`); husky `pre-push` runs typecheck/lint/test.

---

### Task 1: Pure auth logic (`lib/auth-logic.ts`)

**Files:**
- Create: `lib/auth-logic.ts`
- Test: `lib/auth-logic.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `normalizeEmail(raw: string): string`
  - `isValidEmail(email: string): boolean`
  - `isValidCode(code: string): boolean`
  - `type AuthScreenState = 'anonymous' | 'code-sent' | 'permanent'`
  - `authView(s: { isAnonymous: boolean; email: string | null; codeSent: boolean }): AuthScreenState`

- [ ] **Step 1: Write the failing test**

```ts
// lib/auth-logic.test.ts
import { normalizeEmail, isValidEmail, isValidCode, authView } from './auth-logic';

describe('normalizeEmail', () => {
  it('trims and lowercases', () => {
    expect(normalizeEmail('  Me@Example.COM ')).toBe('me@example.com');
  });
});

describe('isValidEmail', () => {
  it('accepts a normal address', () => {
    expect(isValidEmail('a@b.co')).toBe(true);
  });
  it('rejects missing @ / domain / spaces', () => {
    expect(isValidEmail('ab.co')).toBe(false);
    expect(isValidEmail('a@b')).toBe(false);
    expect(isValidEmail('a b@c.co')).toBe(false);
    expect(isValidEmail('')).toBe(false);
  });
});

describe('isValidCode', () => {
  it('accepts exactly six digits (trimmed)', () => {
    expect(isValidCode(' 123456 ')).toBe(true);
  });
  it('rejects wrong length or non-digits', () => {
    expect(isValidCode('12345')).toBe(false);
    expect(isValidCode('1234567')).toBe(false);
    expect(isValidCode('12a456')).toBe(false);
  });
});

describe('authView', () => {
  it('permanent when not anonymous and has email', () => {
    expect(authView({ isAnonymous: false, email: 'a@b.co', codeSent: false })).toBe('permanent');
  });
  it('code-sent when anonymous and a code was sent', () => {
    expect(authView({ isAnonymous: true, email: null, codeSent: true })).toBe('code-sent');
  });
  it('anonymous by default', () => {
    expect(authView({ isAnonymous: true, email: null, codeSent: false })).toBe('anonymous');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest lib/auth-logic.test.ts`
Expected: FAIL — `Cannot find module './auth-logic'`.

- [ ] **Step 3: Write minimal implementation**

```ts
// lib/auth-logic.ts

export function normalizeEmail(raw: string): string {
  return raw.trim().toLowerCase();
}

export function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export function isValidCode(code: string): boolean {
  return /^\d{6}$/.test(code.trim());
}

export type AuthScreenState = 'anonymous' | 'code-sent' | 'permanent';

/** Which /account view to show, from auth + local "code sent" flag. */
export function authView(s: {
  isAnonymous: boolean;
  email: string | null;
  codeSent: boolean;
}): AuthScreenState {
  if (!s.isAnonymous && s.email) return 'permanent';
  if (s.codeSent) return 'code-sent';
  return 'anonymous';
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest lib/auth-logic.test.ts`
Expected: PASS (all 4 describe blocks green).

- [ ] **Step 5: Commit**

```bash
git add lib/auth-logic.ts lib/auth-logic.test.ts
git commit -m "feat: add pure email-auth logic (validation + screen state)"
```

---

### Task 2: AuthProvider (`providers/AuthProvider.tsx`) + wire into layout

**Files:**
- Create: `providers/AuthProvider.tsx`
- Modify: `app/_layout.tsx` (import + wrap `AuthProvider` around `SessionProvider`)

**Interfaces:**
- Consumes: `supabase`, `supabaseEnabled` from `@/lib/supabase`; `normalizeEmail` from `@/lib/auth-logic`.
- Produces `useAuth(): AuthValue` where:

```ts
type AuthValue = {
  email: string | null;
  isAnonymous: boolean;
  enabled: boolean; // false in offline demo mode
  sendUpgradeCode: (email: string) => Promise<void>;
  sendSignInCode: (email: string) => Promise<void>;
  verifyCode: (email: string, token: string, mode: 'email_change' | 'email') => Promise<void>;
  signOut: () => Promise<void>;
};
```

- [ ] **Step 1: Create the provider**

```tsx
// providers/AuthProvider.tsx
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { supabase, supabaseEnabled } from '@/lib/supabase';
import { normalizeEmail } from '@/lib/auth-logic';

type AuthValue = {
  email: string | null;
  isAnonymous: boolean;
  enabled: boolean;
  sendUpgradeCode: (email: string) => Promise<void>;
  sendSignInCode: (email: string) => Promise<void>;
  verifyCode: (email: string, token: string, mode: 'email_change' | 'email') => Promise<void>;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [email, setEmail] = useState<string | null>(null);
  // Default true: an unupgraded session is anonymous. Offline mode never upgrades.
  const [isAnonymous, setIsAnonymous] = useState(true);

  useEffect(() => {
    if (!supabaseEnabled || !supabase) return;
    const client = supabase;
    const apply = (user: { email?: string | null; is_anonymous?: boolean } | null | undefined) => {
      setEmail(user?.email ?? null);
      setIsAnonymous(user?.is_anonymous ?? !user?.email);
    };
    client.auth.getUser().then(({ data }) => apply(data.user)).catch(() => {});
    const { data: sub } = client.auth.onAuthStateChange((_event, session) => {
      apply(session?.user);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  const sendUpgradeCode = useCallback(async (raw: string) => {
    if (!supabase) throw new Error('Auth unavailable offline');
    const { error } = await supabase.auth.updateUser({ email: normalizeEmail(raw) });
    if (error) throw error;
  }, []);

  const sendSignInCode = useCallback(async (raw: string) => {
    if (!supabase) throw new Error('Auth unavailable offline');
    const { error } = await supabase.auth.signInWithOtp({
      email: normalizeEmail(raw),
      options: { shouldCreateUser: false },
    });
    if (error) throw error;
  }, []);

  const verifyCode = useCallback(
    async (raw: string, token: string, mode: 'email_change' | 'email') => {
      if (!supabase) throw new Error('Auth unavailable offline');
      const { error } = await supabase.auth.verifyOtp({
        email: normalizeEmail(raw),
        token: token.trim(),
        type: mode,
      });
      if (error) throw error;
    },
    [],
  );

  const signOut = useCallback(async () => {
    if (!supabase) throw new Error('Auth unavailable offline');
    const { error } = await supabase.auth.signOut();
    if (error) throw error;
  }, []);

  const value = useMemo<AuthValue>(
    () => ({
      email,
      isAnonymous,
      enabled: supabaseEnabled,
      sendUpgradeCode,
      sendSignInCode,
      verifyCode,
      signOut,
    }),
    [email, isAnonymous, sendUpgradeCode, sendSignInCode, verifyCode, signOut],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
```

- [ ] **Step 2: Wire into the layout**

In `app/_layout.tsx`, add the import next to the SessionProvider import:

```tsx
import { AuthProvider } from '@/providers/AuthProvider';
```

Wrap `AuthProvider` immediately around `SessionProvider` (auth is the more fundamental layer). The existing block is:

```tsx
        <SafeAreaProvider>
          <SessionProvider>
            {/* existing children */}
          </SessionProvider>
        </SafeAreaProvider>
```

Change to:

```tsx
        <SafeAreaProvider>
          <AuthProvider>
            <SessionProvider>
              {/* existing children — unchanged */}
            </SessionProvider>
          </AuthProvider>
        </SafeAreaProvider>
```

- [ ] **Step 3: Typecheck**

Run: `npm run typecheck`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add providers/AuthProvider.tsx app/_layout.tsx
git commit -m "feat: add AuthProvider for passwordless email otp"
```

---

### Task 3: `/account` screen (`app/account.tsx`)

**Files:**
- Create: `app/account.tsx`

**Interfaces:**
- Consumes: `useAuth` (Task 2); `authView`, `isValidEmail`, `isValidCode` (Task 1); `Screen`, `Header`, `Button`, `Text`, `useTheme`.
- Produces: default-exported route component at `/account`.

- [ ] **Step 1: Create the screen**

```tsx
// app/account.tsx
import { useState } from 'react';
import { useRouter } from 'expo-router';
import { ScrollView, TextInput, View } from 'react-native';
import { useTheme } from '@/lib/theme';
import { useAuth } from '@/providers/AuthProvider';
import { authView, isValidEmail, isValidCode } from '@/lib/auth-logic';
import { Screen } from '@/components/Screen';
import { Header } from '@/components/Header';
import { Button } from '@/components/Button';
import { Text } from '@/components/Text';

export default function Account() {
  const { colors, spacing, radii } = useTheme();
  const router = useRouter();
  const { email, isAnonymous, enabled, sendUpgradeCode, sendSignInCode, verifyCode, signOut } =
    useAuth();

  const [mode, setMode] = useState<'upgrade' | 'signin'>('upgrade');
  const [emailInput, setEmailInput] = useState('');
  const [code, setCode] = useState('');
  const [codeSent, setCodeSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const view = authView({ isAnonymous, email, codeSent });

  const inputStyle = {
    backgroundColor: colors.surface,
    borderRadius: radii.md,
    padding: spacing.md,
    color: colors.ink,
  };

  const run = async (fn: () => Promise<void>) => {
    setError(null);
    setBusy(true);
    try {
      await fn();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong. Try again.');
    } finally {
      setBusy(false);
    }
  };

  const sendCode = () =>
    run(async () => {
      if (mode === 'upgrade') await sendUpgradeCode(emailInput);
      else await sendSignInCode(emailInput);
      setCodeSent(true);
    });

  const verify = () =>
    run(async () => {
      await verifyCode(emailInput, code, mode === 'upgrade' ? 'email_change' : 'email');
      setCodeSent(false);
      setCode('');
    });

  return (
    <Screen>
      <Header title="Account" onBack={() => router.back()} />
      <ScrollView contentContainerStyle={{ padding: spacing['2xl'], gap: spacing['2xl'] }}>
        {!enabled ? (
          <Text variant="body" color={colors.inkMuted}>
            Accounts are unavailable in offline demo mode.
          </Text>
        ) : view === 'permanent' ? (
          <View style={{ gap: spacing.lg }}>
            <Text variant="body">Signed in as</Text>
            <Text variant="title">{email}</Text>
            <Button
              label="Sign out"
              variant="outlined"
              disabled={busy}
              onPress={() => run(signOut)}
            />
          </View>
        ) : view === 'code-sent' ? (
          <View style={{ gap: spacing.lg }}>
            <Text variant="body" color={colors.inkMuted}>
              Enter the 6-digit code we emailed to {emailInput}.
            </Text>
            <TextInput
              style={inputStyle}
              value={code}
              onChangeText={setCode}
              placeholder="123456"
              placeholderTextColor={colors.inkMuted}
              keyboardType="number-pad"
              maxLength={6}
              autoFocus
            />
            <Button label="Verify" disabled={busy || !isValidCode(code)} onPress={verify} />
            <Button
              label="Use a different email"
              variant="outlined"
              disabled={busy}
              onPress={() => {
                setCodeSent(false);
                setCode('');
              }}
            />
          </View>
        ) : (
          <View style={{ gap: spacing.lg }}>
            <Text variant="body" color={colors.inkMuted}>
              {mode === 'upgrade'
                ? 'Add your email to save your account so you never lose your room and matches.'
                : 'Sign in with the email you saved to restore your room on this device.'}
            </Text>
            <TextInput
              style={inputStyle}
              value={emailInput}
              onChangeText={setEmailInput}
              placeholder="you@example.com"
              placeholderTextColor={colors.inkMuted}
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
            />
            <Button
              label="Send code"
              disabled={busy || !isValidEmail(emailInput.trim().toLowerCase())}
              onPress={sendCode}
            />
            <Button
              label={mode === 'upgrade' ? 'Already have an account? Sign in' : 'Back to saving this account'}
              variant="outlined"
              disabled={busy}
              onPress={() => setMode(mode === 'upgrade' ? 'signin' : 'upgrade')}
            />
          </View>
        )}
        {error ? (
          <Text variant="body" color={colors.primary}>
            {error}
          </Text>
        ) : null}
      </ScrollView>
    </Screen>
  );
}
```

Note: `colors.surface`, `colors.ink`, `colors.inkMuted`, `colors.primary` are existing tokens (used across `settings.tsx`). If any name differs, resolve against `lib/theme/tokens.ts` — do NOT introduce a hex literal.

- [ ] **Step 2: Typecheck + hex-grep**

Run: `npm run typecheck && grep -rEn "#[0-9a-fA-F]{6}" app components providers --include="*.tsx"`
Expected: typecheck clean; grep prints nothing (exit 1, no matches).

- [ ] **Step 3: Commit**

```bash
git add app/account.tsx
git commit -m "feat: add account screen for email upgrade, recovery, sign out"
```

---

### Task 4: Entry point in settings

**Files:**
- Modify: `app/settings.tsx`

**Interfaces:**
- Consumes: existing `Button`, `useRouter` (already imported in settings).

- [ ] **Step 1: Add an Account button**

In `app/settings.tsx`, inside the `ScrollView` (after the locations sections, before it closes), add:

```tsx
        <View style={{ gap: spacing.md }}>
          <Text variant="title">Account</Text>
          <Button
            label="Manage account"
            variant="outlined"
            onPress={() => router.push('/account')}
          />
        </View>
```

`Button` is already imported in `settings.tsx`; `Text`, `View`, `spacing`, `router` are already in scope.

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add app/settings.tsx
git commit -m "feat: link to account screen from settings"
```

---

### Task 5: SessionProvider auth listener (additive re-bootstrap)

**Files:**
- Modify: `providers/SessionProvider.tsx` (extract bootstrap body into a callable; add one `onAuthStateChange` subscription)

**Interfaces:**
- Consumes: existing `supabase` client, existing state setters.
- Produces: no new exports — behavior only.

Currently the bootstrap effect (`SessionProvider.tsx:96`) runs once with deps `[]` and has no listener. Refactor so the room-load body is callable by uid, then re-run it when the authenticated `user.id` changes.

- [ ] **Step 1: Extract the loader**

Inside `SessionProvider`, factor the online branch of the bootstrap into a `useCallback` that loads member/room/partner for a given user id (moving the existing queries verbatim). Signature:

```ts
const loadForUser = useCallback(async (userId: string) => {
  const client = supabase!;
  setUserId(userId);
  const { data: me } = await client
    .from('members')
    .select('id, room_id, display_name, joined_at')
    .eq('id', userId)
    .maybeSingle();
  if (!me) {
    setMember(null);
    setRoom(null);
    setPartner(null);
    return;
  }
  setMember(me as Member);
  const [{ data: r }, { data: others }] = await Promise.all([
    client.from('rooms').select('id, code, locations, created_at').eq('id', me.room_id).maybeSingle(),
    client.from('members').select('id, room_id, display_name, joined_at').eq('room_id', me.room_id).neq('id', userId),
  ]);
  if (r) setRoom(r as Room); else setRoom(null);
  setPartner(others && others.length > 0 ? (others[0] as Member) : null);
}, []);
```

The existing mount effect keeps doing the anonymous-session bootstrap (getSession / signInAnonymously), then calls `await loadForUser(user.id)` instead of the inline queries. Preserve the `cancelled` guard and `setLoading(false)` in `finally`.

- [ ] **Step 2: Add the auth-state listener effect**

Add a new effect that reloads when the signed-in uid changes (recovery / sign-out), reusing `loadForUser`:

```ts
// ---- React to auth changes (email recovery swaps the uid; sign-out clears) ----
useEffect(() => {
  if (!supabase) return;
  const client = supabase;
  const { data: sub } = client.auth.onAuthStateChange((_event, session) => {
    const nextId = session?.user?.id ?? null;
    if (!nextId) return; // sign-out is immediately followed by a fresh anon sign-in
    setUserId((prev) => {
      if (prev === nextId) return prev; // no uid change (e.g. token refresh, email upgrade)
      // reset room state, then load for the new user
      setRoom(null);
      setMember(null);
      setPartner(null);
      seenMatchIds.current.clear();
      void loadForUser(nextId);
      return nextId;
    });
  });
  return () => sub.subscription.unsubscribe();
}, [loadForUser]);
```

Note: on email *upgrade* the uid is unchanged, so the `prev === nextId` guard makes this a no-op — correct. On *recovery* the uid differs → reload. This does not touch match-detection or realtime logic.

- [ ] **Step 3: Verify existing tests still pass + typecheck**

Run: `npm test && npm run typecheck`
Expected: existing suite green (session-logic tests unaffected), typecheck clean.

- [ ] **Step 4: Commit**

```bash
git add providers/SessionProvider.tsx
git commit -m "feat: re-bootstrap session room on auth uid change"
```

---

### Task 6: Verification sweep + docs

**Files:**
- Modify: `MANUAL_TODOS.md`, `HANDOFF.md`, `TODO.md`
- Refresh: build-status Artifact (per repo CLAUDE.md)

- [ ] **Step 1: Full local verification**

Run each, expect all clean:
```bash
npm run test:ci          # 90% gate incl. lib/auth-logic
npm run typecheck
npm run lint
grep -rEn "#[0-9a-fA-F]{6}" app components providers --include="*.tsx"   # zero matches
npx expo export --platform web
```

- [ ] **Step 2: Browser end-to-end against live Supabase**

Start dev server, then in the browser:
1. From lobby → Settings → Manage account → enter a real email → Send code.
2. Retrieve the 6-digit code from the inbox → Verify → screen shows "Signed in as <email>"; confirm the room/matches are intact (uid preserved).
3. Sign out → confirm the app returns to an anonymous session and still works.
4. Recovery: in a second/incognito browser, Settings → Manage account → "Sign in" → same email → code → Verify → confirm the same room loads (proves the Task 5 listener).

Capture a screenshot of the permanent state as proof.

- [ ] **Step 3: Update MANUAL_TODOS.md**

Append:
```markdown
## T9 email auth
- Confirm Supabase Auth email templates ("Change Email Address" and Magic Link) expose `{{ .Token }}` (6-digit OTP) — default yes; the app's OTP entry depends on it.
- (T16b) Enable CAPTCHA + tighten auth rate limits in Supabase Auth settings — now also protects email OTP send.
- When Google/Apple are added later: confirm same-email identities do NOT auto-merge (no cross-provider override), per product rule.
```

- [ ] **Step 4: Update HANDOFF.md + TODO.md**

- HANDOFF: move T9 from "Pending" to shipped (email upgrade + recovery + sign out live; Google/Apple still deferred). Note the SessionProvider auth listener.
- TODO: check off the T9 email portion; leave Google/Apple as a new deferred item.

- [ ] **Step 5: Refresh the build-status Artifact**

Per repo CLAUDE.md, republish to `https://claude.ai/code/artifact/98a0341f-6f7b-4043-8a5e-5b4ff86ea715` (Split Heart design, ❤️ favicon, stable title) reflecting T9 email auth shipped / in review.

- [ ] **Step 6: Commit docs**

```bash
git add MANUAL_TODOS.md HANDOFF.md TODO.md
git commit -m "docs: record T9 email auth shipped + manual steps"
```

- [ ] **Step 7: Code review + PR**

Run `/caveman-review` on the branch diff; address findings. Then `/code-review` (mandatory gate) and the `verify` skill. Open a PR to `main` with `gh pr create` and STOP for human review (do not merge).

---

## Self-Review

**Spec coverage:** auth-logic (Task 1) ✓, AuthProvider with upgrade/signin/verify/signout + offline `enabled` (Task 2) ✓, /account 3-state screen incl. recovery affordance (Task 3) ✓, settings entry (Task 4) ✓, SessionProvider additive listener for recovery uid change (Task 5) ✓, security notes + manual steps + verification (Task 6) ✓. PKCE already configured (constraint noted). No-cross-provider: nothing in this feature links identities ✓.

**Placeholder scan:** no TBD/TODO; all steps carry real code and exact commands. account.tsx uses inline theme-derived styles (no StyleSheet block, no hex).

**Type consistency:** `AuthValue` fields identical across Task 2 definition and Task 3 consumption (`email`, `isAnonymous`, `enabled`, `sendUpgradeCode`, `sendSignInCode`, `verifyCode`, `signOut`). `verifyCode` mode union `'email_change' | 'email'` matches `verifyOtp` types in both tasks. `authView`/`isValidEmail`/`isValidCode` signatures match Task 1 exports. `loadForUser(userId: string)` consistent between Task 5 steps.
