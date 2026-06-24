'use client'

import { useId, useState } from 'react'
import { Plus } from 'lucide-react'
import { cn } from '@/lib/cn'

export function FAQItem({ q, a }: { q: string; a: string }) {
  const [open, setOpen] = useState(false)
  const id = useId()

  return (
    <div className="px-5">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-controls={id}
        className="flex w-full cursor-pointer items-center justify-between gap-4 py-5 text-left text-[1.02rem] font-semibold text-ink"
      >
        {q}
        <Plus
          className={cn(
            'h-5 w-5 shrink-0 text-brand-600 transition-transform duration-300',
            open && 'rotate-45',
          )}
        />
      </button>

      <div id={id} className={cn('collapsible', open && 'is-open')}>
        <div>
          <p className="-mt-1 pb-5 text-[0.95rem] leading-relaxed text-muted">{a}</p>
        </div>
      </div>
    </div>
  )
}
