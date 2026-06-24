import { headers } from 'next/headers'
import { type CurrencyCode, DEFAULT_CURRENCY } from './pricing'

/**
 * Country → currency. PH-first soft launch, so anything we can't resolve to
 * the Philippines falls back to USD (the "international by card" tier).
 */
export function currencyForCountry(country: string | null | undefined): CurrencyCode {
  if (!country) return DEFAULT_CURRENCY
  return country.toUpperCase() === 'PH' ? 'PHP' : 'USD'
}

/**
 * Resolve the visitor's currency on the server from edge geolocation headers.
 * Vercel populates `x-vercel-ip-country`; other CDNs use `cf-ipcountry`.
 * On localhost neither exists, so we get the PH default — fine for dev.
 */
export async function detectCurrency(): Promise<CurrencyCode> {
  const h = await headers()
  const country =
    h.get('x-vercel-ip-country') ?? h.get('cf-ipcountry') ?? null
  return currencyForCountry(country)
}
