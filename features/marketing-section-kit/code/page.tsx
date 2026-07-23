import { Hero } from "@/components/marketing/hero";
import { ProblemSection } from "@/components/marketing/problem-section";
import { TransformationSection } from "@/components/marketing/transformation-section";
import { HowItWorks } from "@/components/marketing/how-it-works";
import { Features } from "@/components/marketing/features";
import { QuoteStrip } from "@/components/marketing/quote-strip";
import { PricingPreview } from "@/components/marketing/pricing-preview";
import { CtaSection } from "@/components/marketing/cta-section";
import { Footer } from "@/components/marketing/footer";

/**
 * Homepage = a planned scroll narrative, not a pile of sections. The ORDER is
 * the reusable idea (website-standard Phase 1): hook -> problem -> proof -> offer
 * -> action. Each section earns its place in the emotional pacing.
 *
 *   Hero                 hook: promise + primary CTA, above the fold
 *   ProblemSection       name the pain the reader already feels
 *   TransformationSection before/after: the world with your product
 *   HowItWorks           reduce perceived effort: 3 simple steps
 *   Features             proof: what makes it real (capabilities)
 *   QuoteStrip           social proof: one strong testimonial
 *   PricingPreview       the offer, made concrete
 *   CtaSection           the ask: one clear action, restated
 */
export default function HomePage() {
  return (
    <main>
      <Hero />
      <ProblemSection />
      <TransformationSection />
      <HowItWorks />
      <Features />
      <QuoteStrip />
      <PricingPreview />
      <CtaSection />
      <Footer />
    </main>
  );
}
