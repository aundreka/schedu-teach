import { Waitlist } from './Waitlist'
import { Reveal } from './Reveal'
import { FINAL_CTA, SITE } from '@/lib/content'

export function FinalCTA() {
  return (
    <section id="early-access" className="container-page scroll-mt-20 py-20 sm:py-24">
      <Reveal className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-brand-600 to-brand-700 px-6 py-14 text-center shadow-xl shadow-brand-600/20 sm:px-12 sm:py-16">
        <div className="pointer-events-none absolute -right-16 -top-16 h-56 w-56 rounded-full bg-white/10 blur-2xl" />
        <div className="pointer-events-none absolute -bottom-20 -left-10 h-56 w-56 rounded-full bg-brand-400/30 blur-2xl" />

        <p className="text-sm font-semibold uppercase tracking-wider text-brand-100">
          {SITE.launchLabel}
        </p>
        <h2 className="mx-auto mt-3 max-w-2xl text-balance text-3xl font-bold tracking-tight text-white sm:text-4xl">
          {FINAL_CTA.title}
        </h2>
        <p className="mx-auto mt-3 max-w-xl text-pretty text-lg text-brand-50">
          {FINAL_CTA.subtitle}
        </p>

        <div className="mt-8 flex justify-center">
          <Waitlist variant="dark" cta={FINAL_CTA.cta} />
        </div>
      </Reveal>
    </section>
  )
}
