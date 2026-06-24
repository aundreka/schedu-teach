import { Check, Minus, X } from 'lucide-react'
import { SectionHeading } from './Section'
import { Reveal } from './Reveal'
import { COMPARISON } from '@/lib/content'
import { cn } from '@/lib/cn'

function Cell({ value }: { value: 'yes' | 'partial' | 'no' }) {
  if (value === 'yes')
    return (
      <span className="mx-auto grid h-7 w-7 place-items-center rounded-full bg-brand-600 text-white">
        <Check className="h-4 w-4" strokeWidth={3} />
      </span>
    )
  if (value === 'partial')
    return (
      <span className="mx-auto grid h-7 w-7 place-items-center rounded-full bg-amber-100 text-amber-600">
        <Minus className="h-4 w-4" strokeWidth={3} />
      </span>
    )
  return (
    <span className="mx-auto grid h-7 w-7 place-items-center rounded-full bg-surface-2 text-muted">
      <X className="h-4 w-4" strokeWidth={2.5} />
    </span>
  )
}

export function Comparison() {
  const { columns, rows, footnote } = COMPARISON
  const lastCol = columns.length - 1

  return (
    <section className="container-page py-20 sm:py-24">
      <Reveal>
        <SectionHeading
          eyebrow="How SchEDU compares"
          title="Other tools store a plan. SchEDU makes one."
          subtitle="Built the way Filipino teachers already pace and grade."
        />
      </Reveal>

      <Reveal delay={120} className="mt-12 overflow-x-auto">
        <table className="w-full min-w-[680px] border-separate border-spacing-0 text-sm">
          <thead>
            <tr>
              <th className="w-[38%] py-3 pr-4 text-left font-semibold text-muted" />
              {columns.map((c, i) => (
                <th
                  key={c}
                  className={cn(
                    'px-3 py-3 text-center align-bottom text-[0.8rem] font-semibold sm:text-sm',
                    i === lastCol
                      ? 'rounded-t-xl bg-brand-600 text-white'
                      : 'text-ink-soft',
                  )}
                >
                  {c}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, r) => (
              <tr key={row.label} className="group">
                <td className="py-3 pr-4 text-left font-medium text-ink">{row.label}</td>
                {row.values.map((v, i) => (
                  <td
                    key={i}
                    className={cn(
                      'px-3 py-3',
                      i === lastCol && 'bg-brand-50',
                      i === lastCol && r === rows.length - 1 && 'rounded-b-xl',
                      r !== rows.length - 1 && 'border-b border-line',
                    )}
                  >
                    <Cell value={v} />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </Reveal>

      <Reveal delay={150}>
        <p className="mx-auto mt-8 max-w-2xl text-center text-lg font-medium italic leading-relaxed text-ink-soft">
          {footnote}
        </p>
      </Reveal>
    </section>
  )
}
