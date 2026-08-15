import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { describe, expect, it } from "vitest";

const workspaceDir = resolve(dirname(fileURLToPath(import.meta.url)), "../../../components/sena/workspace");

function readWorkspaceSource(file: string) {
  return readFileSync(resolve(workspaceDir, file), "utf8");
}

/**
 * The server refuses an approved go-live attestation unless every checklist item
 * is confirmed (ops-go-live-attestations.ts). The client used to satisfy that gate
 * by sending four of the five confirmations as hard-coded `true`, so the exported
 * governance evidence claimed human reviews that never happened. There is no DOM
 * test infrastructure here, so these are source contracts over the call sites.
 */
describe("go-live attestation checklist is reviewer-supplied", () => {
  const actionsSource = readWorkspaceSource("use-enterprise-go-live-actions.ts");
  const panelSource = readWorkspaceSource("enterprise-ops-exports.tsx");
  const propsSource = readWorkspaceSource("use-sena-fusion-workspace-main-shell-props.ts");

  const checklistKeys = [
    "rehearsalReviewed",
    "releaseGateDraftReviewed",
    "verificationEvidenceReviewed",
    "rollbackOwnerConfirmed",
    "platformOwnerDecisionReviewed"
  ];

  it("never sends a checklist confirmation as a hard-coded true", () => {
    for (const key of checklistKeys) {
      expect(actionsSource, `${key} is hard-coded true in the submitted payload`).not.toMatch(
        new RegExp(`${key}:\\s*true`)
      );
    }
  });

  it("sources every confirmation from the reviewer-held checklist state", () => {
    for (const key of checklistKeys) {
      expect(actionsSource, `${key} is not read from goLiveChecklist`).toContain(`goLiveChecklist.${key}`);
    }
  });

  it("renders a checkbox for every checklist item", () => {
    for (const key of checklistKeys) {
      expect(panelSource, `${key} has no checkbox in the ops panel`).toContain(key);
    }
    expect(panelSource).toContain('type="checkbox"');
    expect(panelSource).toContain("enterprise-go-live-attestation-checklist");
  });

  it("defaults every confirmation to unchecked", () => {
    expect(actionsSource).toContain("EMPTY_ENTERPRISE_GO_LIVE_CHECKLIST");
    for (const key of checklistKeys) {
      expect(actionsSource).toMatch(new RegExp(`${key}:\\s*false`));
    }
  });

  it("gates the Attest button on the checklist for an approved decision", () => {
    expect(propsSource).toContain("canSubmitAttestation");
    const gate = propsSource.slice(propsSource.indexOf("canSubmitAttestation"));
    expect(gate.slice(0, 800)).toContain("goLiveChecklist.rehearsalReviewed");
    expect(gate.slice(0, 800)).toContain('releaseGateDecision !== "approved"');
  });

  it("still requires a passing verification status behind the evidence confirmation", () => {
    expect(actionsSource).toContain('releaseGateVerificationStatus === "passed"');
  });
});
