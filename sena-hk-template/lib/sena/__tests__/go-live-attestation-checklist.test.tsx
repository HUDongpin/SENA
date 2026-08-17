import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const opsActions = vi.hoisted(() => ({
  getEnterpriseGoLiveRehearsalAction: vi.fn(),
  submitEnterpriseGoLiveAttestationAction: vi.fn()
}));

vi.mock("../../../components/sena/workspace/enterprise-ops-actions", () => opsActions);

import {
  EMPTY_ENTERPRISE_GO_LIVE_CHECKLIST,
  enterpriseGoLiveChecklistForScope,
  enterpriseGoLiveChecklistScopeKey,
  useEnterpriseGoLiveActions,
  type EnterpriseGoLiveChecklistState
} from "../../../components/sena/workspace/use-enterprise-go-live-actions";
import type {
  EnterpriseReleaseGateDecision,
  EnterpriseReleaseVerificationStatus
} from "../../../components/sena/workspace/enterprise-contracts";

const workspaceDir = resolve(dirname(fileURLToPath(import.meta.url)), "../../../components/sena/workspace");

const checklistKeys = [
  "rehearsalReviewed",
  "releaseGateDraftReviewed",
  "verificationEvidenceReviewed",
  "rollbackOwnerConfirmed",
  "platformOwnerDecisionReviewed"
] as const;

const ALL_CONFIRMED: EnterpriseGoLiveChecklistState = {
  rehearsalReviewed: true,
  releaseGateDraftReviewed: true,
  verificationEvidenceReviewed: true,
  rollbackOwnerConfirmed: true,
  platformOwnerDecisionReviewed: true
};

type GoLiveStore = {
  goLiveChecklist: EnterpriseGoLiveChecklistState;
  activeEnterpriseTeamId: string;
  releaseGateDecision: EnterpriseReleaseGateDecision;
  releaseGateVersion: string;
  releaseGateEnvironment: string;
  releaseGateApproverName: string;
  releaseGateApproverRole: string;
  releaseGateNotes: string;
  releaseGateVerificationStatus: EnterpriseReleaseVerificationStatus;
  releaseGateVerificationSummary: string;
  releaseGateVerificationHash: string;
  message: string;
};

type GoLiveHandlers = {
  applyEnterpriseGoLiveRehearsalDraft: () => Promise<void>;
  submitEnterpriseGoLiveAttestation: () => Promise<void>;
};

function resolveSetter<T>(value: T | ((current: T) => T), current: T): T {
  return typeof value === "function" ? (value as (previous: T) => T)(current) : value;
}

function createStore(overrides: Partial<GoLiveStore> = {}): GoLiveStore {
  return {
    goLiveChecklist: EMPTY_ENTERPRISE_GO_LIVE_CHECKLIST,
    activeEnterpriseTeamId: "team-hk-1",
    releaseGateDecision: "approved",
    releaseGateVersion: "1.4.0",
    releaseGateEnvironment: "pilot-production",
    releaseGateApproverName: "Ms Lee",
    releaseGateApproverRole: "Research platform lead",
    releaseGateNotes: "Rehearsal and rollback drill reviewed in the go-live call.",
    releaseGateVerificationStatus: "passed",
    releaseGateVerificationSummary: "sena:pilot:verify passed.",
    releaseGateVerificationHash: "",
    message: "",
    ...overrides
  };
}

/**
 * Mounts the real go-live actions hook so each test drives the production
 * callbacks. There is no DOM renderer here, so state lives in an external store
 * and every mount is one React render: re-mount to pick up new closures, which is
 * exactly what a reviewer's next click would see.
 */
function mountGoLiveActions(store: GoLiveStore): GoLiveHandlers {
  let handlers: GoLiveHandlers | null = null;

  function GoLiveHarness() {
    const actions = useEnterpriseGoLiveActions({
      enterpriseUserPresent: true,
      activeEnterpriseTeamId: store.activeEnterpriseTeamId,
      goLiveChecklist: store.goLiveChecklist,
      releaseGateDecision: store.releaseGateDecision,
      releaseGateVersion: store.releaseGateVersion,
      releaseGateEnvironment: store.releaseGateEnvironment,
      releaseGateApproverName: store.releaseGateApproverName,
      releaseGateApproverRole: store.releaseGateApproverRole,
      releaseGateNotes: store.releaseGateNotes,
      releaseGateVerificationStatus: store.releaseGateVerificationStatus,
      enterpriseJsonHeaders: async () => ({}),
      exportEnterpriseJsonArtifact: async () => undefined,
      setEnterpriseBusy: () => undefined,
      setEnterpriseMessage: (value) => { store.message = resolveSetter(value, store.message); },
      setGoLiveChecklist: (value) => { store.goLiveChecklist = resolveSetter(value, store.goLiveChecklist); },
      setReleaseGateDecision: (value) => { store.releaseGateDecision = resolveSetter(value, store.releaseGateDecision); },
      setReleaseGateEnvironment: (value) => { store.releaseGateEnvironment = resolveSetter(value, store.releaseGateEnvironment); },
      setReleaseGateVersion: (value) => { store.releaseGateVersion = resolveSetter(value, store.releaseGateVersion); },
      setReleaseGateNotes: (value) => { store.releaseGateNotes = resolveSetter(value, store.releaseGateNotes); },
      setReleaseGateVerificationStatus: (value) => { store.releaseGateVerificationStatus = resolveSetter(value, store.releaseGateVerificationStatus); },
      setReleaseGateVerificationSummary: (value) => { store.releaseGateVerificationSummary = resolveSetter(value, store.releaseGateVerificationSummary); },
      setReleaseGateVerificationHash: (value) => { store.releaseGateVerificationHash = resolveSetter(value, store.releaseGateVerificationHash); }
    });

    handlers = {
      applyEnterpriseGoLiveRehearsalDraft: actions.applyEnterpriseGoLiveRehearsalDraft,
      submitEnterpriseGoLiveAttestation: actions.submitEnterpriseGoLiveAttestation
    };
    return null;
  }

  renderToStaticMarkup(<GoLiveHarness />);
  if (!handlers) throw new Error("Go-live harness did not expose its handlers.");
  return handlers;
}

