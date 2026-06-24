import { Plus } from 'lucide-react'
import { SectionHeading } from './Section'
import { Reveal } from './Reveal'
import { FAQS } from '@/lib/content'

export function FAQ() {
  return (
    <section id="faq" className="border-t border-line bg-surface scroll-mt-20">
      <div className="container-page py-20 sm:py-24">
        <Reveal>
          <SectionHeading eyebrow="FAQ" title="Questions teachers ask" />
        </Reveal>

        <Reveal delay={100} className="mx-auto mt-10 max-w-3xl divide-y divide-line overflow-hidden rounded-2xl border border-line bg-white">
          {FAQS.map((item) => (
            <details key={item.q} className="group px-5 [&_summary::-webkit-details-marker]:hidden">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-4 py-5 text-[1.02rem] font-semibold text-ink">
                {item.q}
                <Plus className="h-5 w-5 shrink-0 text-brand-600 transition-transform duration-200 group-open:rotate-45" />
              </summary>
              <p className="pb-5 -mt-1 text-[0.95rem] leading-relaxed text-muted">{item.a}</p>
            </details>
          ))}
        </Reveal>
      </div>
    </section>
  )
}
