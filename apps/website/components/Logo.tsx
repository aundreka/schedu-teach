import { CalendarCheck } from 'lucide-react'
import { cn } from '@/lib/cn'

export function Logo({ className }: { className?: string }) {
  return (
    <span className={cn('inline-flex items-center gap-2', className)}>
      <span className="grid h-8 w-8 place-items-center rounded-lg bg-gradient-to-br from-brand-400 to-brand-600 text-white shadow-sm">
        <CalendarCheck className="h-[18px] w-[18px]" strokeWidth={2.5} />
      </span>
      <span className="text-[1.15rem] font-bold tracking-tight text-ink">
        Sch<span className="text-brand-600">EDU</span>
      </span>
    </span>
  )
}
