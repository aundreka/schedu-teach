import {
  CalendarRange,
  CalendarCog,
  PartyPopper,
  FileDown,
  ScanText,
  LayoutTemplate,
  Search,
  Users,
  GraduationCap,
  History,
  Palette,
  Moon,
  Sparkles,
  type LucideIcon,
} from 'lucide-react'
import { SectionHeading } from './Section'
import { Reveal } from './Reveal'
import { MORE_FEATURES } from '@/lib/content'

const ICONS: Record<string, LucideIcon> = {
  CalendarRange,
  CalendarCog,
  PartyPopper,
  FileDown,
  ScanText,
  LayoutTemplate,
  Search,
  Users,
  GraduationCap,
  History,
  Palette,
  Moon,
}

export function MoreFeatures() {
  return (
    <section className="border-t border-line bg-white">
      <div className="container-page py-20 sm:py-24">
        <Reveal>
          <SectionHeading
            eyebrow="And there’s more"
            title="Everything around the plan, too"
            subtitle="SchEDU handles the whole teaching workflow — not just the schedule."
          />
        </Reveal>

        <div className="mt-12 grid gap-x-6 gap-y-8 sm:grid-cols-2 lg:grid-cols-3">
          {MORE_FEATURES.map((f, i) => {
            const Icon = ICONS[f.icon] ?? Sparkles
            return (
              <Reveal key={f.title} delay={(i % 3) * 80} className="h-full">
                <div className="group flex h-full gap-4">
                  <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-brand-50 text-brand-600 ring-1 ring-brand-100 transition-colors duration-200 group-hover:bg-brand-600 group-hover:text-white">
                    <Icon className="h-5 w-5" />
                  </span>
                  <div>
                    <h3 className="text-[1.05rem] font-bold tracking-tight text-ink">{f.title}</h3>
                    <p className="mt-1.5 text-[0.92rem] leading-relaxed text-muted">{f.body}</p>
                  </div>
                </div>
              </Reveal>
            )
          })}
        </div>
      </div>
    </section>
  )
}
