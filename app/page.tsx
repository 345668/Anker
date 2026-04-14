import { Navigation } from "@/components/landing/navigation"
import { HeroSection } from "@/components/landing/hero-section"
import { FeaturesSection } from "@/components/landing/features-section"
import { HowItWorksSection } from "@/components/landing/how-it-works-section"
import { DevelopersSection } from "@/components/landing/developers-section"
import { MetricsSection } from "@/components/landing/metrics-section"
import { TestimonialsSection } from "@/components/landing/testimonials-section"
import { SecuritySection } from "@/components/landing/security-section"
import { IntegrationsSection } from "@/components/landing/integrations-section"
import { InfrastructureSection } from "@/components/landing/infrastructure-section"
import { PricingSection } from "@/components/landing/pricing-section"
import { CTASection } from "@/components/landing/cta-section"
import { FooterSection } from "@/components/landing/footer-section"

export default function Home() {
  return (
    <main className="relative min-h-screen overflow-x-hidden noise-overlay">
      <Navigation />
      <HeroSection />
      <FeaturesSection />
      <HowItWorksSection />
      <DevelopersSection />
      <MetricsSection />
      <TestimonialsSection />
      <SecuritySection />
      <IntegrationsSection />
      <InfrastructureSection />
      <PricingSection />
      <CTASection />
      <FooterSection />
    </main>
  )
}
