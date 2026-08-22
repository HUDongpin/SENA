import { createHash } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { POST } from "../../../app/api/sena/snapshot/restore/route";
import {
  SENA_SNAPSHOT_RESTORE_DEFAULT_MAX_JSON_CONTAINERS,
  SENA_SNAPSHOT_RESTORE_DEFAULT_MAX_JSON_CONTAINER_MEMBERS,
  SENA_SNAPSHOT_RESTORE_DEFAULT_MAX_JSON_TOTAL_MEMBERS,
  SENA_SNAPSHOT_RESTORE_MIN_JSON_STRUCTURAL_TOKENS,
  SenaSnapshotRestoreRequestError,
  readSenaSnapshotRestoreRequest,
  type SenaSnapshotRestoreResult
} from "../snapshot-restore";
import { buildSenaModel } from "../model";
import { lessonStudySenaContract } from "../pilot-assets";
import { buildSenaReviewPacket, importSenaReviewPacket } from "../review-packet";
import { SENA_SCHEMA_VERSIONS } from "../schema-registry";
import { buildSenaProjectSnapshot, importSenaProjectSnapshot } from "../snapshot";
import { loadSena14bb306ReviewPacketFixture } from "./fixtures/sena-14bb306-fixture";

const endpoint = "https://sena.example.test/api/sena/snapshot/restore";

function sha256(value: string) {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function restoreRequest(source: unknown, headers: HeadersInit = {}) {
  return new Request(endpoint, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      origin: "https://sena.example.test",
      "sec-fetch-site": "same-origin",
      ...headers
    },
    body: JSON.stringify({
      schemaVersion: SENA_SCHEMA_VERSIONS.snapshotRestoreRequest,
      source
    })
  });
}

function currentSnapshot() {
  return buildSenaProjectSnapshot(buildSenaModel(lessonStudySenaContract), {
    generatedAt: "2026-08-23T00:00:00.000Z",
    sourceDataset: lessonStudySenaContract
  });
}

function currentReviewPacket() {
  return buildSenaReviewPacket(buildSenaModel(lessonStudySenaContract), {
    generatedAt: "2026-08-23T00:00:00.000Z",
    sourceDataset: lessonStudySenaContract,
    evidenceLimit: 500
  });
}

function canonicalHundredCodeSnapshot() {
  const dataset = structuredClone(lessonStudySenaContract);
  dataset.codebook = [
    ...dataset.codebook,
    ...Array.from({ length: 100 - dataset.codebook.length }, (_, index) => ({
      id: `unused-code-${String(index + 1).padStart(3, "0")}`,
      label: `Unused code ${index + 1}`,
      family: "Restore admission fixture",
      description: "Valid unused code retained to exercise canonical builder output bounds.",
      color: "#64748b"
    }))
  ];
  return buildSenaProjectSnapshot(buildSenaModel(dataset), {
    generatedAt: "2026-08-23T00:00:00.000Z",
    sourceDataset: dataset
  });
}

