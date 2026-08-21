import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync
} from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import {
  brotliCompressSync,
  brotliDecompressSync,
  constants as zlibConstants
} from "node:zlib";
import { describe, expect, it } from "vitest";

const PACKAGE_ROOT = fileURLToPath(new URL("../../../", import.meta.url));
const FIXTURE_PATH = path.join(
  PACKAGE_ROOT,
  "lib/sena/__tests__/fixtures/sena-review-packet-14bb306.json.br.b64"
);
const PROVENANCE_PATH = path.join(
  PACKAGE_ROOT,
  "lib/sena/__tests__/fixtures/sena-review-packet-14bb306.provenance.json"
);
const VERIFIER_PATH = path.join(PACKAGE_ROOT, "scripts/verify-sena-14bb306-fixture.mjs");
const APPROVED_TEMP_ROOT = path.join(PACKAGE_ROOT, ".tmp/codex-pr-a-round5");

const BASE_COMMIT = "14bb3067adc7df6c985785d57d62a54761839555";
const PAYLOAD_SHA256 = "e43c07b81f7d6bd409d9d1c4fcc1ce26dfd6d3cb84be4b5c5ff61c87fddae6c9";
const PAYLOAD_UTF8_BYTES = 2_450_487;
const PAYLOAD_JSON_CHARACTERS = 2_431_543;
const DATASET_SHA256 = "ca12ef432ced9635f1d415cc7488e699ca437f7a32dc55d11663ba0c901ce8c9";
const OPTIONS_SHA256 = "47376030ccb3a495df69c370aec11f67266179958b4a5202733cb851e316479b";
const PACKAGE_LOCK_SHA256 = "832a49ed5e719d5a9b55b5e7567d81d56203f96bac4ffee6739b1ee7bdb68666";
const FIXED_TIME = "2026-08-21T00:00:00.000Z";

function sha256(value: string | Buffer) {
  return createHash("sha256").update(value).digest("hex");
}

function readFixture() {
  const [metadata, ...payload] = readFileSync(FIXTURE_PATH, "utf8").trim().split(/\r?\n/);
  const json = brotliDecompressSync(Buffer.from(payload.join(""), "base64")).toString("utf8");
  return { metadata, json };
}

function runVerifier(args: string[], tempDirectory: string) {
  return spawnSync(process.execPath, [VERIFIER_PATH, ...args], {
    cwd: PACKAGE_ROOT,
    encoding: "utf8",
    env: {
      ...process.env,
      TMPDIR: tempDirectory,
      TMP: tempDirectory,
      TEMP: tempDirectory
    }
  });
}

