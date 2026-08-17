"use client";

import dynamic from "next/dynamic";

import { SenaWorkspaceShellStage } from "./workspace/workspace-shell-stage";

/**
 * Stage 2 of the two-stage workspace load (ADR-0011, T7).
 *
 * This module is the outer stage: it owns the dynamic import of the analysis
 * workspace — the component that runs `useSenaFusionWorkspaceMainShellProps` and
 * therefore reaches `analysis-runtime` → `lib/sena/model` → sna.js/jena-js/SVD —
 * and renders the chrome-only stage-1 shell until that import resolves.
 *
 * The split is a component boundary rather than a nullable `model` threaded down,
 * because `model` feeds ~54 render-body memos in one hook and hooks cannot be
 * conditional. Stage 2 is today's component and today's hook, unchanged, mounted
 * once compute is ready, so every memo still runs unconditionally.
 *
 * `SenaWorkspaceShellStage` is imported statically on purpose: as the fallback of
 * an `ssr: false` dynamic it is prerendered into the route HTML, so the chrome is
 * painted from the first response instead of waiting on a second JS round trip.
 * That is only safe because the shell reaches nothing in the analysis graph — see
 * the rule at the top of workspace-shell-stage.tsx.
 */
const SenaFusionWorkspaceClient = dynamic(
  () => import("./SenaFusionWorkspace").then((module) => module.SenaFusionWorkspace),
  {
    ssr: false,
    loading: () => <SenaWorkspaceShellStage />
  }
);

export function SenaFusionWorkspaceLoader() {
  return <SenaFusionWorkspaceClient />;
}
