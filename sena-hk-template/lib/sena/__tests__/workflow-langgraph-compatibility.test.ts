import { describe, expect, it } from "vitest";
import { Command, MemorySaver, StateGraph } from "@langchain/langgraph";
import { PostgresSaver } from "@langchain/langgraph-checkpoint-postgres";
import {
  createEvidenceFlowPostgresSaver,
  runEvidenceFlowLangGraphCompatibilityProbe
} from "../workflow/langgraph-compatibility";

describe("SENA EvidenceFlow LangGraph compatibility", () => {
  it("loads the exact low-level runtime and checkpoint implementations on Node 24", () => {
    expect(process.versions.node.split(".")[0]).toBe("24");
    expect(StateGraph).toBeTypeOf("function");
    expect(Command).toBeTypeOf("function");
    expect(MemorySaver).toBeTypeOf("function");
    expect(PostgresSaver).toBeTypeOf("function");
  });

  it("checkpoints, interrupts, replays the node, and deduplicates its receipt key", async () => {
    const result = await runEvidenceFlowLangGraphCompatibilityProbe();
    expect(result.interrupted).toHaveProperty("__interrupt__");
    expect(result.resumed).toMatchObject({ approved: true, completed: true });
    expect(result.approvalNodeExecutions).toBe(2);
    expect(result.uniqueReceiptCount).toBe(1);
    expect(result.checkpointCount).toBeGreaterThanOrEqual(3);
    expect(result.threadId).toBe("compatibility-run");
    expect(JSON.stringify(result.resumed)).not.toContain("rawRows");
  });

  it("constructs PostgresSaver with the dedicated checkpoint schema without connecting", async () => {
    const saver = createEvidenceFlowPostgresSaver("postgresql://localhost/sena_evidenceflow_test");
    expect(saver).toBeInstanceOf(PostgresSaver);
    await saver.end();
  });
});
