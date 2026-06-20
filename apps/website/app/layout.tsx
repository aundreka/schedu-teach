import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Schedu HQ',
  description: 'Smart scheduling tools for educators.',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}
