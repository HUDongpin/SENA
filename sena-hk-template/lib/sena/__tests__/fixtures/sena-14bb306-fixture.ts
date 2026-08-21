import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { brotliDecompressSync } from "node:zlib";

const REVIEW_PACKET_SHA256 = "e43c07b81f7d6bd409d9d1c4fcc1ce26dfd6d3cb84be4b5c5ff61c87fddae6c9";
const PROVENANCE_SHA256 = "56745167a8e91b86a404348f8bef7a59b2c2b6998238981d41a3eb6809a0d7e2";
const BASE_COMMIT = "14bb3067adc7df6c985785d57d62a54761839555";
const FIXED_TIME = "2026-08-21T00:00:00.000Z";
const REVIEW_PACKET_UTF8_BYTES = 2_450_487;
const REVIEW_PACKET_JSON_CHARACTERS = 2_431_543;
const EXPECTED_HEADER =
  `# SENA historical fixture; baseCommit=${BASE_COMMIT}; generatedAt=${FIXED_TIME}; ` +
  `payloadSha256=${REVIEW_PACKET_SHA256}; utf8Bytes=${REVIEW_PACKET_UTF8_BYTES}; ` +
  `jsonCharacters=${REVIEW_PACKET_JSON_CHARACTERS}`;

export function loadSena14bb306ReviewPacketFixture(): unknown {
  const provenance = readFileSync(
    new URL("./sena-review-packet-14bb306.provenance.json", import.meta.url),
    "utf8"
  );
  const fixture = readFileSync(
    new URL("./sena-review-packet-14bb306.json.br.b64", import.meta.url),
    "utf8"
  ).trim().split(/\r?\n/);
  const [metadata, ...payload] = fixture;
  const json = brotliDecompressSync(Buffer.from(payload.join(""), "base64")).toString("utf8");
  if (
    metadata !== EXPECTED_HEADER ||
    createHash("sha256").update(provenance).digest("hex") !== PROVENANCE_SHA256 ||
    createHash("sha256").update(json).digest("hex") !== REVIEW_PACKET_SHA256 ||
    Buffer.byteLength(json, "utf8") !== REVIEW_PACKET_UTF8_BYTES ||
    json.length !== REVIEW_PACKET_JSON_CHARACTERS
  ) {
    throw new Error("Historical 14bb306 review-packet fixture provenance check failed.");
  }
  return JSON.parse(json) as unknown;
}
