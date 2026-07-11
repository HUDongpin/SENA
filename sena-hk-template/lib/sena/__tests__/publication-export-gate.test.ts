import { describe, expect, it } from "vitest";
import {
  buildSenaModel,
  buildSenaProjectSnapshot,
  lessonStudySenaContract
} from "../index";
import { buildSenaPublicationExport } from "../publication-export";

describe("SENA publication export model-card gate", () => {
  it("blocks publication artifacts when the model card render gate is incomplete", async () => {
    const model = buildSenaModel(lessonStudySenaContract);
    const snapshot = buildSenaProjectSnapshot(model, {
      title: "Ungated Publication Fixture",
      generatedAt: "2026-07-07T00:00:00.000Z",
      sourceDataset: lessonStudySenaContract
    });

    expect(snapshot.report.modelCard.renderGate.status).toBe("blocked");
    expect(snapshot.report.modelCard.renderGate.missingSectionIds).toEqual(expect.arrayContaining([
      "coding-reliability",
      "data-contract"
    ]));
    await expect(buildSenaPublicationExport(snapshot, "svg")).rejects.toMatchObject({
      status: 409,
      code: "publication_export_model_card_blocked"
    });
  });
});
