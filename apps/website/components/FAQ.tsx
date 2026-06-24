import { SectionHeading } from './Section'
import { Reveal } from './Reveal'
import { FAQItem } from './FAQItem'
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
            <FAQItem key={item.q} q={item.q} a={item.a} />
          ))}
        </Reveal>
      </div>
    </section>
  )
}
