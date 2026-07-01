import Link from 'next/link'
import { Logo } from './Logo'
import { FOOTER, SITE } from '@/lib/content'

export function Footer() {
  return (
    <footer className="border-t border-line bg-white">
      <div className="container-page py-14">
        <div className="grid grid-cols-1 gap-10 lg:grid-cols-[1.5fr_2fr]">
          <div className="max-w-sm">
            <Logo />
            <p className="mt-4 text-sm leading-relaxed text-muted">{FOOTER.blurb}</p>
          </div>

          <div className="grid grid-cols-2 gap-8 sm:grid-cols-3">
            {FOOTER.columns.map((col) => (
              <div key={col.title}>
                <h4 className="text-sm font-semibold text-ink">{col.title}</h4>
                <ul className="mt-3 space-y-2.5">
                  {col.links.map((l) => (
                    <li key={l.label}>
                      <Link
                        href={l.href}
                        className="text-sm text-muted transition-colors hover:text-ink"
                      >
                        {l.label}
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>

        <div className="mt-12 flex flex-col items-center justify-between gap-3 border-t border-line pt-6 text-sm text-muted sm:flex-row">
          <p>© {new Date().getFullYear()} {SITE.name}. {SITE.tagline}.</p>
          <p>Made for Philippine classrooms 🇵🇭</p>
        </div>
      </div>
    </footer>
  )
}