describe("SENA stateless snapshot restore route", () => {
  it("returns an independently hashable canonical snapshot without persistence or audit semantics", async () => {
    const source = currentSnapshot();
    const response = await POST(restoreRequest(source));
    const result = await response.json() as SenaSnapshotRestoreResult;

    expect(response.status).toBe(200);
    expect(result).toMatchObject({
      schemaVersion: "sena-snapshot-restore-result/v1",
      sourceKind: "project-snapshot",
      reviewPacket: null,
      processing: {
        persisted: false,
        audited: false,
        mode: "stateless-canonical-read-projection"
      }
    });
    expect(result.snapshot).toEqual(source);
    expect(result.integrity).toEqual({
      hashAlgorithm: "sha256",
      sourcePayloadSha256: sha256(JSON.stringify(source)),
      normalizedSnapshotSha256: sha256(JSON.stringify(result.snapshot))
    });
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(response.headers.get("x-sena-snapshot-restore-persisted")).toBe("false");
    expect(response.headers.get("x-sena-snapshot-restore-source-sha256"))
      .toBe(result.integrity.sourcePayloadSha256);
    expect(response.headers.get("x-sena-snapshot-restore-normalized-sha256"))
      .toBe(result.integrity.normalizedSnapshotSha256);
  });

  it("round-trips the historical review packet through the canonical read-only projection", async () => {
    const source = loadSena14bb306ReviewPacketFixture();
    const expected = importSenaReviewPacket(source);
    const response = await POST(restoreRequest(source));
    const result = await response.json() as SenaSnapshotRestoreResult;

    expect(response.status).toBe(200);
    expect(result.sourceKind).toBe("review-packet");
    expect(result.snapshot).toEqual(expected.contents.projectSnapshot);
    expect(result.reviewPacket).toEqual({
      auditStatus: expected.reviewPacketAudit.status,
      pilotReadinessStatus: expected.summary.pilotReadinessStatus
    });
    expect(result.snapshot.report.fusionMathAudit).toMatchObject({
      schemaVersion: "sena-fusion-math-audit/v2",
      sourceSchemaVersion: "sena-fusion-math-audit/v1"
    });
    expect(result.snapshot.report.codingReliabilityGate).toMatchObject({
      schemaVersion: "sena-coding-reliability-gate/v2",
      sourceSchemaVersion: "sena-coding-reliability-gate/v1"
    });
    expect(result.processing).toEqual({
      persisted: false,
      audited: false,
      mode: "stateless-canonical-read-projection"
    });
  });

  it("round-trips the current built-in review-packet builder output within the byte ceiling", async () => {
    const source = currentReviewPacket();
    const raw = JSON.stringify({
      schemaVersion: SENA_SCHEMA_VERSIONS.snapshotRestoreRequest,
      source
    });
    expect(Buffer.byteLength(raw, "utf8")).toBeLessThan(16 * 1024 * 1024);

    const response = await POST(restoreRequest(source));
    const result = await response.json() as SenaSnapshotRestoreResult | { code: string };
    const expected = importSenaReviewPacket(JSON.parse(JSON.stringify(source))).contents.projectSnapshot;

    expect(response.status).toBe(200);
    expect(result).toMatchObject({
      schemaVersion: "sena-snapshot-restore-result/v1",
      sourceKind: "review-packet",
      processing: {
        persisted: false,
        audited: false,
        mode: "stateless-canonical-read-projection"
      }
    });
    expect("snapshot" in result ? result.snapshot : null).toEqual(expected);
  });

  it("round-trips a builder-generated 100-code canonical snapshot below the byte ceiling", async () => {
    const source = canonicalHundredCodeSnapshot();
    const raw = JSON.stringify({
      schemaVersion: SENA_SCHEMA_VERSIONS.snapshotRestoreRequest,
      source
    });

    expect(Buffer.byteLength(raw, "utf8")).toBeLessThan(16 * 1024 * 1024);
    expect(importSenaProjectSnapshot(source)).toEqual(source);

    const response = await POST(restoreRequest(source));
    const result = await response.json() as SenaSnapshotRestoreResult | { code: string };

    expect(response.status).toBe(200);
    expect(result).toMatchObject({
      schemaVersion: "sena-snapshot-restore-result/v1",
      sourceKind: "project-snapshot",
      processing: {
        persisted: false,
        audited: false,
        mode: "stateless-canonical-read-projection"
      }
    });
    expect("snapshot" in result ? result.snapshot.source.sourceDatasetCounts.codes : null).toBe(100);
  }, 120_000);

  it("rejects over-cardinality review-packet catalogs with one sanitized route error", async () => {
    const source = currentReviewPacket();
    const manifest = source.contents.pilotPackageManifest;
    const extras = Array.from(
      { length: 257 - manifest.exportArtifacts.length },
      (_, index) => `extra-route-artifact-${index}.json`
    );
    manifest.exportArtifacts = [...manifest.exportArtifacts, ...extras];
    manifest.exportArtifactSchemas = {
      ...manifest.exportArtifactSchemas,
      ...Object.fromEntries(extras.map((filename) => [filename, "sena-test-artifact/v1"]))
    };

    const response = await POST(restoreRequest(source));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: "Snapshot restore source did not pass canonical SENA validation.",
      code: "snapshot_restore_source_invalid"
    });
  });

  it("rejects explicit cross-origin browser traffic before reading the restore source", async () => {
    const response = await POST(restoreRequest(currentSnapshot(), {
      origin: "https://attacker.example",
      "sec-fetch-site": "cross-site"
    }));

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({
      error: "Snapshot restore validation accepts only same-origin browser requests.",
      code: "snapshot_restore_cross_origin_blocked"
    });
  });

  it("accepts browser same-origin metadata when Next reconstructs the request URL with an internal host", async () => {
    const source = currentSnapshot();
    const response = await POST(new Request("http://localhost:3101/api/sena/snapshot/restore", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        host: "127.0.0.1:3101",
        origin: "http://127.0.0.1:3101",
        "sec-fetch-site": "same-origin"
      },
      body: JSON.stringify({
        schemaVersion: SENA_SCHEMA_VERSIONS.snapshotRestoreRequest,
        source
      })
    }));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      schemaVersion: "sena-snapshot-restore-result/v1",
      sourceKind: "project-snapshot",
      processing: { persisted: false, audited: false }
    });
  });

  it("uses the public host and forwarded protocol when Fetch Metadata is unavailable", async () => {
    const source = currentSnapshot();
    const response = await POST(new Request("http://localhost:3101/api/sena/snapshot/restore", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        host: "sena.example.test",
        origin: "https://sena.example.test",
        "x-forwarded-proto": "https"
      },
      body: JSON.stringify({
        schemaVersion: SENA_SCHEMA_VERSIONS.snapshotRestoreRequest,
        source
      })
    }));

    expect(response.status).toBe(200);
  });

  it("rejects same-site cross-origin browser traffic even when the internal request URL shares a host", async () => {
    const response = await POST(new Request("https://sena.example.test/api/sena/snapshot/restore", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        host: "sena.example.test",
        origin: "https://subdomain.sena.example.test",
        "sec-fetch-site": "same-site"
      },
      body: JSON.stringify({
        schemaVersion: SENA_SCHEMA_VERSIONS.snapshotRestoreRequest,
        source: currentSnapshot()
      })
    }));

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toMatchObject({ code: "snapshot_restore_cross_origin_blocked" });
  });

  it("rejects an origin mismatch even when a client claims same-origin Fetch Metadata", async () => {
    const response = await POST(new Request("https://sena.example.test/api/sena/snapshot/restore", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        host: "sena.example.test",
        origin: "https://attacker.example",
        "sec-fetch-site": "same-origin"
      },
      body: JSON.stringify({
        schemaVersion: SENA_SCHEMA_VERSIONS.snapshotRestoreRequest,
        source: currentSnapshot()
      })
    }));

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toMatchObject({ code: "snapshot_restore_cross_origin_blocked" });
  });

  it("enforces the configured byte ceiling before JSON parsing", async () => {
    const request = new Request(endpoint, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{\"schemaVersion\":\"sena-snapshot-restore-request/v1\"}"
    });

    await expect(readSenaSnapshotRestoreRequest(request, {
      SENA_SNAPSHOT_RESTORE_MAX_BYTES: "8"
    })).rejects.toMatchObject({
      name: "SenaSnapshotRestoreRequestError",
      status: 413,
      code: "snapshot_restore_request_too_large"
    } satisfies Partial<SenaSnapshotRestoreRequestError>);
  });

  it("rejects excessive JSON structure before invoking the parser", async () => {
    const raw = `{"schemaVersion":"${SENA_SCHEMA_VERSIONS.snapshotRestoreRequest}","source":{"dataset":{"people":[${"{},".repeat(100_000)}null]}}}`;
    const request = new Request(endpoint, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: raw
    });
    const parse = vi.spyOn(JSON, "parse");

    try {
      await expect(readSenaSnapshotRestoreRequest(request)).rejects.toMatchObject({
        name: "SenaSnapshotRestoreRequestError",
        status: 413,
        code: "snapshot_restore_request_too_complex"
      } satisfies Partial<SenaSnapshotRestoreRequestError>);
      expect(parse).not.toHaveBeenCalled();
    } finally {
      parse.mockRestore();
    }
  });

  it("keeps proportional structural fan-out rejection above the adaptive floor", async () => {
    const raw = `{"schemaVersion":"${SENA_SCHEMA_VERSIONS.snapshotRestoreRequest}","source":{"dataset":{"people":[${"{},".repeat(400_000)}null]}}}`;
    expect(Buffer.byteLength(raw, "utf8")).toBeGreaterThan(1_000_000);
    expect(Buffer.byteLength(raw, "utf8")).toBeLessThan(16 * 1024 * 1024);
    const request = new Request(endpoint, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: raw
    });
    const parse = vi.spyOn(JSON, "parse");

    try {
      await expect(readSenaSnapshotRestoreRequest(request)).rejects.toMatchObject({
        name: "SenaSnapshotRestoreRequestError",
        status: 413,
        code: "snapshot_restore_request_too_complex"
      } satisfies Partial<SenaSnapshotRestoreRequestError>);
      expect(parse).not.toHaveBeenCalled();
    } finally {
      parse.mockRestore();
    }
  });

  it("does not let ignored string padding buy pre-parse structural fan-out", async () => {
    const source = structuredClone(currentSnapshot());
    source.dataset.people = Array.from({ length: 300_000 }, () => ({})) as never;
    const raw = JSON.stringify({
      schemaVersion: SENA_SCHEMA_VERSIONS.snapshotRestoreRequest,
      padding: "x".repeat(8_000_000),
      source
    });
    expect(Buffer.byteLength(raw, "utf8")).toBeLessThan(16 * 1024 * 1024);
    const request = new Request(endpoint, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: raw
    });
    const parse = vi.spyOn(JSON, "parse");
    let response: Response;

    try {
      response = await POST(request);
      expect(response.status).toBe(413);
      expect(parse).not.toHaveBeenCalled();
    } finally {
      parse.mockRestore();
    }
    await expect(response!.json()).resolves.toEqual({
      error: "Snapshot restore request exceeds the supported JSON complexity limit.",
      code: "snapshot_restore_request_too_complex"
    });
  });

  it("excludes escaped string contents from the structural-density allowance", async () => {
    const denseMembers = Array.from({ length: 50_000 }, () => ({}));
    expect(100_004).toBeLessThan(SENA_SNAPSHOT_RESTORE_DEFAULT_MAX_JSON_CONTAINERS);
    expect(50_000).toBeLessThan(SENA_SNAPSHOT_RESTORE_DEFAULT_MAX_JSON_CONTAINER_MEMBERS);
    expect(100_005).toBeLessThan(SENA_SNAPSHOT_RESTORE_DEFAULT_MAX_JSON_TOTAL_MEMBERS);
    expect(300_014).toBeGreaterThan(SENA_SNAPSHOT_RESTORE_MIN_JSON_STRUCTURAL_TOKENS);
    const raw = JSON.stringify({
      schemaVersion: SENA_SCHEMA_VERSIONS.snapshotRestoreRequest,
      padding: String.fromCharCode(92, 34, 91, 93, 123, 125).repeat(1_000_000),
      source: {
        first: denseMembers,
        second: denseMembers
      }
    });
    expect(Buffer.byteLength(raw, "utf8")).toBeLessThan(16 * 1024 * 1024);
    const request = new Request(endpoint, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: raw
    });
    const parse = vi.spyOn(JSON, "parse");
    let response: Response;

    try {
      response = await POST(request);
      expect(response.status).toBe(413);
      expect(parse).not.toHaveBeenCalled();
    } finally {
      parse.mockRestore();
    }
    await expect(response!.json()).resolves.toMatchObject({
      code: "snapshot_restore_request_too_complex"
    });
  });

  it("scales member caps only with an explicit configured byte ceiling", async () => {
    const raw = JSON.stringify({
      schemaVersion: SENA_SCHEMA_VERSIONS.snapshotRestoreRequest,
      source: Array.from({ length: 70_000 }, () => null)
    });
    const request = () => new Request(endpoint, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: raw
    });

    await expect(readSenaSnapshotRestoreRequest(request())).rejects.toMatchObject({
      status: 413,
      code: "snapshot_restore_request_too_complex"
    } satisfies Partial<SenaSnapshotRestoreRequestError>);

    const accepted = await readSenaSnapshotRestoreRequest(request(), {
      SENA_SNAPSHOT_RESTORE_MAX_BYTES: String(32 * 1024 * 1024)
    });
    expect(accepted.source).toHaveLength(70_000);
  });

  it("rejects excessive JSON depth before invoking the parser", async () => {
    const nestedSource = `${"[".repeat(65)}null${"]".repeat(65)}`;
    const raw = `{"schemaVersion":"${SENA_SCHEMA_VERSIONS.snapshotRestoreRequest}","source":${nestedSource}}`;
    const request = new Request(endpoint, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: raw
    });
    const parse = vi.spyOn(JSON, "parse");

    try {
      await expect(readSenaSnapshotRestoreRequest(request)).rejects.toMatchObject({
        name: "SenaSnapshotRestoreRequestError",
        status: 413,
        code: "snapshot_restore_request_too_complex"
      } satisfies Partial<SenaSnapshotRestoreRequestError>);
      expect(parse).not.toHaveBeenCalled();
    } finally {
      parse.mockRestore();
    }
  });

  it("preserves the stable size error when stream cancellation fails", async () => {
    const request = new Request(endpoint, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(new TextEncoder().encode("123456789"));
        },
        cancel() {
          throw new Error("transport cancellation failed");
        }
      }),
      duplex: "half"
    } as RequestInit & { duplex: "half" });

    await expect(readSenaSnapshotRestoreRequest(request, {
      SENA_SNAPSHOT_RESTORE_MAX_BYTES: "8"
    })).rejects.toMatchObject({
      name: "SenaSnapshotRestoreRequestError",
      status: 413,
      code: "snapshot_restore_request_too_large"
    } satisfies Partial<SenaSnapshotRestoreRequestError>);
  });

  it("returns one sanitized source-validation error and never exposes analytical row details", async () => {
    const forged = structuredClone(currentSnapshot());
    forged.source.sourceDataset!.interactions[0].weight = -7;
    const response = await POST(restoreRequest(forged));
    const body = await response.json() as { error: string; code: string };

    expect(response.status).toBe(400);
    expect(body).toEqual({
      error: "Snapshot restore source did not pass canonical SENA validation.",
      code: "snapshot_restore_source_invalid"
    });
    expect(JSON.stringify(body)).not.toContain("interactions[0]");
    expect(JSON.stringify(body)).not.toContain("-7");
  });
});
