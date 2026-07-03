import type { Metadata } from 'next'
import { LegalPage } from '@/components/LegalPage'

// Keep this text in sync with the in-app copy at apps/teach/constants/legal.ts,
// and bump the `updated` date on every edit.

export const metadata: Metadata = {
  title: 'Terms of Service',
  description: 'The terms for using SchEDU.',
}

export default function TermsPage() {
  return (
    <LegalPage title="Terms of Service" updated="July 3, 2026">
      <p>
        These Terms of Service (&ldquo;Terms&rdquo;) govern your use of the SchEDU app and websites
        (scheduhq.com and teach.scheduhq.com), operated by SchEDU (&ldquo;we&rdquo;,
        &ldquo;us&rdquo;). By creating an account or using SchEDU, you agree to these Terms and to
        our <a href="/privacy">Privacy Policy</a>. If you do not agree, please do not use SchEDU.
      </p>
      <p>You must be at least 18 years old (or the age of majority where you live) to use SchEDU.</p>

      <h2>The service</h2>
      <p>
        SchEDU is a planning companion for teachers: it builds term schedules from your subjects
        and class times, tracks lessons across sections, and helps turn lessons into classroom
        activities and exams. Features may change as we improve the product; we will not materially
        reduce what a paid plan includes during a period you have already paid for.
      </p>

      <h2>Your account</h2>
      <p>
        You are responsible for keeping your login credentials secure and for all activity under
        your account. Provide accurate information when you sign up and keep it up to date. Notify
        us promptly at <a href="mailto:hello@scheduhq.com">hello@scheduhq.com</a> if you believe
        your account has been compromised.
      </p>

      <h2>Plans, billing, and cancellation</h2>
      <ul>
        <li>
          SchEDU offers a Free plan and paid PRO and MAX subscriptions, each with usage limits
          (lesson plans, subjects, and daily automated activity/exam generations) described at
          purchase.
        </li>
        <li>
          Paid plans are billed monthly in advance through PayMongo (Philippines) or by card
          internationally, and renew automatically each month until cancelled.
        </li>
        <li>
          You can cancel anytime; your paid features remain active until the end of the current
          billing period, after which your account moves to the Free plan. Amounts already paid for
          a started billing period are not refunded except where the law requires.
        </li>
        <li>
          We may change prices or plan limits with at least 30 days&rsquo; notice; changes take
          effect at your next renewal.
        </li>
      </ul>

      <h2>Your content</h2>
      <p>
        You own the subjects, lessons, plans, activities, and other content you create or upload in
        SchEDU. You grant us a limited license to host, process, back up, and display that content
        solely to operate and improve the service — including generating the schedules and
        materials you request.
      </p>
      <p>
        You are responsible for your content. Do not upload material you do not have the right to
        use, and do not include students&rsquo; personal information in your content.
      </p>

      <h2>AI-generated materials</h2>
      <p>
        Automatically generated schedules, activities, and exams are drafts. They can contain
        mistakes, and they are not guaranteed to satisfy your school&rsquo;s or the Department of
        Education&rsquo;s requirements. Review and edit generated materials before using them with
        students — you are responsible for what you ultimately teach and hand out.
      </p>

      <h2>Acceptable use</h2>
      <ul>
        <li>Use SchEDU only for lawful purposes.</li>
        <li>
          Do not attempt to breach, probe, or disrupt the service, access other users&rsquo; data,
          or circumvent plan limits (for example by sharing accounts or automating requests).
        </li>
        <li>
          Do not resell, scrape, or copy the service, or reverse-engineer it except where the law
          permits.
        </li>
      </ul>

      <h2>Our intellectual property</h2>
      <p>
        The SchEDU app, websites, branding, and everything in them (other than your content) belong
        to us or our licensors. These Terms do not give you any right to use our trademarks or a
        license to anything beyond using the service as intended.
      </p>

      <h2>Termination</h2>
      <p>
        You may stop using SchEDU or delete your account at any time from Settings. We may suspend
        or terminate accounts that violate these Terms, that we are required to close by law, or
        after extended inactivity on the Free plan — with notice where practicable. Sections that
        by their nature should survive (such as ownership, disclaimers, and limitation of
        liability) survive termination.
      </p>

      <h2>Disclaimers</h2>
      <p>
        SchEDU is provided &ldquo;as is&rdquo; and &ldquo;as available&rdquo;. We work hard to keep
        it reliable, but we do not guarantee that it will be uninterrupted, error-free, or that
        generated content will be accurate or fit for a particular purpose. SchEDU is a planning
        aid — it is not an official school record, grading system, or system of record for your
        institution.
      </p>

      <h2>Limitation of liability</h2>
      <p>
        To the maximum extent permitted by law, we are not liable for indirect, incidental,
        special, or consequential damages, or for loss of data, profits, or goodwill, arising from
        your use of SchEDU. Our total liability for any claim is limited to the amount you paid us
        in the 12 months before the claim arose (or ₱1,000 if you have paid nothing). Nothing in
        these Terms limits liability that cannot be limited under applicable law.
      </p>

      <h2>Governing law</h2>
      <p>
        These Terms are governed by the laws of the Republic of the Philippines. Disputes will be
        brought in the competent courts of the Philippines, without prejudice to any mandatory
        consumer rights you have where you live.
      </p>

      <h2>Changes to these Terms</h2>
      <p>
        We may update these Terms as SchEDU evolves. If we make material changes, we will notify
        you in the app or by email before they take effect. Continuing to use SchEDU after changes
        take effect means you accept the updated Terms.
      </p>

      <h2>Contact us</h2>
      <p>
        Questions about these Terms? Email{' '}
        <a href="mailto:hello@scheduhq.com">hello@scheduhq.com</a>.
      </p>
    </LegalPage>
  )
}
