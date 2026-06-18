import { AnalyticsGallery } from "@/components/AnalyticsGallery";
import { DocsSection } from "@/components/DocsSection";
import { EthicsSection } from "@/components/EthicsSection";
import { Footer } from "@/components/Footer";
import { Hero } from "@/components/Hero";
import { MethodSection } from "@/components/MethodSection";
import { NavBar } from "@/components/NavBar";
import { ResearchCases } from "@/components/ResearchCases";
import { Workflow } from "@/components/Workflow";
import { WorkspacePreview } from "@/components/WorkspacePreview";

export default function HomePage() {
  return (
    <main>
      <NavBar />
      <Hero />
      <Workflow />
      <MethodSection />
      <WorkspacePreview />
      <ResearchCases />
      <AnalyticsGallery />
      <EthicsSection />
      <DocsSection />
      <Footer />
    </main>
  );
}
