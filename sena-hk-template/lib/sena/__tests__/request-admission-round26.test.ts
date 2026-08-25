import { describe, expect, it } from "vitest";
import {
  assertSenaRequestExactKeys,
  assertSenaRequestStringTreeBudget,
  readSenaBoundedJsonObjectRequest,
  readSenaBoundedMultipartRequest
} from "../enterprise/request-admission";

const codes = {
  contentTypeInvalid: "fixture_content_type_invalid",
  requestInvalid: "fixture_request_invalid",
  requestTooLarge: "fixture_request_too_large",
  requestTooFragmented: "fixture_request_too_fragmented",
  multipartLimitsExceeded: "fixture_multipart_limits_exceeded"
};

function streamedRequest(chunks: Uint8Array[], headers: Record<string, string>) {
  let index = 0;
  return new Request("https://sena.example.test/api/sena/fixture", {
    method: "POST",
    headers,
    body: new ReadableStream<Uint8Array>({
      pull(controller) {
        if (index >= chunks.length) {
          controller.close();
          return;
        }
        controller.enqueue(chunks[index]);
        index += 1;
      }
    }),
    duplex: "half"
  } as RequestInit & { duplex: "half" });
}

describe("shared SENA request admission", () => {
  it("rejects understated streamed JSON bytes and zero-byte chunk storms before parsing", async () => {
    const oversized = streamedRequest([
      new TextEncoder().encode('{"note":"'),
      new TextEncoder().encode("x".repeat(128))
    ], {
      "content-type": "application/json",
      "content-length": "1"
    });
    await expect(readSenaBoundedJsonObjectRequest(oversized, {
      label: "Fixture",
      maximumBytes: 64,
      maximumChunks: 4,
      codes
    })).rejects.toMatchObject({ status: 413, code: "fixture_request_too_large" });

    const fragmented = streamedRequest([
      new Uint8Array(),
      new Uint8Array(),
      new Uint8Array(),
      new Uint8Array(),
      new Uint8Array(),
      new TextEncoder().encode("{}")
    ], { "content-type": "application/json" });
    await expect(readSenaBoundedJsonObjectRequest(fragmented, {
      label: "Fixture",
      maximumBytes: 64,
      maximumChunks: 4,
      codes
    })).rejects.toMatchObject({ status: 413, code: "fixture_request_too_fragmented" });
  });

  it("accepts only a bounded application/json object and reconstructs its exact body", async () => {
    const admitted = await readSenaBoundedJsonObjectRequest(new Request(
      "https://sena.example.test/api/sena/fixture",
      {
        method: "POST",
        headers: { "content-type": "application/json; charset=utf-8" },
        body: JSON.stringify({ projectId: "project_1" })
      }
    ), {
      label: "Fixture",
      maximumBytes: 64,
      maximumChunks: 4,
      codes
    });

    expect(admitted.body).toEqual({ projectId: "project_1" });
    await expect(admitted.request.clone().json()).resolves.toEqual(admitted.body);
    expect(admitted.request.headers.get("content-length")).toBe("25");
  });

  it("preflights multipart file count, per-file bytes, aggregate bytes, and text fields before formData", async () => {
    const tooManyFiles = new FormData();
    tooManyFiles.append("files", new File(["a"], "a.csv", { type: "text/csv" }));
    tooManyFiles.append("files", new File(["b"], "b.csv", { type: "text/csv" }));
    const request = new Request("https://sena.example.test/api/sena/fixture", {
      method: "POST",
      body: tooManyFiles
    });

    await expect(readSenaBoundedMultipartRequest(request, {
      label: "Fixture",
      maximumBytes: 4_096,
      maximumChunks: 64,
      codes,
      multipart: {
        maximumFiles: 1,
        maximumFileBytes: 8,
        maximumAggregateFileBytes: 8,
        maximumFields: 4,
        maximumFieldBytes: 16,
        maximumAggregateFieldBytes: 32
      }
    })).rejects.toMatchObject({ status: 413, code: "fixture_multipart_limits_exceeded" });

    const oversizedField = new FormData();
    oversizedField.append("title", "x".repeat(17));
    await expect(readSenaBoundedMultipartRequest(new Request(
      "https://sena.example.test/api/sena/fixture",
      { method: "POST", body: oversizedField }
    ), {
      label: "Fixture",
      maximumBytes: 4_096,
      maximumChunks: 64,
      codes,
      multipart: {
        maximumFiles: 1,
        maximumFileBytes: 8,
        maximumAggregateFileBytes: 8,
        maximumFields: 4,
        maximumFieldBytes: 16,
        maximumAggregateFieldBytes: 32
      }
    })).rejects.toMatchObject({ status: 413, code: "fixture_multipart_limits_exceeded" });
  });

  it("rejects unknown request keys and over-budget nested text without coercing values", () => {
    expect(() => assertSenaRequestExactKeys(
      { projectId: "project_1", unexpected: true },
      ["projectId"],
      { label: "Fixture", code: "fixture_fields_invalid" }
    )).toThrowError(expect.objectContaining({ code: "fixture_fields_invalid" }));

    expect(() => assertSenaRequestStringTreeBudget({
      review: { notes: "x".repeat(17) }
    }, {
      label: "Fixture review",
      maximumStringBytes: 16,
      maximumTotalBytes: 32,
      maximumNodes: 16,
      code: "fixture_fields_invalid"
    })).toThrowError(expect.objectContaining({ code: "fixture_fields_invalid" }));
  });
});
