import type { Metadata } from 'next'
import { LegalPage } from '@/components/LegalPage'

export const metadata: Metadata = {
  title: 'Privacy Policy',
  description: 'How SchEDU collects, uses, and protects your information.',
}

export default function PrivacyPage() {
  return (
    <LegalPage title="Privacy Policy" updated="June 24, 2026">
      <p>
        This is a starter summary of how SchEDU handles your information. A full policy will be
        published before our public launch. By using this site or joining our early-access list,
        you agree to the practices described here.
      </p>

      <h2>What we collect</h2>
      <ul>
        <li>
          <strong>Early-access signups:</strong> the email address you submit so we can notify you
          when SchEDU launches.
        </li>
        <li>
          <strong>Account data (at launch):</strong> the name, email, and school details you provide
          when you create a SchEDU account.
        </li>
        <li>
          <strong>Usage data:</strong> basic, anonymous analytics about how the site and app are
          used, to help us improve them.
        </li>
      </ul>

      <h2>How we use it</h2>
      <ul>
        <li>To tell you when SchEDU is available and to share important product updates.</li>
        <li>To provide, maintain, and improve the SchEDU app and website.</li>
        <li>To process subscriptions through our payment partners at launch.</li>
      </ul>

      <h2>Who we share it with</h2>
      <p>
        We do not sell your personal information. We share it only with service providers that help
        us run SchEDU, such as our hosting provider and our payment processors (PayMongo for the
        Philippines and Stripe internationally) once paid plans go live.
      </p>

      <h2>Your choices</h2>
      <p>
        You can ask us to access, correct, or delete your information at any time by emailing us. You
        can unsubscribe from launch emails using the link in any message we send.
      </p>

      <h2>Contact</h2>
      <p>
        Questions about your privacy? Email <a href="mailto:hello@scheduhq.com">hello@scheduhq.com</a>.
      </p>
    </LegalPage>
  )
}
