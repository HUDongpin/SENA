import { NavBar } from "@/components/NavBar";
import { EnaWorkspaceClient } from "./EnaWorkspaceClient";

export default function EnaWorkspacePage() {
  return (
    <main>
      <NavBar />
      <EnaWorkspaceClient />
    </main>
  );
}
