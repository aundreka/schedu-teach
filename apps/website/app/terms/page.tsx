import type { Metadata } from 'next'
import { LegalPage } from '@/components/LegalPage'

export const metadata: Metadata = {
  title: 'Terms of Service',
  description: 'The terms for using SchEDU.',
}

export default function TermsPage() {
  return (
    <LegalPage title="Terms of Service" updated="June 24, 2026">
      <p>
        This is a starter summary of the terms for using SchEDU. Full terms will be published before
        our public launch. By using this site or joining our early-access list, you agree to these
        terms.
      </p>

      <h2>The service</h2>
      <p>
        SchEDU is a mobile lesson-planning companion for teachers. It is currently in pre-launch; the
        app soft-launches on Android for the 2026-2027 school year. Features described on this site
        may change before release.
      </p>

      <h2>Accounts</h2>
      <p>
        When accounts become available, you are responsible for keeping your login details secure and
        for the activity that happens under your account. You must provide accurate information when
        you sign up.
      </p>

      <h2>Plans and billing</h2>
      <p>
        SchEDU offers a free tier and paid Pro and Max plans. Paid plans are billed monthly and can be
        cancelled anytime. At launch, payments are processed by PayMongo in the Philippines and Stripe
        internationally. Prices shown on this site are subject to change before launch.
      </p>

      <h2>Acceptable use</h2>
      <p>
        Use SchEDU only for lawful purposes. Do not attempt to disrupt the service, access it without
        authorization, or misuse content created with it.
      </p>

      <h2>Disclaimer</h2>
      <p>
        SchEDU is provided on an &ldquo;as is&rdquo; basis during pre-launch. We work hard to keep it
        reliable, but we make no guarantees about availability while the product is in development.
      </p>

      <h2>Contact</h2>
      <p>
        Questions about these terms? Email <a href="mailto:hello@scheduhq.com">hello@scheduhq.com</a>.
      </p>
    </LegalPage>
  )
}
