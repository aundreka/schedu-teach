import type { Metadata } from 'next'
import { LegalPage } from '@/components/LegalPage'

// Keep this text in sync with the in-app copy at apps/teach/constants/legal.ts,
// and bump the `updated` date on every edit.

export const metadata: Metadata = {
  title: 'Privacy Policy',
  description: 'How SchEDU collects, uses, and protects your information.',
}

export default function PrivacyPage() {
  return (
    <LegalPage title="Privacy Policy" updated="July 3, 2026">
      <p>
        SchEDU (&ldquo;SchEDU&rdquo;, &ldquo;we&rdquo;, &ldquo;us&rdquo;) is a lesson-planning and
        scheduling companion for teachers. This Privacy Policy explains what information we collect
        through the SchEDU app and our websites (scheduhq.com and teach.scheduhq.com), how we use
        it, and the choices you have.
      </p>
      <p>
        We handle personal information in line with the Philippine Data Privacy Act of 2012
        (Republic Act No. 10173) and its implementing rules. By using SchEDU, you agree to the
        practices described in this policy.
      </p>

      <h2>Information we collect</h2>
      <ul>
        <li>
          <strong>Account information</strong> — your name, email address, username, and password
          credentials when you create an account (passwords are stored only in hashed form by our
          authentication provider, never in plain text).
        </li>
        <li>
          <strong>Profile and school details</strong> — optional information you add, such as your
          institution and role.
        </li>
        <li>
          <strong>Content you create</strong> — subjects, lessons, lesson plans, schedules,
          sections, activities, exams, and any files or templates you upload.
        </li>
        <li>
          <strong>Subscription and billing records</strong> — your plan, subscription status, and
          billing history. Card and e-wallet details are collected and processed directly by our
          payment providers (PayMongo in the Philippines, Stripe internationally); we never see or
          store your full payment credentials.
        </li>
        <li>
          <strong>Usage and device data</strong> — basic information about how the app is used,
          your device type and operating system, and crash and error reports that help us fix
          problems.
        </li>
        <li>
          <strong>Early-access signups</strong> — the email address you submit on our website to be
          notified about SchEDU.
        </li>
      </ul>

      <h2>How we use your information</h2>
      <ul>
        <li>
          To provide SchEDU: build your term schedules, track your lessons and sections, and sync
          your content across sessions.
        </li>
        <li>
          To generate materials you request: when you use automated activity or exam creation, the
          relevant lesson content is processed to draft those materials for you.
        </li>
        <li>To manage subscriptions, process payments, and send billing notices.</li>
        <li>
          To respond to support requests and send important service messages (such as changes to
          these policies).
        </li>
        <li>
          To understand how SchEDU is used, improve it, and keep it secure — including detecting
          abuse and fraud.
        </li>
      </ul>
      <p>
        We do not use your lesson content for advertising, and we do not sell your personal
        information to anyone.
      </p>

      <h2>AI-assisted features</h2>
      <p>
        SchEDU&rsquo;s automated lesson-to-activity and exam generation may send the lesson content
        you select to trusted AI service providers, solely to produce the materials you requested.
        The output is returned to you and stored in your library like any other content you create.
        Always review generated materials before using them in class.
      </p>

      <h2>Who we share information with</h2>
      <p>
        We share personal information only with service providers that help us run SchEDU — such as
        our hosting and database provider, payment processors (PayMongo and Stripe),
        error-monitoring service, and AI service providers — and only to the extent needed for them
        to perform their services for us.
      </p>
      <p>
        We may also disclose information if required by law or a lawful government request, to
        protect the rights and safety of our users, or as part of a merger, acquisition, or sale of
        assets (in which case this policy will continue to apply to your information).
      </p>

      <h2>Data retention and deletion</h2>
      <p>
        We keep your information for as long as your account is active. You can delete your account
        at any time from Settings → Delete Account in the app, which permanently removes your
        account and the content associated with it. You can also email us to request deletion.
        Residual copies may persist in encrypted backups for a limited period before being purged,
        and we may retain records we are legally required to keep (such as billing records).
      </p>

      <h2>Security</h2>
      <p>
        Your data is encrypted in transit, access to it is restricted by per-user access controls
        at the database level, and payment credentials are handled entirely by our payment
        providers. No system is perfectly secure, but we work to protect your information and will
        notify you and the National Privacy Commission of any breach as required by law.
      </p>

      <h2>Your rights</h2>
      <p>
        Under the Data Privacy Act, you have the right to be informed about, access, correct, and
        object to the processing of your personal data, to have it erased or blocked, to data
        portability, and to be indemnified for damages. You may also lodge a complaint with the
        National Privacy Commission (<a href="https://privacy.gov.ph">privacy.gov.ph</a>).
      </p>
      <p>
        To exercise any of these rights, email us at{' '}
        <a href="mailto:hello@scheduhq.com">hello@scheduhq.com</a>. You can unsubscribe from launch
        and marketing emails using the link in any message we send.
      </p>

      <h2>Children</h2>
      <p>
        SchEDU is built for teachers and other education professionals. It is not directed at
        children, and we do not knowingly collect personal information from anyone under 18. SchEDU
        accounts do not require you to enter your students&rsquo; personal information, and we ask
        that you do not include it in your content.
      </p>

      <h2>International transfers</h2>
      <p>
        Our service providers may store and process data on servers located outside the
        Philippines. Wherever your data is processed, it remains protected under this policy and
        applicable law.
      </p>

      <h2>Changes to this policy</h2>
      <p>
        We may update this policy as SchEDU evolves. If we make material changes, we will notify
        you in the app or by email before they take effect. The &ldquo;Last updated&rdquo; date
        above always reflects the current version.
      </p>

      <h2>Contact us</h2>
      <p>
        Questions about your privacy or this policy? Email{' '}
        <a href="mailto:hello@scheduhq.com">hello@scheduhq.com</a>.
      </p>
    </LegalPage>
  )
}
