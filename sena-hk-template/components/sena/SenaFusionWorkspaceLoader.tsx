"use client";

import dynamic from "next/dynamic";

const SenaFusionWorkspaceClient = dynamic(
  () => import("./SenaFusionWorkspace").then((module) => module.SenaFusionWorkspace),
  {
    ssr: false,
    loading: () => (
      <main
        data-testid="sena-workspace-loading"
        className="min-h-screen bg-background px-4 py-6 text-foreground sm:px-6 lg:px-8"
      >
        <div className="mx-auto flex min-h-[70vh] max-w-6xl items-center justify-center">
          <div className="w-full max-w-xl rounded-lg border border-cardBorder/45 bg-card/75 p-6 shadow-glow">
            <div className="h-3 w-32 rounded-full bg-foreground/20" />
            <div className="mt-5 h-8 w-5/6 rounded-full bg-foreground/15" />
            <div className="mt-3 h-8 w-3/5 rounded-full bg-foreground/10" />
            <div className="mt-8 grid gap-3 sm:grid-cols-3">
              <div className="h-24 rounded-lg border border-cardBorder/35 bg-background/45" />
              <div className="h-24 rounded-lg border border-cardBorder/35 bg-background/45" />
              <div className="h-24 rounded-lg border border-cardBorder/35 bg-background/45" />
            </div>
            <div className="mt-6 h-64 rounded-lg border border-cardBorder/35 bg-background/35" />
          </div>
        </div>
      </main>
    )
  }
);

export function SenaFusionWorkspaceLoader() {
  return <SenaFusionWorkspaceClient />;
}
