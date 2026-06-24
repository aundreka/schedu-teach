import { SectionHeading } from './Section'
import { Reveal } from './Reveal'
import { AUDIENCE } from '@/lib/content'

export function Audience() {
  return (
    <section className="border-t border-line bg-surface">
      <div className="container-page py-20 sm:py-24">
        <Reveal>
          <SectionHeading
            eyebrow="Who it’s for"
            title="Made for real teaching loads"
            subtitle="From a single section to a department, SchEDU fits the way you already work."
          />
        </Reveal>

        <div className="mt-12 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {AUDIENCE.map((a, i) => (
            <Reveal key={a.who} delay={i * 70} className="h-full">
              <div className="h-full rounded-2xl border border-line bg-white p-6 shadow-sm transition-all duration-200 hover:-translate-y-1 hover:border-brand-200 hover:shadow-md">
                <h3 className="text-base font-bold text-ink">{a.who}</h3>
                <p className="mt-2 text-[0.95rem] leading-relaxed text-muted">{a.gets}</p>
              </div>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  )
}
