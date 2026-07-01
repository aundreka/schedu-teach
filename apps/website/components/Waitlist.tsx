'use client'

import { useState } from 'react'
import { ArrowRight, CheckCircle2, Loader2 } from 'lucide-react'
import { cn } from '@/lib/cn'

type Status = 'idle' | 'loading' | 'done' | 'error'

export function Waitlist({
  className,
  variant = 'light',
  cta = 'Get early access',
}: {
  className?: string
  /** `light` for white sections, `dark` for the green CTA band. */
  variant?: 'light' | 'dark'
  cta?: string
}) {
  const [email, setEmail] = useState('')
  const [status, setStatus] = useState<Status>('idle')
  const [message, setMessage] = useState('')

  const dark = variant === 'dark'

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (status === 'loading') return
    setStatus('loading')
    setMessage('')
    try {
      const res = await fetch('/api/waitlist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setStatus('error')
        setMessage(data.error ?? 'Something went wrong.')
        return
      }
      setStatus('done')
    } catch {
      setStatus('error')
      setMessage('Network error. Please try again.')
    }
  }

  if (status === 'done') {
    return (
      <div
        className={cn(
          'flex items-center gap-2.5 rounded-full px-5 py-3 text-sm font-medium',
          dark ? 'bg-white/15 text-white' : 'bg-brand-50 text-brand-800',
          className,
        )}
      >
        <CheckCircle2 className="h-5 w-5 shrink-0" />
        You’re on the list. We’ll email you the moment SchEDU launches.
      </div>
    )
  }

  return (
    <form onSubmit={onSubmit} className={cn('w-full max-w-md', className)}>
      <div
        className={cn(
          'flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-2 sm:rounded-full sm:p-1.5 sm:shadow-sm',
          dark ? 'sm:bg-white/10 sm:ring-1 sm:ring-white/20' : 'sm:bg-white sm:ring-1 sm:ring-line',
        )}
      >
        <input
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@school.edu.ph"
          aria-label="Email address"
          className={cn(
            'h-12 w-full flex-1 rounded-full px-5 text-sm outline-none placeholder:text-muted',
            dark
              ? 'bg-white/10 text-white ring-1 ring-white/25 placeholder:text-white/60 sm:bg-transparent sm:ring-0'
              : 'bg-white text-ink ring-1 ring-line sm:ring-0',
          )}
        />
        <button
          type="submit"
          disabled={status === 'loading'}
          className={cn(
            'inline-flex h-12 shrink-0 items-center justify-center gap-2 rounded-full px-6 text-sm font-semibold transition-colors disabled:opacity-70',
            dark
              ? 'bg-white text-brand-700 hover:bg-brand-50'
              : 'bg-brand-600 text-white hover:bg-brand-700',
          )}
        >
          {status === 'loading' ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <>
              {cta}
              <ArrowRight className="h-4 w-4" />
            </>
          )}
        </button>
      </div>
      <p
        className={cn(
          'mt-2 px-1 text-xs',
          status === 'error'
            ? dark
              ? 'text-white'
              : 'text-red-600'
            : dark
              ? 'text-white/70'
              : 'text-muted',
        )}
      >
        {status === 'error' ? message : 'Free to start · No spam · Just a launch-day heads-up.'}
      </p>
    </form>
  )
}