describe("historical 14bb306 fixture provenance", () => {
  it("binds the artifact to independent full-SHA, input, option, lockfile, runtime, and byte-count anchors", () => {
    expect(existsSync(PROVENANCE_PATH)).toBe(true);
    if (!existsSync(PROVENANCE_PATH)) return;

    const provenance = JSON.parse(readFileSync(PROVENANCE_PATH, "utf8")) as {
      schemaVersion: string;
      fixture: {
        path: string;
        payloadSha256: string;
        utf8Bytes: number;
        jsonCharacters: number;
      };
      source: {
        baseCommit: string;
        dataset: {
          modulePath: string;
          exportName: string;
          canonicalSerialization: string;
          sha256: string;
          utf8Bytes: number;
          recordCounts: Record<string, number>;
        };
        buildOptions: {
          canonicalSerialization: string;
          sha256: string;
          utf8Bytes: number;
          value: Record<string, unknown>;
        };
      };
      generation: {
        generatedAt: string;
        command: string;
        nodeVersion: string;
        v8Version: string;
        brotliVersion: string;
        platform: string;
        architecture: string;
        packageLock: { path: string; sha256: string; utf8Bytes: number };
        packages: Record<string, string>;
      };
    };
    const { metadata, json } = readFixture();

    expect(provenance).toMatchObject({
      schemaVersion: "sena-historical-fixture-provenance/v1",
      fixture: {
        path: "lib/sena/__tests__/fixtures/sena-review-packet-14bb306.json.br.b64",
        payloadSha256: PAYLOAD_SHA256,
        utf8Bytes: PAYLOAD_UTF8_BYTES,
        jsonCharacters: PAYLOAD_JSON_CHARACTERS
      },
      source: {
        baseCommit: BASE_COMMIT,
        dataset: {
          modulePath: "lib/sena/pilot-assets.ts",
          exportName: "lessonStudySenaContract",
          canonicalSerialization: "JSON.stringify",
          sha256: DATASET_SHA256,
          utf8Bytes: 8_989,
          recordCounts: {
            people: 4,
            interactions: 8,
            utterances: 10,
            coded_segments: 10,
            codebook: 7
          }
        },
        buildOptions: {
          canonicalSerialization: "JSON.stringify",
          sha256: OPTIONS_SHA256,
          utf8Bytes: 324,
          value: {
            alpha: 1,
            beta: 1,
            gamma: 1,
            normalization: "max",
            bridgeWeightRule: "count",
            direction: "directed",
            deg_convention: "row-sum",
            delta: "shortest_path_reciprocal_weight",
            Phi: "classical_mds",
            d: 2,
            seed: 0,
            undirectedSocial: false,
            temporal: {
              mode: "stage",
              movingWindowSize: 3,
              movingWindowStep: 1,
              turnWindowRadius: 1
            }
          }
        }
      },
      generation: {
        generatedAt: FIXED_TIME,
        command: "npm run sena:fixture:verify",
        nodeVersion: "v24.15.0",
        v8Version: "13.6.233.17-node.48",
        brotliVersion: "1.2.0",
        platform: "darwin",
        architecture: "arm64",
        packageLock: {
          path: "package-lock.json",
          sha256: PACKAGE_LOCK_SHA256,
          utf8Bytes: 336_460
        },
        packages: {
          "jena-js": "0.6.2",
          "sna.js": "0.4.0",
          vite: "8.1.4",
          vitest: "4.1.10",
          typescript: "5.9.3"
        }
      }
    });
    expect(metadata).toBe(
      `# SENA historical fixture; baseCommit=${BASE_COMMIT}; generatedAt=${FIXED_TIME}; ` +
      `payloadSha256=${PAYLOAD_SHA256}; utf8Bytes=${PAYLOAD_UTF8_BYTES}; ` +
      `jsonCharacters=${PAYLOAD_JSON_CHARACTERS}`
    );
    expect(sha256(json)).toBe(PAYLOAD_SHA256);
    expect(Buffer.byteLength(json, "utf8")).toBe(PAYLOAD_UTF8_BYTES);
    expect(json.length).toBe(PAYLOAD_JSON_CHARACTERS);
  });

  it("reconstructs the fixture from the exact base archive and independently verifies it", () => {
    expect(existsSync(VERIFIER_PATH)).toBe(true);
    if (!existsSync(VERIFIER_PATH)) return;

    mkdirSync(APPROVED_TEMP_ROOT, { recursive: true });
    const runDirectory = mkdtempSync(path.join(APPROVED_TEMP_ROOT, "fixture-rebuild-test-"));
    try {
      const result = runVerifier([], runDirectory);
      expect(result.status, `${result.stdout}\n${result.stderr}`).toBe(0);
      expect(result.stdout).toContain(`verified ${BASE_COMMIT}`);
      expect(result.stdout).toContain(PAYLOAD_SHA256);
    } finally {
      rmSync(runDirectory, { recursive: true, force: true });
    }
  }, 30_000);

  it("rejects metadata-only substitution", () => {
    expect(existsSync(VERIFIER_PATH) && existsSync(PROVENANCE_PATH)).toBe(true);
    if (!existsSync(VERIFIER_PATH) || !existsSync(PROVENANCE_PATH)) return;

    mkdirSync(APPROVED_TEMP_ROOT, { recursive: true });
    const runDirectory = mkdtempSync(path.join(APPROVED_TEMP_ROOT, "fixture-metadata-tamper-test-"));
    try {
      const tamperedFixture = path.join(runDirectory, "tampered-metadata.json.br.b64");
      const source = readFileSync(FIXTURE_PATH, "utf8");
      writeFileSync(tamperedFixture, source.replace(BASE_COMMIT, `${BASE_COMMIT.slice(0, -1)}0`), "utf8");
      const result = runVerifier([
        "--skip-rebuild",
        "--fixture",
        tamperedFixture,
        "--provenance",
        PROVENANCE_PATH
      ], runDirectory);
      expect(result.status).not.toBe(0);
      expect(`${result.stdout}\n${result.stderr}`).toContain("provenance");
    } finally {
      rmSync(runDirectory, { recursive: true, force: true });
    }
  });

  it("rejects payload, metadata, and manifest digest substitution performed together", () => {
    expect(existsSync(VERIFIER_PATH) && existsSync(PROVENANCE_PATH)).toBe(true);
    if (!existsSync(VERIFIER_PATH) || !existsSync(PROVENANCE_PATH)) return;

    mkdirSync(APPROVED_TEMP_ROOT, { recursive: true });
    const runDirectory = mkdtempSync(path.join(APPROVED_TEMP_ROOT, "fixture-payload-tamper-test-"));
    try {
      const { json } = readFixture();
      const payload = JSON.parse(json) as Record<string, unknown>;
      payload.title = "Coherently forged historical packet";
      const tamperedJson = JSON.stringify(payload);
      const tamperedSha = sha256(tamperedJson);
      const tamperedBytes = Buffer.byteLength(tamperedJson, "utf8");
      const tamperedFixture = path.join(runDirectory, "tampered-payload.json.br.b64");
      const tamperedProvenance = path.join(runDirectory, "tampered-provenance.json");
      const compressed = brotliCompressSync(Buffer.from(tamperedJson, "utf8"), {
        params: { [zlibConstants.BROTLI_PARAM_QUALITY]: 11 }
      }).toString("base64");
      const header =
        `# SENA historical fixture; baseCommit=${BASE_COMMIT}; generatedAt=${FIXED_TIME}; ` +
        `payloadSha256=${tamperedSha}; utf8Bytes=${tamperedBytes}; ` +
        `jsonCharacters=${tamperedJson.length}`;
      writeFileSync(tamperedFixture, `${header}\n${compressed}\n`, "utf8");

      const provenance = JSON.parse(readFileSync(PROVENANCE_PATH, "utf8")) as {
        fixture: { payloadSha256: string; utf8Bytes: number; jsonCharacters: number };
      };
      provenance.fixture.payloadSha256 = tamperedSha;
      provenance.fixture.utf8Bytes = tamperedBytes;
      provenance.fixture.jsonCharacters = tamperedJson.length;
      writeFileSync(tamperedProvenance, `${JSON.stringify(provenance, null, 2)}\n`, "utf8");

      const result = runVerifier([
        "--skip-rebuild",
        "--fixture",
        tamperedFixture,
        "--provenance",
        tamperedProvenance
      ], runDirectory);
      expect(result.status).not.toBe(0);
      expect(`${result.stdout}\n${result.stderr}`).toContain(PAYLOAD_SHA256);
    } finally {
      rmSync(runDirectory, { recursive: true, force: true });
    }
  });
});
