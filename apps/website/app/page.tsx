import { Nav } from '@/components/Nav'
import { Hero } from '@/components/Hero'
import { Problem } from '@/components/Problem'
import { HeadlineFeature } from '@/components/HeadlineFeature'
import { Features } from '@/components/Features'
import { MoreFeatures } from '@/components/MoreFeatures'
import { Comparison } from '@/components/Comparison'
import { Audience } from '@/components/Audience'
import { Schools } from '@/components/Schools'
import { Pricing } from '@/components/Pricing'
import { Steps } from '@/components/Steps'
import { FAQ } from '@/components/FAQ'
import { FinalCTA } from '@/components/FinalCTA'
import { Footer } from '@/components/Footer'
import { detectCurrency } from '@/lib/geo'

export default async function HomePage() {
  const currency = await detectCurrency()

  return (
    <>
      <Nav />
      <main>
        <Hero />
        <Problem />
        <HeadlineFeature />
        <Features />
        <MoreFeatures />
        <Comparison />
        <Audience />
        <Schools />
        <Pricing initialCurrency={currency} />
        <Steps />
        <FAQ />
        <FinalCTA />
      </main>
      <Footer />
    </>
  )
}
