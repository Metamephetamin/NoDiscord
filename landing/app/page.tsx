import { AppMockup } from "@/components/AppMockup";
import { CTASection } from "@/components/CTASection";
import { FeatureCards } from "@/components/FeatureCards";
import { Hero } from "@/components/Hero";
import { Navbar } from "@/components/Navbar";
import { VoiceSection } from "@/components/VoiceSection";

export default function Home() {
  return (
    <>
      <Navbar />
      <main>
        <Hero />
        <FeatureCards />
        <VoiceSection />
        <AppMockup />
        <CTASection />
      </main>
    </>
  );
}