function submittedChecklists() {
  return opsActions.submitEnterpriseGoLiveAttestationAction.mock.calls.map(
    (call) => (call[0] as { checklist: EnterpriseGoLiveChecklistState }).checklist
  );
}

function rehearsalDraft(releaseVersion: string, environment = "pilot-production") {
  return {
    releaseGateDraft: {
      decision: "approved" as EnterpriseReleaseGateDecision,
      environment,
      releaseVersion,
      notes: `Draft notes for ${releaseVersion}.`,
      verificationEvidence: {
        status: "passed" as EnterpriseReleaseVerificationStatus,
        summary: `sena:pilot:verify passed for ${releaseVersion}.`
      }
    }
  };
}

describe("go-live attestation checklist is reviewer-supplied", () => {
  beforeEach(() => {
    opsActions.submitEnterpriseGoLiveAttestationAction.mockReset();
    opsActions.submitEnterpriseGoLiveAttestationAction.mockResolvedValue({ attestation: undefined });
    opsActions.getEnterpriseGoLiveRehearsalAction.mockReset();
  });

  it("defaults every confirmation to unchecked", () => {
    for (const key of checklistKeys) {
      expect(EMPTY_ENTERPRISE_GO_LIVE_CHECKLIST[key], `${key} defaults to confirmed`).toBe(false);
    }
  });

  it("submits exactly the confirmations the reviewer ticked", async () => {
    for (const key of checklistKeys) {
      opsActions.submitEnterpriseGoLiveAttestationAction.mockClear();
      const store = createStore({
        goLiveChecklist: { ...EMPTY_ENTERPRISE_GO_LIVE_CHECKLIST, [key]: true }
      });
      await mountGoLiveActions(store).submitEnterpriseGoLiveAttestation();

      expect(submittedChecklists()[0], `${key} is not sourced from the reviewer checklist`).toEqual({
        ...EMPTY_ENTERPRISE_GO_LIVE_CHECKLIST,
        [key]: true
      });
    }
  });

  it("never asserts a review the reviewer left unticked", async () => {
    const store = createStore();
    await mountGoLiveActions(store).submitEnterpriseGoLiveAttestation();

    expect(submittedChecklists()[0]).toEqual(EMPTY_ENTERPRISE_GO_LIVE_CHECKLIST);
  });

  it("still requires a passing verification status behind the evidence confirmation", async () => {
    const store = createStore({
      goLiveChecklist: ALL_CONFIRMED,
      releaseGateVerificationStatus: "failed"
    });
    await mountGoLiveActions(store).submitEnterpriseGoLiveAttestation();

    expect(submittedChecklists()[0].verificationEvidenceReviewed).toBe(false);
    expect(submittedChecklists()[0].rehearsalReviewed).toBe(true);
  });

  it("does not carry confirmations from one submission into the next", async () => {
    const store = createStore({ goLiveChecklist: ALL_CONFIRMED });
    await mountGoLiveActions(store).submitEnterpriseGoLiveAttestation();
    expect(submittedChecklists()[0]).toEqual(ALL_CONFIRMED);

    // The reviewer ticks nothing more and clicks Attest again — a second approved
    // attestation must not reuse the first release's confirmations.
    await mountGoLiveActions(store).submitEnterpriseGoLiveAttestation();

    expect(submittedChecklists()[1]).toEqual(EMPTY_ENTERPRISE_GO_LIVE_CHECKLIST);
    expect(store.goLiveChecklist).toEqual(EMPTY_ENTERPRISE_GO_LIVE_CHECKLIST);
  });

  it("keeps a failed submission's confirmations so the reviewer can retry", async () => {
    opsActions.submitEnterpriseGoLiveAttestationAction.mockRejectedValueOnce(new Error("Attestation rejected."));
    const store = createStore({ goLiveChecklist: ALL_CONFIRMED });
    await mountGoLiveActions(store).submitEnterpriseGoLiveAttestation();

    expect(store.goLiveChecklist).toEqual(ALL_CONFIRMED);
    expect(store.message).toContain("Attestation rejected.");
  });

  it("drops confirmations when a fresh rehearsal draft replaces the reviewed material", async () => {
    opsActions.getEnterpriseGoLiveRehearsalAction.mockResolvedValue(rehearsalDraft("1.5.0"));
    const store = createStore({ goLiveChecklist: ALL_CONFIRMED });

    await mountGoLiveActions(store).applyEnterpriseGoLiveRehearsalDraft();

    expect(store.releaseGateVersion).toBe("1.5.0");
    expect(store.goLiveChecklist).toEqual(EMPTY_ENTERPRISE_GO_LIVE_CHECKLIST);
  });

  it("cannot attest an unreviewed release after applying a draft", async () => {
    opsActions.getEnterpriseGoLiveRehearsalAction.mockResolvedValue(rehearsalDraft("1.5.0"));
    const store = createStore({ goLiveChecklist: ALL_CONFIRMED });

    // Reviewer ticks everything for 1.4.0, submits, then pulls a fresh draft.
    await mountGoLiveActions(store).submitEnterpriseGoLiveAttestation();
    await mountGoLiveActions(store).applyEnterpriseGoLiveRehearsalDraft();
    await mountGoLiveActions(store).submitEnterpriseGoLiveAttestation();

    const [first, second] = submittedChecklists();
    expect(first).toEqual(ALL_CONFIRMED);
    expect(second).toEqual(EMPTY_ENTERPRISE_GO_LIVE_CHECKLIST);
  });

  it("leaves the checklist alone when the rehearsal draft request fails", async () => {
    opsActions.getEnterpriseGoLiveRehearsalAction.mockRejectedValue(new Error("Go-live rehearsal draft failed."));
    const store = createStore({ goLiveChecklist: ALL_CONFIRMED });

    await mountGoLiveActions(store).applyEnterpriseGoLiveRehearsalDraft();

    expect(store.goLiveChecklist).toEqual(ALL_CONFIRMED);
    expect(store.releaseGateVersion).toBe("1.4.0");
  });
});

