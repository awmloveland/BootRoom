import { BetaStats } from '@/components/landing/BetaStats'
import { FaqAccordion } from '@/components/landing/FaqAccordion'
import { FeatureGrid } from '@/components/landing/FeatureGrid'
import { Hero } from '@/components/landing/Hero'
import { HonoursShowcase } from '@/components/landing/HonoursShowcase'
import { HowItWorks } from '@/components/landing/HowItWorks'
import { LandingFooter } from '@/components/landing/LandingFooter'
import { LandingHeader } from '@/components/landing/LandingHeader'
import { LineupLabDemo } from '@/components/landing/LineupLabDemo'
import { Marquee } from '@/components/landing/Marquee'
import { ResultsShowcase } from '@/components/landing/ResultsShowcase'
import { StatsDemo } from '@/components/landing/StatsDemo'
import { WaitlistSection } from '@/components/landing/WaitlistSection'

/** Marketing landing page shown at / for signed-out visitors. */
export function LandingPage() {
  return (
    <div className="bg-[#060b14] font-grotesk text-[#eaf2ff]">
      <LandingHeader />
      <Hero />
      <Marquee />
      <FeatureGrid />
      <StatsDemo />
      <LineupLabDemo />
      <HonoursShowcase />
      <ResultsShowcase />
      <HowItWorks />
      <FaqAccordion />
      <BetaStats />
      <WaitlistSection />
      <LandingFooter />
    </div>
  )
}
