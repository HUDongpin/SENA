import { beforeAll, describe, expect, it, vi } from "vitest";
import { buildSenaModel } from "../model";
import {
  buildSenaAnalysisConfigHash,
  buildSenaDatasetContentHash
} from "../data-contract-audit";
import { lessonStudySenaContract } from "../pilot-assets";
import { buildSenaReviewPacket, importSenaReviewPacket } from "../review-packet";

let basePacket: ReturnType<typeof buildSenaReviewPacket>;

function nonJsonValuePaths(value: unknown) {
  const paths: string[] = [];
  const visit = (candidate: unknown, path: string) => {
    if (candidate === undefined ||
      (typeof candidate === "number" && !Number.isFinite(candidate)) ||
      typeof candidate === "bigint" ||
      typeof candidate === "symbol" ||
      typeof candidate === "function") {
      paths.push(`${path}=${String(candidate)} (${typeof candidate})`);
      return;
    }
    if (candidate === null || typeof candidate !== "object") return;
    for (const [key, descriptor] of Object.entries(Object.getOwnPropertyDescriptors(candidate))) {
      if (descriptor.enumerable && "value" in descriptor) visit(descriptor.value, `${path}.${key}`);
    }
  };
  visit(value, "$packet");
  return paths;
}

beforeAll(() => {
  basePacket = buildSenaReviewPacket(buildSenaModel(lessonStudySenaContract), {
    generatedAt: "2026-08-23T00:00:00.000Z",
    sourceDataset: lessonStudySenaContract,
    evidenceLimit: 500
  });
});

describe("Round 23 review-packet import work bounds", () => {
  it.each([
    {
      label: "sparse",
      mutate: (packet: typeof basePacket) => {
        packet.contents.projectSnapshot.analysis.pairReport = new Array(16) as never;
      }
    },
    {
      label: "cyclic",
      mutate: (packet: typeof basePacket) => {
        const cycle: Record<string, unknown> = {};
        cycle.self = cycle;
        (packet.contents.projectSnapshot as typeof packet.contents.projectSnapshot & Record<string, unknown>)
          .restoreCycle = cycle;
      }
    }
  ])("admits the $label embedded snapshot before outer packet clone/normalization", ({ mutate }) => {
    const packet = structuredClone(basePacket);
    mutate(packet);
    const clone = vi.spyOn(globalThis, "structuredClone");
    try {
      expect(() => importSenaReviewPacket(packet)).toThrow(/structural admission limit/i);
      expect(clone).not.toHaveBeenCalled();
    } finally {
      clone.mockRestore();
    }
  });

  it("rejects an undefined embedded-snapshot member before outer packet clone/normalization", () => {
    const packet = structuredClone(basePacket);
    expect(nonJsonValuePaths(packet)).toEqual([]);
    (packet.contents.projectSnapshot as typeof packet.contents.projectSnapshot & Record<string, unknown>)
      .undefinedCarrier = undefined;
    const clone = vi.spyOn(globalThis, "structuredClone");
    try {
      expect(() => importSenaReviewPacket(packet)).toThrow(/structural admission limit/i);
      expect(clone).not.toHaveBeenCalled();
    } finally {
      clone.mockRestore();
    }
  });

  it("runs embedded canonical work admission before any outer compatibility clone", () => {
    const packet = structuredClone(basePacket);
    const snapshot = packet.contents.projectSnapshot;
    snapshot.dataset.codebook = Array.from({ length: 100 }, (_, index) => ({
      id: `active-code-${index}`,
      label: `Active code ${index}`,
      family: "Review packet work admission",
      description: "Every declared code is connected in one segment.",
      color: "#64748b"
    }));
    snapshot.dataset.coded_segments[0].codes = snapshot.dataset.codebook.map((code) => code.id);
    snapshot.source.sourceDataset = structuredClone(snapshot.dataset);
    snapshot.source.sourceDatasetCounts.codes = 100;
    const runIdentity = {
      hashAlgorithm: "sena-stable-fnv1a32/v1" as const,
      datasetVersion: snapshot.dataset.metadata?.datasetVersion ?? "unversioned",
      datasetContentHash: buildSenaDatasetContentHash(snapshot.dataset),
      configHash: buildSenaAnalysisConfigHash(snapshot.reproducibility.buildOptions)
    };
    packet.contents.runtimeBundle.runtimes.sena.operatorDiagnostics.runIdentity = runIdentity;
    packet.contents.runtimeBundle.report.operatorDiagnostics.runIdentity = structuredClone(runIdentity);
    packet.contents.reportJson.operatorDiagnostics.runIdentity = structuredClone(runIdentity);
    snapshot.report.operatorDiagnostics.runIdentity = structuredClone(runIdentity);

    const clone = vi.spyOn(globalThis, "structuredClone");
    try {
      expect(() => importSenaReviewPacket(packet)).toThrow(/canonical analysis work budget/i);
      expect(clone).not.toHaveBeenCalled();
    } finally {
      clone.mockRestore();
    }
  });

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
