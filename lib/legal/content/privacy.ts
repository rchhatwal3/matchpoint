// Verbatim body of docs/compliance/PRIVACY_POLICY.draft.md.
// Update this string whenever counsel finalizes wording/placeholders; bump
// POLICY_VERSION in lib/legal/policy-meta.ts on material change.
export const privacyMarkdown = `# matchpoint — Privacy Policy

> **DRAFT — not legal advice; have a qualified attorney review before publishing.**
> Prepared as a compliance-readiness draft by a non-lawyer. Do not publish or rely on it until reviewed by qualified counsel. Bracketed **[PLACEHOLDER]** fields must be completed, and each sub-processor's transfer mechanism verified, before publication.

**Last updated:** [DATE]
**Effective date:** [DATE]

This Privacy Policy explains how **[LEGAL ENTITY NAME]** ("**matchpoint**", "**we**", "**us**") collects, uses, and shares personal data when you use the matchpoint app and website (the "**Service**"), and the rights you have. matchpoint is the **data controller** for the personal data described here.

**In short:** We collect the minimum needed to run a shared-decision app for pairs. We do **not** sell your data, show ads, or track you across other websites or apps.

---

## 1. Who we are and how to contact us

**Controller:** [LEGAL ENTITY NAME], [REGISTERED ADDRESS].
**Privacy contact:** [PRIVACY CONTACT EMAIL].
**EU representative (Art. 27 GDPR):** [NAME / ADDRESS, or "Not currently appointed — see Section 12"].
**UK representative:** [NAME / ADDRESS, or "Not currently appointed"].

## 2. What matchpoint does (relevant to your data)

Two people join a private "room" using a 6-character invite code and swipe on decks of options (food, restaurants, vacations, activities, date nights, shows). Mutual likes become "matches". You can use the Service **anonymously**, or optionally create a permanent account by verifying an email address.

## 3. Personal data we collect

| Category | What it is | When we collect it |
|---|---|---|
| **Authentication identifiers** | An anonymous session/user ID created by our auth provider; a session token stored on your device. | Automatically, when you start using the Service. |
| **Email address** | The email you provide. | **Only if** you upgrade to a permanent account. |
| **One-time codes / recovery codes** | The OTP used to verify your email and one-time recovery codes. | Only when you create/upgrade a permanent account. |
| **Room and membership data** | Which rooms you are in, invite-code associations. | When you create or join a room. |
| **Swipe preferences and matches** | The options you like/pass, and resulting matches, within a room. | As you use the Service. |
| **Saved locations** | Free-text place/city names you type (used to look up nearby restaurants). | When you enter them. |
| **Device storage** | A session token kept in your browser's \`localStorage\` or the app's \`AsyncStorage\` to keep you signed in. | Automatically (strictly necessary — see Section 7). |
| **Basic technical/log data** | Standard request metadata (e.g. IP address, timestamps) processed by our infrastructure providers to deliver and secure the Service. | Automatically. |

**We do not intentionally collect special-category data** (such as data revealing health, religion, or sexual orientation). Please do not enter such information into free-text fields like saved locations.

**No payments** are processed today. We do not collect payment or financial information.

## 4. How and why we use your data, and our lawful bases (GDPR/UK GDPR)

| Purpose | Data used | Lawful basis |
|---|---|---|
| Provide the core Service (rooms, swiping, matches) | Auth identifiers, room/membership, swipes | **Performance of a contract** (our Terms) and/or **legitimate interests** in operating the Service you requested. |
| Keep you signed in | Session token in device storage | **Legitimate interests** / strictly necessary to deliver the Service. |
| Look up nearby restaurants/places you ask for | Saved locations (sent server-side to place providers) | **Performance of a contract** — delivering a feature you triggered. |
| Verify your email and enable account recovery | Email, OTP, recovery codes | **Performance of a contract** — providing the permanent-account feature you requested. |
| Secure the Service, prevent abuse, debug | Technical/log data | **Legitimate interests** in security and reliability. |
| Comply with legal obligations | As required | **Legal obligation.** |

We do **not** process your data for advertising or cross-context tracking, and we do **not** rely on consent for the core Service. If we ever introduce processing that requires consent (for example, marketing emails or analytics), we will ask for it separately and you can withdraw it at any time.

## 5. Who we share data with (sub-processors and third parties)

We share personal data only with service providers that help us run the Service, under contracts (Data Processing Agreements) that restrict their use of the data. Your device (frontend) does not call these third parties directly; place lookups are made server-side from our backend.

| Provider | Role | Data involved | Location |
|---|---|---|---|
| **Supabase** | Authentication, database (Postgres), server-side functions | Auth identifiers, email, room/membership, swipes, saved locations | United States |
| **Google (Places API — New)** | Restaurant/place lookups | The saved location/query sent server-side (not your account identity) | United States |
| **Foursquare (Places)** | Restaurant/place lookups | The saved location/query sent server-side (not your account identity) | United States |
| **Resend** | Transactional email (OTP, account) | Email address, message content | United States |
| **GitHub Pages** | Static website hosting | Technical/log data associated with loading the site | United States |

We may also disclose data if required by law, to enforce our Terms, or to protect the rights, safety, and security of users or the public. We do **not sell** your personal data and do **not share** it for cross-context behavioral advertising.

## 6. International data transfers

We are based in **[COUNTRY]** and our providers listed above are located in the **United States**. When we transfer personal data of individuals in the EU/EEA or UK to the United States, we rely on a lawful transfer mechanism under Chapter V of the GDPR (and the UK equivalent), which is the **Standard Contractual Clauses (SCCs)** and/or the **EU-US Data Privacy Framework** where the provider is self-certified, together with the UK Addendum / International Data Transfer Agreement for UK transfers. You may request more information, or a copy of the relevant safeguards, using the contact details in Section 1.

> **[TO VERIFY before publishing: confirm for each provider whether it is Data Privacy Framework-certified and/or relies on SCCs, and list the specific mechanism. Do not state a provider is DPF-certified until confirmed on the official DPF list.]**

## 7. Cookies and device storage

matchpoint does **not** use advertising or tracking cookies, analytics, or cross-site tracking. We store only a **strictly necessary** authentication token on your device (in \`localStorage\` on the web, or \`AsyncStorage\` in the mobile app) so you stay signed in and the Service works. Because this storage is strictly necessary to provide the Service you requested, **no cookie-consent banner is required**. If we introduce any non-essential storage or tracking in the future, we will ask for your consent first.

## 8. How long we keep your data (retention)

| Data | Retention |
|---|---|
| Anonymous session data (swipes, room data) | Kept while the session/room is active; deleted when you delete the room/data or after **[X months]** of inactivity. |
| Email + permanent-account data | Kept while your account exists; deleted on account deletion (subject to backups below). |
| Recovery codes / OTP | OTP is short-lived; recovery codes are kept while your account exists. |
| Failed recovery-code attempts | Purged automatically after 30 days. |
| Technical/log data | Kept for a limited period for security and debugging, typically **[X days/months]**. |
| Backups | Deleted data may persist in routine encrypted backups for up to **[X days]** before being overwritten. |

> **[TO SET: fill in concrete retention periods after deciding your data-lifecycle policy.]**

## 9. Your rights

Depending on where you live, you have the following rights over your personal data.

**If you are in the EU/EEA or UK (GDPR / UK GDPR):**
- **Access** — get a copy of your personal data.
- **Rectification** — correct inaccurate or incomplete data (e.g. your email or saved locations).
- **Erasure** — ask us to delete your data ("right to be forgotten").
- **Restriction** — ask us to limit how we use your data.
- **Portability** — receive your data in a portable format.
- **Objection** — object to processing based on legitimate interests.
- **Withdraw consent** — where we rely on consent, withdraw it at any time (this does not affect prior processing).
- **Complain** — lodge a complaint with your local supervisory authority (in the UK, the [ICO](https://ico.org.uk/); in the EU, your national data protection authority).

**How to exercise them:** email **[PRIVACY CONTACT EMAIL]**, or use the in-app delete/export controls where available. We respond within **one month** (extendable for complex requests, as permitted by law). We may need to verify your identity first.

**Anonymous users:** because anonymous use has no email tied to you, the practical way to exercise access/erasure is through the in-app controls to export or delete your room and data. If you need help, contact us.

**Shared rooms:** a room is shared between two people. If you delete your data, we remove your personal data from the room. Room content that also belongs to the other member (such as their swipes and the shared match history) may remain available to that other member unless they also delete it. Contact us if you have questions about a specific room.

**If you are a California / US resident:** we do **not sell or share** your personal information (as those terms are defined under the CCPA/CPRA) and do not use it for cross-context behavioral advertising — including for any consumer under 16, for whom the CCPA would otherwise require opt-in consent before a sale or share. matchpoint's stated minimum age to use the Service is 16. You may contact us to ask what personal information we hold and to request deletion. We will not discriminate against you for exercising your rights.

## 10. Security

We use reasonable technical and organisational measures to protect your data, including encryption in transit, access controls on our database, database row-level security so users can only access their own rooms, and secret management so third-party API keys are never exposed in the app. No system is perfectly secure; please use a strong, unique email account and store your recovery codes safely.

## 11. Children

**You must be at least 16 years old to use the Service.** We do not knowingly collect personal data from anyone under 16. If you believe someone under 16 has provided us data, contact **[PRIVACY CONTACT EMAIL]** and we will delete it.

## 12. Data breaches

If a personal-data breach occurs that is likely to result in a risk to your rights, we will notify the relevant supervisory authority within 72 hours where required, and affected users where the risk is high, in line with GDPR/UK GDPR.

## 13. Changes to this policy

We may update this Privacy Policy. If changes are material, we will provide reasonable notice (in-app, or by email if you have a permanent account) before they take effect. The "Last updated" date above shows the latest version.

## 14. Contact

Privacy questions or requests: **[PRIVACY CONTACT EMAIL]**
Controller: **[LEGAL ENTITY NAME]**, **[REGISTERED ADDRESS]**

---

*Companion document: see the matchpoint Terms of Service for the terms governing your use of the Service.*
`;
