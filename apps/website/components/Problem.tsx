import { AlertCircle } from 'lucide-react'
import { Eyebrow } from './Section'
import { Reveal } from './Reveal'
import { PROBLEM } from '@/lib/content'

export function Problem() {
  return (
    <section className="border-y border-line bg-surface">
      <div className="container-page grid gap-10 py-16 sm:py-20 lg:grid-cols-[0.9fr_1.1fr] lg:gap-16">
        <Reveal>
          <Eyebrow>{PROBLEM.eyebrow}</Eyebrow>
          <h2 className="mt-3 text-balance text-3xl font-bold tracking-tight text-ink sm:text-4xl">
            {PROBLEM.title}
          </h2>
          <p className="mt-4 text-pretty text-lg leading-relaxed text-muted">{PROBLEM.body}</p>
          <p className="mt-6 rounded-xl border-l-4 border-brand-500 bg-brand-50/70 px-4 py-3 text-[0.95rem] font-medium leading-relaxed text-ink-soft">
            {PROBLEM.outcome}
          </p>
        </Reveal>

        <div className="grid gap-3 self-center">
          {PROBLEM.points.map((p, i) => (
            <Reveal key={p} delay={i * 80}>
              <div className="flex items-start gap-3 rounded-xl border border-line bg-white px-4 py-3.5 text-[0.95rem] leading-relaxed text-ink-soft shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:border-amber-200 hover:shadow-md">
                <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-amber-500" />
                {p}
              </div>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  )
}
