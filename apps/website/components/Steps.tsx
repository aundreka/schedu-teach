import { SectionHeading } from './Section'
import { Reveal } from './Reveal'
import { STEPS } from '@/lib/content'

export function Steps() {
  return (
    <section id="how-it-works" className="container-page scroll-mt-20 py-20 sm:py-24">
      <Reveal>
        <SectionHeading
          eyebrow="Getting started"
          title="Up and running in minutes"
          subtitle="From download to a complete, balanced term, in five simple steps."
        />
      </Reveal>

      <div className="mx-auto mt-12 grid grid-cols-1 max-w-4xl gap-4 sm:grid-cols-2 lg:grid-cols-5">
        {STEPS.map((s, i) => (
          <Reveal key={s.title} delay={i * 80} className="h-full">
            <div className="group flex h-full flex-col rounded-2xl border border-line bg-white p-5 shadow-sm transition-all duration-200 hover:-translate-y-1 hover:border-brand-200 hover:shadow-md">
              <span className="grid h-9 w-9 place-items-center rounded-full bg-brand-600 text-sm font-bold text-white transition-transform duration-200 group-hover:scale-110">
                {i + 1}
              </span>
              <h3 className="mt-4 text-[0.95rem] font-bold leading-snug text-ink">{s.title}</h3>
              <p className="mt-1.5 text-sm leading-relaxed text-muted">{s.body}</p>
            </div>
          </Reveal>
        ))}
      </div>
    </section>
  )
}
