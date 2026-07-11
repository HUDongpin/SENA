import { Footer } from "@/components/Footer";
import { NavBar } from "@/components/NavBar";
import { WorkspacePreview } from "@/components/WorkspacePreview";

export default function WorkspacePage() {
  return (
    <main>
      <NavBar />
      <WorkspacePreview />
      <Footer />
    </main>
  );
}
