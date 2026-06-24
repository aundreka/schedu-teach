/**
 * Plans & pricing — single source of truth for the pricing section.
 *
 * Peso prices come straight from the Product Guide (PRO ₱99, MAX ₱199).
 * USD prices are PLACEHOLDERS — replace `pro`/`max` under `USD` with the
 * final international numbers Aundreka provides.
 */

export type CurrencyCode = 'PHP' | 'USD'

export interface Currency {
  code: CurrencyCode
  symbol: string
  label: string
  /** Monthly price of each paid tier, in the currency's major unit. */
  pro: number
  max: number
  /** Payment rail shown under the cards. */
  rail: string
}

export const CURRENCIES: Record<CurrencyCode, Currency> = {
  PHP: {
    code: 'PHP',
    symbol: '₱',
    label: 'PHP',
    pro: 99,
    max: 199,
    rail: 'Paid securely via PayMongo',
  },
  USD: {
    code: 'USD',
    symbol: '$',
    label: 'USD',
    // From launch docs (PRO ~$5, MAX ~$10). Confirm final international prices.
    pro: 4.99,
    max: 9.99,
    rail: 'Billed internationally by card',
  },
}

export const DEFAULT_CURRENCY: CurrencyCode = 'PHP'

export type PlanId = 'free' | 'pro' | 'max'

export interface Plan {
  id: PlanId
  name: string
  tagline: string
  /** Highlighted as the recommended plan. */
  featured?: boolean
  /** Pulls the price from the active currency; free is always 0. */
  priceKey: 'free' | 'pro' | 'max'
  cta: string
  features: string[]
}

export const PLANS: Plan[] = [
  {
    id: 'free',
    name: 'Free',
    tagline: 'Best for trying SchEDU',
    priceKey: 'free',
    cta: 'Start free',
    features: [
      '2 lesson plans (lifetime)',
      '2 subjects',
      '1 automated activity/exam per day',
      'Full term auto-planning',
    ],
  },
  {
    id: 'pro',
    name: 'Pro',
    tagline: 'A teacher’s full load',
    featured: true,
    priceKey: 'pro',
    cta: 'Choose Pro',
    features: [
      '10 lesson plans',
      '5 subjects',
      '10 automated activities/exams per day',
      'Everything in Free',
    ],
  },
  {
    id: 'max',
    name: 'Max',
    tagline: 'Heavy multi-section loads',
    priceKey: 'max',
    cta: 'Choose Max',
    features: [
      '20 lesson plans',
      '20 subjects',
      '20 automated activities/exams per day',
      'Everything in Pro',
    ],
  },
]

/** Format a price for a given plan + currency. */
export function priceFor(plan: Plan, currency: Currency): string {
  if (plan.priceKey === 'free') return `${currency.symbol}0`
  const amount = currency[plan.priceKey]
  // Show decimals only when the currency uses them (USD), never for whole pesos.
  const formatted = Number.isInteger(amount) ? amount.toString() : amount.toFixed(2)
  return `${currency.symbol}${formatted}`
}
