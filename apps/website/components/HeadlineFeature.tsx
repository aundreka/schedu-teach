import { ArrowRight, Wand2 } from 'lucide-react'
import { Eyebrow } from './Section'
import { Reveal } from './Reveal'
import { PhoneFrame } from './PhoneFrame'
import { HEADLINE_FEATURE } from '@/lib/content'

export function HeadlineFeature() {
  return (
    <section id="features" className="container-page scroll-mt-20 py-20 sm:py-24">
      <div className="grid items-center gap-12 lg:grid-cols-2 lg:gap-16">
        <Reveal>
          <Eyebrow>{HEADLINE_FEATURE.eyebrow}</Eyebrow>
          <h2 className="mt-3 text-balance text-3xl font-bold tracking-tight text-ink sm:text-4xl">
            {HEADLINE_FEATURE.title}
          </h2>
          <p className="mt-4 text-pretty text-lg leading-relaxed text-muted">
            {HEADLINE_FEATURE.body}
          </p>

          <p className="mt-6 text-xs font-semibold uppercase tracking-wider text-muted">You enter</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {HEADLINE_FEATURE.inputs.map((i) => (
              <span
                key={i}
                className="rounded-full border border-line bg-white px-3 py-1.5 text-sm font-medium text-ink-soft shadow-sm transition-colors hover:border-brand-300 hover:text-brand-700"
              >
                {i}
              </span>
            ))}
          </div>

          <p className="mt-6 flex items-start gap-2.5 text-[0.95rem] font-semibold leading-relaxed text-ink">
            <Wand2 className="mt-0.5 h-5 w-5 shrink-0 text-brand-600" />
            {HEADLINE_FEATURE.benefit}
          </p>
        </Reveal>

        {/* Real setup screen → balanced-term output */}
        <Reveal delay={120}>
          <div className="relative mx-auto w-full max-w-[300px] pb-16 sm:pb-0">
            <PhoneFrame
              src="/screenshots/lessonplan.png"
              alt="SchEDU setup: subject, class days, and how many quizzes, performance tasks, and exams"
            />

            <div className="absolute -bottom-2 right-0 w-[270px] rounded-2xl border border-line bg-white/95 p-4 shadow-xl shadow-ink/10 backdrop-blur sm:-right-8 lg:-right-14">
              <div className="flex items-center gap-2 text-brand-700">
                <span className="inline-flex items-center gap-1.5 rounded-full bg-brand-600 px-2.5 py-1 text-[11px] font-semibold text-white">
                  SchEDU builds it <ArrowRight className="h-3 w-3" />
                </span>
              </div>
              <p className="mt-3 text-[11px] font-semibold uppercase tracking-wider text-muted">
                Your balanced term
              </p>
              <div className="mt-2 space-y-2">
                <TermWeek label="Wk 1–3" items={[['Lesson', 'lesson'], ['Lesson', 'lesson'], ['Quiz', 'quiz']]} />
                <TermWeek label="Wk 4–6" items={[['Lesson', 'lesson'], ['Task', 'task'], ['Review', 'review']]} />
                <TermWeek label="Wk 7–9" items={[['Lesson', 'lesson'], ['Quiz', 'quiz'], ['Exam', 'exam']]} />
              </div>
            </div>
          </div>
        </Reveal>
      </div>
    </section>
  )
}

const TONE: Record<string, string> = {
  lesson: 'bg-brand-100 text-brand-800',
  quiz: 'bg-sky-100 text-sky-800',
  task: 'bg-violet-100 text-violet-800',
  review: 'bg-amber-100 text-amber-800',
  exam: 'bg-rose-100 text-rose-800',
}

function TermWeek({ label, items }: { label: string; items: [string, string][] }) {
  return (
    <div className="flex items-center gap-2">
      <span className="w-12 shrink-0 text-[10px] font-medium text-muted">{label}</span>
      <div className="flex flex-1 gap-1">
        {items.map(([text, tone], i) => (
          <span
            key={i}
            className={`flex-1 rounded px-1.5 py-1 text-center text-[10px] font-semibold ${TONE[tone]}`}
          >
            {text}
          </span>
        ))}
      </div>
    </div>
  )
}
