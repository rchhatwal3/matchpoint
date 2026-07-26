# Phone-number account recovery — scoping & decisions

**Status:** scoping, not approved to build. This document decides *whether* and *how* phone recovery
should exist before any code is written. It sits alongside the recovery-codes design
(`docs/superpowers/specs/2026-07-23-t9-recovery-codes-design.md`), which is already shipped (T9 Phase B,
PR #11).

**TL;DR recommendation:** **Do not build phone recovery now.** Recovery codes already give every permanent
account a free, inbox-free, second-vendor-free recovery path. Phone adds a recurring SMS bill, a new PII
category (GDPR consequences), a new SMS sub-processor to contract, and a fraud/toll-abuse surface — to solve a
gap the shipped feature already closes. If it is built later, build it as a **recovery-only channel** (SMS OTP
that mints a session for the *same* uid), **not** as a full Supabase phone-auth identity, and keep it a
**supplement**, never a replacement for recovery codes.

The rest of this doc justifies each decision and, for the "if approved" case, sketches the implementation shape
and the decisions the user must lock first.

---

## Background: what recovery already looks like

Permanent accounts are passwordless email OTP (`providers/AuthProvider.tsx`). The email inbox is the only key.
The lost-inbox gap is already covered two ways:

- **Recovery codes (shipped).** 8 single-use 25-char codes, salted-SHA-256 hashed server-side, redeemed with
  email + code via the `--no-verify-jwt` `redeem-recovery-code` edge function, which calls admin `generateLink`
  to mint a session for the **same `auth.uid()`** — so the room and matches survive. Free, no second vendor.
- **Google/Apple (deferred).** Eventually an alternate factor, but only for users who linked one, and needs
  OAuth dashboard config we don't have.

The identity model matters for everything below: room membership is `members.id = auth.uid()`
(`SessionProvider`), so any recovery path is only useful if it restores the **same uid**. A path that creates a
*new* uid loses the room — exactly the failure `docs/session-ttl-research.md` warns about for the anonymous
session.

---

## 1. Full auth identity vs recovery-only channel

**Recommendation: recovery-only channel.** If phone is added at all, it is a way to prove "I am the owner of
this existing account and I've lost my inbox" — an SMS OTP whose *only* effect is to mint a session for the
account's existing `auth.uid()`. It is **not** a Supabase phone-auth sign-in identity.

Why, for this product specifically:

- **Anonymous-first + uid-bound rooms.** Supabase phone OTP sign-in (`signInWithOtp({ phone })`) authenticates a
  user *by phone number*. For a brand-new phone it creates a **new** user with a **new uid**. That is the
  cross-provider-merge trap (see §4) and, worse, it doesn't restore the room, which is bound to the original
  uid. Full phone identity fights the core data model; recovery-only respects it by reusing the shipped
  `generateLink` → `verifyOtp` uid-preserving mechanism.
- **No new primary login is wanted.** The product intentionally has one upgrade path (email OTP). A second
  first-class login (phone) doubles the identity surface, the account-settings UI, and the merge edge cases,
  for no product benefit — users aren't asking to *log in* by phone, they're asking to *recover*.
- **Symmetry with recovery codes.** Recovery-only phone is the same shape as the recovery-code flow already in
  the codebase: an unauthenticated endpoint that verifies a factor and returns a `generateLink` token. It reuses
  the pattern, the `SessionProvider` uid-swap re-bootstrap, and the security posture, instead of introducing a
  whole new Supabase auth mode.

**Rejected alternative — full phone identity (Supabase phone OTP as a sign-in method):** only worth it if phone
were meant to be a primary login for phone-first users with no email. That's not this product; it's
email-upgrade-first, and it would require solving same-uid recovery *and* no-merge on top of Supabase's built-in
phone-user creation. More surface, no added recovery value.

---

## 2. SMS provider + cost

Supabase phone auth (and any SMS-OTP recovery) **requires a third-party SMS provider** — Supabase does not send
SMS itself. Supported providers: **Twilio**, **Twilio Verify**, **MessageBird**, **Vonage**, **TextLocal**
(region-limited). You configure the provider's credentials in Supabase Auth → Phone settings; Supabase then
calls it to deliver OTPs.

Rough cost and setup burden (order-of-magnitude, verify at build time — pricing shifts):

| Item | Reality |
|---|---|
| Per-SMS (US, Twilio programmable SMS) | ~$0.0079 per message segment + a per-message carrier fee; effectively **~1–2 US cents per OTP**. |
| Per-SMS (international) | Highly variable — **from ~$0.02 to $0.30+** per message depending on country; some routes are much worse. |
| Twilio Verify (managed OTP) | Priced per *verification* (~$0.05 each) instead of per-SMS; simpler (Twilio owns the code lifecycle) but pricier per attempt. |
| Phone number rental | ~$1–2/month per long-code sender number. |
| A2P 10DLC registration (US) | US application-to-person SMS now **requires brand + campaign registration** with one-time (~$4) and monthly (~$1.50+) fees, plus a review step. Real setup friction, not just a keys-in-dashboard task. |
| Setup burden | Create provider account → verify a sender number → (US) register A2P 10DLC brand/campaign → paste credentials into Supabase → configure SMS template. Days of lead time for A2P approval, not minutes. |

**The key contrast with recovery codes: this is a real, recurring, usage-scaling cost and a fraud surface.**
Recovery codes cost **$0** and have no external dependency. SMS adds a per-message bill that someone can drive
up: **SMS pumping / toll fraud** (bots requesting OTPs to premium-rate numbers to skim revenue) is a known
attack that has cost other apps real money. Any SMS endpoint needs strict rate limits, CAPTCHA, and possibly
geo-restrictions from day one — extending the T16b hardening posture. That operational burden is a big part of
why the recommendation is "don't build now."

---

## 3. Replace or supplement recovery codes?

**Recommendation: supplement, and only if there's demonstrated demand. Never replace.**

- **Never replace.** Recovery codes are free, vendor-independent, and offline. Phone recovery depends on a paid
  third party, a live cellular number, and carrier deliverability. Dropping codes for phone would *reduce*
  resilience (one more thing that can fail or cost money) and trade a $0 path for a metered one. There is no
  version of "phone instead of codes" that is a net win here.
- **Supplement, conditionally.** Phone's genuine advantage is UX: people lose a slip of recovery codes but rarely
  lose their phone number, and "text me a code" is a familiar recovery gesture. That's a real but *incremental*
  improvement over a feature that already works. Given the recurring cost, PII burden, and fraud surface, treat
  phone as a **later, demand-driven enhancement**, not part of the current auth push. If users actually report
  losing recovery codes, revisit; until then, codes are sufficient.

---

## 4. Keeping the no-cross-provider-auto-merge rule safe

The product rule (CLAUDE.md / TODO / T9 notes): **an email account must not silently become loginable via
another identity, and no same-identity auto-merge across accounts.** Phone recovery must not create a back door
around it. Concrete safeguards, all of which the recovery-only design in §1 makes natural:

1. **Phone is an attribute of an existing account, not a login that resolves to an account.** Store the phone
   against the already-authenticated user's `auth.uid()` (the user adds it from `/account` while signed in),
   exactly like recovery codes are issued to the signed-in user. Recovery *verifies possession of that phone for
   that account* and mints a session for that **same uid** — it never creates a user and never picks an account
   by phone lookup alone in a way that could merge two.
2. **Do not use Supabase phone-OTP sign-in (`signInWithOtp({ phone })`).** That path will *create or sign into a
   phone-keyed user*, which is precisely the auto-resolution-by-identity the rule forbids and which also spawns a
   new uid. Recovery-only uses `generateLink` for the account the phone is registered to, mirroring
   `redeem-recovery-code`.
3. **One phone → at most one account (enforced), and no auto-merge.** If a phone number is already registered to
   account A and someone tries to register it on account B, **do not merge and do not move it silently** — reject
   or require an explicit, authenticated re-assignment. A shared household phone must never make account A
   loginable as account B. (Store phone unique-per-user; on collision, fail closed.)
4. **Registration requires an authenticated session.** Adding/verifying a phone is only possible from inside a
   live session (JWT-gated, like `issue-recovery-codes`). You cannot attach a phone to an account you can't
   already prove you own — so phone can never be used to *claim* an account, only to *recover* one you set it up
   on.

Net: phone stays a per-uid recovery factor, structurally identical to recovery codes, and the "no cross-provider
override" invariant holds by construction.

---

## 5. Compliance impact

Phone number is a **new category of personal data** and pulls directly on the open compliance item
(`docs/compliance/REQUIREMENTS.md`). Today the processed-data set is "email (on upgrade), swipe prefs, room
membership, saved locations, session IDs." Adding phone changes that inventory and triggers:

- **Consent / transparency at collection (Arts. 13–14).** Phone is collected only at the point the user opts into
  phone recovery, for the *specific purpose* of account recovery. Lawful basis is **contract** (a feature the
  user requested), like email — not marketing consent. But it needs: an inline notice at the phone field ("used
  only to text you a recovery code; we won't use it for marketing"), and the Privacy Policy's data-categories and
  purposes sections **must be updated** to list phone + the SMS sub-processor. This is a new sub-processor
  (Twilio/MessageBird/etc.) → a new **DPA to sign and a transfer mechanism (SCCs/DPF) to file** (REQUIREMENTS §8),
  and the international-transfer note must name it.
- **Retention.** Define and document how long a recovery phone is kept — recommendation: **for the life of the
  account, deleted on account deletion or when the user removes the number.** No separate retention timer needed,
  but it must be written down (Art. 30 record).
- **Data-subject rights (Arts. 15–22).** Phone must be included in **data export** ("download my data") and in
  **erasure/delete** — the export/delete runbook the compliance memo already requires must add the phone field.
  Rectification: the user must be able to change/remove the number from `/account`.
- **Consent checkbox spec.** REQUIREMENTS §9 defines Stage A (first-use) and Stage B (email upgrade) checkboxes.
  Phone recovery adds no *mandatory* checkbox (it's optional and contract-based) but adds the inline notice
  above; if added, slot it as an optional item in the account/settings area, not the blocking first-use gate.
- **No special-category data.** Phone is not Art. 9 sensitive data, so no heightened regime — but it does raise
  the profile of the account (a phone is more identifying than an app-scoped email-OTP identity), which is another
  reason to keep it optional and purpose-limited.

**Cross-link:** fold any phone-recovery build into the compliance work item so the Privacy Policy, sub-processor
list, DPA/transfer files, and export/delete runbook are updated in the same change — do not ship phone collection
before those are in place.

---

## 6. Rough implementation shape (IF approved)

This is the recovery-only design from §1, deliberately mirroring the shipped recovery-codes architecture so it
reuses proven patterns. **Not to be built without the §7 decisions locked.**

**Layers that change:**

- **Migration (new, e.g. `013_recovery_phone.sql`).**
  - Add a store for the recovery phone tied to `auth.users(id)` — either a `recovery_phone` column on a
    per-user table or a small `recovery_phones(user_id pk, phone_e164 unique, verified_at, created_at)` table.
    `unique(phone_e164)` enforces §4.3 (one phone → one account).
  - **RLS deny-all to `authenticated`/`anon`** like `recovery_codes`; only service_role edge functions read it.
    New projects grant nothing by default (repo gotcha) — add explicit service_role grants.
  - A SECURITY DEFINER RPC `recovery_phone_status()` returning only whether a verified phone exists for
    `auth.uid()` (never the number itself to the client beyond a masked form), `search_path` set.
- **Edge functions (new, 2, mirroring recovery codes).**
  - `add-recovery-phone` (**JWT-gated, verify ON**) — authenticated user submits a phone; function sends an SMS
    OTP via the provider and, on a follow-up verify call, stores the number against their uid. Split into
    `index.ts` (provider IO) + pure `logic.ts` (E.164 normalization/validation, throttle decision) per the repo
    test convention.
  - `redeem-recovery-phone` (**`--no-verify-jwt`**, the deliberate unauthenticated exception, same as
    `redeem-recovery-code`) — input `{ phone, code }`; verify the SMS OTP for the account that phone is
    registered to; on success call admin `generateLink({ type: 'magiclink', email })` for that account and return
    the `token_hash`; client calls `verifyOtp({ token_hash, type: 'magiclink' })` → same-uid session restored.
    Generic errors (no enumeration), per-phone lockout throttle, constant-time behavior — copy the
    `redeem-recovery-code` security posture.
- **Pure logic (new, unit-tested to the 90% gate).**
  - `lib/recovery-phone-logic.ts` — E.164 formatting/validation, masking for display (e.g. `+1 ••• ••• 1234`),
    input shaping. jest.
  - `supabase/functions/*/logic.ts` — OTP throttle/lockout decision, phone normalization. `deno test`.
- **`providers/AuthProvider.tsx`.** Add methods paralleling the recovery-code ones:
  `addRecoveryPhone(phone)`, `verifyRecoveryPhone(phone, code)`, `redeemRecoveryPhone(phone, code)`,
  `recoveryPhoneStatus()`. Same offline guards (`if (!supabase) throw`) as existing methods.
- **Account UI (`app/account.tsx`, or the planned Settings hub).**
  - Permanent view: a "Phone recovery" section — show masked verified number or an "Add a recovery phone"
    affordance → enter number → receive SMS → verify → stored. Allow remove/replace.
  - Sign-in view: "Lost access to your email? Use your recovery phone" alongside the existing "use a recovery
    code" affordance → phone + SMS code → session restored.
- **Compliance artifacts (same change).** Update Privacy Policy data categories + sub-processor list, add the
  SMS-provider DPA/transfer note, and extend the export/delete runbook to include phone (see §5).

**Testing/verification (repo protocol):** jest for `lib/*` logic, `deno test` for edge `logic.ts`, migration run
before the bundle that uses the new objects, then a live inbox-free E2E: register a phone → sign out to an empty
session → recover with phone + SMS code → same account/room restored. Plus typecheck, lint, hex-grep 0,
`expo export --platform web`.

**New MANUAL_TODOS this would add (human-only, dashboard/provider config):**

- Create an SMS provider account (Twilio/MessageBird/Vonage), buy a sender number, paste credentials into
  Supabase Auth → Phone provider settings, configure the SMS OTP template.
- **US: register A2P 10DLC brand + campaign** (lead time; can't be automated) before US SMS will deliver reliably.
- Deploy both edge functions (`add-recovery-phone` JWT ON; `redeem-recovery-phone` `--no-verify-jwt`, document
  the exception).
- Run the new migration in the SQL Editor before shipping the bundle.
- Extend the T16b CAPTCHA + rate-limit hardening to cover **both** new SMS endpoints (toll-fraud / SMS-pumping
  mitigation) — set a per-phone and per-IP send cap and consider geo-limiting to expected countries.
- Sign the SMS provider DPA and file its transfer mechanism (SCCs/DPF); publish the updated Privacy Policy.
- Set a monthly SMS spend cap/alert at the provider to bound cost/abuse.

---

## 7. Decisions the user must make before build

Do not start implementation until each of these is answered:

1. **Build it at all now?** Recommendation is **no** — recovery codes already close the gap; defer phone until
   there's evidence users need it. Confirm defer, or override.
2. **Recovery-only channel, not full phone-auth identity?** (Recommended: recovery-only.) Confirm we will **not**
   enable Supabase phone-OTP sign-in.
3. **Supplement, never replace recovery codes?** (Recommended: supplement.) Confirm codes stay.
4. **SMS provider + budget.** Which provider (Twilio vs Twilio Verify vs MessageBird/Vonage), and an accepted
   monthly SMS budget + spend cap. Are we willing to take on A2P 10DLC registration for US delivery?
5. **Geography.** US-only recovery SMS at launch (cheaper, simpler A2P story, smaller fraud surface) or
   international? International multiplies per-message cost and abuse risk.
6. **One-phone-per-account collision policy.** On a phone already registered to another account: reject outright,
   or allow explicit authenticated re-assignment? (Recommended: reject / fail closed.)
7. **Compliance gating.** Confirm the Privacy Policy update, new sub-processor DPA + transfer filing, and
   export/delete runbook update ship **in the same change** as phone collection — phone data is not collected
   before those land.
8. **Abuse controls scope.** Confirm rate limits + CAPTCHA (extending T16b) on both SMS endpoints, plus a
   provider-side spend cap, are in scope as launch-blocking, not follow-ups.
