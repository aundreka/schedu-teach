import {
  Bell,
  Library,
  Sparkles,
  LayoutList,
  CalendarClock,
  PlusCircle,
  type LucideIcon,
} from 'lucide-react'
import { SectionHeading } from './Section'
import { Reveal } from './Reveal'
import { PhoneFrame, CardShot } from './PhoneFrame'
import { FEATURES } from '@/lib/content'
import { cn } from '@/lib/cn'

type Shot =
  | { kind: 'phone'; src: string }
  | { kind: 'card'; src: string; width: number; height: number }

/** Each feature (in guide order) paired with its real app screen. */
const ICONS: LucideIcon[] = [Bell, Library, Sparkles, LayoutList, CalendarClock, PlusCircle]
const SHOTS: Shot[] = [
  { kind: 'phone', src: '/screenshots/calendar_daily.png' },
  { kind: 'phone', src: '/screenshots/library.png' },
  { kind: 'phone', src: '/screenshots/activities.png' },
  { kind: 'phone', src: '/screenshots/plans.png' },
  { kind: 'phone', src: '/screenshots/onboarding.png' },
  { kind: 'card', src: '/screenshots/create_sheet.png', width: 824, height: 420 },
]

export function Features() {
  return (
    <section className="border-t border-line bg-surface">
      <div className="container-page py-20 sm:py-24">
        <Reveal>
          <SectionHeading
            eyebrow="What SchEDU does"
            title="Everything a real teaching load needs, in one app"
            subtitle="Each feature, shown the way it actually looks in the app."
          />
        </Reveal>

        <div className="mt-16 flex flex-col gap-20 sm:gap-28">
          {FEATURES.map((f, i) => {
            const Icon = ICONS[i] ?? Sparkles
            const shot = SHOTS[i]
            const reversed = i % 2 === 1
            return (
              <div key={f.title} className="grid items-center gap-10 lg:grid-cols-2 lg:gap-16">
                <Reveal className={cn(reversed && 'lg:order-2')}>
                  <span className="grid h-12 w-12 place-items-center rounded-xl bg-brand-50 text-brand-600 ring-1 ring-brand-100">
                    <Icon className="h-6 w-6" />
                  </span>
                  <h3 className="mt-5 text-2xl font-bold tracking-tight text-ink sm:text-[1.7rem]">
                    {f.title}
                  </h3>
                  <p className="mt-3 text-lg leading-relaxed text-muted">{f.body}</p>
                  <p className="mt-5 border-l-[3px] border-brand-500 pl-4 text-[0.95rem] font-medium leading-relaxed text-ink-soft">
                    {f.benefit}
                  </p>
                </Reveal>

                <Reveal delay={120} className={cn(reversed && 'lg:order-1')}>
                  <Visual shot={shot} alt={f.title} />
                </Reveal>
              </div>
            )
          })}
        </div>
      </div>
    </section>
  )
}

function Visual({ shot, alt }: { shot: Shot; alt: string }) {
  if (shot.kind === 'card') {
    return (
      <div className="relative mx-auto w-full max-w-[460px]">
        <div className="absolute -inset-6 -z-10 rounded-[2.5rem] bg-gradient-to-tr from-brand-100/60 to-transparent blur-2xl" />
        <CardShot src={shot.src} alt={alt} width={shot.width} height={shot.height} />
      </div>
    )
  }
  return (
    <div className="relative mx-auto w-full max-w-[280px]">
      <div className="absolute -inset-8 -z-10 rounded-[3rem] bg-gradient-to-tr from-brand-100/60 to-transparent blur-2xl" />
      <PhoneFrame src={shot.src} alt={alt} />
    </div>
  )
}