describe("go-live checklist scope", () => {
  const scope = { teamId: "team-hk-1", environment: "pilot-production", releaseVersion: "1.4.0" };
  const heldKey = enterpriseGoLiveChecklistScopeKey(scope);

  it("keeps confirmations while team, environment, and version are unchanged", () => {
    expect(
      enterpriseGoLiveChecklistForScope({ scopeKey: heldKey, checklist: ALL_CONFIRMED }, heldKey)
    ).toEqual(ALL_CONFIRMED);
  });

  it("drops confirmations on a change of team, environment, or release version", () => {
    const movedScopes = [
      { ...scope, teamId: "team-hk-2" },
      { ...scope, environment: "production" },
      { ...scope, releaseVersion: "1.5.0" }
    ];
    for (const moved of movedScopes) {
      expect(
        enterpriseGoLiveChecklistForScope(
          { scopeKey: heldKey, checklist: ALL_CONFIRMED },
          enterpriseGoLiveChecklistScopeKey(moved)
        ),
        `confirmations survived a move to ${JSON.stringify(moved)}`
      ).toEqual(EMPTY_ENTERPRISE_GO_LIVE_CHECKLIST);
    }
  });

  it("cannot collide two different scopes onto one key", () => {
    expect(enterpriseGoLiveChecklistScopeKey({ teamId: "a", environment: "b:c", releaseVersion: "d" }))
      .not.toBe(enterpriseGoLiveChecklistScopeKey({ teamId: "a", environment: "b", releaseVersion: "c:d" }));
  });
});

describe("go-live attestation checklist panel", () => {
  // The ops panel needs a full workspace props tree to render, and there is no DOM
  // renderer here, so this one contract stays a source grep.
  const panelSource = readFileSync(resolve(workspaceDir, "enterprise-ops-exports.tsx"), "utf8");
  const propsSource = readFileSync(resolve(workspaceDir, "use-sena-fusion-workspace-main-shell-props.ts"), "utf8");

  it("renders a checkbox for every checklist item", () => {
    for (const key of checklistKeys) {
      expect(panelSource, `${key} has no checkbox in the ops panel`).toContain(key);
    }
    expect(panelSource).toContain('type="checkbox"');
    expect(panelSource).toContain("enterprise-go-live-attestation-checklist");
  });

  it("gates the Attest button on the checklist for an approved decision", () => {
    expect(propsSource).toContain("canSubmitAttestation");
    const gate = propsSource.slice(propsSource.indexOf("canSubmitAttestation"));
    expect(gate.slice(0, 800)).toContain("goLiveChecklist.rehearsalReviewed");
    expect(gate.slice(0, 800)).toContain('releaseGateDecision !== "approved"');
  });

  it("scopes the held checklist to the team, environment, and release version on screen", () => {
    expect(propsSource).toContain("enterpriseGoLiveChecklistScopeKey");
    expect(propsSource).toContain("enterpriseGoLiveChecklistForScope");
  });
});
