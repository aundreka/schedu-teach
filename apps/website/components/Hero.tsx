import Link from 'next/link'
import { Sparkles, PlayCircle, ShieldCheck } from 'lucide-react'
import { PhoneFrame, CardShot } from './PhoneFrame'
import { Waitlist } from './Waitlist'
import { HERO } from '@/lib/content'

export function Hero() {
  return (
    <section id="top" className="relative overflow-hidden">
      <div className="pointer-events-none absolute inset-0 -z-10 bg-dotted opacity-60 [mask-image:radial-gradient(ellipse_at_top,black,transparent_70%)]" />
      <div className="pointer-events-none absolute -top-24 left-1/2 -z-10 h-[400px] w-[700px] -translate-x-1/2 rounded-full bg-brand-100/50 blur-3xl" />

      <div className="container-page grid items-center gap-12 py-16 sm:py-20 lg:grid-cols-[1.05fr_0.95fr] lg:py-24">
        <div className="animate-rise">
          <span className="inline-flex items-center gap-2 rounded-full border border-brand-200 bg-brand-50 px-3.5 py-1.5 text-xs font-semibold text-brand-700">
            <Sparkles className="h-3.5 w-3.5" />
            {HERO.badge}
          </span>

          <h1 className="mt-5 text-balance text-4xl font-bold leading-[1.08] tracking-tight text-ink sm:text-5xl lg:text-[3.4rem]">
            {HERO.title}
          </h1>

          <p className="mt-5 max-w-xl text-pretty text-lg leading-relaxed text-muted">
            {HERO.subtitle}
          </p>

          <div className="mt-7">
            <Waitlist cta={HERO.primaryCta} />
          </div>

          <div className="mt-5 flex flex-wrap items-center gap-x-6 gap-y-3 text-sm text-muted">
            <Link
              href="#how-it-works"
              className="inline-flex items-center gap-1.5 font-medium text-ink-soft transition-colors hover:text-ink"
            >
              <PlayCircle className="h-5 w-5 text-brand-600" />
              {HERO.secondaryCta}
            </Link>
            <span className="inline-flex items-center gap-1.5">
              <ShieldCheck className="h-4 w-4 text-brand-600" />
              {HERO.trust}
            </span>
          </div>
        </div>

        {/* Real app screens: planned term + floating "up next" card */}
        <div className="relative animate-rise [animation-delay:120ms]">
          <div className="relative mx-auto w-full max-w-[300px] animate-float">
            <PhoneFrame
              src="/screenshots/calendar.png"
              alt="SchEDU app showing a complete term auto-planned across the month"
              priority
            />
          </div>
          <div className="animate-float-delayed absolute -bottom-6 -left-2 w-[225px] rotate-[-4deg] sm:-left-6 lg:-left-10">
            <CardShot
              src="/screenshots/home_card.png"
              alt="The next class, section, time, and lesson at a glance"
              width={824}
              height={640}
            />
          </div>
        </div>
      </div>
    </section>
  )
}
