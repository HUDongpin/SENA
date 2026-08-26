import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

const endpoint = "https://sena.example.test/api/sena/exports/publication";
const maximumBytes = 65_536;
const maximumChunks = 1_024;

function publicationRequest(
  body: BodyInit,
  csrfToken: string,
  headers: Record<string, string> = {}
) {
  return new Request(endpoint, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-sena-csrf-token": csrfToken,
      ...headers
    },
    body,
    ...((body instanceof ReadableStream) ? { duplex: "half" } : {})
  } as RequestInit & { duplex?: "half" });
}

describe("publication export transport admission", () => {
  const previousDbDir = process.env.SENA_ENTERPRISE_DB_DIR;
  const enterpriseDbDir = mkdtempSync(path.join(tmpdir(), "sena-publication-transport-"));
  let sessionToken = "";
  let csrfToken = "";
  let route: typeof import("../../../app/api/sena/exports/publication/route");

  beforeAll(async () => {
    vi.resetModules();
    process.env.SENA_ENTERPRISE_DB_DIR = enterpriseDbDir;
    vi.doMock("next/headers", () => ({
      cookies: () => ({
        get: (name: string) => name === "sena_session" ? { value: sessionToken } : undefined
      })
    }));
    vi.doMock("@/lib/sena/enterprise", async () => await import("../enterprise"));
    vi.doMock("@/lib/sena/api-helpers", async () => await import("../api-helpers"));
    vi.doMock("@/lib/sena/publication-export", async () => await import("../publication-export"));
    vi.doMock("@/lib/sena/snapshot", async () => await import("../snapshot"));

    const enterprise = await import("../enterprise");
    const registered = enterprise.registerEnterpriseUser({
      name: "Publication Transport Reviewer",
      email: "publication-transport@example.edu",
      password: "sena-secure-123",
      organization: "Publication Transport Lab",
      plan: "lab"
    });
    sessionToken = registered.token;
    csrfToken = enterprise.createEnterpriseCsrfToken(registered.context).token;
    route = await import("../../../app/api/sena/exports/publication/route");
  });

  afterAll(() => {
    vi.restoreAllMocks();
    if (previousDbDir === undefined) delete process.env.SENA_ENTERPRISE_DB_DIR;
    else process.env.SENA_ENTERPRISE_DB_DIR = previousDbDir;
    rmSync(enterpriseDbDir, { recursive: true, force: true });
  });

  function publicationSideEffects() {
    const db = JSON.parse(readFileSync(path.join(enterpriseDbDir, "enterprise-db.json"), "utf8")) as {
      auditLog: Array<{ event: string }>;
      serverJobs: unknown[];
    };
    return {
      exportAuditCount: db.auditLog.filter((entry) => (
        entry.event === "export.run" || entry.event === "export.queue"
      )).length,
      jobCount: db.serverJobs.length
    };
  }

  it("fast-fails an oversized declared Content-Length before JSON parsing or side effects", async () => {
    const parse = vi.spyOn(Request.prototype, "json");
    const before = publicationSideEffects();
    try {
      const response = await route.POST(publicationRequest("{}", csrfToken, {
        "content-length": String(maximumBytes + 1)
      }));

      expect(response.status).toBe(413);
      await expect(response.json()).resolves.toEqual({
        error: `Publication export request exceeds the ${maximumBytes}-byte limit.`,
        code: "publication_export_request_too_large"
      });
      expect(parse).not.toHaveBeenCalled();
      expect(publicationSideEffects()).toEqual(before);
    } finally {
      parse.mockRestore();
    }
  });

  it.each(["abc", "-1", "1.5"])(
    "rejects malformed Content-Length %s before JSON parsing or side effects",
    async (contentLength) => {
      const parse = vi.spyOn(Request.prototype, "json");
      const before = publicationSideEffects();
      try {
        const response = await route.POST(publicationRequest("{}", csrfToken, {
          "content-length": contentLength
        }));

        expect(response.status).toBe(400);
        await expect(response.json()).resolves.toEqual({
          error: "Publication export request must be a JSON object.",
          code: "publication_export_request_invalid"
        });
        expect(parse).not.toHaveBeenCalled();
        expect(publicationSideEffects()).toEqual(before);
      } finally {
        parse.mockRestore();
      }
    }
  );

  it.each(["text/plain", "multipart/form-data", "application/problem+json"])(
    "rejects unsupported %s media before body parsing or side effects",
    async (contentType) => {
      const parse = vi.spyOn(Request.prototype, "json");
      const before = publicationSideEffects();
      try {
        const response = await route.POST(publicationRequest("{}", csrfToken, {
          "content-type": contentType
        }));

        expect(response.status).toBe(400);
        await expect(response.json()).resolves.toEqual({
          error: "Publication export request media type must be application/json.",
          code: "publication_export_content_type_invalid"
        });
        expect(parse).not.toHaveBeenCalled();
        expect(publicationSideEffects()).toEqual(before);
      } finally {
        parse.mockRestore();
      }
    }
  );

  it.each(["absent", "understated"] as const)(
    "caps one oversized streamed chunk with %s Content-Length",
    async (declaration) => {
      const parse = vi.spyOn(Request.prototype, "json");
      const before = publicationSideEffects();
      const body = `${JSON.stringify({ projectId: "missing-project", format: "html" })}${" ".repeat(maximumBytes)}`;
      try {
        const response = await route.POST(publicationRequest(
          body,
          csrfToken,
          declaration === "understated" ? { "content-length": "1" } : {}
        ));

        expect(response.status).toBe(413);
        await expect(response.json()).resolves.toMatchObject({
          code: "publication_export_request_too_large"
        });
        expect(parse).not.toHaveBeenCalled();
        expect(publicationSideEffects()).toEqual(before);
      } finally {
        parse.mockRestore();
      }
    }
  );

  it("caps a zero-byte chunk storm before parsing or side effects", async () => {
    const parse = vi.spyOn(Request.prototype, "json");
    const before = publicationSideEffects();
    let emitted = 0;
    const body = new ReadableStream<Uint8Array>({
      pull(controller) {
        if (emitted < maximumChunks + 1) {
          emitted += 1;
          controller.enqueue(new Uint8Array());
          return;
        }
        controller.enqueue(new TextEncoder().encode("{}"));
        controller.close();
      }
    });
    try {
      const response = await route.POST(publicationRequest(body, csrfToken));

      expect(response.status).toBe(413);
      await expect(response.json()).resolves.toEqual({
        error: "Publication export request uses too many streamed chunks.",
        code: "publication_export_request_too_fragmented"
      });
      expect(emitted).toBeLessThanOrEqual(maximumChunks + 1);
      expect(parse).not.toHaveBeenCalled();
      expect(publicationSideEffects()).toEqual(before);
    } finally {
      parse.mockRestore();
    }
  });

  it("admits an exactly 65536-byte JSON object and proceeds to project lookup", async () => {
    const envelope = JSON.stringify({ projectId: "missing-project", format: "html" });
    const body = `${envelope}${" ".repeat(maximumBytes - Buffer.byteLength(envelope))}`;

    const response = await route.POST(publicationRequest(body, csrfToken));

    expect(Buffer.byteLength(body)).toBe(maximumBytes);
    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toMatchObject({ code: "project_not_found" });
  });

  it("cancels an oversized stream and preserves the stable 413 when cancellation fails", async () => {
    let cancelCalls = 0;
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new Uint8Array(maximumBytes + 1));
      },
      cancel() {
        cancelCalls += 1;
        throw new Error("synthetic cancel failure");
      }
    });

    const response = await route.POST(publicationRequest(body, csrfToken));

    expect(response.status).toBe(413);
    await expect(response.json()).resolves.toMatchObject({
      code: "publication_export_request_too_large"
    });
    expect(cancelCalls).toBe(1);
  });

  it("maps a rejecting request stream to a sanitized 400 without export side effects", async () => {
    const before = publicationSideEffects();
    const body = new ReadableStream<Uint8Array>({
      pull() {
        throw new Error("forged-secret stream failure");
      }
    });

    const response = await route.POST(publicationRequest(body, csrfToken));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: "Publication export request must be a JSON object.",
      code: "publication_export_request_invalid"
    });
    expect(publicationSideEffects()).toEqual(before);
  });

  it.each([
    ["malformed", "{"],
    ["null", "null"],
    ["array", "[]"]
  ])("rejects a %s JSON control envelope with one sanitized 400", async (_label, body) => {
    const parse = vi.spyOn(Request.prototype, "json");
    const before = publicationSideEffects();
    try {
      const response = await route.POST(publicationRequest(body, csrfToken));

      expect(response.status).toBe(400);
      await expect(response.json()).resolves.toEqual({
        error: "Publication export request must be a JSON object.",
        code: "publication_export_request_invalid"
      });
      expect(parse).not.toHaveBeenCalled();
      expect(publicationSideEffects()).toEqual(before);
    } finally {
      parse.mockRestore();
    }
  });
});
