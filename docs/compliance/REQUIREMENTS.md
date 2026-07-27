# matchpoint — Legal & Compliance Requirements Memo

> **DRAFT — not legal advice; have a qualified attorney review before publishing.**
> Prepared as a compliance-readiness draft for the matchpoint product team. The author is not a lawyer. Every conclusion below must be confirmed by qualified counsel in the relevant jurisdictions before you rely on it or publish any user-facing document.

**Last updated:** 2026-07-26
**Scope of this memo:** which privacy/platform laws apply to matchpoint as it broadens its user base, and the concrete minimum each one requires for *this specific app*.

---

## 0. Product facts this memo is based on

| Fact | Value |
|---|---|
| What it is | Tinder-style swipe app for **pairs** (couples/friends). Two people share a private room via a 6-char invite code, swipe decks (food, restaurants, vacations, activities, date nights, shows); mutual likes = "matches". |
| Pairing model | Private invite code only. **Not** a stranger-matching/dating service. |
| Platforms | One Expo codebase → iOS, Android, web. Web is **live** at https://rchhatwal3.github.io/matchpoint/ (redirects to ramneekchhatwal.com/matchpoint), publicly reachable from EU/EEA + UK today. |
| Auth | Supabase **anonymous** auth by default (no account). Optional upgrade to a permanent account via **passwordless email OTP**. Lost-email recovery via one-time recovery codes. |
| Personal data processed | Email (only on upgrade), swipe preferences, room membership, saved locations (free-text city names typed by user), auth session identifiers. **No payments today.** |
| Sub-processors | **Supabase** (auth + Postgres + edge functions, US), **Google Places API (New)** and **Foursquare Places** (restaurant lookups, called server-side from an edge function using the user's saved location), **Resend** (transactional email/OTP), **GitHub Pages** (static hosting). Frontend never calls third parties directly. |
| Tracking/ads | None today. Session/token stored client-side (localStorage / AsyncStorage). |

Because the web app is publicly reachable in the EU/EEA and UK **now**, GDPR / UK GDPR apply today under their "targeting/monitoring" extraterritorial tests, not at some future launch. Treat this as live exposure.

---

## 1. Applicable regimes — summary table

| Regime | Applies to matchpoint? | Why |
|---|---|---|
| **EU GDPR** | **Yes** | App is offered to individuals in the EU/EEA (web live, no geoblock). Art. 3(2) extraterritorial scope. |
| **UK GDPR + DPA 2018** | **Yes** | Same reasoning for UK individuals post-Brexit. |
| **ePrivacy Directive ("cookie law")** | **Yes, but** no consent banner required today | Storing/reading data on a device triggers it; but only **strictly necessary** storage (session token) is used → exempt from consent. See §4. |
| **EU Digital Services Act (DSA)** | **Partially** — you are an "intermediary/hosting" service, but the invite-only 1:1 nature and micro-enterprise status remove almost all of it | See §5. Minimum obligations are light but non-zero. |
| **GDPR Art. 8 (children's consent age)** | **Yes** — and you should go further with an **18+ gate** | See §6. |
| **US — CCPA/CPRA (California)** | **Not yet** — below all thresholds today | Backend being US-hosted does **not** trigger CCPA. See §7. Revisit at scale. |
| **Other US state privacy laws** | Not yet | Same threshold logic; monitor as you grow. |

---

## 2. EU GDPR — does it apply, and minimum obligations

**Applies: Yes.** Under GDPR Art. 3(2), the Regulation reaches a controller outside the EU that offers services to individuals in the EU. A free, publicly reachable web app with no geoblock and general-audience appeal is offering services to EU users. ([gdpr-info.eu/art-3](https://gdpr-info.eu/art-3-gdpr/))

You are a **data controller** for the personal data of your users. Supabase, Google, Foursquare, Resend and GitHub are **processors / sub-processors** (or independent controllers for their own purposes — confirm per contract).

### Minimum concrete obligations for matchpoint

1. **Lawful basis for each processing activity (Art. 6).** Map each one:
   - Anonymous auth session + swipe/room data needed to make the app work → **contract / legitimate interests** (you must run and document a legitimate-interests assessment if you rely on LI).
   - Email address on account upgrade → **contract** (necessary to provide the permanent-account feature the user asked for) and to send OTP.
   - Saved location → **contract / legitimate interests** (needed to return nearby restaurants the user requested).
   - Restaurant lookups via Google/Foursquare → processing needed to deliver the feature the user triggered.
   - You are **not** relying on marketing consent today (no ads/tracking), which keeps the consent surface small.

2. **Privacy notice / policy (Arts. 13–14).** Publish a policy containing: identity + contact of controller, purposes and lawful bases, data categories, recipients/sub-processors, international-transfer mechanism, retention periods, all data-subject rights, right to complain to a supervisory authority, and whether provision is mandatory. Draft provided: `PRIVACY_POLICY.draft.md`.

3. **Data-subject rights mechanisms (Arts. 15–22).** You must be able to, within **one month**:
   - **Access / portability** — export a user's data (email, room memberships, swipes, saved locations). Build a "Download my data" path or a manual runbook.
   - **Erasure ("right to be forgotten")** — hard-delete a user and their room-linked data on request. Note anonymous users have no identifier to reach you with, so provide an in-app "delete my data / delete room" control; that is the practical erasure mechanism.
   - **Rectification** — let users correct email / saved locations.
   - **Restriction / objection** — a documented process, even if manual.
   - Because rooms are shared between two people, define what happens to *shared* room data when one member erases (typically: remove the erasing user's personal data; the room/matches may persist for the other member unless both delete). Document this decision.

4. **Records of processing (Art. 30).** Keep a short internal Record of Processing Activities (a spreadsheet is fine at this size). Small orgs get a partial exemption, but a dating-adjacent app processing data continuously will generally be expected to keep one.

5. **Data Processing Agreements (Art. 28).** Have a signed/accepted DPA in place with **every** processor: Supabase, Resend, Google (Places API terms + DPA), Foursquare, GitHub. Most offer standard DPAs — accept and file them.

6. **Security (Art. 32).** Reasonable technical/organisational measures: TLS in transit, access controls on Supabase, secrets management for API keys (never in the client bundle), Postgres Row Level Security so a user can only read their own rooms.

7. **Breach notification (Arts. 33–34).** Have a process to notify your lead supervisory authority within **72 hours** of becoming aware of a qualifying breach, and affected users if high risk.

8. **DPO / EU representative.**
   - **DPO (Art. 37):** likely **not required** — your core activity is not large-scale monitoring or large-scale special-category processing. Reassess at scale.
   - **EU representative (Art. 27):** technically required for non-EU controllers targeting the EU, but there is an exemption for occasional processing that is low-risk and small-scale. Given continuous processing of a general audience, **budget for appointing an Art. 27 representative** as you grow, and confirm with counsel whether you can rely on the exemption now.

9. **No special-category data by design.** You do **not** intentionally collect Art. 9 data (health, sexuality, etc.). Keep it that way: free-text "saved location" and swipe decks should not solicit sensitive info. Flag internally that a "couples" framing could *imply* relationship status — avoid storing anything that reveals sexual orientation.

**Sources:** [GDPR Art. 3](https://gdpr-info.eu/art-3-gdpr/), [GDPR text (gdpr-info.eu)](https://gdpr-info.eu/), [ICO UK GDPR guidance](https://ico.org.uk/for-organisations/uk-gdpr-guidance-and-resources/).

---

## 3. UK GDPR + Data Protection Act 2018 — does it apply, and minimum obligations

**Applies: Yes**, for the same targeting reason for individuals in the UK. UK GDPR mirrors EU GDPR; the DPA 2018 supplements it.

### Minimum concrete obligations (delta vs EU GDPR)

- Substantially the **same** obligations as §2. A single privacy policy and consistent rights-handling can satisfy both regimes.
- **Data-subject rights** are the same set (access via SAR, rectification, erasure, restriction, portability, objection), one-month response window. ([ICO — rights of individuals](https://ico.org.uk/for-organisations/uk-gdpr-guidance-and-resources/data-sharing/data-sharing-a-code-of-practice/the-rights-of-individuals/), [ICO — right to erasure](https://ico.org.uk/for-organisations/uk-gdpr-guidance-and-resources/individual-rights/individual-rights/right-to-erasure/))
- **UK representative (Art. 27 UK GDPR):** parallel requirement for non-UK controllers targeting the UK; same small-scale/low-risk exemption analysis as the EU representative. Budget for one at scale.
- **ICO registration & data-protection fee:** organisations established in the UK that process personal data must pay the ICO fee. As a US-based controller *without a UK establishment*, this fee generally does not apply, but confirm your establishment status with counsel.
- **Children's Code (Age Appropriate Design Code):** applies to information-society services **likely to be accessed by children** in the UK. Your intended mitigation is an **18+ gate** (see §6) so that children are not your audience; document that reasoning. If any under-18 access is foreseeable, the Code's 15 standards (high-privacy defaults, data minimisation, no nudge techniques, etc.) apply. ([ICO Children's Code / Wikipedia summary](https://en.wikipedia.org/wiki/Children%27s_Code))

---

## 4. ePrivacy Directive ("cookie law") — is a consent banner required?

**Bottom line: No consent banner is required today**, because matchpoint stores only **strictly necessary** data on the device.

### Why
The ePrivacy Directive (Art. 5(3)) requires prior consent to **store or read information on a user's device** — and this applies to **any** client-side storage, not just HTTP cookies: `localStorage`, `sessionStorage`, `AsyncStorage`, and IndexedDB are all covered by the same test. Swapping cookies for localStorage does **not** avoid the rule. ([Swetrix — does localStorage require consent](https://swetrix.com/blog/does-local-storage-require-cookie-consent), [Kukie.io — local/session storage cookie law](https://kukie.io/blog/local-storage-session-storage-cookies-law))

**But there is an exemption:** storage that is *strictly necessary* for a service the user explicitly requested needs **no consent**. A login/auth **session token** is the textbook example of strictly-necessary storage. ([ConsentTheater — strictly-necessary cookies](https://consenttheater.org/handbook/strict-necessary-cookies/))

matchpoint stores **only** the Supabase auth session/token client-side, which is necessary to keep the user signed in and operate the app. There is **no** advertising, analytics, cross-visit tracking, fingerprinting, or third-party marketing storage. Therefore:

- **No cookie/consent banner is required.**
- You **still** must **disclose** this storage in the Privacy Policy (a short "How we use device storage" section — provided in the draft).

### What would change this
If you ever add analytics (e.g. Google Analytics, PostHog), advertising SDKs, A/B tools that persist identifiers, or any cross-visit tracking, those are **not** strictly necessary → you would then need a **compliant consent mechanism** (granular, opt-in, no pre-ticked boxes, reject-all as easy as accept-all) before setting that storage. Revisit this section the day you add the first analytics SDK.

**Sources:** [ePrivacy vs GDPR (biscotti-cmp)](https://www.biscotti-cmp.com/en/blog/the-eprivacy-directive-vs-gdpr-navigating-the-eus-cookie-rules), [ConsentTheater handbook](https://consenttheater.org/handbook/strict-necessary-cookies/), [Swetrix](https://swetrix.com/blog/does-local-storage-require-cookie-consent).

---

## 5. EU Digital Services Act (DSA) — does it apply to an invite-only pair app?

**Applies: Partially, and lightly.** The DSA applies to "intermediary services" offered to users in the EU, in force in full since **17 February 2024** for services beyond just the "very large" ones. ([EC DSA Q&A](https://digital-strategy.ec.europa.eu/en/faqs/digital-services-act-questions-and-answers), [Ropes & Gray](https://www.ropesgray.com/en/insights/viewpoints/102j0f0/reminder-eu-digital-services-act-applies-beyond-very-large-online-service-prov))

### How matchpoint classifies

- matchpoint stores user-generated content (swipes, room data) on behalf of users → it is at least a **hosting service**.
- Is it an **"online platform"** (hosting service that *disseminates information to the public*)? Probably **not** in the strict sense: content is shared only between **two people in a private, invite-code room**, not disseminated to the public. Private/closed communications are generally outside the "online platform" tier. This removes the heavy Section 3 platform obligations (trusted flaggers, statement-of-reasons database, notice-and-action at scale, etc.).
- **Micro/small-enterprise exemption (Art. 19):** even where the online-platform obligations *would* apply, businesses with **< 50 employees and ≤ €10m turnover** are exempt from the Section 3 online-platform obligations. matchpoint clearly qualifies today. ([DSA Library Art. 29](https://dsa-library.com/article/29/), [Promise Legal DSA explainer](https://blog.promise.legal/eu-digital-services-act-game-studios/))

### Minimum concrete obligations that DO apply (hosting-provider baseline, size-independent)

The Art. 19 SME exemption does **not** remove the basic hosting obligations (Arts. 16–18) or the general transparency baseline. For matchpoint the practical minimum is:

1. **Single point of contact** for authorities and for users (Arts. 11–12) — publish a contact email in the Terms/Privacy Policy. (Done in drafts.)
2. **Clear terms & conditions** describing any restrictions you impose on use of the service, in plain language (Art. 14). (Done in ToS draft.)
3. **Notice-and-action mechanism (Art. 16):** a way for anyone to report illegal content held in a room. Given content is private and two-party, exposure is low, but provide a report/abuse email. (Referenced in ToS/Privacy.)
4. **Legal representative in the EU (Art. 13)** for intermediary providers without an EU establishment — parallel to the GDPR Art. 27 rep. Confirm scope with counsel; can often be the same appointed representative.

You are **not** an online marketplace, so trader-traceability (Art. 30) does not apply.

**Sources:** [EC DSA Q&A](https://digital-strategy.ec.europa.eu/en/faqs/digital-services-act-questions-and-answers), [Ropes & Gray reminder](https://www.ropesgray.com/en/insights/viewpoints/102j0f0/reminder-eu-digital-services-act-applies-beyond-very-large-online-service-prov), [DSA Library Art. 29](https://dsa-library.com/article/29/).

---

## 6. Age of consent for data processing + should there be an 18+ gate?

### GDPR Art. 8 — digital age of consent
Where processing of a child's personal data relies on **consent** for an information-society service, the child must be **at least 16** by default; **Member States may lower this to no less than 13**. Below the applicable age, a holder of parental responsibility must consent, and the controller must make reasonable efforts to verify it. ([GDPR Art. 8](https://gdpr-info.eu/art-8-gdpr/), [ICO — ISS and consent](https://ico.org.uk/for-organisations/uk-gdpr-guidance-and-resources/childrens-information/children-and-the-uk-gdpr-old/what-are-the-rules-about-an-iss-and-consent/))

The threshold varies by country (examples: **Germany, Ireland, Netherlands = 16**; **UK, Denmark, Sweden = 13**; **France = 15**; **Spain = 14**). Because you serve a general EU/UK audience, the *conservative* planning number is **16**.

**Important nuance:** Art. 8 only bites where your **lawful basis is consent**. matchpoint's core processing runs on **contract / legitimate interests**, not consent, which softens the strict Art. 8 verification duty — but it does **not** remove the general duty to protect children and to not target them.

### Should matchpoint have an 18+ gate?
**Recommendation: Yes — gate the app at 18+ and state it as a Terms condition.** Reasons:

1. The product is **dating-adjacent** ("date nights", couples framing). App-store policies and public perception treat couples/dating-style apps as adult-oriented. **Apple App Store** and **Google Play** both effectively require **17+/18+ age ratings** for dating or "mature/suggestive" content, and dating apps must gate at 18+ under Google Play's dating-app policies.
2. An 18+ gate sidesteps the entire GDPR Art. 8 child-consent verification problem and the ICO **Children's Code** (which applies to services *likely to be accessed by children*) — provided you genuinely design against child access and don't market to minors.
3. It is the lightest-weight compliant path for a small team: one age-confirmation checkbox + Terms clause, rather than building parental-consent verification.

**Implementation:** a **self-declared 18+ confirmation** at first use (checkbox, unticked by default) plus a Terms clause reserving the service to adults and allowing account termination on discovery of underage use. Self-declaration is the accepted minimum for an 18+ general app; if the app ever adds features that heighten risk, revisit with stronger age assurance.

**Sources:** [GDPR Art. 8](https://gdpr-info.eu/art-8-gdpr/), [ICO ISS & consent](https://ico.org.uk/for-organisations/uk-gdpr-guidance-and-resources/childrens-information/children-and-the-uk-gdpr-old/what-are-the-rules-about-an-iss-and-consent/), [Children's Code overview](https://en.wikipedia.org/wiki/Children%27s_Code).

> **SUPERSEDED 2026-07-27:** The "Yes — gate at 18+" recommendation above and its A2 checkbox (§9) are no longer implemented. Reasoning: point 1 above rested on matchpoint being "dating-adjacent" and therefore subject to the App Store/Play dating-app age rules. matchpoint is a decision-making app for **existing** couples and friends — access is by private invite code only, there is no stranger-matching or discovery surface — so it is not a dating product and that App Store/Play rationale does not apply to it. The GDPR Art. 8 analysis above is unaffected by this change and remains the reason the floor is **16**, not lower: matchpoint's stated minimum age is now 16, the default digital age of consent under Art. 8, so no parental-consent verification is required in any EU member state at that threshold. The stated minimum is a Terms condition users agree to by using the Service; it is not verified or asked about in-app. The A2 age-confirmation checkbox has been removed from the entry flow; only the A1 Terms + Privacy checkbox remains.

---

## 7. US baseline — CCPA/CPRA (and why "US-hosted backend" is a red herring)

**Applies today: No.** CCPA/CPRA applies to a **for-profit business** doing business in California that meets **at least one** threshold:
- Annual gross revenue **> $26,625,000** (2026 inflation-adjusted figure), **OR**
- Buys/sells/shares personal information of **100,000+** California residents/households per year, **OR**
- Derives **50%+** of annual revenue from **selling/sharing** personal information.

([Clym — CCPA applicability](https://www.clym.io/blog/ccpa-applicability-guide), [CPPA threshold adjustment](https://www.cppa.ca.gov/regulations/cpi_adjustment.html))

matchpoint has **no revenue**, is far below 100,000 California users, and does **not** sell/share data. So **no threshold is met → CCPA does not apply yet.**

**The backend being hosted in the US does not trigger CCPA.** CCPA turns on the business's revenue/volume/sale thresholds and doing business in California, not on where servers sit. Hosting in the US is a **GDPR international-transfer** question (§8), not a CCPA trigger.

### What to do now vs later
- **Now:** nothing mandatory. As good practice (and to future-proof), the drafted Privacy Policy already includes a "US residents / California" section and a "we do not sell or share your personal information" statement — this is cheap insurance and consumer-friendly.
- **Later (revisit when):** you monetise, cross ~$26.6m revenue, approach 100,000 CA users, or start any data "sharing" for cross-context advertising. Then you must add: a "Do Not Sell or Share My Personal Information" / opt-out mechanism, the CCPA rights notice, and (if you ever share for cross-context behavioral advertising) Global Privacy Control honoring.
- Also monitor other US state laws (Virginia, Colorado, Texas, etc.) which have their own thresholds; none are triggered at current scale.

**Sources:** [Clym CCPA applicability 2026](https://www.clym.io/blog/ccpa-applicability-guide), [CPPA CPI adjustment](https://www.cppa.ca.gov/regulations/cpi_adjustment.html), [Jackson Lewis CCPA FAQs](https://www.jacksonlewis.com/insights/navigating-california-consumer-privacy-act-30-essential-faqs-covered-businesses-including-clarifying-regulations-effective-1126).

---

## 8. International data transfers (needed because processors are US-hosted)

Because your controller processing of EU/UK personal data uses **US-based processors** (Supabase, Google, Foursquare, Resend; GitHub Pages for static hosting), you make a **restricted transfer** under GDPR Chapter V / UK equivalents. You need a valid transfer mechanism for each.

**Available mechanisms (Arts. 44–46):**
- **EU-US Data Privacy Framework (DPF)** — adequacy decision (10 July 2023), upheld by the EU General Court in September 2025. If a US processor is **DPF-self-certified**, transfers to it are covered with no extra paperwork. ([activeMind — DPF](https://www.activemind.legal/guides/eu-us-data-privacy-framework/), [Recording Law — DPF 2026](https://www.recordinglaw.com/world-laws/world-data-privacy-laws/eu-us-data-privacy-framework/))
- **Standard Contractual Clauses (SCCs)** — 2021 modular clauses (Module 2 controller→processor). Recommended even for DPF-certified vendors as a backup, and required for any vendor not DPF-certified. ([IAPP SCCs](https://iapp.org/resources/article/eu-standard-contractual-clauses-word-documents), [Lexology SCC vs DPF](https://www.lexology.com/library/detail.aspx?g=ba093af6-68ec-433c-b9c4-0d75de2d7f98))
- For UK transfers: the **UK International Data Transfer Agreement (IDTA)** or the **UK Addendum** to the EU SCCs.

**Action items:**
1. For each US processor, confirm which mechanism its DPA relies on (DPF certification and/or SCCs) and file the documentation. Do **not** assert a specific vendor is DPF-certified in the Privacy Policy until you have verified it on the official DPF list — the drafted policy names the mechanism generically ("SCCs and/or the EU-US Data Privacy Framework") to stay accurate.
2. Where SCCs are relied on, complete a short **Transfer Impact Assessment (TIA)**.

**Sources:** [activeMind DPF guide](https://www.activemind.legal/guides/eu-us-data-privacy-framework/), [Lexology SCC/DPF](https://www.lexology.com/library/detail.aspx?g=ba093af6-68ec-433c-b9c4-0d75de2d7f98), [IAPP SCCs](https://iapp.org/resources/article/eu-standard-contractual-clauses-word-documents).

---

## 9. Consent & disclosure checkbox specification (with ready-to-paste microcopy)

Design rules applied below (from GDPR + EDPB guidance):
- **No pre-ticked boxes.** Any box representing a consent or an affirmative confirmation must be **unticked by default** and require an affirmative user action.
- **Granular & separate.** Don't bundle unrelated consents into one "I agree to everything."
- **Only collect what's needed at each stage.** Anonymous first-use needs the bare minimum; email upgrade adds email-specific items.
- **Links must be tappable** and open the actual Terms / Privacy Policy.

### Stage A — First app use / anonymous entry (before creating or joining a room)

This is where the *general* acceptance and age gate belong, because anonymous users are already having personal data processed (session ID, swipes, room membership).

| # | Checkbox / control | Microcopy (final, ready to paste) | Mandatory? | Default state | Notes |
|---|---|---|---|---|---|
| A1 | Terms + Privacy acceptance | **"I agree to matchpoint's [Terms of Service](#) and [Privacy Policy](#)."** | **Mandatory** — block entry until ticked | **Unticked** | Single combined box for the two governing documents is acceptable; keep both links live. |
| A2 | ~~Age confirmation (18+)~~ | ~~**"I confirm I am 18 years of age or older."**~~ | **SUPERSEDED 2026-07-27 — removed, see §6.** Was mandatory. | — | Was intended to implement the 18+ gate (§6). Superseded: matchpoint is not a dating product, so the App Store/Play rationale for an 18+ gate does not apply. The stated minimum is now 16 (still the Art. 8 default), asserted as a Terms condition rather than confirmed via checkbox. |

> Originally: you may combine A1 and A2 visually as two adjacent checkboxes on the same welcome screen, both actively ticked to continue, not merged into one line. **As of 2026-07-27, A2 no longer exists — only A1 is shown.**

**No consent checkbox is required for the core data processing itself** at Stage A, because that processing runs on contract/legitimate interests, not consent — but the Privacy Policy link (A1) provides the required transparency notice.

### Stage B — Email upgrade (converting anonymous → permanent account via email OTP)

Only shown when the user chooses to upgrade. Adds email-specific items.

| # | Checkbox / control | Microcopy (final, ready to paste) | Mandatory? | Default state | Notes |
|---|---|---|---|---|---|
| B1 | Email-use notice (transactional) | **"We'll email you a one-time code to verify this address and to help you recover your account. We won't use it for marketing."** | Informational — **no checkbox needed** (processing is contract-based for the feature the user requested) | n/a | Display as inline helper text next to the email field, not a consent box. |
| B2 | Recovery-code acknowledgement | **"I understand my recovery codes are the only way to regain access if I lose my email, and matchpoint cannot recover them for me. I've saved them somewhere safe."** | **Mandatory** to complete upgrade | **Unticked** | Protects the user and you; this is an acknowledgement, not a data consent. |
| B3 | Marketing email opt-in *(only if/when you ever send marketing)* | **"Send me occasional product updates and tips by email. (Optional — you can unsubscribe anytime.)"** | **Optional** | **Unticked** | Not needed today (no marketing email). Include **only** when you actually start sending marketing; if included it must be a separate, unticked, opt-in box (consent lawful basis). |

### Which consents at first use vs only at upgrade — quick answer
- **At first use (anonymous):** A1 (Terms + Privacy). ~~A2 (18+)~~ — **superseded 2026-07-27** (see §6): A1 alone is required for **every** user, because processing starts immediately; the stated minimum age (now 16) is a Terms condition, not a checkbox.
- **Only at email upgrade:** B2 (recovery-code acknowledgement), the B1 inline notice, and — *only if you later add marketing* — B3. Email is not collected until this stage, so nothing email-related belongs at first use.

### Copy for the "why we ask" / privacy short-notice (optional but recommended)
Place a one-line link near the checkboxes:
**"How we handle your data → [Privacy Policy](#). We don't sell your data, show ads, or track you across the web."**

---

## 10. Prioritised action checklist

**Do before broadening the user base:**
1. Publish the tailored **Privacy Policy** and **Terms of Service** (drafts in this folder) after attorney review.
2. Ship the **A1 checkbox** (Terms/Privacy) on first-use screen, unticked, blocking entry. ~~A2 (18+)~~ — **superseded 2026-07-27** (see §6): stated minimum age is now 16, asserted in the Terms rather than confirmed via checkbox.
3. Ship the **B2** recovery-code acknowledgement on email upgrade.
4. Build **in-app data export + delete** (or a documented manual runbook) to satisfy access/erasure within one month.
5. Sign/accept **DPAs** with Supabase, Resend, Google, Foursquare, GitHub; file the **transfer mechanism** (DPF/SCCs) evidence for each.
6. Add a **contact/abuse email** to both documents (DSA + GDPR contact point).
7. Write a one-page **Record of Processing** and a **breach-response** note (72-hour process).

**Defer until scale/monetisation:**
8. Appoint an **EU/UK Art. 27 representative** and DSA legal representative.
9. Add **CCPA** notices + opt-out **only** when a threshold is approached.
10. Re-open the **cookie/consent** question the day you add any analytics or ads SDK.

---

## Sources
- [GDPR Art. 3 (territorial scope)](https://gdpr-info.eu/art-3-gdpr/)
- [GDPR Art. 8 (child's consent)](https://gdpr-info.eu/art-8-gdpr/)
- [GDPR full text — gdpr-info.eu](https://gdpr-info.eu/)
- [ICO — UK GDPR guidance & resources](https://ico.org.uk/for-organisations/uk-gdpr-guidance-and-resources/)
- [ICO — rights of individuals](https://ico.org.uk/for-organisations/uk-gdpr-guidance-and-resources/data-sharing/data-sharing-a-code-of-practice/the-rights-of-individuals/)
- [ICO — right to erasure](https://ico.org.uk/for-organisations/uk-gdpr-guidance-and-resources/individual-rights/individual-rights/right-to-erasure/)
- [ICO — ISS and consent (children)](https://ico.org.uk/for-organisations/uk-gdpr-guidance-and-resources/childrens-information/children-and-the-uk-gdpr-old/what-are-the-rules-about-an-iss-and-consent/)
- [Children's Code overview](https://en.wikipedia.org/wiki/Children%27s_Code)
- [ePrivacy vs GDPR cookie rules (biscotti-cmp)](https://www.biscotti-cmp.com/en/blog/the-eprivacy-directive-vs-gdpr-navigating-the-eus-cookie-rules)
- [Strictly-necessary cookies (ConsentTheater)](https://consenttheater.org/handbook/strict-necessary-cookies/)
- [Does localStorage require consent (Swetrix)](https://swetrix.com/blog/does-local-storage-require-cookie-consent)
- [Local/session storage cookie law (Kukie.io)](https://kukie.io/blog/local-storage-session-storage-cookies-law)
- [EC — Digital Services Act Q&A](https://digital-strategy.ec.europa.eu/en/faqs/digital-services-act-questions-and-answers)
- [Ropes & Gray — DSA beyond VLOPs](https://www.ropesgray.com/en/insights/viewpoints/102j0f0/reminder-eu-digital-services-act-applies-beyond-very-large-online-service-prov)
- [DSA Library — Art. 29 (micro/small exclusion)](https://dsa-library.com/article/29/)
- [Clym — CCPA applicability 2026](https://www.clym.io/blog/ccpa-applicability-guide)
- [CPPA — CPI threshold adjustment](https://www.cppa.ca.gov/regulations/cpi_adjustment.html)
- [Jackson Lewis — CCPA FAQs (2026 regs)](https://www.jacksonlewis.com/insights/navigating-california-consumer-privacy-act-30-essential-faqs-covered-businesses-including-clarifying-regulations-effective-1126)
- [activeMind — EU-US Data Privacy Framework](https://www.activemind.legal/guides/eu-us-data-privacy-framework/)
- [Recording Law — EU-US DPF 2026](https://www.recordinglaw.com/world-laws/world-data-privacy-laws/eu-us-data-privacy-framework/)
- [Lexology — SCCs vs DPF](https://www.lexology.com/library/detail.aspx?g=ba093af6-68ec-433c-b9c4-0d75de2d7f98)
- [IAPP — EU Standard Contractual Clauses](https://iapp.org/resources/article/eu-standard-contractual-clauses-word-documents)
