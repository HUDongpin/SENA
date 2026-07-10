import { cpSync, existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { createCipheriv, createHash, randomBytes } from "node:crypto";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import { RouteMemoryPostgres } from "./postgres-primary-route-fixture";

describe("SENA uploads route", () => {
  it("persists upload registry, list, and storage verification through Postgres primary state", async () => {
    const enterpriseDbDir = mkdtempSync(path.join(tmpdir(), "sena-uploads-postgres-route-"));
    const pg = new RouteMemoryPostgres();
    let sessionToken = "";
    vi.resetModules();
    process.env.SENA_ENTERPRISE_DB_DIR = enterpriseDbDir;
    process.env.SENA_ENTERPRISE_DB_ADAPTER = "postgres";
    process.env.SENA_ENTERPRISE_STATE_STORE = "postgres";
    process.env.SENA_ENTERPRISE_POSTGRES_URL = "postgres://sena_user:super-secret@example.neon.tech/senadb?sslmode=require";
    process.env.SENA_OBJECT_STORAGE_ADAPTER = "s3";
    process.env.SENA_OBJECT_STORAGE_ENDPOINT = "https://objects.example.test";
    process.env.SENA_OBJECT_STORAGE_BUCKET = "sena-private-bucket";
    process.env.SENA_OBJECT_STORAGE_REGION = "us-east-1";
    process.env.SENA_OBJECT_STORAGE_ACCESS_KEY_ID = "sena-access-key";
    process.env.SENA_OBJECT_STORAGE_SECRET_ACCESS_KEY = "sena-object-storage-secret";
    process.env.SENA_OBJECT_STORAGE_PREFIX = "sena/uploads";
    vi.stubGlobal("fetch", vi.fn(async () => new Response("", {
      status: 200,
      headers: {
        etag: "\"route-object-storage-etag\"",
        "x-amz-version-id": "route-version-1"
      }
    })));
    vi.doMock("pg", () => ({
      Pool: class FakePool {
        async query(sql: string, values: unknown[] = []) {
          return pg.query(sql, values);
        }

        async end() {
          return undefined;
        }
      }
    }));
    vi.doMock("next/headers", () => ({
      cookies: () => ({
        get: (name: string) => name === "sena_session" ? { value: sessionToken } : undefined
      })
    }));
    vi.doMock("@/lib/sena/enterprise", async () => await import("../enterprise"));
    vi.doMock("@/lib/sena/api-helpers", async () => await import("../api-helpers"));

    try {
      const enterprise = await import("../enterprise");
      const registered = await enterprise.registerEnterpriseUserAsync({
        name: "Postgres Upload Reviewer",
        email: "postgres-upload-reviewer@example.edu",
        password: "sena-secure-123",
        organization: "Postgres Upload Route Lab",
        plan: "lab"
      });
      sessionToken = registered.token;
      const csrf = enterprise.createEnterpriseCsrfToken(registered.context);
      const form = new FormData();
      form.set("teamId", registered.context.teams[0].id);
      form.append("files", new File([
        "person_id,name\np1,Ada\n"
      ], "route-people.csv", { type: "text/csv" }));

      const route = await import("../../../app/api/sena/uploads/route");
      const createResponse = await route.POST(new Request("https://sena.example.test/api/sena/uploads", {
        method: "POST",
        headers: {
          "x-sena-csrf-token": csrf.token
        },
        body: form
      }));
      const createBody = await createResponse.json() as {
        uploads?: Array<{ id?: string; sha256?: string }>;
      };
      const uploadId = createBody.uploads?.[0]?.id;

      expect(createResponse.status).toBe(201);
      expect(createResponse.headers.get("x-sena-observed-route")).toBe("sena-uploads");
      expect(createResponse.headers.get("x-sena-observed-status-class")).toBe("2xx");
      expect(uploadId).toMatch(/^upload_/);
      expect(pg.state?.payload.uploads.map((upload) => upload.id)).toContain(uploadId);
      expect(pg.uploads.map((upload) => upload.id)).toContain(uploadId);
      expect(existsSync(path.join(enterpriseDbDir, "enterprise-db.json"))).toBe(false);

      const deliveryResponse = await route.POST(new Request("https://sena.example.test/api/sena/uploads", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-sena-csrf-token": csrf.token
        },
        body: JSON.stringify({
          action: "deliver-object-storage",
          teamId: registered.context.teams[0].id,
          uploadId
        })
      }));
      const deliveryBody = await deliveryResponse.json() as {
        status?: string;
        provider?: { mode?: string };
        summary?: { attempted?: number; delivered?: number; failed?: number };
        uploads?: Array<{ uploadId?: string; deliveryStatus?: string; objectVersion?: string; etagHash?: string }>;
      };

      expect(deliveryResponse.status).toBe(200);
      expect(deliveryResponse.headers.get("x-sena-observed-route")).toBe("sena-uploads");
      expect(deliveryResponse.headers.get("x-sena-observed-status-class")).toBe("2xx");
      expect(deliveryBody.status).toBe("completed");
      expect(deliveryBody.provider?.mode).toBe("native-s3");
      expect(deliveryBody.summary).toEqual(expect.objectContaining({
        attempted: 1,
        delivered: 1,
        failed: 0
      }));
      expect(deliveryBody.uploads?.[0]).toEqual(expect.objectContaining({
        uploadId,
        deliveryStatus: "delivered",
        objectVersion: "route-version-1",
        etagHash: expect.stringMatching(/^[a-f0-9]{64}$/)
      }));
      expect(pg.state?.payload.uploads.find((upload) => upload.id === uploadId)?.objectStorageCustody)
        .toEqual(expect.objectContaining({
          status: "delivered",
          providerMode: "native-s3",
          objectVersion: "route-version-1",
          etagHash: expect.stringMatching(/^[a-f0-9]{64}$/)
        }));
      expect(existsSync(path.join(enterpriseDbDir, "enterprise-db.json"))).toBe(false);

      const listResponse = await route.GET(new Request(`https://sena.example.test/api/sena/uploads?teamId=${registered.context.teams[0].id}&verify=1`));
      const listBody = await listResponse.json() as {
        uploads?: Array<{ id?: string; objectStorageCustody?: { status?: string; providerMode?: string } }>;
        storageVerification?: {
          status?: string;
          summary?: {
            registeredUploads?: number;
            verifiedBlobs?: number;
            missingBlobs?: number;
          };
        };
      };

      expect(listResponse.status).toBe(200);
      expect(listResponse.headers.get("x-sena-observed-route")).toBe("sena-uploads");
      expect(listResponse.headers.get("x-sena-observed-status-class")).toBe("2xx");
      expect(listBody.uploads?.map((upload) => upload.id)).toContain(uploadId);
      expect(listBody.storageVerification?.status).toBe("pass");
      expect(listBody.storageVerification?.summary).toEqual(expect.objectContaining({
        registeredUploads: 1,
        verifiedBlobs: 1,
        missingBlobs: 0
      }));
      expect(listBody.uploads?.[0]).toEqual(expect.objectContaining({
        id: uploadId,
        objectStorageCustody: expect.objectContaining({
          status: "delivered",
          providerMode: "native-s3"
        })
      }));

      const fileBackedUploads = enterprise.readEnterpriseDb().uploads;
      expect(fileBackedUploads.map((upload: { id: string }) => upload.id)).not.toContain(uploadId);
      expect(existsSync(path.join(enterpriseDbDir, "enterprise-db.json"))).toBe(false);
      expect(JSON.stringify({ createBody, deliveryBody, listBody, postgresState: pg.state })).not.toContain("super-secret");
      expect(JSON.stringify({ createBody, deliveryBody, listBody, postgresState: pg.state })).not.toContain("example.neon.tech");
      expect(JSON.stringify({ createBody, deliveryBody, listBody, postgresState: pg.state })).not.toContain("sena-object-storage-secret");
      expect(JSON.stringify({ createBody, deliveryBody, listBody, postgresState: pg.state })).not.toContain("sena-access-key");
      expect(JSON.stringify({ createBody, deliveryBody, listBody, postgresState: pg.state })).not.toContain("sena-private-bucket");
      expect(JSON.stringify({ createBody, deliveryBody, listBody, postgresState: pg.state })).not.toContain("objects.example.test");
    } finally {
      delete process.env.SENA_ENTERPRISE_DB_DIR;
      delete process.env.SENA_ENTERPRISE_DB_ADAPTER;
      delete process.env.SENA_ENTERPRISE_STATE_STORE;
      delete process.env.SENA_ENTERPRISE_POSTGRES_URL;
      delete process.env.SENA_OBJECT_STORAGE_ADAPTER;
      delete process.env.SENA_OBJECT_STORAGE_ENDPOINT;
      delete process.env.SENA_OBJECT_STORAGE_BUCKET;
      delete process.env.SENA_OBJECT_STORAGE_REGION;
      delete process.env.SENA_OBJECT_STORAGE_ACCESS_KEY_ID;
      delete process.env.SENA_OBJECT_STORAGE_SECRET_ACCESS_KEY;
      delete process.env.SENA_OBJECT_STORAGE_PREFIX;
      rmSync(enterpriseDbDir, { recursive: true, force: true });
      vi.unstubAllGlobals();
      vi.resetModules();
    }
  }, 30_000);

  it("rejects unsafe upload files at the route boundary", async () => {
    const enterpriseDbDir = mkdtempSync(path.join(tmpdir(), "sena-uploads-security-route-"));
    let sessionToken = "";
    vi.resetModules();
    process.env.SENA_ENTERPRISE_DB_DIR = enterpriseDbDir;
    process.env.SENA_UPLOAD_MAX_BYTES = "8";
    vi.doMock("next/headers", () => ({
      cookies: () => ({
        get: (name: string) => name === "sena_session" ? { value: sessionToken } : undefined
      })
    }));
    vi.doMock("@/lib/sena/enterprise", async () => await import("../enterprise"));
    vi.doMock("@/lib/sena/api-helpers", async () => await import("../api-helpers"));

    try {
      const enterprise = await import("../enterprise");
      const registered = await enterprise.registerEnterpriseUserAsync({
        name: "Upload Security Reviewer",
        email: "upload-security-reviewer@example.edu",
        password: "sena-secure-123",
        organization: "Upload Security Route Lab",
        plan: "lab"
      });
      sessionToken = registered.token;
      const csrf = enterprise.createEnterpriseCsrfToken(registered.context);
      const route = await import("../../../app/api/sena/uploads/route");

      const executableForm = new FormData();
      executableForm.set("teamId", registered.context.teams[0].id);
      executableForm.append("files", new File(["MZ"], "tool.exe", { type: "application/octet-stream" }));
      const executableResponse = await route.POST(new Request("https://sena.example.test/api/sena/uploads", {
        method: "POST",
        headers: {
          "x-sena-csrf-token": csrf.token
        },
        body: executableForm
      }));
      const executableBody = await executableResponse.json() as { code?: string };

      expect(executableResponse.status).toBe(400);
      expect(executableBody.code).toBe("upload_extension_blocked");
      expect(executableResponse.headers.get("x-sena-observed-route")).toBe("sena-uploads");
      expect(executableResponse.headers.get("x-sena-observed-status-class")).toBe("4xx");

      const oversizedForm = new FormData();
      oversizedForm.set("teamId", registered.context.teams[0].id);
      oversizedForm.append("files", new File(["person_id,name\np1,Ada\n"], "people.csv", { type: "text/csv" }));
      const oversizedResponse = await route.POST(new Request("https://sena.example.test/api/sena/uploads", {
        method: "POST",
        headers: {
          "x-sena-csrf-token": csrf.token
        },
        body: oversizedForm
      }));
      const oversizedBody = await oversizedResponse.json() as { code?: string };

      expect(oversizedResponse.status).toBe(413);
      expect(oversizedBody.code).toBe("upload_too_large");
      expect(enterprise.listEnterpriseUploads(registered.context, registered.context.teams[0].id)).toHaveLength(0);
    } finally {
      delete process.env.SENA_ENTERPRISE_DB_DIR;
      delete process.env.SENA_UPLOAD_MAX_BYTES;
      rmSync(enterpriseDbDir, { recursive: true, force: true });
      vi.resetModules();
    }
  });

  it("keeps encrypted upload blobs readable after the enterprise directory moves and for legacy path-derived envelopes", async () => {
    const originalDbDir = mkdtempSync(path.join(tmpdir(), "sena-uploads-keyfile-a-"));
    const movedDbDir = mkdtempSync(path.join(tmpdir(), "sena-uploads-keyfile-b-"));
    const uploadContent = "person_id,name\np1,Ada\n";
    let sessionToken = "";
    let teamId = "";
    const mockHeaders = () => {
      vi.doMock("next/headers", () => ({
        cookies: () => ({
          get: (name: string) => name === "sena_session" ? { value: sessionToken } : undefined
        })
      }));
      vi.doMock("@/lib/sena/enterprise", async () => await import("../enterprise"));
      vi.doMock("@/lib/sena/api-helpers", async () => await import("../api-helpers"));
    };
    const verifyUploads = async (route: typeof import("../../../app/api/sena/uploads/route")) => {
      const response = await route.GET(new Request(`https://sena.example.test/api/sena/uploads?teamId=${teamId}&verify=1`));
      const body = await response.json() as {
        storageVerification?: {
          status?: string;
          storage?: { encryption?: { atRest?: string; keySource?: string; encryptedBlobs?: number } };
          summary?: { registeredUploads?: number; verifiedBlobs?: number };
        };
      };
      expect(response.status).toBe(200);
      return body.storageVerification;
    };

    vi.resetModules();
    process.env.SENA_ENTERPRISE_DB_DIR = originalDbDir;
    delete process.env.SENA_UPLOAD_ENCRYPTION_KEY;
    mockHeaders();

    try {
      const enterprise = await import("../enterprise");
      const registered = await enterprise.registerEnterpriseUserAsync({
        name: "Keyfile Upload Reviewer",
        email: "keyfile-upload-reviewer@example.edu",
        password: "sena-secure-123",
        organization: "Keyfile Upload Route Lab",
        plan: "lab"
      });
      sessionToken = registered.token;
      teamId = registered.context.teams[0].id;
      const csrf = enterprise.createEnterpriseCsrfToken(registered.context);
      const route = await import("../../../app/api/sena/uploads/route");

      const form = new FormData();
      form.set("teamId", teamId);
      form.append("files", new File([uploadContent], "keyfile-people.csv", { type: "text/csv" }));
      const createResponse = await route.POST(new Request("https://sena.example.test/api/sena/uploads", {
        method: "POST",
        headers: { "x-sena-csrf-token": csrf.token },
        body: form
      }));
      expect(createResponse.status).toBe(201);

      // The pilot fallback key must be a persisted file so it travels with the directory.
      expect(existsSync(path.join(originalDbDir, "upload-encryption.key"))).toBe(true);
      const initialVerification = await verifyUploads(route);
      expect(initialVerification?.status).toBe("pass");
      expect(initialVerification?.summary).toEqual(expect.objectContaining({ registeredUploads: 1, verifiedBlobs: 1 }));
      expect(initialVerification?.storage?.encryption).toEqual(expect.objectContaining({
        atRest: "sena-upload-aes-256-gcm-envelope/v1",
        keySource: "pilot-local-derived",
        encryptedBlobs: 1
      }));

      // Simulate a backup restore / directory move to a different absolute path.
      cpSync(originalDbDir, movedDbDir, { recursive: true });
      vi.resetModules();
      process.env.SENA_ENTERPRISE_DB_DIR = movedDbDir;
      mockHeaders();
      const movedRoute = await import("../../../app/api/sena/uploads/route");
      const movedVerification = await verifyUploads(movedRoute);
      expect(movedVerification?.status).toBe("pass");
      expect(movedVerification?.summary).toEqual(expect.objectContaining({ registeredUploads: 1, verifiedBlobs: 1 }));

      // Legacy envelopes encrypted with the old path-derived key must still decrypt in place.
      const movedEnterprise = await import("../enterprise");
      const storedUpload = movedEnterprise.readEnterpriseDb().uploads[0] as { storagePath: string };
      const legacyKey = createHash("sha256")
        .update(`sena-upload-pilot-local:${path.join(movedDbDir, "enterprise-db.json")}`)
        .digest();
      const iv = randomBytes(12);
      const cipher = createCipheriv("aes-256-gcm", legacyKey, iv);
      const ciphertext = Buffer.concat([cipher.update(Buffer.from(uploadContent, "utf8")), cipher.final()]);
      writeFileSync(path.join(movedDbDir, storedUpload.storagePath), JSON.stringify({
        schemaVersion: "sena-upload-aes-256-gcm-envelope/v1",
        algorithm: "aes-256-gcm",
        keySource: "pilot-local-derived",
        iv: iv.toString("base64"),
        authTag: cipher.getAuthTag().toString("base64"),
        ciphertextBase64: ciphertext.toString("base64")
      }));
      const legacyVerification = await verifyUploads(movedRoute);
      expect(legacyVerification?.status).toBe("pass");
      expect(legacyVerification?.summary).toEqual(expect.objectContaining({ registeredUploads: 1, verifiedBlobs: 1 }));
    } finally {
      delete process.env.SENA_ENTERPRISE_DB_DIR;
      rmSync(originalDbDir, { recursive: true, force: true });
      rmSync(movedDbDir, { recursive: true, force: true });
      vi.resetModules();
    }
  }, 30_000);
});
