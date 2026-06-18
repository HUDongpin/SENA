import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

describe("SENA workspace module boundaries", () => {
  it("keeps enterprise response contracts out of the main workspace container", () => {
    const workspacePath = path.join(process.cwd(), "components", "sena", "SenaFusionWorkspace.tsx");
    const contractsPath = path.join(process.cwd(), "components", "sena", "workspace", "enterprise-contracts.ts");
    const workspaceSource = readFileSync(workspacePath, "utf8");

    expect(existsSync(contractsPath)).toBe(true);
    expect(workspaceSource).not.toContain("type EnterpriseContext =");
    expect(workspaceSource).not.toContain("type EnterpriseReleaseGateState =");
    expect(workspaceSource).toContain("from \"./workspace/enterprise-contracts\"");

    const contractsSource = readFileSync(contractsPath, "utf8");
    expect(contractsSource).toContain("export type EnterpriseContext");
    expect(contractsSource).toContain("export type EnterpriseReleaseGateState");
  });

  it("keeps enterprise workspace option sets in a focused module", () => {
    const workspacePath = path.join(process.cwd(), "components", "sena", "SenaFusionWorkspace.tsx");
    const optionsPath = path.join(process.cwd(), "components", "sena", "workspace", "enterprise-options.ts");
    const workspaceSource = readFileSync(workspacePath, "utf8");

    expect(existsSync(optionsPath)).toBe(true);
    expect(workspaceSource).not.toContain("const enterpriseValidationMetrics");
    expect(workspaceSource).not.toContain("const enterprisePlatformDecisionOptions");
    expect(workspaceSource).toContain("from \"./workspace/enterprise-options\"");

    const optionsSource = readFileSync(optionsPath, "utf8");
    expect(optionsSource).toContain("export const enterpriseValidationMetrics");
    expect(optionsSource).toContain("export const enterpriseSsoProviderOptions");
  });

  it("routes enterprise JSON refresh calls through the workspace API helper", () => {
    const workspacePath = path.join(process.cwd(), "components", "sena", "SenaFusionWorkspace.tsx");
    const workspaceSource = readFileSync(workspacePath, "utf8");

    expect(workspaceSource).toContain("requestSenaWorkspaceJson");
    expect(workspaceSource).toContain("requestSenaWorkspaceJson<EnterpriseTeamState>");
    expect(workspaceSource).toContain("requestSenaWorkspaceJson<EnterprisePlatformDecisionState>");
    expect(workspaceSource).toContain("requestSenaWorkspaceJson<EnterpriseReleaseGateState>");
  });

  it("keeps enterprise request token state in a runtime hook", () => {
    const workspacePath = path.join(process.cwd(), "components", "sena", "SenaFusionWorkspace.tsx");
    const runtimeHookPath = path.join(process.cwd(), "components", "sena", "workspace", "use-enterprise-runtime.ts");
    const workspaceSource = readFileSync(workspacePath, "utf8");

    expect(existsSync(runtimeHookPath)).toBe(true);
    expect(workspaceSource).toContain("useEnterpriseWorkspaceApi");
    expect(workspaceSource).toContain("resetEnterpriseCsrfToken");
    expect(workspaceSource).not.toContain("const enterpriseCsrfRef = useRef");

    const runtimeHookSource = readFileSync(runtimeHookPath, "utf8");
    expect(runtimeHookSource).toContain("export function useEnterpriseWorkspaceApi");
    expect(runtimeHookSource).toContain("const enterpriseCsrfRef = useRef<EnterpriseCsrfToken | null>(null)");
    expect(runtimeHookSource).toContain("requestSenaWorkspaceJson<Partial<EnterpriseCsrfToken>");
  });
});
