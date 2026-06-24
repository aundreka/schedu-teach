import { Building2 } from 'lucide-react'
import { Eyebrow } from './Section'
import { Reveal } from './Reveal'
import { DIFFERENTIATORS, SCHOOLS } from '@/lib/content'

export function Schools() {
  return (
    <section id="schools" className="container-page scroll-mt-20 py-20 sm:py-24">
      <div className="grid gap-12 lg:grid-cols-[1fr_1fr] lg:gap-16">
        <Reveal>
          <Eyebrow>{SCHOOLS.eyebrow}</Eyebrow>
          <h2 className="mt-3 flex items-start gap-3 text-balance text-3xl font-bold tracking-tight text-ink sm:text-4xl">
            <Building2 className="mt-1 hidden h-8 w-8 shrink-0 text-brand-600 sm:block" />
            {SCHOOLS.title}
          </h2>
          <p className="mt-4 text-pretty text-lg leading-relaxed text-muted">{SCHOOLS.body}</p>
        </Reveal>

        <div className="grid gap-3 self-center sm:grid-cols-2">
          {DIFFERENTIATORS.map((d, i) => (
            <Reveal key={d.title} delay={i * 60} className="h-full">
              <div className="h-full rounded-xl border border-line bg-white p-4 shadow-sm transition-all duration-200 hover:-translate-y-1 hover:border-brand-200 hover:shadow-md">
                <h3 className="text-sm font-bold text-ink">{d.title}</h3>
                <p className="mt-1 text-[0.85rem] leading-relaxed text-muted">{d.body}</p>
              </div>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  )
}
