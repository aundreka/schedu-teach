# Legal & Compliance — Launch Plan

Status as of July 29, 2026. Covers the Philippine Data Privacy Act (RA 10173),
app-store requirements, and what remains before/after launch.

## What already exists (verified)

| Item | Where | Status |
| --- | --- | --- |
| Privacy Policy | `apps/website/app/privacy` → https://www.scheduhq.com/privacy | Live. References DPA, lists data collected, third-party processors (hosting, payments, error monitoring, AI providers), retention, and user rights. |
| Terms of Service | `apps/website/app/terms` → https://www.scheduhq.com/terms | Live. |
| In-app legal pages | `apps/teach/app/legal/{privacy,terms}` | Linked from sign-in, sign-up, and Settings. |
| Account deletion | Settings → Delete account → `delete-account` edge function (deployed on prod) | Permanently deletes account + data. Satisfies Play's deletion requirement and DPA erasure right. |
| Consent at signup | Sign-up screen links Terms + Privacy | Creating an account = acceptance. |

## Data inventory (what SCHEDU actually holds)

- **Account data:** name, email, username, hashed password (Supabase Auth).
- **User content:** subjects, syllabi text, lesson plans, activities, schedules,
  school/section names. No student records, no grades, no student PII.
- **Usage/technical:** AI generation counts, error logs (Sentry), device info in logs.
- **Payment data (when billing launches):** handled by PayMongo; we store only
  webhook events and subscription state, never card/wallet numbers.
- **No sensitive personal information** (health, biometrics, government IDs, minors'
  data) is collected. This keeps compliance obligations light — keep it that way.

## Data Privacy Act plan

1. **Data Protection Officer.** Small-scale personal information controllers still
   need an accountable person. Designate the founder as DPO contact; the
   `privacy@` email in the policy is the DPO channel. Make sure that inbox is
   monitored. *(No filing needed for this at our scale.)*
2. **NPC registration: not required yet.** Registration is mandatory only for
   systems processing sensitive personal information of 1,000+ individuals, or
   employers with 250+ employees, or processing likely to pose risks. SCHEDU
   stores no sensitive PI. **Trigger to revisit:** if we ever store student data,
   government IDs, or cross 1,000 users with anything sensitive.
3. **Breach protocol (72-hour rule).** If personal data is breached in a way
   likely to cause real harm: (a) contain (rotate keys, disable access);
   (b) notify the NPC and affected users within 72 hours of knowledge —
   email template: what happened, what data, what we did, what users should do;
   (c) log the incident. Supabase dashboard + Sentry are the detection surfaces.
4. **Security measures (already in place, cite these if ever asked):** RLS on all
   27 prod tables, TLS everywhere, encryption at rest (Supabase), least-privilege
   service keys, security-definer RPCs for quota/billing paths, gitignored secrets.
5. **Retention:** account data lives until deletion; deletion is immediate and
   cascaded via the delete-account function. Policy language already says this.

## Google Play requirements

- **Privacy policy URL:** `https://www.scheduhq.com/privacy` (live now).
- **Account deletion:** in-app deletion exists. Play also wants a **web link** for
  deletion requests — use `https://www.scheduhq.com/privacy` (the policy documents both
  the in-app flow and the email route). If review pushes back, add a tiny
  `/delete-account` page with the same instructions.
- **Data safety form answers** (fill exactly this):
  - Collects: Name, Email address, User IDs, Other in-app content (lesson plans).
  - Purpose: App functionality, Account management.
  - Shared with third parties: No (processors acting on our behalf only).
  - Encrypted in transit: Yes. Deletion mechanism: Yes.
  - No ads, no location, no financial data collected by the app itself.
- **In-app purchases:** none during early access; when billing launches inside the
  app it must use Play Billing (web checkout stays on scheduhq.com and is never
  linked from inside the app).

## Early access notes

- While `app_settings.early_access = true`, no payments are collected, so no
  BIR/receipt obligations exist yet. The paywall flip (single row update) is the
  moment tax/registration obligations become live — do DTI + BIR during the
  advance-notice window before flipping (see plan in chat: DTI national ₱2,030,
  BIR Form 1901 sole prop under trade name, 8% option, ₱30 DST).
- Marketing copy rule: always "free during early access," never just "free."

## Remaining launch checklist (non-legal, found during audit)

1. **Custom SMTP for auth emails (blocker at any volume).** Prod uses Supabase's
   built-in sender: a few emails/hour, spam-prone. Create a Resend (or Brevo)
   account, verify the scheduhq.com domain, and set SMTP in Supabase Auth settings.
   Until then, signup confirmations will throttle.
2. **Domains.** The website is LIVE at https://www.scheduhq.com (apex redirects
   to www; DNS was already on Vercel via Squarespace). `schedu.ph` — printed on
   every video end card — is **unregistered and available**: buying it
   (~₱2,000–3,000/yr at dot.ph) and redirecting to scheduhq.com keeps all
   marketing assets accurate. Decide before the videos go out, or re-render the
   end cards/captions to say scheduhq.com.
3. **Supabase free-plan pause risk.** Free projects pause after ~1 week idle and
   the org is capped at 2 active projects (dev is paused so prod can run). A
   daily keep-alive ping runs via GitHub Actions (.github/workflows/keepalive.yml).
   NOTE: on July 29 the platform paused ALL org projects at once (not idle-based) —
   check the Supabase account email for the pause notice; if it recurs, the org
   likely tripped a free-tier usage limit and Pro becomes non-optional.
4. Auth `site_url` and redirect allow-list fixed to `https://www.scheduhq.com` +
   `schedu://**` (was localhost). Done during this audit.
