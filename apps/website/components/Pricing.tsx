'use client'

import { useEffect, useState } from 'react'
import { Check, Globe } from 'lucide-react'
import { ButtonLink } from './Button'
import { SectionHeading } from './Section'
import { Reveal } from './Reveal'
import {
  CURRENCIES,
  PLANS,
  priceFor,
  type CurrencyCode,
} from '@/lib/pricing'
import { SITE } from '@/lib/content'
import { cn } from '@/lib/cn'

const STORAGE_KEY = 'schedu.currency'
const CURRENCY_LIST: CurrencyCode[] = ['PHP', 'USD']

export function Pricing({ initialCurrency }: { initialCurrency: CurrencyCode }) {
  const [currency, setCurrency] = useState<CurrencyCode>(initialCurrency)

  // Honor a previous manual override on return visits.
  useEffect(() => {
    const saved = window.localStorage.getItem(STORAGE_KEY)
    if (saved === 'PHP' || saved === 'USD') setCurrency(saved)
  }, [])

  function choose(code: CurrencyCode) {
    setCurrency(code)
    window.localStorage.setItem(STORAGE_KEY, code)
  }

  const active = CURRENCIES[currency]

  return (
    <section id="pricing" className="border-t border-line bg-surface scroll-mt-20">
      <div className="container-page py-20 sm:py-24">
        <Reveal>
          <SectionHeading
            eyebrow="Plans & pricing"
            title="Free to start, affordable to grow"
            subtitle="Billed monthly · cancel anytime. Pick the plan that fits your teaching load."
          />
        </Reveal>

        {/* currency switcher */}
        <div className="mt-8 flex items-center justify-center">
          <div className="inline-flex items-center gap-1 rounded-full border border-line bg-white p-1 shadow-sm">
            <span className="px-2 text-muted">
              <Globe className="h-4 w-4" />
            </span>
            {CURRENCY_LIST.map((code) => (
              <button
                key={code}
                onClick={() => choose(code)}
                className={cn(
                  'rounded-full px-3.5 py-1.5 text-sm font-semibold transition-colors',
                  currency === code
                    ? 'bg-brand-600 text-white'
                    : 'text-ink-soft hover:bg-surface',
                )}
                aria-pressed={currency === code}
              >
                {CURRENCIES[code].symbol} {CURRENCIES[code].label}
              </button>
            ))}
          </div>
        </div>

        <div className="mx-auto mt-10 grid max-w-5xl gap-6 lg:grid-cols-3">
          {PLANS.map((plan, i) => {
            const featured = plan.featured
            const isFree = plan.priceKey === 'free'
            return (
              <Reveal key={plan.id} delay={i * 90} className="h-full">
              <div
                className={cn(
                  'relative flex h-full flex-col rounded-3xl border bg-white p-7 shadow-sm transition-all duration-200 hover:-translate-y-1.5 hover:shadow-xl',
                  featured
                    ? 'border-brand-300 shadow-lg shadow-brand-600/10 ring-1 ring-brand-300 lg:-mt-3 lg:mb-3'
                    : 'border-line',
                )}
              >
                {featured ? (
                  <span className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-brand-600 px-3 py-1 text-xs font-semibold text-white shadow-sm">
                    Most popular
                  </span>
                ) : null}

                <h3 className="text-lg font-bold text-ink">{plan.name}</h3>
                <p className="mt-1 text-sm text-muted">{plan.tagline}</p>

                <div className="mt-5 flex items-baseline gap-1">
                  <span className="text-4xl font-bold tracking-tight text-ink">
                    {priceFor(plan, active)}
                  </span>
                  {!isFree ? (
                    <span className="text-sm font-medium text-muted">/month</span>
                  ) : (
                    <span className="text-sm font-medium text-muted">forever</span>
                  )}
                </div>

                <ButtonLink
                  href={isFree ? '#top' : SITE.appUrl}
                  variant={featured ? 'primary' : 'secondary'}
                  size="lg"
                  className="mt-6 w-full"
                >
                  {plan.cta}
                </ButtonLink>

                <ul className="mt-6 space-y-3 border-t border-line pt-6">
                  {plan.features.map((f) => (
                    <li key={f} className="flex items-start gap-2.5 text-sm text-ink-soft">
                      <Check className="mt-0.5 h-4 w-4 shrink-0 text-brand-600" strokeWidth={3} />
                      {f}
                    </li>
                  ))}
                </ul>
              </div>
              </Reveal>
            )
          })}
        </div>

        <p className="mt-8 text-center text-sm text-muted">
          {active.rail}. Manage and upgrade your plan anytime on{' '}
          <a href={SITE.appUrl} className="font-medium text-brand-700 underline-offset-2 hover:underline">
            the web
          </a>
          .
        </p>
      </div>
    </section>
  )
}
