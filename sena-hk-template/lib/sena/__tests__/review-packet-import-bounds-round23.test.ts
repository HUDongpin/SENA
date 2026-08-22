import { beforeAll, describe, expect, it } from "vitest";
import { buildSenaModel } from "../model";
import { lessonStudySenaContract } from "../pilot-assets";
import { buildSenaReviewPacket, importSenaReviewPacket } from "../review-packet";

let basePacket: ReturnType<typeof buildSenaReviewPacket>;

beforeAll(() => {
  basePacket = buildSenaReviewPacket(buildSenaModel(lessonStudySenaContract), {
    generatedAt: "2026-08-23T00:00:00.000Z",
    sourceDataset: lessonStudySenaContract,
    evidenceLimit: 500
  });
});

describe("Round 23 review-packet import work bounds", () => {
  it("rejects oversized pilot export-artifact membership before accepting extra schema keys", () => {
    const packet = structuredClone(basePacket);
    const manifest = packet.contents.pilotPackageManifest;
    const extras = Array.from(
      { length: 257 - manifest.exportArtifacts.length },
      (_, index) => `extra-artifact-${index}.json`
    );
    manifest.exportArtifacts = [...manifest.exportArtifacts, ...extras];
    manifest.exportArtifactSchemas = {
      ...manifest.exportArtifactSchemas,
      ...Object.fromEntries(extras.map((filename) => [filename, "sena-test-artifact/v1"]))
    };

    expect(() => importSenaReviewPacket(packet)).toThrow(
      /pilotPackageManifest\.exportArtifacts must contain at most 256 items/i
    );
  });

  it("rejects oversized pilot asset membership before pairwise href scans", () => {
    const packet = structuredClone(basePacket);
    const manifest = packet.contents.pilotPackageManifest;
    const extras = Array.from(
      { length: 257 - manifest.assets.sample.length },
      (_, index) => `/sena-pilot/sample/extra-${index}.json`
    );
    manifest.assets.sample = [...manifest.assets.sample, ...extras];
    manifest.assetIntegrity = [
      ...manifest.assetIntegrity,
      ...extras.map((href) => ({
        href,
        kind: "sample" as const,
        format: "json" as const,
        bytes: 1,
        sha256: "a".repeat(64)
      }))
    ];

    expect(() => importSenaReviewPacket(packet)).toThrow(
      /pilotPackageManifest\.assets\.sample must contain at most 256 items/i
    );
  });

  it("rejects oversized handoff membership before artifact lookups", () => {
    const packet = structuredClone(basePacket);
    const manifest = packet.contents.pilotPackageManifest;
    const extras = Array.from(
      { length: 257 - manifest.handoffChecks.length },
      (_, index) => ({
        id: `extra-check-${index}`,
        label: `Extra check ${index}`,
        artifact: manifest.exportArtifacts[0],
        expectedEvidence: ["bounded-test-evidence"]
      })
    );
    manifest.handoffChecks = [...manifest.handoffChecks, ...extras];

    expect(() => importSenaReviewPacket(packet)).toThrow(
      /pilotPackageManifest\.handoffChecks must contain at most 256 items/i
    );
  });
});
