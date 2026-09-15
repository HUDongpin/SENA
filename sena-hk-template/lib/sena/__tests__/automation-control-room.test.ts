import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

function source(relativePath: string) {
  return readFileSync(path.join(process.cwd(), relativePath), "utf8");
}

describe("SENA Automation Control Room contract", () => {
  it("ships the fixed route, workspace entry, redacted API boundary, and honest evidence labels", () => {
    const page = source("app/workspace/sena/automation/page.tsx");
    const controlRoom = source("components/sena/automation/SenaAutomationControlRoom.tsx");
    const command = source("app/workspace/sena/automation/command/route.ts");
    const workspaceHeader = source("components/sena/workspace/workspace-header-section.tsx");

    expect(page).toContain("SenaAutomationControlRoom");
    expect(page).toContain('dynamic = "force-dynamic"');
    expect(workspaceHeader).toContain("/workspace/sena/automation");
    expect(controlRoom).toContain('data-testid="sena-automation-control-room"');
    expect(controlRoom).toContain("Skip to EvidenceFlow controls");
    expect(controlRoom).toContain('aria-live="polite"');
    expect(controlRoom).toContain('aria-label="EvidenceFlow templates"');
    expect(controlRoom).toContain('aria-current={template === item.kind ? "page"');
    expect(controlRoom).toContain('aria-label="Start Research Evidence"');
    expect(controlRoom).toContain('aria-label="Start Engineering Release"');
    expect(controlRoom).toContain("Research Evidence");
    expect(controlRoom).toContain("Engineering Release");
    expect(controlRoom).toContain("mode=shadow, no external side effects");
    expect(controlRoom).toContain("Decision persisted");
    expect(controlRoom).toContain("duplicate decisions are unavailable");
    expect(controlRoom).toContain("status:");
    expect(controlRoom).toContain("claim:");
    expect(controlRoom).toContain("not-run");
    expect(controlRoom).not.toContain('"use client"');
    expect(command).toContain("verifyEnterpriseCsrfTokenAsync");
    expect(command).toContain("idempotencyKey");
    expect(command).toContain("expectedVersion");
    expect(command).toContain("createSenaWorkflowRun");
    expect(command).toContain("performSenaWorkflowAction");
    expect(command).toContain("location: `/workspace/sena/automation?${params}`");
  });

  it("keeps visible Control Room copy free of dash typography and supports client-free mobile collapse", () => {
    const controlRoom = source("components/sena/automation/SenaAutomationControlRoom.tsx");
    expect(controlRoom).not.toMatch(/[—–]/);
    expect(controlRoom).toContain("lg:grid-cols-");
    expect(controlRoom).toContain("min-h-11");
    expect(controlRoom).toContain("focus-visible:outline");
    expect(controlRoom).toContain('method="post"');
    expect(controlRoom).toContain('method="get"');
  });
});
