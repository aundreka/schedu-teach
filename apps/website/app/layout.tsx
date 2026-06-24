import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import './globals.css'

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
  display: 'swap',
})

const SITE_URL = 'https://scheduhq.com'

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: 'SchEDU — Plan your whole term in minutes, not weekends',
    template: '%s · SchEDU',
  },
  description:
    'SchEDU turns a teacher’s subjects and class times into a complete, balanced term schedule — automatically — and turns each lesson into ready-to-use classroom activities. All from their phone.',
  keywords: [
    'lesson planning',
    'teacher app',
    'DepEd',
    'term scheduler',
    'classroom activities',
    'Philippines teachers',
  ],
  openGraph: {
    type: 'website',
    url: SITE_URL,
    siteName: 'SchEDU',
    title: 'SchEDU — Smarter lesson planning for teachers',
    description:
      'Plan your whole term in minutes, not weekends. Built for Philippine classrooms and DepEd pacing.',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'SchEDU — Smarter lesson planning for teachers',
    description: 'Plan your whole term in minutes, not weekends.',
  },
  icons: { icon: '/favicon.ico' },
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={inter.variable}>
      <body className="font-sans antialiased">
        <noscript>
          {/* Without JS the IntersectionObserver never fires — keep content visible. */}
          <style>{`.reveal{opacity:1!important;transform:none!important}`}</style>
        </noscript>
        {children}
      </body>
    </html>
  )
}
