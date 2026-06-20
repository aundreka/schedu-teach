import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Schedu Teach',
  description: 'AI-powered lesson planning for Filipino teachers.',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}
