import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { brotliDecompressSync } from "node:zlib";

const REVIEW_PACKET_SHA256 = "e43c07b81f7d6bd409d9d1c4fcc1ce26dfd6d3cb84be4b5c5ff61c87fddae6c9";

export function loadSena14bb306ReviewPacketFixture(): unknown {
  const fixture = readFileSync(
    new URL("./sena-review-packet-14bb306.json.br.b64", import.meta.url),
    "utf8"
  ).trim().split(/\r?\n/);
  const [metadata, ...payload] = fixture;
  const json = brotliDecompressSync(Buffer.from(payload.join(""), "base64")).toString("utf8");
  if (!metadata.includes("commit 14bb306") ||
    createHash("sha256").update(json).digest("hex") !== REVIEW_PACKET_SHA256) {
    throw new Error("Historical 14bb306 review-packet fixture provenance check failed.");
  }
  return JSON.parse(json) as unknown;
}
